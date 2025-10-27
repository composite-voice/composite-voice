/**
 * Abstract base STT provider class
 * Contains common functionality for all STT providers
 */

import type {
  STTProviderConfig,
  TranscriptionResult,
} from '../../core/types/providers';
import { BaseProvider } from './BaseProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base STT provider
 * All STT providers (Rest/Live) extend this
 */
export abstract class BaseSTTProvider extends BaseProvider {
  public override config: STTProviderConfig;
  protected transcriptionCallback?: (result: TranscriptionResult) => void;

  constructor(type: 'rest' | 'websocket', config: STTProviderConfig, logger?: Logger) {
    super(type, config, logger);
    this.config = config;
  }

  /**
   * Register callback for transcription results
   * All STT providers send text via this callback
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
