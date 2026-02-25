/**
 * Audio capture manager for microphone input
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link AudioCapture} class, which manages microphone
 * input using the Web Audio API. It handles the full lifecycle of audio
 * capture: requesting microphone permissions, creating an `AudioContext` and
 * `ScriptProcessorNode`, converting raw audio data to the configured format
 * (e.g. 16-bit PCM), and delivering audio chunks to a callback.
 *
 * Audio data flows through the following pipeline:
 *
 * 1. `MediaStream` (from `getUserMedia`)
 * 2. `MediaStreamAudioSourceNode`
 * 3. `ScriptProcessorNode` (buffer processing)
 * 4. Optional downsampling (if the hardware sample rate differs from config)
 * 5. Format conversion (Float32 to Int16 PCM)
 * 6. Callback delivery as `ArrayBuffer`
 *
 * @see {@link AudioPlayer} for the corresponding audio playback manager.
 */

import type { AudioInputConfig, AudioCaptureState } from '../types/audio';
import { AudioCaptureError, MicrophonePermissionError } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import { floatTo16BitPCM, downsampleAudio } from '../../utils/audio';
import { DEFAULT_AUDIO_INPUT_CONFIG } from '../types/config';

/**
 * Callback function that receives captured audio data.
 *
 * @remarks
 * The `audioData` buffer contains audio in the format specified by the
 * {@link AudioInputConfig.format} setting. By default this is 16-bit linear
 * PCM.
 *
 * @param audioData - A buffer containing one chunk of captured audio data.
 *
 * @example
 * ```ts
 * const onAudioData: AudioCaptureCallback = (audioData) => {
 *   // Forward to a WebSocket for real-time STT
 *   websocket.send(audioData);
 * };
 * ```
 */
export type AudioCaptureCallback = (audioData: ArrayBuffer) => void;

/**
 * Manages microphone audio capture using the Web Audio API.
 *
 * @remarks
 * `AudioCapture` encapsulates the browser's `getUserMedia`, `AudioContext`, and
 * `ScriptProcessorNode` APIs to provide a simple start/stop interface for
 * microphone capture. It supports pause/resume, configurable sample rates,
 * echo cancellation, noise suppression, and automatic gain control.
 *
 * Audio data is delivered as `ArrayBuffer` chunks to the callback provided to
 * {@link AudioCapture.start | start()}. The chunk size is determined by the
 * {@link AudioInputConfig.chunkDuration} setting (default 100ms), rounded to
 * the nearest power-of-two buffer size for the `ScriptProcessorNode`.
 *
 * The class tracks its own state via {@link AudioCaptureState} values:
 * `'inactive'`, `'starting'`, `'active'`, `'paused'`, and `'stopping'`.
 *
 * @example
 * ```ts
 * import { AudioCapture } from './AudioCapture';
 *
 * const capture = new AudioCapture({ sampleRate: 16000 }, logger);
 *
 * // Start capturing microphone audio
 * await capture.start((audioData) => {
 *   // Process or send the PCM audio chunk
 *   sttProvider.sendAudio(audioData);
 * });
 *
 * console.log(capture.isCapturing()); // true
 *
 * // Pause during TTS playback
 * capture.pause();
 *
 * // Resume after playback ends
 * await capture.resume();
 *
 * // Stop capture and release resources
 * await capture.stop();
 * ```
 *
 * @see {@link AudioPlayer} for audio playback.
 * @see {@link AudioInputConfig} for available configuration options.
 */
export class AudioCapture {
  private config: AudioInputConfig;
  private logger: Logger | undefined;
  private state: AudioCaptureState = 'inactive';
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private callback: AudioCaptureCallback | null = null;

  /**
   * Creates a new `AudioCapture` instance.
   *
   * @remarks
   * The instance starts in the `'inactive'` state. Call
   * {@link AudioCapture.start | start()} to begin capturing audio.
   *
   * @param config - Partial audio input configuration. Missing fields are filled
   *   from {@link DEFAULT_AUDIO_INPUT_CONFIG}.
   * @param logger - Optional {@link Logger} instance. A child logger named
   *   `'AudioCapture'` is created if provided.
   */
  constructor(config: Partial<AudioInputConfig> = {}, logger?: Logger) {
    this.config = { ...DEFAULT_AUDIO_INPUT_CONFIG, ...config };
    this.logger = logger ? logger.child('AudioCapture') : undefined;
  }

  /**
   * Returns the current capture state.
   *
   * @returns The current {@link AudioCaptureState} (`'inactive'`, `'starting'`,
   *   `'active'`, `'paused'`, or `'stopping'`).
   */
  getState(): AudioCaptureState {
    return this.state;
  }

  /**
   * Checks whether the capture is actively recording audio.
   *
   * @returns `true` if the state is `'active'`, `false` otherwise.
   */
  isCapturing(): boolean {
    return this.state === 'active';
  }

  /**
   * Requests microphone permission from the user without starting capture.
   *
   * @remarks
   * This method calls `getUserMedia` to trigger the browser's permission
   * prompt, then immediately stops the resulting stream. It is useful for
   * pre-requesting permission during onboarding so that
   * {@link AudioCapture.start | start()} can succeed without a permission dialog.
   *
   * @returns `true` if permission was granted, `false` if denied or unavailable.
   */
  async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately, we just needed permission
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (error) {
      this.logger?.error('Failed to get microphone permission', error);
      return false;
    }
  }

  /**
   * Queries the current microphone permission status without prompting the user.
   *
   * @remarks
   * Uses the Permissions API (`navigator.permissions.query`). If the
   * Permissions API is not available (e.g. in some browsers), this method
   * returns `'prompt'` as a safe fallback.
   *
   * @returns The permission state: `'granted'`, `'denied'`, or `'prompt'`.
   */
  async checkPermission(): Promise<'granted' | 'denied' | 'prompt'> {
    if (!navigator.permissions) {
      return 'prompt';
    }

    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state as 'granted' | 'denied' | 'prompt';
    } catch {
      return 'prompt';
    }
  }

  /**
   * Starts capturing audio from the microphone.
   *
   * @remarks
   * This method:
   * 1. Requests microphone access via `getUserMedia`.
   * 2. Creates an `AudioContext` at the configured sample rate.
   * 3. Connects a `MediaStreamAudioSourceNode` through a `ScriptProcessorNode`.
   * 4. Delivers processed audio chunks to the provided `callback`.
   *
   * If already capturing (`state === 'active'`), this method logs a warning
   * and returns immediately without error.
   *
   * @param callback - The {@link AudioCaptureCallback} that receives audio data
   *   chunks as `ArrayBuffer`.
   *
   * @throws {@link AudioCaptureError} if the Media Devices API is not supported
   *   by the browser.
   * @throws {@link MicrophonePermissionError} if the user denies microphone
   *   access.
   * @throws {@link AudioCaptureError} for any other failure during stream or
   *   context creation.
   *
   * @example
   * ```ts
   * await capture.start((audioData) => {
   *   websocket.send(audioData);
   * });
   * ```
   */
  async start(callback: AudioCaptureCallback): Promise<void> {
    if (this.state === 'active') {
      this.logger?.warn('Already capturing audio');
      return;
    }

    // Check if Media Devices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new AudioCaptureError(
        'Media Devices API is not supported in this browser. Please use Chrome, Edge, or a modern browser.',
        new Error('navigator.mediaDevices.getUserMedia is not available')
      );
    }

    this.state = 'starting';
    this.callback = callback;
    this.logger?.info('Starting audio capture');

    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels ?? 1,
          echoCancellation: this.config.echoCancellation ?? true,
          noiseSuppression: this.config.noiseSuppression ?? true,
          autoGainControl: this.config.autoGainControl ?? true,
        },
      });

      // Create audio context
      this.audioContext = new AudioContext({
        sampleRate: this.config.sampleRate,
      });

      // Create source node from media stream
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create script processor node for audio processing
      // Buffer size calculation: sampleRate * chunkDuration / 1000
      const bufferSize = this.calculateBufferSize();
      this.processorNode = this.audioContext.createScriptProcessor(
        bufferSize,
        this.config.channels ?? 1,
        this.config.channels ?? 1
      );

      // Process audio data
      this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
        this.processAudioData(event);
      };

      // Connect the nodes
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.state = 'active';
      this.logger?.info('Audio capture started');
    } catch (error) {
      this.state = 'inactive';
      this.cleanup();

      if (
        (error as Error).name === 'NotAllowedError' ||
        (error as Error).name === 'PermissionDeniedError'
      ) {
        throw new MicrophonePermissionError();
      }

      throw new AudioCaptureError(
        `Failed to start capture: ${(error as Error).message}`,
        error as Error
      );
    }
  }

  /**
   * Calculate the appropriate `ScriptProcessorNode` buffer size.
   *
   * @remarks
   * The target buffer size is derived from `sampleRate * chunkDuration / 1000`,
   * then rounded to the nearest valid power-of-two buffer size accepted by the
   * Web Audio API (256 to 16384).
   *
   * @returns The buffer size as a power-of-two integer.
   */
  private calculateBufferSize(): number {
    const targetSize = (this.config.sampleRate * (this.config.chunkDuration ?? 100)) / 1000;
    // Round to nearest power of 2
    const bufferSizes = [256, 512, 1024, 2048, 4096, 8192, 16384];
    return bufferSizes.reduce((prev, curr) =>
      Math.abs(curr - targetSize) < Math.abs(prev - targetSize) ? curr : prev
    );
  }

  /**
   * Process raw audio data from the `ScriptProcessorNode`.
   *
   * @remarks
   * This handler is invoked by the `onaudioprocess` event. It extracts channel
   * data, applies downsampling if the hardware sample rate differs from the
   * configured rate, converts to the target format, and delivers the result to
   * the registered callback.
   *
   * @param event - The `AudioProcessingEvent` from the `ScriptProcessorNode`.
   */
  private processAudioData(event: AudioProcessingEvent): void {
    if (!this.callback || this.state !== 'active') {
      return;
    }

    try {
      const inputBuffer = event.inputBuffer;
      const channelData = inputBuffer.getChannelData(0);

      // Downsample if necessary
      let processedData: Float32Array = channelData;
      if (inputBuffer.sampleRate !== this.config.sampleRate) {
        processedData = downsampleAudio(
          channelData,
          inputBuffer.sampleRate,
          this.config.sampleRate
        );
      }

      // Convert to appropriate format
      const audioData = this.convertAudioData(processedData);

      // Send to callback
      this.callback(audioData);
    } catch (error) {
      this.logger?.error('Error processing audio data', error);
    }
  }

  /**
   * Convert Float32 audio samples to the configured output format.
   *
   * @remarks
   * Currently only PCM (16-bit linear) is fully implemented. Other formats
   * (`wav`, `opus`, `mp3`, `webm`) fall back to PCM with a warning, leaving
   * encoding to downstream providers.
   *
   * @param float32Data - The raw Float32 audio samples from the `ScriptProcessorNode`.
   * @returns An `ArrayBuffer` containing the converted audio data.
   */
  private convertAudioData(float32Data: Float32Array): ArrayBuffer {
    switch (this.config.format) {
      case 'pcm': {
        const int16Data = floatTo16BitPCM(float32Data);
        return int16Data.buffer as ArrayBuffer;
      }
      case 'wav':
      case 'opus':
      case 'mp3':
      case 'webm': {
        // For these formats, we'd need encoding libraries
        // For now, return raw PCM and let providers handle encoding
        this.logger?.warn(`Format ${this.config.format} not yet implemented, returning PCM`);
        const int16Data = floatTo16BitPCM(float32Data);
        return int16Data.buffer as ArrayBuffer;
      }
      default: {
        const defaultInt16Data = floatTo16BitPCM(float32Data);
        return defaultInt16Data.buffer as ArrayBuffer;
      }
    }
  }

  /**
   * Pauses audio capture by suspending the `AudioContext`.
   *
   * @remarks
   * If the capture is not in the `'active'` state, this method logs a warning
   * and returns without error. While paused, no audio data is delivered to the
   * callback. Call {@link AudioCapture.resume | resume()} to continue capturing.
   */
  pause(): void {
    if (this.state !== 'active') {
      this.logger?.warn('Cannot pause: not capturing');
      return;
    }

    this.state = 'paused';
    if (this.audioContext) {
      void this.audioContext.suspend();
    }
    this.logger?.info('Audio capture paused');
  }

  /**
   * Resumes audio capture from a paused state.
   *
   * @remarks
   * If the capture is not in the `'paused'` state, this method logs a warning
   * and returns without error.
   */
  async resume(): Promise<void> {
    if (this.state !== 'paused') {
      this.logger?.warn('Cannot resume: not paused');
      return;
    }

    if (this.audioContext) {
      await this.audioContext.resume();
    }
    this.state = 'active';
    this.logger?.info('Audio capture resumed');
  }

  /**
   * Stops audio capture and releases all audio resources.
   *
   * @remarks
   * This method disconnects the audio processing graph, closes the
   * `AudioContext`, stops all media stream tracks, and clears the callback.
   * If already in the `'inactive'` state, this method is a no-op.
   *
   * After stopping, the instance can be restarted by calling
   * {@link AudioCapture.start | start()} again with a new callback.
   */
  async stop(): Promise<void> {
    if (this.state === 'inactive') {
      this.logger?.warn('Already stopped');
      return;
    }

    this.state = 'stopping';
    this.logger?.info('Stopping audio capture');

    this.cleanup();
    this.state = 'inactive';
    this.logger?.info('Audio capture stopped');
  }

  /**
   * Releases all internal audio resources (nodes, context, stream, callback).
   *
   * @remarks
   * Called internally by {@link AudioCapture.stop | stop()} and on error during
   * {@link AudioCapture.start | start()}. Disconnects all audio nodes, closes
   * the `AudioContext`, stops media stream tracks, and nullifies references.
   */
  private cleanup(): void {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    this.callback = null;
  }

  /**
   * Returns the underlying `AudioContext`, if one has been created.
   *
   * @remarks
   * This is intended for advanced use cases where direct access to the audio
   * context is needed (e.g. creating custom audio processing nodes). Returns
   * `null` if capture has not been started or has been stopped.
   *
   * @returns The active `AudioContext`, or `null` if none exists.
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Returns a copy of the current audio input configuration.
   *
   * @remarks
   * The returned object is a shallow copy; modifying it does not affect the
   * internal configuration. Use {@link AudioCapture.updateConfig | updateConfig()}
   * to change settings.
   *
   * @returns A copy of the current {@link AudioInputConfig}.
   */
  getConfig(): AudioInputConfig {
    return { ...this.config };
  }

  /**
   * Updates the audio input configuration.
   *
   * @remarks
   * Configuration changes take effect on the next call to
   * {@link AudioCapture.start | start()}. They do **not** affect an active
   * capture session -- you must stop and restart capture for changes to apply.
   *
   * @param config - Partial configuration to merge with the current settings.
   */
  updateConfig(config: Partial<AudioInputConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger?.info('Audio configuration updated');
  }

  /**
   * Releases all resources by stopping capture. Safe to call from any state.
   *
   * @remarks
   * This is a convenience method equivalent to calling
   * {@link AudioCapture.stop | stop()}. It is intended for use in cleanup/teardown
   * code where you want to ensure all resources are freed regardless of the
   * current state.
   */
  async dispose(): Promise<void> {
    await this.stop();
  }
}
