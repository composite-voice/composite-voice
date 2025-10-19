/**
 * Base STT provider class
 */

import type {
  STTProvider,
  STTProviderConfig,
  TranscriptionResult,
} from '../../core/types/providers';
import { BaseProvider } from './BaseProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base STT provider
 */
export abstract class BaseSTTProvider extends BaseProvider implements STTProvider {
  public override config: STTProviderConfig;
  protected transcriptionCallback?: (result: TranscriptionResult) => void;

  constructor(config: STTProviderConfig, logger?: Logger) {
    super('rest', config, logger);
    this.config = config;
  }

  /**
   * Transcribe complete audio (REST providers)
   */
  async transcribe?(audio: Blob): Promise<string>;

  /**
   * Connect to streaming service (WebSocket providers)
   */
  async connect?(): Promise<void>;

  /**
   * Send audio chunk for transcription (WebSocket providers)
   */
  sendAudio?(chunk: ArrayBuffer): void;

  /**
   * Disconnect from streaming service (WebSocket providers)
   */
  async disconnect?(): Promise<void>;

  /**
   * Register callback for transcription results (WebSocket providers)
   */
  onTranscription(callback: (result: TranscriptionResult) => void): void {
    this.transcriptionCallback = callback;
  }

  /**
   * Emit transcription result to callback
   */
  protected emitTranscription(result: TranscriptionResult): void {
    if (this.transcriptionCallback) {
      this.transcriptionCallback(result);
    }
  }

  /**
   * Get current configuration
   */
  override getConfig(): STTProviderConfig {
    return { ...this.config };
  }
}
