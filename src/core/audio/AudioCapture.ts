/**
 * Audio capture manager for microphone input
 */

import type { AudioInputConfig, AudioCaptureState } from '../types/audio';
import { AudioCaptureError, MicrophonePermissionError } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import { floatTo16BitPCM, downsampleAudio } from '../../utils/audio';
import { DEFAULT_AUDIO_INPUT_CONFIG } from '../types/config';

/**
 * Audio capture callback type
 */
export type AudioCaptureCallback = (audioData: ArrayBuffer) => void;

/**
 * Audio capture manager
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

  constructor(config: Partial<AudioInputConfig> = {}, logger?: Logger) {
    this.config = { ...DEFAULT_AUDIO_INPUT_CONFIG, ...config };
    this.logger = logger ? logger.child('AudioCapture') : undefined;
  }

  /**
   * Get current capture state
   */
  getState(): AudioCaptureState {
    return this.state;
  }

  /**
   * Check if actively capturing
   */
  isCapturing(): boolean {
    return this.state === 'active';
  }

  /**
   * Request microphone permission
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
   * Check microphone permission status
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
   * Start capturing audio
   */
  async start(callback: AudioCaptureCallback): Promise<void> {
    if (this.state === 'active') {
      this.logger?.warn('Already capturing audio');
      return;
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
   * Calculate appropriate buffer size
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
   * Process audio data from microphone
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
   * Convert audio data to configured format
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
   * Pause audio capture
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
   * Resume audio capture
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
   * Stop capturing audio
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
   * Clean up resources
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
   * Get audio context (for advanced use cases)
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Get current audio configuration
   */
  getConfig(): AudioInputConfig {
    return { ...this.config };
  }

  /**
   * Update audio configuration (requires restart to take effect)
   */
  updateConfig(config: Partial<AudioInputConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger?.info('Audio configuration updated');
  }
}
