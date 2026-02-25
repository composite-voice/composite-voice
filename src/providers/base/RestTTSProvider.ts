/**
 * Abstract base class for REST-based (batch) TTS providers.
 *
 * @packageDocumentation
 */

import type {
  RestTTSProvider as IRestTTSProvider,
  TTSProviderConfig,
} from '../../core/types/providers';
import { BaseTTSProvider } from './BaseTTSProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base class for REST (batch) text-to-speech providers.
 *
 * @remarks
 * `RestTTSProvider` extends {@link BaseTTSProvider} with a single
 * {@link synthesize} method that accepts complete text and returns an
 * audio `Blob`. Use this base class when the TTS service exposes an HTTP
 * endpoint that returns the full audio in one response rather than
 * streaming chunks over a WebSocket.
 *
 * The typical data flow is:
 *
 * ```
 * LLM completes full response -> synthesize(text) -> HTTP POST -> TTS Engine
 *                                                                     |
 *                               Blob <-------------------------------+
 *                                |
 * AudioPlayer <-- plays Blob directly
 * ```
 *
 * **Inheritance hierarchy:**
 *
 * ```
 * BaseProvider
 *  +-- BaseTTSProvider
 *       +-- LiveTTSProvider
 *       +-- RestTTSProvider     <-- you are here
 *            +-- OpenAITTS
 * ```
 *
 * @example
 * ```ts
 * import { RestTTSProvider } from 'composite-voice';
 * import type { TTSProviderConfig } from 'composite-voice';
 *
 * class MyRestTTS extends RestTTSProvider {
 *   constructor(config: TTSProviderConfig) {
 *     super(config);
 *   }
 *
 *   protected async onInitialize(): Promise<void> { }
 *   protected async onDispose(): Promise<void> { }
 *
 *   async synthesize(text: string): Promise<Blob> {
 *     const response = await fetch('https://my-tts.example.com/synthesize', {
 *       method: 'POST',
 *       headers: { 'Content-Type': 'application/json' },
 *       body: JSON.stringify({ text, voice: this.config.voice }),
 *     });
 *     return response.blob();
 *   }
 * }
 * ```
 *
 * @see {@link BaseTTSProvider} for the shared audio callback mechanism
 * @see {@link LiveTTSProvider} for WebSocket-based streaming TTS
 */
export abstract class RestTTSProvider extends BaseTTSProvider implements IRestTTSProvider {
  /**
   * Create a new REST TTS provider.
   *
   * @param config - TTS provider configuration (voice, model, rate, etc.).
   * @param logger - Optional parent logger; a child will be derived.
   */
  constructor(config: TTSProviderConfig, logger?: Logger) {
    super('rest', config, logger);
  }

  /**
   * Synthesize complete text into an audio blob.
   *
   * @remarks
   * Implementations should send the text to the TTS service via HTTP and
   * return the resulting audio data as a `Blob`. The caller (typically
   * CompositeVoice) is responsible for playing the audio.
   *
   * @param text - The full text to synthesize.
   * @returns A `Blob` containing the synthesized audio data.
   *
   * @virtual
   */
  abstract synthesize(text: string): Promise<Blob>;
}
