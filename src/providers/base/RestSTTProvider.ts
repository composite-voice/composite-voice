/**
 * Base REST STT provider class
 */

import type { RestSTTProvider as IRestSTTProvider, STTProviderConfig } from '../../core/types/providers';
import { BaseSTTProvider } from './BaseSTTProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base REST STT provider
 * REST providers transcribe complete audio files and emit results via onTranscription callback
 */
export abstract class RestSTTProvider extends BaseSTTProvider implements IRestSTTProvider {
  constructor(config: STTProviderConfig, logger?: Logger) {
    super('rest', config, logger);
  }

  /**
   * Transcribe complete audio file
   * Provider should call emitTranscription() with the result
   * @param audio Complete audio blob to transcribe
   */
  abstract transcribe(audio: Blob): Promise<void>;
}

