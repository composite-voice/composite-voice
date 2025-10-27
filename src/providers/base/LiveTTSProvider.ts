/**
 * Base Live TTS provider class
 */

import type { LiveTTSProvider as ILiveTTSProvider, TTSProviderConfig } from '../../core/types/providers';
import { BaseTTSProvider } from './BaseTTSProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base Live TTS provider
 */
export abstract class LiveTTSProvider extends BaseTTSProvider implements ILiveTTSProvider {
  constructor(config: TTSProviderConfig, logger?: Logger) {
    super('websocket', config, logger);
  }

  /**
   * Connect to streaming service
   */
  abstract connect(): Promise<void>;

  /**
   * Send text chunk for synthesis
   * CompositeVoice sends text TO provider
   */
  abstract sendText(chunk: string): void;

  /**
   * Finalize synthesis and process remaining text
   */
  abstract finalize(): Promise<void>;

  /**
   * Disconnect from streaming service
   */
  abstract disconnect(): Promise<void>;
}
