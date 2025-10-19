/**
 * Base TTS provider class
 */

import type { TTSProvider, TTSProviderConfig } from '../../core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../core/types/audio';
import { BaseProvider } from './BaseProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base TTS provider
 */
export abstract class BaseTTSProvider extends BaseProvider implements TTSProvider {
  public override config: TTSProviderConfig;
  protected audioCallback?: (chunk: AudioChunk) => void;
  protected metadataCallback?: (metadata: AudioMetadata) => void;

  constructor(config: TTSProviderConfig, logger?: Logger) {
    super('rest', config, logger);
    this.config = config;
  }

  /**
   * Synthesize complete text to audio (REST providers)
   */
  async synthesize?(text: string): Promise<Blob>;

  /**
   * Connect to streaming service (WebSocket providers)
   */
  async connect?(): Promise<void>;

  /**
   * Send text chunk for synthesis (WebSocket providers)
   */
  sendText?(chunk: string): void;

  /**
   * Finalize synthesis and process remaining text (WebSocket providers)
   */
  async finalize?(): Promise<void>;

  /**
   * Disconnect from streaming service (WebSocket providers)
   */
  async disconnect?(): Promise<void>;

  /**
   * Register callback for audio chunks (WebSocket providers)
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Register callback for audio metadata (WebSocket providers)
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
