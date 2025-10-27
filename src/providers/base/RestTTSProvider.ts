/**
 * Base REST TTS provider class
 */

import type { RestTTSProvider as IRestTTSProvider, TTSProviderConfig } from '../../core/types/providers';
import { BaseTTSProvider } from './BaseTTSProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base REST TTS provider
 */
export abstract class RestTTSProvider extends BaseTTSProvider implements IRestTTSProvider {
  constructor(config: TTSProviderConfig, logger?: Logger) {
    super('rest', config, logger);
  }

  /**
   * Synthesize complete text to audio
   */
  abstract synthesize(text: string): Promise<Blob>;
}

