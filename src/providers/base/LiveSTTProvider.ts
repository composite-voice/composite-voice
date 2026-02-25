/**
 * Abstract base class for WebSocket-based real-time STT providers.
 *
 * @packageDocumentation
 */

import type {
  LiveSTTProvider as ILiveSTTProvider,
  STTProviderConfig,
} from '../../core/types/providers';
import { BaseSTTProvider } from './BaseSTTProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base class for live (WebSocket) speech-to-text providers.
 *
 * @remarks
 * `LiveSTTProvider` extends {@link BaseSTTProvider} with a WebSocket
 * streaming lifecycle: **connect**, **sendAudio**, and **disconnect**.
 * This is the base class you should extend when building a real-time
 * STT provider that receives a continuous audio stream over a persistent
 * connection.
 *
 * The typical data flow is:
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> WebSocket -> STT Engine
 *                                                                   |
 * CompositeVoice <- onTranscription(result) <--- emitTranscription <-+
 * ```
 *
 * **Inheritance hierarchy:**
 *
 * ```
 * BaseProvider
 *  +-- BaseSTTProvider
 *       +-- LiveSTTProvider     <-- you are here
 *       |    +-- DeepgramSTT
 *       |    +-- AssemblyAISTT
 *       |    +-- NativeSTT
 *       +-- RestSTTProvider
 * ```
 *
 * @example
 * ```ts
 * import { LiveSTTProvider } from 'composite-voice';
 * import type { STTProviderConfig } from 'composite-voice';
 *
 * class MyLiveSTT extends LiveSTTProvider {
 *   private ws: WebSocket | null = null;
 *
 *   constructor(config: STTProviderConfig) {
 *     super(config);
 *   }
 *
 *   protected async onInitialize(): Promise<void> { }
 *   protected async onDispose(): Promise<void> { await this.disconnect(); }
 *
 *   async connect(): Promise<void> {
 *     this.ws = new WebSocket('wss://my-stt-service.example.com');
 *     this.ws.onmessage = (e) => {
 *       const data = JSON.parse(e.data);
 *       this.emitTranscription({
 *         text: data.text,
 *         isFinal: data.isFinal,
 *         confidence: data.confidence,
 *       });
 *     };
 *   }
 *
 *   sendAudio(chunk: ArrayBuffer): void {
 *     this.ws?.send(chunk);
 *   }
 *
 *   async disconnect(): Promise<void> {
 *     this.ws?.close();
 *     this.ws = null;
 *   }
 * }
 * ```
 *
 * @see {@link BaseSTTProvider} for the shared STT callback mechanism
 * @see {@link RestSTTProvider} for batch/file-based STT
 * @see {@link DeepgramSTT} for a concrete WebSocket STT implementation
 * @see {@link AssemblyAISTT} for another concrete WebSocket STT implementation
 */
export abstract class LiveSTTProvider extends BaseSTTProvider implements ILiveSTTProvider {
  /**
   * Create a new live STT provider.
   *
   * @param config - STT provider configuration.
   * @param logger - Optional parent logger; a child will be derived.
   */
  constructor(config: STTProviderConfig, logger?: Logger) {
    super('websocket', config, logger);
  }

  /**
   * Open the WebSocket connection to the streaming STT service.
   *
   * @remarks
   * Implementations should establish the connection, set up event handlers,
   * and resolve the promise once the connection is confirmed open.
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the connection cannot be established (timeout, auth failure, etc.).
   *
   * @virtual
   */
  abstract connect(): Promise<void>;

  /**
   * Send a raw audio chunk to the STT service for real-time transcription.
   *
   * @remarks
   * CompositeVoice calls this method with audio data captured from the
   * microphone. The provider should forward the data over the WebSocket
   * connection. For providers that manage their own audio (e.g.
   * {@link NativeSTT}), this method is a no-op.
   *
   * @param chunk - Raw audio data as an `ArrayBuffer`.
   *
   * @virtual
   */
  abstract sendAudio(chunk: ArrayBuffer): void;

  /**
   * Close the WebSocket connection to the streaming STT service.
   *
   * @remarks
   * Implementations should gracefully close the connection, flush any
   * pending data, and clean up resources.
   *
   * @virtual
   */
  abstract disconnect(): Promise<void>;
}
