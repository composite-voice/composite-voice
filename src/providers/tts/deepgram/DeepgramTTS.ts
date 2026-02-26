/**
 * Deepgram TTS provider using the official Deepgram SDK V5.
 *
 * @remarks
 * This module provides a WebSocket-based real-time streaming text-to-speech provider
 * powered by Deepgram's Aura voice models. Text chunks are sent over a persistent
 * WebSocket connection and audio chunks are received as raw PCM or encoded audio.
 *
 * Transport: WebSocket (via `@deepgram/sdk` V5 `speak.v1`)
 * Audio format: Configurable (linear16, mulaw, alaw); default is `linear16` at 24 kHz
 *
 * The `@deepgram/sdk` package (>= 5.0.0-beta.1) is a peer dependency and must be
 * installed separately.
 *
 * @packageDocumentation
 */

import { LiveTTSProvider } from '../../base/LiveTTSProvider';
import type { TTSProviderConfig, AudioChunk } from '../../../core/types';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

// Type alias for the V5 DeepgramClient constructor
type DeepgramClientConstructor = new (options: {
  apiKey: string;
  baseUrl?: string;
}) => DeepgramClientInstance;

// Type representing the V5 DeepgramClient instance
interface DeepgramClientInstance {
  speak: {
    v1: {
      connect(options: Record<string, unknown>): Promise<V1Socket>;
    };
  };
}

// Type representing the V5 speak V1Socket
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type V1Socket = any;

/**
 * Deepgram-specific TTS synthesis options.
 *
 * @remarks
 * These options map to the Deepgram TTS WebSocket API parameters. They are
 * passed as connection options when establishing the live TTS session.
 *
 * @see {@link https://developers.deepgram.com/docs/tts-websocket | Deepgram TTS WebSocket Docs}
 */
export interface DeepgramTTSOptions {
  /**
   * The Deepgram voice model to use for synthesis.
   *
   * @remarks
   * Aura 2 models (recommended): `'aura-2-thalia-en'`, `'aura-2-andromeda-en'`,
   * `'aura-2-janus-en'`, `'aura-2-proteus-en'`, `'aura-2-orion-en'`,
   * `'aura-2-luna-en'`, `'aura-2-arcas-en'`.
   *
   * Aura 1 models (legacy): `'aura-asteria-en'`, `'aura-luna-en'`, `'aura-stella-en'`.
   *
   * @defaultValue Falls back to `config.voice` or `'aura-2-thalia-en'`
   */
  model?: string;

  /**
   * Audio encoding format for the output audio.
   *
   * @defaultValue Falls back to `config.outputFormat` or `'linear16'`
   */
  encoding?: string;

  /**
   * Sample rate for the output audio in Hz.
   *
   * @defaultValue Falls back to `config.sampleRate` or `24000`
   */
  sampleRate?: number;
}

/**
 * Configuration for the {@link DeepgramTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: DeepgramTTSConfig = {
 *   apiKey: 'dg-xxxxxxxxxxxx',
 *   voice: 'aura-2-thalia-en',
 *   sampleRate: 24000,
 *   outputFormat: 'linear16',
 * };
 *
 * // Via proxy server
 * const proxyConfig: DeepgramTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/deepgram',
 *   voice: 'aura-2-andromeda-en',
 * };
 * ```
 *
 * @see {@link DeepgramTTSOptions} - Additional Deepgram-specific synthesis options.
 */
export interface DeepgramTTSConfig extends TTSProviderConfig {
  /**
   * Deepgram API key for direct authentication.
   *
   * @remarks
   * Required when connecting directly to Deepgram (no proxy).
   * Omit when using `proxyUrl` -- the proxy server supplies the key server-side.
   */
  apiKey?: string;

  /**
   * URL of the CompositeVoice proxy server's Deepgram endpoint.
   *
   * @remarks
   * When set, the WebSocket connection is routed through the proxy and the
   * `apiKey` is not required on the client side.
   *
   * @example `'http://localhost:3001/api/proxy/deepgram'`
   */
  proxyUrl?: string;

  /**
   * Additional Deepgram-specific TTS options.
   *
   * @remarks
   * Options here override the top-level `voice`, `sampleRate`, and `outputFormat`
   * values when both are provided.
   *
   * @see {@link DeepgramTTSOptions}
   */
  options?: DeepgramTTSOptions;
}

/**
 * Deepgram TTS provider for real-time streaming text-to-speech via WebSocket.
 *
 * @remarks
 * This provider uses the official `@deepgram/sdk` V5 to establish a persistent WebSocket
 * connection to Deepgram's TTS service. Text chunks are sent incrementally and audio
 * chunks are emitted as they arrive, enabling low-latency speech output.
 *
 * The lifecycle is:
 * 1. Construct with {@link DeepgramTTSConfig}
 * 2. Call `initialize()` to load the Deepgram SDK and create the client
 * 3. Call `connect()` to open the WebSocket connection
 * 4. Call `sendText()` to stream text for synthesis
 * 5. Call `finalize()` to flush remaining audio
 * 6. Call `disconnect()` to close the WebSocket
 * 7. Call `dispose()` to release all resources
 *
 * Audio flow: `Text chunks -> WebSocket -> Deepgram -> Audio chunks -> onAudio callback`
 *
 * @example
 * ```typescript
 * import { DeepgramTTS } from 'composite-voice';
 *
 * const tts = new DeepgramTTS({
 *   apiKey: 'dg-xxxxxxxxxxxx',
 *   voice: 'aura-2-thalia-en',
 *   sampleRate: 24000,
 *   outputFormat: 'linear16',
 * });
 *
 * await tts.initialize();
 * await tts.connect();
 *
 * tts.onAudio((chunk) => {
 *   // Process audio chunk (e.g., feed to AudioPlayer)
 * });
 *
 * tts.sendText('Hello, world!');
 * await tts.finalize();
 * await tts.disconnect();
 * ```
 *
 * @see {@link LiveTTSProvider} - The base class this provider extends.
 * @see {@link DeepgramTTSConfig} - Configuration options for this provider.
 */
export class DeepgramTTS extends LiveTTSProvider {
  declare public config: DeepgramTTSConfig;
  private deepgram: DeepgramClientInstance | null = null;
  private speakSocket: V1Socket | null = null;
  private isConnected = false;

  /**
   * Creates a new DeepgramTTS provider instance.
   *
   * @param config - Configuration for the Deepgram TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   *
   * @example
   * ```typescript
   * const tts = new DeepgramTTS({
   *   apiKey: 'dg-xxxxxxxxxxxx',
   *   voice: 'aura-2-thalia-en',
   * });
   * ```
   */
  constructor(config: DeepgramTTSConfig, logger?: Logger) {
    const finalConfig = {
      voice: config.voice ?? 'aura-2-thalia-en',
      sampleRate: config.sampleRate ?? 24000,
      outputFormat: config.outputFormat ?? 'linear16',
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Initializes the Deepgram client by dynamically importing the V5 SDK.
   *
   * @remarks
   * The `@deepgram/sdk` is loaded dynamically as a peer dependency. If using
   * `proxyUrl`, the client is configured to route WebSocket traffic through
   * the proxy server. Otherwise, it connects directly using the `apiKey`.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if the `@deepgram/sdk` package is not installed.
   * @throws {@link ProviderInitializationError} if any other initialization error occurs.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'DeepgramTTS',
        new Error('DeepgramTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    try {
      // Dynamically import Deepgram SDK V5 (peer dependency)
      const { DeepgramClient: DGClient } = await import('@deepgram/sdk');

      if (this.config.proxyUrl) {
        const wsUrl = this.config.proxyUrl.replace(/^http/, 'ws');
        this.deepgram = new (DGClient as unknown as DeepgramClientConstructor)({
          apiKey: 'proxy',
          baseUrl: wsUrl,
        });
        this.logger.info('Deepgram TTS initialized (proxy mode)', { proxyUrl: wsUrl });
      } else {
        this.deepgram = new (DGClient as unknown as DeepgramClientConstructor)({
          apiKey: this.config.apiKey as string,
        });
        this.logger.info('Deepgram TTS initialized (direct mode)', {
          model: this.config.options?.model ?? this.config.voice,
          sampleRate: this.config.sampleRate,
          encoding: this.config.options?.encoding ?? this.config.outputFormat,
        });
      }
    } catch (error) {
      if ((error as Error).message?.includes('Cannot find module')) {
        throw new ProviderInitializationError(
          'DeepgramTTS',
          new Error(
            'Deepgram SDK not found. Install with: npm install @deepgram/sdk@^5.0.0-beta.1\n' +
              'The Deepgram SDK is a peer dependency and must be installed separately.'
          )
        );
      }
      throw new ProviderInitializationError('DeepgramTTS', error as Error);
    }
  }

  /**
   * Disposes the provider, disconnecting from the WebSocket and releasing resources.
   */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.speakSocket = null;
    this.deepgram = null;
    this.logger.info('Deepgram TTS disposed');
  }

  /**
   * Connects to the Deepgram WebSocket for real-time TTS streaming.
   *
   * @remarks
   * Establishes a live TTS connection using the V5 `speak.v1.connect()` API with the
   * configured model, encoding, and sample rate. The connection emits audio chunks
   * as Deepgram processes incoming text.
   *
   * This method is idempotent -- calling it when already connected is a no-op.
   *
   * @throws {@link ProviderConnectionError} if the Deepgram client is not initialized.
   * @throws {@link ProviderConnectionError} if the WebSocket connection fails or times out.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Deepgram TTS');
      return;
    }

    if (!this.deepgram) {
      throw new ProviderConnectionError(
        'DeepgramTTS',
        new Error('Deepgram client not initialized')
      );
    }

    try {
      this.logger.debug('Connecting to Deepgram TTS WebSocket');

      const model = this.config.options?.model ?? this.config.voice ?? 'aura-2-thalia-en';
      const encoding = this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16';
      const sampleRate = String(this.config.options?.sampleRate ?? this.config.sampleRate ?? 24000);

      // V5 connect args are all strings
      const connectOptions: Record<string, unknown> = {
        model,
        encoding,
        sample_rate: sampleRate,
      };

      // Create live TTS connection via V5 speak.v1.connect()
      this.speakSocket = await this.deepgram.speak.v1.connect(connectOptions);

      // Set up event handlers
      this.setupEventHandlers();

      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.timeout ?? 10000);

        this.speakSocket?.on('open', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.logger.info('Connected to Deepgram TTS WebSocket');
          resolve();
        });

        this.speakSocket?.on('error', (error: Error) => {
          clearTimeout(timeout);
          this.logger.error('Failed to connect to Deepgram TTS WebSocket', error);
          reject(error);
        });
      });
    } catch (error) {
      this.speakSocket = null;
      throw new ProviderConnectionError('DeepgramTTS', error as Error);
    }
  }

  /**
   * Sets up event handlers on the V5 speak socket for JSON messages, binary audio
   * data, errors, and connection close.
   *
   * @remarks
   * In V5, JSON messages (Metadata, Flushed, Cleared, Warning) arrive via the typed
   * `'message'` event handler. Audio binary data must be captured from the underlying
   * raw WebSocket exposed via `socket.socket`, since V5's typed handler only routes
   * text/JSON messages.
   */
  private setupEventHandlers(): void {
    if (!this.speakSocket) return;

    // Handle JSON messages via the V5 typed 'message' event
    this.speakSocket.on(
      'message',
      (
        msg:
          | {
              type?: string;
              request_id?: string;
              model_name?: string;
              model_version?: string;
              model_uuid?: string;
            }
          | string
      ) => {
        try {
          // String messages are unrecognized text; skip them
          if (typeof msg === 'string') {
            this.logger.debug('Unrecognized text message from Deepgram TTS', { msg });
            return;
          }

          // Discriminate on type field
          switch (msg.type) {
            case 'Metadata': {
              this.logger.debug('Metadata received', msg);
              this.emitMetadata({
                sampleRate: this.config.options?.sampleRate ?? this.config.sampleRate ?? 24000,
                encoding: (this.config.options?.encoding ??
                  this.config.outputFormat ??
                  'linear16') as 'linear16' | 'opus' | 'mp3' | 'mulaw' | 'alaw',
                channels: 1,
                bitDepth: 16,
                mimeType: `audio/${this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16'}`,
              });
              break;
            }
            case 'Flushed': {
              this.logger.debug('Deepgram TTS flushed');
              break;
            }
            case 'Cleared': {
              this.logger.debug('Deepgram TTS buffer cleared');
              break;
            }
            case 'Warning': {
              this.logger.warn('Deepgram TTS WebSocket warning', msg);
              break;
            }
            default: {
              this.logger.debug('Unknown message type from Deepgram TTS', msg);
              break;
            }
          }
        } catch (error) {
          this.logger.error('Error processing Deepgram TTS message', error);
        }
      }
    );

    // Handle binary audio data from the underlying raw WebSocket
    // V5's typed 'message' event only receives JSON; binary audio comes through
    // the raw WebSocket exposed via speakSocket.socket
    const rawSocket = this.speakSocket.socket;
    if (rawSocket) {
      rawSocket.addEventListener('message', (event: MessageEvent) => {
        try {
          const { data } = event;

          // Only handle binary data; text is already routed to the typed handler
          if (data instanceof ArrayBuffer) {
            this.handleBinaryAudio(data);
          } else if (typeof Blob !== 'undefined' && data instanceof Blob) {
            // Convert Blob to ArrayBuffer
            data.arrayBuffer().then((arrayBuffer: ArrayBuffer) => {
              this.handleBinaryAudio(arrayBuffer);
            });
          } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
            // Handle Node.js Buffer
            const arrayBuffer = new ArrayBuffer(data.byteLength);
            const view = new Uint8Array(arrayBuffer);
            view.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
            this.handleBinaryAudio(arrayBuffer);
          }
          // If data is a string, it's JSON and is handled by the typed 'message' event
        } catch (error) {
          this.logger.error('Error processing binary audio data', error);
        }
      });
    }

    // Handle errors
    this.speakSocket.on('error', (error: Error) => {
      this.logger.error('Deepgram TTS WebSocket error', error);
    });

    // Handle close
    this.speakSocket.on('close', () => {
      this.logger.info('Deepgram TTS WebSocket closed');
      this.isConnected = false;
    });
  }

  /**
   * Processes binary audio data received from the WebSocket and emits it as
   * an {@link AudioChunk} via the audio callback.
   *
   * @param arrayBuffer - The raw audio data as an ArrayBuffer.
   */
  private handleBinaryAudio(arrayBuffer: ArrayBuffer): void {
    const chunk: AudioChunk = {
      data: arrayBuffer,
      timestamp: Date.now(),
      metadata: {
        sampleRate: this.config.options?.sampleRate ?? this.config.sampleRate ?? 24000,
        encoding: (this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16') as
          | 'linear16'
          | 'opus'
          | 'mp3'
          | 'mulaw'
          | 'alaw',
        channels: 1, // Deepgram TTS typically outputs mono
        bitDepth: 16,
      },
    };

    this.emitAudio(chunk);
  }

  /**
   * Sends a text chunk to Deepgram for real-time synthesis.
   *
   * @remarks
   * Text is sent over the open WebSocket connection using the V5
   * `sendText({ type: 'Speak', text })` method. Deepgram processes the
   * text incrementally and emits audio chunks via the `onAudio` callback.
   * If not connected, the call is silently ignored with a warning log.
   *
   * @param text - The text to synthesize into speech.
   */
  sendText(text: string): void {
    if (!this.isConnected || !this.speakSocket) {
      this.logger.warn('Cannot send text: not connected');
      return;
    }

    try {
      this.speakSocket.sendText({ type: 'Speak', text });
    } catch (error) {
      this.logger.error('Failed to send text chunk', error);
    }
  }

  /**
   * Finalizes the current synthesis session by flushing remaining audio.
   *
   * @remarks
   * Sends a flush command to Deepgram using the V5 `sendFlush({ type: 'Flush' })`
   * method to ensure all buffered text has been processed and all resulting audio
   * has been emitted. Waits for the `Flushed` message or a 1-second timeout before
   * resolving.
   *
   * @throws Rethrows any error that occurs during finalization.
   */
  async finalize(): Promise<void> {
    if (!this.isConnected || !this.speakSocket) {
      this.logger.warn('Cannot finalize: not connected');
      return;
    }

    try {
      this.logger.debug('Finalizing Deepgram TTS synthesis');

      // Flush any remaining audio via V5 sendFlush
      this.speakSocket.sendFlush({ type: 'Flush' });

      // Wait for flushed message
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000); // Force resolve after 1 second

        this.speakSocket?.on('message', (msg: { type?: string } | string) => {
          if (typeof msg !== 'string' && msg.type === 'Flushed') {
            clearTimeout(timeout);
            resolve();
          }
        });
      });

      this.logger.info('Deepgram TTS finalized');
    } catch (error) {
      this.logger.error('Error finalizing Deepgram TTS', error);
      throw error;
    }
  }

  /**
   * Clears the Deepgram TTS audio buffer.
   *
   * @remarks
   * Sends a destructive clear command via the V5 `sendClear({ type: 'Clear' })`
   * method. This immediately discards any buffered text and audio that has not
   * yet been sent to the client. Useful for interrupting speech when the user
   * starts talking (barge-in).
   *
   * If not connected, the call is silently ignored with a warning log.
   */
  clearBuffer(): void {
    if (!this.isConnected || !this.speakSocket) {
      this.logger.warn('Cannot clear buffer: not connected');
      return;
    }

    try {
      this.speakSocket.sendClear({ type: 'Clear' });
      this.logger.debug('Deepgram TTS buffer clear sent');
    } catch (error) {
      this.logger.error('Failed to clear Deepgram TTS buffer', error);
    }
  }

  /**
   * Disconnects from the Deepgram WebSocket.
   *
   * @remarks
   * Sends a flush command, then a close signal via the V5 `sendClose({ type: 'Close' })`
   * method, and finally calls `close()` on the socket. Waits for the WebSocket to
   * close (with a 1-second timeout). After disconnection, the socket reference is released.
   *
   * @throws Rethrows any error that occurs during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.speakSocket) {
      this.logger.warn('Not connected to Deepgram TTS');
      return;
    }

    try {
      this.logger.debug('Disconnecting from Deepgram TTS WebSocket');

      // Flush remaining audio, then send close signal
      this.speakSocket.sendFlush({ type: 'Flush' });
      this.speakSocket.sendClose({ type: 'Close' });
      this.speakSocket.close();

      // Wait for close event
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000); // Force resolve after 1 second

        this.speakSocket?.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.isConnected = false;
      this.speakSocket = null;

      this.logger.info('Disconnected from Deepgram TTS WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Deepgram TTS', error);
      throw error;
    }
  }

  /**
   * Checks whether the WebSocket connection to Deepgram is currently active.
   *
   * @returns `true` if the WebSocket is connected, `false` otherwise.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
