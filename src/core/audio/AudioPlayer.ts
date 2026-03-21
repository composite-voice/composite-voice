/**
 * Audio playback manager
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link AudioPlayer} class, which manages audio
 * playback using the Web Audio API. It supports two playback modes:
 *
 * 1. **Complete playback** -- Play a full `Blob` of audio via
 *    {@link AudioPlayer.play | play()}.
 * 2. **Streaming playback** -- Queue individual {@link AudioChunk} objects via
 *    {@link AudioPlayer.addChunk | addChunk()}, which are buffered and played
 *    sequentially.
 *
 * For streaming playback, the player implements a buffering strategy:
 * - Chunks are queued in an internal `audioQueue`.
 * - Playback begins only after a minimum buffer duration is met
 *   (configurable via {@link AudioOutputConfig.minBufferDuration}).
 * - Chunks are decoded and played one at a time in order.
 * - If direct `decodeAudioData` fails, the player falls back to creating an
 *   `AudioBuffer` from raw PCM data using the provided {@link AudioMetadata}.
 *
 * @see {@link AudioCapture} for the corresponding audio capture manager.
 */

import type {
  AudioOutputConfig,
  AudioPlaybackState,
  AudioChunk,
  AudioMetadata,
} from '../types/audio';
import { AudioPlaybackError } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import { DEFAULT_AUDIO_OUTPUT_CONFIG } from '../types/config';

/**
 * Callback invoked when audio playback begins.
 *
 * @example
 * ```ts
 * const onStart: PlaybackStartCallback = () => {
 *   speakingIndicator.show();
 * };
 * ```
 */
export type PlaybackStartCallback = () => void;

/**
 * Callback invoked when audio playback ends (queue fully drained or explicit stop).
 *
 * @example
 * ```ts
 * const onEnd: PlaybackEndCallback = () => {
 *   speakingIndicator.hide();
 * };
 * ```
 */
export type PlaybackEndCallback = () => void;

/**
 * Callback invoked when a playback error occurs.
 *
 * @param error - The error that occurred during playback.
 *
 * @example
 * ```ts
 * const onError: PlaybackErrorCallback = (error) => {
 *   console.error('Playback failed:', error.message);
 * };
 * ```
 */
export type PlaybackErrorCallback = (error: Error) => void;

/**
 * Manages audio playback using the Web Audio API with support for both complete
 * and streaming playback modes.
 *
 * @remarks
 * `AudioPlayer` creates and manages an `AudioContext` and plays audio through
 * `AudioBufferSourceNode` instances. It maintains an internal queue for
 * streaming playback and implements minimum-buffer-duration gating to prevent
 * choppy output.
 *
 * The class tracks its state via {@link AudioPlaybackState} values: `'idle'`,
 * `'buffering'`, `'playing'`, `'paused'`, and `'stopped'`.
 *
 * Lifecycle callbacks can be registered via
 * {@link AudioPlayer.setCallbacks | setCallbacks()} to respond to playback
 * start, end, and error events.
 *
 * @example
 * ```ts
 * import { AudioPlayer } from './AudioPlayer';
 *
 * const player = new AudioPlayer({ minBufferDuration: 200 }, logger);
 *
 * // Set up lifecycle callbacks
 * player.setCallbacks({
 *   onStart: () => console.log('Started speaking'),
 *   onEnd: () => console.log('Finished speaking'),
 *   onError: (err) => console.error('Playback error:', err),
 * });
 *
 * // Streaming playback: set metadata, then add chunks as they arrive
 * player.setMetadata({ sampleRate: 24000, encoding: 'linear16', channels: 1 });
 * for await (const chunk of ttsStream) {
 *   await player.addChunk(chunk);
 * }
 *
 * // Wait for all audio to finish playing
 * await player.waitForCompletion();
 *
 * // Complete playback: play a full audio blob
 * await player.play(audioBlob);
 *
 * // Clean up
 * await player.dispose();
 * ```
 *
 * @see {@link AudioCapture} for audio capture.
 * @see {@link AudioOutputConfig} for available configuration options.
 */
export class AudioPlayer {
  private config: AudioOutputConfig;
  private logger: Logger | undefined;
  private state: AudioPlaybackState = 'idle';
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private audioQueue: AudioChunk[] = [];
  private isProcessingQueue = false;
  private metadata: AudioMetadata | null = null;
  private onPlaybackStart: PlaybackStartCallback | null = null;
  private onPlaybackEnd: PlaybackEndCallback | null = null;
  private onPlaybackError: PlaybackErrorCallback | null = null;

  /**
   * Creates a new `AudioPlayer` instance.
   *
   * @remarks
   * The instance starts in the `'idle'` state with an empty audio queue. The
   * `AudioContext` is created lazily on the first playback request.
   *
   * @param config - Partial audio output configuration. Missing fields are filled
   *   from {@link DEFAULT_AUDIO_OUTPUT_CONFIG}.
   * @param logger - Optional {@link Logger} instance. A child logger named
   *   `'AudioPlayer'` is created if provided.
   */
  constructor(config: Partial<AudioOutputConfig> = {}, logger?: Logger) {
    this.config = { ...DEFAULT_AUDIO_OUTPUT_CONFIG, ...config };
    this.logger = logger ? logger.child('AudioPlayer') : undefined;
  }

  /**
   * Returns the current playback state.
   *
   * @returns The current {@link AudioPlaybackState} (`'idle'`, `'buffering'`,
   *   `'playing'`, `'paused'`, or `'stopped'`).
   */
  getState(): AudioPlaybackState {
    return this.state;
  }

  /**
   * Checks whether the player is currently playing audio.
   *
   * @remarks
   * Returns `true` only when in the `'playing'` state. Unlike
   * {@link SimpleAudioPlaybackStateMachine.isPlaying}, this does not include
   * the `'buffering'` state.
   *
   * @returns `true` if the state is `'playing'`, `false` otherwise.
   */
  isPlaying(): boolean {
    return this.state === 'playing';
  }

  /**
   * Lazily creates and resumes the `AudioContext`.
   *
   * @remarks
   * The `AudioContext` is created once and reused across playback sessions.
   * If the context was suspended (e.g. due to browser autoplay policy), it is
   * resumed automatically.
   *
   * @returns The active `AudioContext`.
   */
  private async ensureAudioContext(): Promise<AudioContext> {
    if (!this.audioContext) {
      const options: AudioContextOptions = {};
      if (this.config.sampleRate !== undefined) {
        options.sampleRate = this.config.sampleRate;
      }
      this.audioContext = new AudioContext(options);
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    return this.audioContext;
  }

  /**
   * Registers lifecycle callbacks for playback events.
   *
   * @remarks
   * Pass `undefined` or omit a callback to leave it unset. Previously
   * registered callbacks are replaced. Pass `null` explicitly is not needed;
   * omitted callbacks default to `null` internally.
   *
   * @param callbacks - An object with optional `onStart`, `onEnd`, and
   *   `onError` callback properties.
   *
   * @example
   * ```ts
   * player.setCallbacks({
   *   onStart: () => ui.showSpeaking(),
   *   onEnd: () => ui.hideSpeaking(),
   *   onError: (err) => ui.showError(err.message),
   * });
   * ```
   */
  setCallbacks(callbacks: {
    onStart?: PlaybackStartCallback;
    onEnd?: PlaybackEndCallback;
    onError?: PlaybackErrorCallback;
  }): void {
    this.onPlaybackStart = callbacks.onStart ?? null;
    this.onPlaybackEnd = callbacks.onEnd ?? null;
    this.onPlaybackError = callbacks.onError ?? null;
  }

  /**
   * Sets audio metadata for streaming playback.
   *
   * @remarks
   * Metadata is used to calculate buffer durations and to decode raw PCM chunks
   * when standard `decodeAudioData` fails. This should be called before adding
   * streaming chunks via {@link AudioPlayer.addChunk | addChunk()}.
   *
   * @param metadata - The {@link AudioMetadata} describing the audio format
   *   (sample rate, encoding, channels, etc.).
   *
   * @example
   * ```ts
   * player.setMetadata({
   *   sampleRate: 24000,
   *   encoding: 'linear16',
   *   channels: 1,
   *   bitDepth: 16,
   * });
   * ```
   */
  setMetadata(metadata: AudioMetadata): void {
    this.metadata = metadata;
    this.logger?.debug('Audio metadata set', metadata);
  }

  /**
   * Plays a complete audio blob.
   *
   * @remarks
   * The blob is decoded via `AudioContext.decodeAudioData` and played through
   * an `AudioBufferSourceNode`. This method is intended for one-shot playback
   * of a complete audio file, not for streaming.
   *
   * @param audioBlob - The audio data as a `Blob` (e.g. WAV, MP3, OGG).
   *
   * @throws {@link AudioPlaybackError} if decoding or playback fails.
   *
   * @example
   * ```ts
   * const response = await fetch('/audio/greeting.wav');
   * const blob = await response.blob();
   * await player.play(blob);
   * ```
   */
  async play(audioBlob: Blob): Promise<void> {
    this.logger?.info('Playing audio blob');

    try {
      const context = await this.ensureAudioContext();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await context.decodeAudioData(arrayBuffer);

      await this.playAudioBuffer(audioBuffer);
    } catch (error) {
      const playbackError = new AudioPlaybackError(
        `Failed to play audio: ${(error as Error).message}`,
        error as Error
      );
      this.handleError(playbackError);
      throw playbackError;
    }
  }

  /**
   * Adds an audio chunk to the streaming playback queue.
   *
   * @remarks
   * Chunks are queued internally and processed in order. If the queue processor
   * is not already running, it is started automatically. The processor waits
   * for a minimum buffer duration (see {@link AudioOutputConfig.minBufferDuration})
   * before beginning playback to prevent choppy output.
   *
   * Call {@link AudioPlayer.setMetadata | setMetadata()} before adding chunks
   * to ensure correct decoding and buffer duration estimation.
   *
   * @param chunk - The {@link AudioChunk} to add to the playback queue.
   *
   * @example
   * ```ts
   * // Add chunks as they arrive from TTS provider
   * ttsProvider.on('audio', async (chunk) => {
   *   await player.addChunk(chunk);
   * });
   * ```
   */
  async addChunk(chunk: AudioChunk): Promise<void> {
    this.audioQueue.push(chunk);

    if (!this.isProcessingQueue) {
      void this.processQueue();
    }
  }

  /**
   * Processes the audio chunk queue sequentially.
   *
   * @remarks
   * This method runs as a loop, draining chunks from the queue one at a time.
   * Before playing the first chunk, it waits for the minimum buffer duration
   * to be met. The method exits when the queue is empty, resetting the state
   * to `'idle'`.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.audioQueue.length > 0) {
        // Wait for minimum buffer before starting
        if (this.state === 'idle' && !this.hasMinimumBuffer()) {
          this.state = 'buffering';
          this.logger?.debug('Buffering audio...');
          await this.waitForMinimumBuffer();
        }

        // Drain all available chunks and concatenate into a single buffer
        // to eliminate gaps between individual chunk playback
        const chunks: AudioChunk[] = [];
        while (this.audioQueue.length > 0) {
          const chunk = this.audioQueue.shift();
          if (chunk) chunks.push(chunk);
        }

        if (chunks.length === 1) {
          const single = chunks[0];
          if (single) await this.playChunk(single);
        } else if (chunks.length > 1) {
          const firstChunk = chunks[0];
          if (!firstChunk) continue;

          const totalBytes = chunks.reduce((sum, c) => sum + c.data.byteLength, 0);
          const merged = new Uint8Array(totalBytes);
          let offset = 0;
          for (const c of chunks) {
            merged.set(new Uint8Array(c.data), offset);
            offset += c.data.byteLength;
          }
          const mergedChunk: AudioChunk = {
            data: merged.buffer,
            timestamp: firstChunk.timestamp,
          };
          if (firstChunk.metadata) {
            mergedChunk.metadata = firstChunk.metadata;
          }
          await this.playChunk(mergedChunk);
        }
      }

      this.state = 'idle';
    } catch (error) {
      this.handleError(error as Error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Checks whether the queue contains enough data to meet the minimum buffer
   * duration.
   *
   * @remarks
   * The check estimates total buffer duration from the byte count of all queued
   * chunks and the estimated bytes-per-millisecond rate derived from
   * {@link AudioMetadata}.
   *
   * @returns `true` if the buffered duration meets or exceeds
   *   {@link AudioOutputConfig.minBufferDuration}.
   */
  private hasMinimumBuffer(): boolean {
    if (this.audioQueue.length === 0) return false;

    const totalBytes = this.audioQueue.reduce((sum, chunk) => sum + chunk.data.byteLength, 0);
    const bytesPerMs = this.estimateBytesPerMs();
    const bufferDuration = totalBytes / bytesPerMs;

    return bufferDuration >= (this.config.minBufferDuration ?? 200);
  }

  /**
   * Polls until the minimum buffer duration is met or a timeout is reached.
   *
   * @remarks
   * Checks every 50ms for up to 5 seconds. If the timeout is exceeded, playback
   * proceeds with whatever data is available.
   */
  private async waitForMinimumBuffer(): Promise<void> {
    const checkInterval = 50; // ms
    const maxWait = 5000; // ms
    let waited = 0;

    while (!this.hasMinimumBuffer() && waited < maxWait) {
      await new Promise((resolve) => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }
  }

  /**
   * Estimates the bytes-per-millisecond rate based on audio metadata.
   *
   * @remarks
   * If no metadata is set, defaults to an estimate for 16kHz 16-bit mono audio
   * (32 bytes/ms). The calculation assumes 16-bit (2 bytes per sample) encoding.
   *
   * @returns The estimated bytes per millisecond.
   */
  private estimateBytesPerMs(): number {
    if (!this.metadata) {
      // Default estimate for 16kHz 16-bit mono
      return (16000 * 2) / 1000; // 32 bytes/ms
    }

    const { sampleRate, channels } = this.metadata;
    const bytesPerSample = 2; // Assuming 16-bit
    return (sampleRate * channels * bytesPerSample) / 1000;
  }

  /**
   * Decodes and plays a single audio chunk.
   *
   * @param chunk - The {@link AudioChunk} to play.
   *
   * @throws Re-throws any error from decoding or playback.
   */
  private async playChunk(chunk: AudioChunk): Promise<void> {
    try {
      const context = await this.ensureAudioContext();

      // Decode audio data
      const audioBuffer = await this.decodeChunk(chunk, context);

      // Play the buffer
      await this.playAudioBuffer(audioBuffer);
    } catch (error) {
      this.logger?.error('Error playing chunk', error);
      throw error;
    }
  }

  /**
   * Decodes an audio chunk into an `AudioBuffer`.
   *
   * @remarks
   * First attempts to decode using `AudioContext.decodeAudioData`. If that
   * fails (e.g. for raw PCM data without headers), falls back to manually
   * creating an `AudioBuffer` from PCM data using the configured
   * {@link AudioMetadata}.
   *
   * @param chunk - The {@link AudioChunk} to decode.
   * @param context - The `AudioContext` to use for decoding.
   * @returns The decoded `AudioBuffer`.
   *
   * @throws Re-throws decoding errors if no metadata is available for fallback.
   */
  private async decodeChunk(chunk: AudioChunk, context: AudioContext): Promise<AudioBuffer> {
    try {
      // Try to decode directly
      return await context.decodeAudioData(chunk.data.slice(0));
    } catch (error) {
      // If direct decoding fails, try to create from raw PCM
      if (this.metadata) {
        return this.createAudioBufferFromPCM(chunk.data, this.metadata, context);
      }
      throw error;
    }
  }

  /**
   * Creates an `AudioBuffer` from raw 16-bit PCM data.
   *
   * @remarks
   * Converts `Int16` samples to `Float32` in the range `[-1.0, 1.0]` and
   * distributes them across the specified number of channels.
   *
   * @param data - Raw PCM audio data as an `ArrayBuffer`.
   * @param metadata - The {@link AudioMetadata} describing the PCM format.
   * @param context - The `AudioContext` used to create the `AudioBuffer`.
   * @returns The created `AudioBuffer`.
   */
  private createAudioBufferFromPCM(
    data: ArrayBuffer,
    metadata: AudioMetadata,
    context: AudioContext
  ): AudioBuffer {
    const { sampleRate, channels } = metadata;
    const int16Array = new Int16Array(data);
    const floatArray = new Float32Array(int16Array.length);

    // Convert Int16 to Float32
    for (let i = 0; i < int16Array.length; i++) {
      const int = int16Array[i];
      if (int !== undefined) {
        floatArray[i] = int >= 0 ? int / 0x7fff : int / 0x8000;
      }
    }

    const samplesPerChannel = floatArray.length / channels;
    const audioBuffer = context.createBuffer(channels, samplesPerChannel, sampleRate);

    // Fill audio buffer channels
    for (let channel = 0; channel < channels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < samplesPerChannel; i++) {
        const sample = floatArray[i * channels + channel];
        if (sample !== undefined) {
          channelData[i] = sample;
        }
      }
    }

    return audioBuffer;
  }

  /**
   * Creates an `AudioBufferSourceNode`, connects it, and plays the buffer.
   *
   * @remarks
   * Returns a `Promise` that resolves when the buffer finishes playing
   * (`onended` event). If the audio queue is empty when playback ends, the
   * state is set to `'idle'` and the `onPlaybackEnd` callback is invoked.
   *
   * @param audioBuffer - The `AudioBuffer` to play.
   */
  private async playAudioBuffer(audioBuffer: AudioBuffer): Promise<void> {
    const context = await this.ensureAudioContext();

    return new Promise((resolve, reject) => {
      try {
        this.currentSource = context.createBufferSource();
        this.currentSource.buffer = audioBuffer;

        // Apply smoothing if enabled
        if (this.config.enableSmoothing) {
          // Note: Actual fade would need to modify the buffer
          // For now, this is a placeholder for the feature
          // const fadeMs = 5; // 5ms fade
          // const fadeSamples = Math.floor((audioBuffer.sampleRate * fadeMs) / 1000);
        }

        this.currentSource.connect(context.destination);

        this.currentSource.onended = () => {
          if (this.audioQueue.length === 0) {
            this.state = 'idle';
            this.onPlaybackEnd?.();
            this.logger?.info('Playback ended');
          }
          resolve();
        };

        if (this.state !== 'playing') {
          this.state = 'playing';
          this.onPlaybackStart?.();
          this.logger?.info('Playback started');
        }

        this.currentSource.start(0);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Pauses audio playback by suspending the `AudioContext`.
   *
   * @remarks
   * If the player is not in the `'playing'` state, this method logs a warning
   * and returns without error.
   */
  async pause(): Promise<void> {
    if (this.state !== 'playing') {
      this.logger?.warn('Cannot pause: not playing');
      return;
    }

    if (this.audioContext) {
      await this.audioContext.suspend();
    }
    this.state = 'paused';
    this.logger?.info('Playback paused');
  }

  /**
   * Resumes audio playback from a paused state.
   *
   * @remarks
   * If the player is not in the `'paused'` state, this method logs a warning
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
    this.state = 'playing';
    this.logger?.info('Playback resumed');
  }

  /**
   * Stops playback immediately and clears the audio queue.
   *
   * @remarks
   * This method:
   * 1. Stops the current `AudioBufferSourceNode` (ignoring errors if already stopped).
   * 2. Clears the chunk queue.
   * 3. Resets the queue-processing flag.
   * 4. Sets the state to `'stopped'` and clears metadata.
   * 5. Invokes the `onPlaybackEnd` callback.
   *
   * After stopping, new chunks can be queued via
   * {@link AudioPlayer.addChunk | addChunk()} to start a new playback session.
   */
  async stop(): Promise<void> {
    this.logger?.info('Stopping playback');

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Ignore errors if already stopped
      }
      this.currentSource = null;
    }

    this.audioQueue = [];
    this.isProcessingQueue = false;
    this.state = 'stopped';
    this.metadata = null;

    this.onPlaybackEnd?.();
    this.logger?.info('Playback stopped');
  }

  /**
   * Waits for all queued audio to finish playing.
   *
   * @remarks
   * Polls every 50ms until the queue is empty, the queue processor has
   * finished, and the state returns to `'idle'`. If the timeout is exceeded, a
   * warning is logged and the method returns (audio may still be playing).
   *
   * @param timeoutMs - Maximum wait time in milliseconds.
   *   @defaultValue 30000
   *
   * @example
   * ```ts
   * // Add all chunks, then wait for playback to complete
   * for (const chunk of chunks) {
   *   await player.addChunk(chunk);
   * }
   * await player.waitForCompletion(10000); // wait up to 10 seconds
   * ```
   */
  async waitForCompletion(timeoutMs = 30000): Promise<void> {
    const start = Date.now();
    while (this.isProcessingQueue || this.audioQueue.length > 0 || this.state !== 'idle') {
      if (Date.now() - start > timeoutMs) {
        this.logger?.warn('waitForCompletion timed out — audio may still be playing');
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
    }
  }

  /**
   * Handles playback errors by logging, resetting state, and invoking the
   * error callback.
   *
   * @param error - The error that occurred during playback.
   */
  private handleError(error: Error): void {
    this.logger?.error('Playback error', error);
    this.state = 'idle';
    this.onPlaybackError?.(error);
  }

  /**
   * Disposes of the player by stopping playback and closing the `AudioContext`.
   *
   * @remarks
   * This method stops any active playback, clears the queue, closes the
   * `AudioContext`, and nullifies all callback references. After disposal, the
   * instance should not be reused.
   */
  async dispose(): Promise<void> {
    await this.stop();

    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }

    this.onPlaybackStart = null;
    this.onPlaybackEnd = null;
    this.onPlaybackError = null;
  }

  /**
   * Returns the underlying `AudioContext`, if one has been created.
   *
   * @remarks
   * This is intended for advanced use cases where direct access to the audio
   * context is needed. Returns `null` if no playback has been initiated or if
   * the player has been disposed.
   *
   * @returns The active `AudioContext`, or `null` if none exists.
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Returns a copy of the current audio output configuration.
   *
   * @remarks
   * The returned object is a shallow copy; modifying it does not affect the
   * internal configuration. Use {@link AudioPlayer.updateConfig | updateConfig()}
   * to change settings.
   *
   * @returns A copy of the current {@link AudioOutputConfig}.
   */
  getConfig(): AudioOutputConfig {
    return { ...this.config };
  }

  /**
   * Updates the audio output configuration.
   *
   * @remarks
   * Configuration changes may affect subsequent playback behavior (e.g.
   * buffer duration thresholds). Some settings (like `sampleRate`) only take
   * effect when a new `AudioContext` is created.
   *
   * @param config - Partial configuration to merge with the current settings.
   */
  updateConfig(config: Partial<AudioOutputConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger?.info('Audio configuration updated');
  }
}
