/**
 * Base all-in-one provider class
 */

import type {
  AllInOneProvider,
  AllInOneProviderConfig,
  TranscriptionResult,
} from '../../core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../core/types/audio';
import { BaseProvider } from './BaseProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base all-in-one provider
 */
export abstract class BaseAllInOneProvider extends BaseProvider implements AllInOneProvider {
  public override config: AllInOneProviderConfig;
  protected transcriptionCallback?: (result: TranscriptionResult) => void;
  protected llmChunkCallback?: (text: string) => void;
  protected audioCallback?: (chunk: AudioChunk) => void;
  protected metadataCallback?: (metadata: AudioMetadata) => void;

  constructor(config: AllInOneProviderConfig, logger?: Logger) {
    super('websocket', config, logger);
    this.config = config;
  }

  /**
   * Connect to the all-in-one service
   */
  abstract connect(): Promise<void>;

  /**
   * Send audio for processing
   */
  abstract sendAudio(chunk: ArrayBuffer): void;

  /**
   * Send text for processing (optional)
   */
  sendText?(text: string): void;

  /**
   * Disconnect from the service
   */
  abstract disconnect(): Promise<void>;

  /**
   * Register callback for transcription results
   */
  onTranscription(callback: (result: TranscriptionResult) => void): void {
    this.transcriptionCallback = callback;
  }

  /**
   * Register callback for LLM text chunks
   */
  onLLMChunk(callback: (text: string) => void): void {
    this.llmChunkCallback = callback;
  }

  /**
   * Register callback for audio responses
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Register callback for audio metadata
   */
  onMetadata(callback: (metadata: AudioMetadata) => void): void {
    this.metadataCallback = callback;
  }

  /**
   * Emit transcription result
   */
  protected emitTranscription(result: TranscriptionResult): void {
    if (this.transcriptionCallback) {
      this.transcriptionCallback(result);
    }
  }

  /**
   * Emit LLM text chunk
   */
  protected emitLLMChunk(text: string): void {
    if (this.llmChunkCallback) {
      this.llmChunkCallback(text);
    }
  }

  /**
   * Emit audio chunk
   */
  protected emitAudio(chunk: AudioChunk): void {
    if (this.audioCallback) {
      this.audioCallback(chunk);
    }
  }

  /**
   * Emit audio metadata
   */
  protected emitMetadata(metadata: AudioMetadata): void {
    if (this.metadataCallback) {
      this.metadataCallback(metadata);
    }
  }

  /**
   * Get current configuration
   */
  override getConfig(): AllInOneProviderConfig {
    return { ...this.config };
  }
}
