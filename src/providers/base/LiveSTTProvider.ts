/**
 * Base Live STT provider class
 */

import type {
  LiveSTTProvider as ILiveSTTProvider,
  STTProviderConfig,
} from '../../core/types/providers';
import { BaseSTTProvider } from './BaseSTTProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base Live STT provider
 */
export abstract class LiveSTTProvider extends BaseSTTProvider implements ILiveSTTProvider {
  constructor(config: STTProviderConfig, logger?: Logger) {
    super('websocket', config, logger);
  }

  /**
   * Connect to streaming service
   */
  abstract connect(): Promise<void>;

  /**
   * Send audio chunk for transcription
   * CompositeVoice sends audio TO provider
   */
  abstract sendAudio(chunk: ArrayBuffer): void;

  /**
   * Disconnect from streaming service
   */
  abstract disconnect(): Promise<void>;
}

