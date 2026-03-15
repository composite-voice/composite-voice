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
 * streaming lifecycle: **connect**, **processChunk**, **finalize**, and
 * **disconnect**. This is the base class you should extend when building
 * a real-time TTS provider that accepts incremental text and streams
 * synthesized audio back over a persistent connection.
 *
 * The `processChunk` handler (inherited from {@link BaseTTSProvider} as
 * abstract) is implemented here to delegate to the abstract
 * {@link sendTextToSocket} method, which subclasses must implement.
 *
 * The typical data flow is:
 *
 * ```
 * LLM yields text chunk -> processChunk(chunk) -> WebSocket -> TTS Engine
 *                                                                  |
 * AudioPlayer <- onAudio(audioChunk) <--- emitAudio <------------+
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
 *   sendTextToSocket(text: string): void {
 *     this.ws?.send(JSON.stringify({ text }));
 *   }
 *
 *   async finalizeSocket(): Promise<void> {
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
 * @see {@link BaseTTSProvider} for the shared audio callback and guard mechanism
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
   * Send a text chunk for real-time synthesis.
   *
   * @remarks
   * This is the public method required by the {@link ILiveTTSProvider} interface.
   * It delegates to {@link sendTextToSocket}, which subclasses implement to
   * forward text over the WebSocket connection.
   *
   * @param chunk - Text to synthesize.
   */
  sendText(chunk: string): void {
    this.sendTextToSocket(chunk);
  }

  /**
   * Process a text chunk by sending it over the WebSocket for synthesis.
   *
   * @remarks
   * Legacy alias for {@link sendText}. Delegates to {@link sendTextToSocket}.
   *
   * @param text - A piece of text to synthesize.
   */
  processChunk(text: string): void {
    this.sendTextToSocket(text);
  }

  /**
   * Send a text chunk over the WebSocket connection.
   *
   * @remarks
   * Subclasses implement this to forward text to the TTS service.
   *
   * @param text - A piece of text to synthesize.
   *
   * @virtual
   */
  protected abstract sendTextToSocket(text: string): void;

  /**
   * Finalize synthesis — flush remaining audio.
   *
   * @remarks
   * Called after all text has been sent via {@link processChunk}. Delegates
   * to {@link finalizeSocket}, which subclasses implement to flush the
   * WebSocket connection.
   */
  async finalize(): Promise<void> {
    await this.finalizeSocket();
  }

  /**
   * Signal the WebSocket that all text has been sent and flush remaining audio.
   *
   * @remarks
   * Implementations should send a flush/finalize message to the TTS service
   * and ensure all remaining audio is synthesized and emitted before resolving.
   *
   * @virtual
   */
  protected abstract finalizeSocket(): Promise<void>;

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
