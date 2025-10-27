/**
 * Abstract base TTS provider class
 * Contains common functionality for all TTS providers
 */

import type { TTSProviderConfig } from '../../core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../core/types/audio';
import { BaseProvider } from './BaseProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base TTS provider
 * All TTS providers (Rest/Live) extend this
 */
export abstract class BaseTTSProvider extends BaseProvider {
  public override config: TTSProviderConfig;
  protected audioCallback?: (chunk: AudioChunk) => void;
  protected metadataCallback?: (metadata: AudioMetadata) => void;

  constructor(type: 'rest' | 'websocket', config: TTSProviderConfig, logger?: Logger) {
    super(type, config, logger);
    this.config = config;
  }

  /**
   * Register callback for audio chunks
   * All TTS providers send audio via this callback
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Register callback for audio metadata (optional)
   * Providers should emit metadata at the start if available
   * Providers are not required to call emitMetadata
   */
  onMetadata(callback: (metadata: AudioMetadata) => void): void {
    this.metadataCallback = callback;
  }

  /**
   * Emit audio chunk to callback
   */
  protected emitAudio(chunk: AudioChunk): void {
    if (this.audioCallback) {
      this.audioCallback(chunk);
    }
  }

  /**
   * Emit audio metadata to callback
   */
  protected emitMetadata(metadata: AudioMetadata): void {
    if (this.metadataCallback) {
      this.metadataCallback(metadata);
    }
  }

  /**
   * Get current configuration
   */
  override getConfig(): TTSProviderConfig {
    return { ...this.config };
  }
}
