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
 * streaming lifecycle: **connect**, **processAudio**, and **disconnect**.
 * This is the base class you should extend when building a real-time
 * STT provider that receives a continuous audio stream over a persistent
 * connection.
 *
 * The `processAudio` handler method (inherited from {@link BaseSTTProvider}
 * as abstract) is implemented here to delegate to the abstract
 * {@link sendAudioToSocket} method, which subclasses must implement to
 * forward audio data over the WebSocket.
 *
 * The typical data flow is:
 *
 * ```
 * Microphone -> AudioCapture -> processAudio(chunk) -> WebSocket -> STT Engine
 *                                                                      |
 * CompositeVoice <- onTranscription(result) <--- emitTranscription <--+
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
 *   sendAudioToSocket(chunk: ArrayBuffer): void {
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
 * @see {@link BaseSTTProvider} for the shared STT callback and guard mechanism
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
   * Send an audio chunk for real-time transcription.
   *
   * @remarks
   * This is the public method required by the {@link ILiveSTTProvider} interface.
   * It delegates to {@link sendAudioToSocket}, which subclasses implement to
   * forward audio data over the WebSocket connection. For providers that manage
   * their own audio (e.g. {@link NativeSTT}), `sendAudioToSocket` is a no-op.
   *
   * @param chunk - Raw audio data as an `ArrayBuffer`.
   */
  sendAudio(chunk: ArrayBuffer): void {
    this.sendAudioToSocket(chunk);
  }

  /**
   * Process a raw audio chunk by sending it over the WebSocket.
   *
   * @remarks
   * Legacy alias for {@link sendAudio}. Delegates to {@link sendAudioToSocket}.
   *
   * @param chunk - Raw audio data as an `ArrayBuffer`.
   */
  processAudio(chunk: ArrayBuffer): void {
    this.sendAudioToSocket(chunk);
  }

  /**
   * Send a raw audio chunk over the WebSocket connection.
   *
   * @remarks
   * Subclasses implement this to forward audio data to the STT service.
   * For providers that manage their own audio capture (e.g. NativeSTT),
   * this method is a no-op.
   *
   * @param chunk - Raw audio data as an `ArrayBuffer`.
   *
   * @virtual
   */
  protected abstract sendAudioToSocket(chunk: ArrayBuffer): void;

  /**
   * Emit the standardized "connection lost" error result.
   *
   * @remarks
   * Every live STT provider MUST call this when its streaming connection
   * dies unexpectedly mid-session (server-initiated close, reconnection
   * give-up, fatal transport error) and will not recover on its own.
   * This error-shaped result is the liveness signal the pipeline's error
   * handling (`transcription.error`) and `FallbackSTT`'s mid-session
   * failover depend on — a provider that only logs and flips an internal
   * flag leaves the session silently dead.
   *
   * Do NOT call this for closes the application requested via
   * `disconnect()`.
   *
   * @param message - Human-readable description of why the connection died.
   */
  protected emitConnectionLost(message: string): void {
    this.emitTranscription({
      text: '',
      isFinal: true,
      confidence: 0,
      metadata: {
        error: 'ws_closed',
        message,
      },
    });
  }

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
