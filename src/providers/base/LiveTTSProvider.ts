/**
 * Abstract base class for WebSocket-based real-time TTS providers.
 *
 * @packageDocumentation
 */

import type {
  LiveTTSProvider as ILiveTTSProvider,
  TTSProviderConfig,
} from '../../core/types/providers';
import { BaseTTSProvider } from './BaseTTSProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base class for live (WebSocket) text-to-speech providers.
 *
 * @remarks
 * `LiveTTSProvider` extends {@link BaseTTSProvider} with a WebSocket
 * streaming lifecycle: **connect**, **sendText**, **finalize**, and
 * **disconnect**. This is the base class you should extend when building
 * a real-time TTS provider that accepts incremental text and streams
 * synthesized audio back over a persistent connection.
 *
 * The typical data flow is:
 *
 * ```
 * LLM yields text chunk -> sendText(chunk) -> WebSocket -> TTS Engine
 *                                                             |
 * AudioPlayer <- onAudio(audioChunk) <--- emitAudio <--------+
 * ```
 *
 * When all text has been sent, {@link finalize} signals the provider to
 * flush any buffered text and complete synthesis for the current utterance.
 *
 * **Inheritance hierarchy:**
 *
 * ```
 * BaseProvider
 *  +-- BaseTTSProvider
 *       +-- LiveTTSProvider     <-- you are here
 *       |    +-- DeepgramTTS
 *       |    +-- ElevenLabsTTS
 *       +-- RestTTSProvider
 * ```
 *
 * @example
 * ```ts
 * import { LiveTTSProvider } from 'composite-voice';
 * import type { TTSProviderConfig } from 'composite-voice';
 *
 * class MyLiveTTS extends LiveTTSProvider {
 *   private ws: WebSocket | null = null;
 *
 *   constructor(config: TTSProviderConfig) {
 *     super(config);
 *   }
 *
 *   protected async onInitialize(): Promise<void> { }
 *   protected async onDispose(): Promise<void> { await this.disconnect(); }
 *
 *   async connect(): Promise<void> {
 *     this.ws = new WebSocket('wss://my-tts-service.example.com');
 *     this.ws.onmessage = (e) => {
 *       this.emitAudio({
 *         data: e.data,
 *         timestamp: Date.now(),
 *       });
 *     };
 *   }
 *
 *   sendText(chunk: string): void {
 *     this.ws?.send(JSON.stringify({ text: chunk }));
 *   }
 *
 *   async finalize(): Promise<void> {
 *     this.ws?.send(JSON.stringify({ flush: true }));
 *   }
 *
 *   async disconnect(): Promise<void> {
 *     this.ws?.close();
 *     this.ws = null;
 *   }
 * }
 * ```
 *
 * @see {@link BaseTTSProvider} for the shared audio callback mechanism
 * @see {@link RestTTSProvider} for batch/REST TTS
 */
export abstract class LiveTTSProvider extends BaseTTSProvider implements ILiveTTSProvider {
  /**
   * Create a new live TTS provider.
   *
   * @param config - TTS provider configuration (voice, model, rate, etc.).
   * @param logger - Optional parent logger; a child will be derived.
   */
  constructor(config: TTSProviderConfig, logger?: Logger) {
    super('websocket', config, logger);
  }

  /**
   * Open the WebSocket connection to the streaming TTS service.
   *
   * @remarks
   * Implementations should establish the connection, set up event handlers
   * for incoming audio data, and resolve once the connection is confirmed
   * open.
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the connection cannot be established.
   *
   * @virtual
   */
  abstract connect(): Promise<void>;

  /**
   * Send a text chunk to the TTS service for incremental synthesis.
   *
   * @remarks
   * CompositeVoice calls this method as the LLM yields text tokens.
   * The provider should forward the text over the WebSocket connection.
   * Audio results arrive asynchronously via the {@link onAudio} callback.
   *
   * @param chunk - A piece of text to synthesize.
   *
   * @virtual
   */
  abstract sendText(chunk: string): void;

  /**
   * Signal that all text for the current utterance has been sent.
   *
   * @remarks
   * Implementations should flush any internally buffered text and ensure
   * all remaining audio is synthesized and emitted before resolving.
   *
   * @virtual
   */
  abstract finalize(): Promise<void>;

  /**
   * Close the WebSocket connection to the streaming TTS service.
   *
   * @remarks
   * Implementations should gracefully close the connection and clean up
   * resources.
   *
   * @virtual
   */
  abstract disconnect(): Promise<void>;
}
