/**
 * Cartesia TTS provider using WebSocket streaming API.
 *
 * @remarks
 * This module provides a low-latency WebSocket-based real-time streaming text-to-speech
 * provider powered by Cartesia's Sonic voice models. Text chunks are sent over a persistent
 * WebSocket connection with context-based streaming continuation, and audio chunks are
 * received as raw PCM or encoded audio.
 *
 * Transport: WebSocket (direct to Cartesia or via proxy)
 * Audio format: Configurable (pcm_s16le, pcm_f32le, pcm_mulaw, pcm_alaw);
 * default is `pcm_s16le` at 16 kHz in a `raw` container
 *
 * @packageDocumentation
 */

import { LiveTTSProvider } from '../../base/LiveTTSProvider';
import type { TTSProviderConfig, AudioChunk } from '../../../core/types';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * Cartesia voice model identifiers.
 *
 * @remarks
 * - `sonic-2` -- Latest model with improved quality and speed (default)
 * - `sonic` -- Previous-generation model
 * - `sonic-multilingual` -- Multi-language support
 *
 * Custom model IDs are also accepted via the `string & {}` type widening.
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export type CartesiaTTSModel = 'sonic-2' | 'sonic' | 'sonic-multilingual' | (string & {});

/**
 * Cartesia output audio encoding types.
 *
 * @remarks
 * - `pcm_s16le` -- 16-bit signed little-endian PCM (default)
 * - `pcm_f32le` -- 32-bit float little-endian PCM
 * - `pcm_mulaw` -- mu-law encoded PCM (telephony)
 * - `pcm_alaw` -- A-law encoded PCM (telephony)
 *
 * Custom encoding strings are also accepted via the `string & {}` type widening.
 */
export type CartesiaOutputEncoding =
  | 'pcm_s16le'
  | 'pcm_f32le'
  | 'pcm_mulaw'
  | 'pcm_alaw'
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/**
 * Cartesia output format configuration passed in each WebSocket message.
 *
 * @remarks
 * Cartesia requires the output format to be specified in every synthesis request.
 * For WebSocket streaming, the container is always `'raw'` (no wrapper).
 */
export interface CartesiaOutputFormat {
  /**
   * Container format.
   *
   * @remarks
   * Always `'raw'` for WebSocket streaming (no WAV header or other wrapper).
   */
  container: 'raw';

  /**
   * Audio encoding for the output samples.
   *
   * @see {@link CartesiaOutputEncoding}
   */
  encoding: CartesiaOutputEncoding;

  /**
   * Sample rate of the output audio in Hz.
   */
  sample_rate: number;
}

/**
 * Configuration for the {@link CartesiaTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client. The `voiceId` is always required.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: CartesiaTTSConfig = {
 *   apiKey: 'cart-xxxxxxxxxxxx',
 *   voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
 *   modelId: 'sonic-2',
 *   language: 'en',
 *   outputEncoding: 'pcm_s16le',
 *   outputSampleRate: 24000,
 * };
 *
 * // Via proxy server
 * const proxyConfig: CartesiaTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/cartesia',
 *   voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
 * };
 * ```
 *
 * @see {@link CartesiaTTSModel} - Available model options.
 * @see {@link CartesiaOutputEncoding} - Available encoding options.
 */
export interface CartesiaTTSConfig extends TTSProviderConfig {
  /**
   * Cartesia API key for direct authentication.
   *
   * @remarks
   * Required when connecting directly to Cartesia (no proxy).
   * Omit when using `proxyUrl` -- the proxy server supplies the key server-side.
   */
  apiKey?: string;

  /**
   * URL of the CompositeVoice proxy server's Cartesia endpoint.
   *
   * @remarks
   * When set, the WebSocket connection is routed through the proxy and the
   * `apiKey` is not required on the client side. The HTTP URL is automatically
   * converted to a WebSocket URL (`ws://` or `wss://`).
   *
   * @example `'http://localhost:3001/api/proxy/cartesia'`
   */
  proxyUrl?: string;

  /**
   * Cartesia voice ID (required).
   *
   * @remarks
   * Find voice IDs via the {@link https://play.cartesia.ai/voices | Cartesia Voice Library}
   * or the API's list voices endpoint.
   */
  voiceId: string;

  /**
   * Model ID to use for synthesis.
   *
   * @defaultValue `'sonic-2'`
   * @see {@link CartesiaTTSModel}
   */
  modelId?: CartesiaTTSModel;

  /**
   * BCP 47 language code for synthesis.
   *
   * @defaultValue `'en'`
   */
  language?: string;

  /**
   * Output audio encoding format.
   *
   * @defaultValue `'pcm_s16le'`
   * @see {@link CartesiaOutputEncoding}
   */
  outputEncoding?: CartesiaOutputEncoding;

  /**
   * Output audio sample rate in Hz.
   *
   * @defaultValue `16000`
   */
  outputSampleRate?: number;

  /**
   * Speech speed multiplier.
   *
   * @remarks
   * Values greater than 1 speed up speech; values less than 1 slow it down.
   *
   * @defaultValue `undefined` (uses Cartesia's default)
   */
  speed?: number;

  /**
   * Emotion controls for voice expression.
   *
   * @remarks
   * An array of emotion tags that influence the voice's expressiveness.
   * Example tags: `'positivity:high'`, `'curiosity'`, `'anger:low'`.
   *
   * @defaultValue `undefined`
   *
   * @example
   * ```typescript
   * { emotion: ['positivity:high', 'curiosity'] }
   * ```
   */
  emotion?: string[];

  /**
   * Cartesia API version string.
   *
   * @remarks
   * Used as a query parameter in the WebSocket URL for direct connections.
   *
   * @defaultValue `'2024-06-10'`
   */
  cartesiaVersion?: string;
}

/**
 * Maps Cartesia output encoding strings to SDK-compatible {@link AudioEncoding} values.
 *
 * @internal
 */
const ENCODING_MAP: Record<string, 'linear16' | 'opus' | 'mp3' | 'mulaw' | 'alaw'> = {
  pcm_s16le: 'linear16',
  pcm_f32le: 'linear16',
  pcm_mulaw: 'mulaw',
  pcm_alaw: 'alaw',
};

/**
 * Cartesia TTS provider for low-latency real-time streaming text-to-speech via WebSocket.
 *
 * @remarks
 * This provider establishes a WebSocket connection to the Cartesia TTS API (or a proxy).
 * It uses Cartesia's context-based streaming protocol, where a `context_id` links multiple
 * text chunks into a single coherent utterance. The `continue` flag indicates whether a
 * chunk continues an existing context or starts a new one.
 *
 * The lifecycle is:
 * 1. Construct with {@link CartesiaTTSConfig}
 * 2. Call `initialize()` to validate configuration
 * 3. Call `connect()` to open the WebSocket and generate a context ID
 * 4. Call `sendText()` to stream text for synthesis (uses context continuation)
 * 5. Call `finalize()` to send end-of-input and flush remaining audio
 * 6. Call `disconnect()` to close the WebSocket
 * 7. Call `dispose()` to release all resources
 *
 * Audio flow: `Text chunks -> WebSocket -> Cartesia -> Audio chunks -> onAudio callback`
 *
 * @example
 * ```typescript
 * import { CartesiaTTS } from 'composite-voice';
 *
 * const tts = new CartesiaTTS({
 *   apiKey: 'cart-xxxxxxxxxxxx',
 *   voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
 *   modelId: 'sonic-2',
 *   outputEncoding: 'pcm_s16le',
 *   outputSampleRate: 24000,
 * });
 *
 * await tts.initialize();
 * await tts.connect();
 *
 * tts.onAudio((chunk) => {
 *   // Process audio chunk
 * });
 *
 * tts.sendText('Hello, ');
 * tts.sendText('world!');
 * await tts.finalize();
 * await tts.disconnect();
 * ```
 *
 * @see {@link LiveTTSProvider} - The base class this provider extends.
 * @see {@link CartesiaTTSConfig} - Configuration options for this provider.
 * @see {@link WebSocketManager} - The WebSocket manager used for connection handling.
 */
export class CartesiaTTS extends LiveTTSProvider {
  declare public config: CartesiaTTSConfig;
  private wsManager: WebSocketManager | null = null;
  private isConnected = false;
  private contextId: string | null = null;
  private hasSentFirstChunk = false;

  /**
   * Creates a new CartesiaTTS provider instance.
   *
   * @param config - Configuration for the Cartesia TTS provider.
   *   The `voiceId` property is required.
   * @param logger - Optional logger instance for debug and diagnostic output.
   *
   * @example
   * ```typescript
   * const tts = new CartesiaTTS({
   *   apiKey: 'cart-xxxxxxxxxxxx',
   *   voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
   * });
   * ```
   */
  constructor(config: CartesiaTTSConfig, logger?: Logger) {
    const finalConfig: CartesiaTTSConfig = {
      modelId: 'sonic-2',
      language: 'en',
      outputEncoding: 'pcm_s16le',
      outputSampleRate: 16000,
      cartesiaVersion: '2024-06-10',
      sampleRate: config.outputSampleRate ?? 16000,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Validates configuration and prepares the provider for connection.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if `voiceId` is not provided.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'CartesiaTTS',
        new Error('CartesiaTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.config.voiceId) {
      throw new ProviderInitializationError(
        'CartesiaTTS',
        new Error('CartesiaTTS requires "voiceId" to be configured.')
      );
    }

    this.logger.info('Cartesia TTS initialized', {
      voiceId: this.config.voiceId,
      modelId: this.config.modelId,
      outputEncoding: this.config.outputEncoding,
      outputSampleRate: this.config.outputSampleRate,
      hasProxy: !!this.config.proxyUrl,
    });
  }

  /**
   * Disposes the provider, disconnecting from the WebSocket and releasing resources.
   */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.wsManager = null;
    this.contextId = null;
    this.hasSentFirstChunk = false;
    this.logger.info('Cartesia TTS disposed');
  }

  /**
   * Builds the WebSocket URL for the Cartesia streaming TTS endpoint.
   *
   * @remarks
   * When using a proxy, the HTTP URL is converted to a WebSocket URL.
   * For direct connections, the URL includes the API key and Cartesia
   * API version as query parameters.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private buildWebSocketUrl(): string {
    if (this.config.proxyUrl) {
      // Convert http(s) to ws(s) for proxy
      return this.config.proxyUrl.replace(/^http/, 'ws');
    }

    const version = this.config.cartesiaVersion ?? '2024-06-10';
    return `wss://api.cartesia.ai/tts/websocket?api_key=${this.config.apiKey}&cartesia_version=${version}`;
  }

  /**
   * Generates a random context ID for streaming continuation.
   *
   * @remarks
   * Cartesia uses context IDs to link multiple text chunks into a single
   * coherent utterance. A new context ID is generated on each `connect()`
   * and after each `finalize()`.
   *
   * @returns A UUID-like random string (four 8-character hex segments joined by hyphens).
   */
  private generateContextId(): string {
    // Simple UUID-like random ID
    const segments = [];
    for (let i = 0; i < 4; i++) {
      segments.push(Math.random().toString(36).substring(2, 10));
    }
    return segments.join('-');
  }

  /**
   * Connects to the Cartesia WebSocket for real-time TTS streaming.
   *
   * @remarks
   * Establishes a WebSocket connection and generates a fresh context ID for
   * the session. Auto-reconnect is disabled for TTS sessions since each
   * session is typically short-lived.
   *
   * This method is idempotent -- calling it when already connected is a no-op.
   *
   * @throws {@link ProviderConnectionError} if the WebSocket connection fails.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Cartesia TTS');
      return;
    }

    try {
      this.logger.debug('Connecting to Cartesia TTS WebSocket');

      const wsUrl = this.buildWebSocketUrl();

      const wsOptions: WebSocketManagerOptions = {
        url: wsUrl,
        connectionTimeout: this.config.timeout ?? 10000,
        reconnection: {
          enabled: false, // Disable auto-reconnect for TTS sessions
        },
        logger: this.logger,
      };

      this.wsManager = new WebSocketManager(wsOptions);

      // Set up message handler for incoming audio/metadata
      this.wsManager.setHandlers({
        onMessage: (event: MessageEvent) => {
          this.handleMessage(event);
        },
        onClose: () => {
          this.logger.info('Cartesia TTS WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('Cartesia TTS WebSocket error', error);
        },
      });

      // Connect and wait for open
      await this.wsManager.connect();
      this.isConnected = true;

      // Generate a fresh context ID for this session
      this.contextId = this.generateContextId();
      this.hasSentFirstChunk = false;

      this.logger.info('Connected to Cartesia TTS WebSocket', {
        voiceId: this.config.voiceId,
        modelId: this.config.modelId,
        contextId: this.contextId,
      });
    } catch (error) {
      this.wsManager = null;
      this.isConnected = false;
      this.contextId = null;
      throw new ProviderConnectionError('CartesiaTTS', error as Error);
    }
  }

  /**
   * Handles incoming WebSocket messages containing audio data, timestamps, or errors.
   *
   * @remarks
   * Cartesia may send messages in several forms:
   * - Binary `ArrayBuffer` -- raw PCM audio data
   * - `Blob` -- converted to `ArrayBuffer` asynchronously
   * - JSON string with `type: 'chunk'` and `data` field -- base64-encoded audio
   * - JSON string with `type: 'timestamps'` -- word-level timing information
   * - JSON string with `type: 'done'` -- end-of-stream indicator
   * - JSON string with `type: 'error'` -- error from the Cartesia API
   *
   * @param event - The WebSocket `MessageEvent` to process.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      // Binary data = raw audio (Cartesia can send raw PCM)
      if (event.data instanceof ArrayBuffer) {
        this.processAudioData(event.data);
        return;
      }

      if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buffer) => {
          this.processAudioData(buffer);
        });
        return;
      }

      // String data = JSON message
      if (typeof event.data === 'string') {
        const message = JSON.parse(event.data);

        // Audio chunk with base64 data
        if (message.type === 'chunk' && message.data) {
          const binaryString = atob(message.data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          this.processAudioData(bytes.buffer);
        }

        // Word-level timestamps
        if (message.type === 'timestamps' && message.word_timestamps) {
          this.emitMetadata({
            sampleRate: this.config.outputSampleRate ?? 16000,
            encoding: this.getEncoding(),
            channels: 1,
            bitDepth: 16,
            mimeType: `audio/${this.getEncoding()}`,
          });
        }

        // Stream done
        if (message.type === 'done' || (message.type === 'chunk' && message.done === true)) {
          this.logger.debug('Cartesia TTS stream complete');
        }

        // Error message
        if (message.type === 'error' || message.error) {
          this.logger.error('Cartesia TTS error', {
            error: message.error ?? message.message ?? message,
          });
        }
      }
    } catch (error) {
      this.logger.error('Error processing WebSocket message', error);
    }
  }

  /**
   * Processes raw audio data and emits it as a typed {@link AudioChunk}.
   *
   * @param data - The raw audio data as an `ArrayBuffer`.
   */
  private processAudioData(data: ArrayBuffer): void {
    const chunk: AudioChunk = {
      data,
      timestamp: Date.now(),
      metadata: {
        sampleRate: this.config.outputSampleRate ?? 16000,
        encoding: this.getEncoding(),
        channels: 1,
        bitDepth: 16,
      },
    };

    this.emitAudio(chunk);
  }

  /**
   * Derives the SDK audio encoding from the Cartesia output encoding configuration.
   *
   * @returns The SDK-compatible audio encoding string.
   */
  private getEncoding(): 'linear16' | 'opus' | 'mp3' | 'mulaw' | 'alaw' {
    const encoding = this.config.outputEncoding ?? 'pcm_s16le';
    return ENCODING_MAP[encoding] ?? 'linear16';
  }

  /**
   * Builds the output format object required by the Cartesia WebSocket API.
   *
   * @returns A {@link CartesiaOutputFormat} object with container, encoding, and sample rate.
   */
  private buildOutputFormat(): CartesiaOutputFormat {
    return {
      container: 'raw',
      encoding: this.config.outputEncoding ?? 'pcm_s16le',
      sample_rate: this.config.outputSampleRate ?? 16000,
    };
  }

  /**
   * Sends a text chunk to Cartesia for real-time synthesis.
   *
   * @remarks
   * Each message includes the model ID, voice reference, output format, and a
   * `context_id` for streaming continuation. The `continue` flag is `false` for
   * the first chunk and `true` for subsequent chunks, allowing Cartesia to
   * maintain prosody across multiple text segments.
   *
   * Optional parameters (`language`, `speed`, `emotion`) are included when configured.
   *
   * @param chunk - The text to synthesize into speech.
   */
  protected sendTextToSocket(chunk: string): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot send text: not connected');
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const message: Record<string, any> = {
        model_id: this.config.modelId ?? 'sonic-2',
        transcript: chunk,
        voice: {
          mode: 'id',
          id: this.config.voiceId,
        },
        output_format: this.buildOutputFormat(),
        context_id: this.contextId,
        continue: this.hasSentFirstChunk,
      };

      // Add optional parameters
      if (this.config.language) {
        message.language = this.config.language;
      }
      if (this.config.speed !== undefined) {
        message.speed = this.config.speed;
      }
      if (this.config.emotion) {
        message.emotion = this.config.emotion;
      }

      this.wsManager.send(JSON.stringify(message));

      // After the first chunk, subsequent chunks continue the context
      this.hasSentFirstChunk = true;
    } catch (error) {
      this.logger.error('Failed to send text chunk', error);
    }
  }

  /**
   * Finalizes the current synthesis session by sending an end-of-input signal.
   *
   * @remarks
   * Sends an empty transcript with `continue: false` to signal that no more
   * text will be sent for the current context. Waits up to 2 seconds for any
   * remaining audio to arrive, then resets the context ID for the next utterance.
   *
   * @throws Rethrows any error that occurs during finalization.
   */
  protected async finalizeSocket(): Promise<void> {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot finalize: not connected');
      return;
    }

    try {
      this.logger.debug('Finalizing Cartesia TTS synthesis');

      // Send empty transcript with continue:false to signal end of input
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const endMessage: Record<string, any> = {
        model_id: this.config.modelId ?? 'sonic-2',
        transcript: '',
        voice: {
          mode: 'id',
          id: this.config.voiceId,
        },
        output_format: this.buildOutputFormat(),
        context_id: this.contextId,
        continue: false,
      };

      this.wsManager.send(JSON.stringify(endMessage));

      // Wait for final audio to arrive (or timeout)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 2000);

        if (!this.wsManager?.isConnected()) {
          clearTimeout(timeout);
          resolve();
        }
      });

      // Reset context for next utterance
      this.contextId = this.generateContextId();
      this.hasSentFirstChunk = false;

      this.logger.info('Cartesia TTS finalized');
    } catch (error) {
      this.logger.error('Error finalizing Cartesia TTS', error);
      throw error;
    }
  }

  /**
   * Disconnects from the Cartesia WebSocket.
   *
   * @remarks
   * Gracefully closes the WebSocket connection and releases the
   * {@link WebSocketManager} instance. Also resets the context ID
   * and chunk tracking state.
   *
   * @throws Rethrows any error that occurs during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Not connected to Cartesia TTS');
      return;
    }

    try {
      this.logger.debug('Disconnecting from Cartesia TTS WebSocket');

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;
      this.contextId = null;
      this.hasSentFirstChunk = false;

      this.logger.info('Disconnected from Cartesia TTS WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Cartesia TTS', error);
      throw error;
    }
  }

  /**
   * Checks whether the WebSocket connection to Cartesia is currently active.
   *
   * @returns `true` if the WebSocket is connected, `false` otherwise.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
