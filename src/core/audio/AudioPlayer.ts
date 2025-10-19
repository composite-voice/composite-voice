/**
 * Audio playback manager
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
 * Playback callback types
 */
export type PlaybackStartCallback = () => void;
export type PlaybackEndCallback = () => void;
export type PlaybackErrorCallback = (error: Error) => void;

/**
 * Audio player manager
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

  constructor(config: Partial<AudioOutputConfig> = {}, logger?: Logger) {
    this.config = { ...DEFAULT_AUDIO_OUTPUT_CONFIG, ...config };
    this.logger = logger ? logger.child('AudioPlayer') : undefined;
  }

  /**
   * Get current playback state
   */
  getState(): AudioPlaybackState {
    return this.state;
  }

  /**
   * Check if currently playing
   */
  isPlaying(): boolean {
    return this.state === 'playing';
  }

  /**
   * Initialize audio context
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
   * Set playback callbacks
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
   * Set audio metadata for streaming playback
   */
  setMetadata(metadata: AudioMetadata): void {
    this.metadata = metadata;
    this.logger?.debug('Audio metadata set', metadata);
  }

  /**
   * Play a complete audio blob
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
   * Add audio chunk to streaming queue
   */
  async addChunk(chunk: AudioChunk): Promise<void> {
    this.audioQueue.push(chunk);

    if (!this.isProcessingQueue) {
      void this.processQueue();
    }
  }

  /**
   * Process queued audio chunks
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

        const chunk = this.audioQueue.shift();
        if (!chunk) continue;

        await this.playChunk(chunk);
      }

      this.state = 'idle';
    } catch (error) {
      this.handleError(error as Error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Check if we have minimum buffer duration
   */
  private hasMinimumBuffer(): boolean {
    if (this.audioQueue.length === 0) return false;

    const totalBytes = this.audioQueue.reduce((sum, chunk) => sum + chunk.data.byteLength, 0);
    const bytesPerMs = this.estimateBytesPerMs();
    const bufferDuration = totalBytes / bytesPerMs;

    return bufferDuration >= (this.config.minBufferDuration ?? 200);
  }

  /**
   * Wait for minimum buffer to be filled
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
   * Estimate bytes per millisecond based on metadata
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
   * Play a single audio chunk
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
   * Decode audio chunk to AudioBuffer
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
   * Create AudioBuffer from raw PCM data
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
   * Play an AudioBuffer
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
   * Pause playback
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
   * Resume playback
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
   * Stop playback and clear queue
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
   * Handle playback errors
   */
  private handleError(error: Error): void {
    this.logger?.error('Playback error', error);
    this.state = 'idle';
    this.onPlaybackError?.(error);
  }

  /**
   * Clean up resources
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
   * Get audio context (for advanced use cases)
   */
  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Get current audio configuration
   */
  getConfig(): AudioOutputConfig {
    return { ...this.config };
  }

  /**
   * Update audio configuration
   */
  updateConfig(config: Partial<AudioOutputConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger?.info('Audio configuration updated');
  }
}
