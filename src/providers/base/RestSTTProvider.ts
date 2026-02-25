/**
 * Abstract base class for REST-based (batch) STT providers.
 *
 * @packageDocumentation
 */

import type {
  RestSTTProvider as IRestSTTProvider,
  STTProviderConfig,
} from '../../core/types/providers';
import { BaseSTTProvider } from './BaseSTTProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base class for REST (batch/file-based) speech-to-text providers.
 *
 * @remarks
 * `RestSTTProvider` extends {@link BaseSTTProvider} with a single
 * {@link transcribe} method that accepts a complete audio `Blob` and
 * delivers the result through the inherited {@link emitTranscription}
 * callback. Use this base class when the STT service exposes an HTTP
 * endpoint rather than a persistent WebSocket connection.
 *
 * The typical data flow is:
 *
 * ```
 * AudioCapture records full utterance -> transcribe(blob) -> HTTP POST -> STT Engine
 *                                                                            |
 * CompositeVoice <- onTranscription(result) <--- emitTranscription <--------+
 * ```
 *
 * **Inheritance hierarchy:**
 *
 * ```
 * BaseProvider
 *  +-- BaseSTTProvider
 *       +-- LiveSTTProvider
 *       +-- RestSTTProvider     <-- you are here
 * ```
 *
 * @example
 * ```ts
 * import { RestSTTProvider } from 'composite-voice';
 * import type { STTProviderConfig } from 'composite-voice';
 *
 * class MyRestSTT extends RestSTTProvider {
 *   constructor(config: STTProviderConfig) {
 *     super(config);
 *   }
 *
 *   protected async onInitialize(): Promise<void> { }
 *   protected async onDispose(): Promise<void> { }
 *
 *   async transcribe(audio: Blob): Promise<void> {
 *     const formData = new FormData();
 *     formData.append('audio', audio);
 *
 *     const response = await fetch('https://my-stt.example.com/transcribe', {
 *       method: 'POST',
 *       body: formData,
 *     });
 *     const result = await response.json();
 *
 *     this.emitTranscription({
 *       text: result.text,
 *       isFinal: true,
 *       confidence: result.confidence,
 *     });
 *   }
 * }
 * ```
 *
 * @see {@link BaseSTTProvider} for the shared STT callback mechanism
 * @see {@link LiveSTTProvider} for WebSocket-based real-time STT
 */
export abstract class RestSTTProvider extends BaseSTTProvider implements IRestSTTProvider {
  /**
   * Create a new REST STT provider.
   *
   * @param config - STT provider configuration.
   * @param logger - Optional parent logger; a child will be derived.
   */
  constructor(config: STTProviderConfig, logger?: Logger) {
    super('rest', config, logger);
  }

  /**
   * Transcribe a complete audio file.
   *
   * @remarks
   * Implementations should upload the audio blob to the STT service,
   * wait for the transcription result, and call {@link emitTranscription}
   * with the result. The promise resolves once the transcription has been
   * emitted.
   *
   * @param audio - Complete audio data as a `Blob`.
   *
   * @virtual
   */
  abstract transcribe(audio: Blob): Promise<void>;
}
