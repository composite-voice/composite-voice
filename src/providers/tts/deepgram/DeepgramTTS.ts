/**
 * Deepgram TTS provider using native WebSocket (no SDK required).
 *
 * @remarks
 * This module provides a WebSocket-based real-time streaming text-to-speech provider
 * powered by Deepgram's Aura voice models. Text chunks are sent over a persistent
 * WebSocket connection and audio chunks are received as raw PCM or encoded audio.
 *
 * Transport: Native WebSocket (direct connection to Deepgram API)
 * Audio format: Configurable (linear16, mulaw, alaw); default is `linear16` at 24 kHz
 *
 * @packageDocumentation
 */

import { LiveTTSProvider } from '../../base/LiveTTSProvider';
import type { TTSProviderConfig, AudioChunk } from '../../../core/types';
import { Logger } from '../../../utils/logger';
import { ProviderConnectionError } from '../../../utils/errors';
import { buildQueryParams } from '../../../utils/queryParams';

/**
 * Deepgram-specific TTS synthesis options.
 *
 * @remarks
 * These options map to the Deepgram TTS WebSocket API query parameters. They are
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

  /** Labels for usage reporting in the Deepgram console. Multiple values are sent as separate `tag=` query parameters. */
  tag?: string | string[];
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

/** Deepgram's base WebSocket URL for TTS. */
const DEEPGRAM_WS_URL = 'wss://api.deepgram.com';

/**
 * Deepgram TTS provider for real-time streaming text-to-speech via native WebSocket.
 *
 * @remarks
 * This provider connects directly to Deepgram's TTS WebSocket API without the
 * `@deepgram/sdk`. Text chunks are sent incrementally and audio chunks are emitted
 * as they arrive, enabling low-latency speech output.
 *
 * The lifecycle is:
 * 1. Construct with {@link DeepgramTTSConfig}
 * 2. Call `initialize()` to validate configuration
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

  /** The raw WebSocket connection to Deepgram. */
  private ws: WebSocket | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /** In-flight connection promise to prevent concurrent connect() calls. */
  private connectingPromise: Promise<void> | null = null;

  /** Keep-alive interval timer. */
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  /** Resolve callback for the pending `finalize()` flush, if any. */
  private pendingFlushResolve: (() => void) | null = null;

  /**
   * Creates a new DeepgramTTS provider instance.
   *
   * @param config - Configuration for the Deepgram TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
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
   * Validate configuration — no SDK import required.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   */
  protected async onInitialize(): Promise<void> {
    this.assertAuth();

    if (this.isProxyMode) {
      this.logger.info('Deepgram TTS initialized (proxy mode)', { proxyUrl: this.config.proxyUrl });
    } else {
      this.logger.info('Deepgram TTS initialized (direct mode)', {
        model: this.config.options?.model ?? this.config.voice,
        sampleRate: this.config.sampleRate,
        encoding: this.config.options?.encoding ?? this.config.outputFormat,
      });
    }
  }

  /** Stop the keep-alive interval timer. */
  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
  }

  /** Send a keep-alive signal to prevent the WebSocket from timing out. */
  sendKeepAlive(): void {
    if (!this.isConnected || !this.ws) return;
    try {
      this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
    } catch {
      // Connection may be closing
    }
  }

  /**
   * Disposes the provider, disconnecting from the WebSocket and releasing resources.
   */
  protected async onDispose(): Promise<void> {
    this.stopKeepAlive();
    if (this.isConnected) {
      await this.disconnect();
    }
    this.ws = null;
    this.logger.info('Deepgram TTS disposed');
  }

  /**
   * Build the full WebSocket connection URL with query parameters.
   *
   * @remarks
   * Proxy mode: `ws(s)://<proxyUrl>/v1/speak?model=aura-2-thalia-en&...`
   * Direct mode: `wss://api.deepgram.com/v1/speak?model=aura-2-thalia-en&...`
   */
  private buildConnectionUrl(): string {
    const base = this.resolveBaseUrl(DEEPGRAM_WS_URL);
    if (!base) {
      throw new ProviderConnectionError(
        'DeepgramTTS',
        new Error('Failed to resolve base WebSocket URL')
      );
    }

    const params = buildQueryParams({
      model: this.config.options?.model ?? this.config.voice ?? 'aura-2-thalia-en',
      encoding: this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16',
      sampleRate: this.config.options?.sampleRate ?? this.config.sampleRate ?? 24000,
      tag: this.config.options?.tag,
    });

    return `${base}/v1/speak?${params.toString()}`;
  }

  /**
   * Connects to the Deepgram WebSocket for real-time TTS streaming.
   *
   * @remarks
   * Establishes a native WebSocket connection with the configured model,
   * encoding, and sample rate as query parameters. The connection emits
   * audio chunks as Deepgram processes incoming text.
   *
   * In direct mode, auth is sent via WebSocket subprotocol `["token", apiKey]`.
   * In proxy mode, no auth is sent — the proxy injects the real key.
   *
   * This method is idempotent — calling it when already connected is a no-op.
   *
   * @throws {@link ProviderConnectionError} if the connection fails or times out.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Deepgram TTS');
      return;
    }

    // Coalesce concurrent connect() calls onto a single attempt
    if (this.connectingPromise) {
      return this.connectingPromise;
    }

    this.connectingPromise = this.doConnect();
    try {
      await this.connectingPromise;
    } finally {
      this.connectingPromise = null;
    }
  }

  /** Internal connect implementation — callers go through connect(). */
  private async doConnect(): Promise<void> {
    try {
      this.logger.debug('Connecting to Deepgram TTS WebSocket');

      // Close any stale socket before opening a new one
      if (this.ws) {
        try { this.ws.close(); } catch { /* ignore */ }
        this.ws = null;
        this.isConnected = false;
      }

      const url = this.buildConnectionUrl();

      const protocols = await this.resolveWsProtocols('token');
      this.ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);

      // Receive binary audio as ArrayBuffer (not Blob)
      this.ws.binaryType = 'arraybuffer';

      // Wait for connection to be established
      const timeoutMs = this.config.timeout ?? 10000;
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, timeoutMs);

        const ws = this.ws;
        if (!ws) {
          clearTimeout(timeout);
          reject(new Error('WebSocket instance was not created'));
          return;
        }

        ws.onopen = () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.logger.info('Connected to Deepgram TTS WebSocket');
          resolve();
        };

        ws.onerror = (event) => {
          clearTimeout(timeout);
          reject(
            new Error(`WebSocket error: ${(event as ErrorEvent).message ?? 'connection failed'}`)
          );
        };
      });

      // Set up event handlers after connection is open
      this.setupEventHandlers();

      // Start keep-alive to prevent idle timeout (every 8s)
      this.stopKeepAlive();
      this.keepAliveTimer = setInterval(() => this.sendKeepAlive(), 8000);
    } catch (error) {
      this.ws = null;
      this.isConnected = false;
      throw new ProviderConnectionError('DeepgramTTS', error as Error);
    }
  }

  /**
   * Sets up event handlers for incoming WebSocket messages.
   *
   * @remarks
   * Binary frames contain audio data. Text frames contain JSON messages:
   * `Metadata`, `Flushed`, `Cleared`, `Warning`.
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        // Binary frame: audio data
        try {
          this.handleBinaryAudio(event.data);
        } catch (error) {
          this.logger.error('Error processing binary audio data', error);
        }
      } else if (typeof event.data === 'string') {
        // Text frame: JSON control message
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'Metadata':
              this.handleMetadata(msg);
              break;
            case 'Flushed':
              this.logger.debug('Deepgram TTS flushed', { sequence_id: msg.sequence_id });
              if (this.pendingFlushResolve) {
                this.pendingFlushResolve();
                this.pendingFlushResolve = null;
              }
              break;
            case 'Cleared':
              this.logger.debug('Deepgram TTS buffer cleared', { sequence_id: msg.sequence_id });
              break;
            case 'Warning':
              this.logger.warn('Deepgram TTS warning', {
                code: msg.code,
                description: msg.description,
              });
              break;
            default:
              this.logger.debug('Unknown TTS message type', msg);
          }
        } catch (error) {
          this.logger.error('Error parsing Deepgram TTS message', error);
        }
      }
    };

    this.ws.onerror = (event) => {
      this.logger.error('Deepgram TTS WebSocket error', event);
    };

    this.ws.onclose = (event) => {
      this.logger.info('Deepgram TTS WebSocket closed', {
        code: event.code,
        reason: event.reason,
      });
      this.isConnected = false;
    };
  }

  /**
   * Processes a `Metadata` message from Deepgram and emits audio metadata.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleMetadata(msg: any): void {
    this.logger.debug('Metadata received', msg);
    this.emitMetadata({
      sampleRate: this.config.options?.sampleRate ?? this.config.sampleRate ?? 24000,
      encoding: (this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16') as
        | 'linear16'
        | 'opus'
        | 'mp3'
        | 'mulaw'
        | 'alaw',
      channels: 1,
      bitDepth: 16,
      mimeType: `audio/${this.config.options?.encoding ?? this.config.outputFormat ?? 'linear16'}`,
    });
  }

  /**
   * Processes binary audio data and emits it as an {@link AudioChunk}.
   *
   * @param arrayBuffer - The raw audio data received from Deepgram.
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
        channels: 1,
        bitDepth: 16,
      },
    };

    this.emitAudio(chunk);
  }

  /**
   * Sends a text chunk to Deepgram for real-time synthesis.
   *
   * @remarks
   * Sends a `{ "type": "Speak", "text": "..." }` JSON message over the WebSocket.
   * Deepgram processes the text incrementally and emits audio chunks.
   * If not connected, the call is silently ignored with a warning log.
   *
   * Called by the base class's {@link LiveTTSProvider.sendText} method.
   *
   * @param text - The text to synthesize into speech.
   */
  protected sendTextToSocket(text: string): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot send text: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify({ type: 'Speak', text }));
    } catch (error) {
      this.logger.error('Failed to send text chunk', error);
    }
  }

  /**
   * Finalizes the current synthesis session by flushing remaining audio.
   *
   * @remarks
   * Sends a `{ "type": "Flush" }` JSON message to ensure all buffered text
   * has been processed and all resulting audio has been emitted. Waits for
   * the `Flushed` event or a 1-second timeout before resolving.
   *
   * Called by the base class's {@link LiveTTSProvider.finalize} method.
   *
   * @throws Rethrows any error that occurs during finalization.
   */
  protected async finalizeSocket(): Promise<void> {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot finalize: not connected');
      return;
    }

    try {
      this.logger.debug('Finalizing Deepgram TTS synthesis');

      this.ws.send(JSON.stringify({ type: 'Flush' }));

      // Wait for the Flushed response (or 1s safety timeout)
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.pendingFlushResolve = null;
          resolve();
        }, 1000);

        this.pendingFlushResolve = () => {
          clearTimeout(timeout);
          resolve();
        };
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
   * Sends a `{ "type": "Clear" }` JSON message. This immediately discards
   * any buffered text and audio that has not yet been sent to the client.
   * Useful for interrupting speech when the user starts talking (barge-in).
   *
   * If not connected, the call is silently ignored with a warning log.
   */
  clearBuffer(): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot clear buffer: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify({ type: 'Clear' }));
      this.logger.debug('Deepgram TTS buffer clear sent');
    } catch (error) {
      this.logger.error('Failed to clear Deepgram TTS buffer', error);
    }
  }

  /**
   * Disconnects from the Deepgram WebSocket.
   *
   * @remarks
   * Sends a Flush then Close message for graceful server-side cleanup.
   * Waits for the WebSocket to close (with a 1-second timeout).
   *
   * @throws Rethrows any error that occurs during disconnection.
   */
  async disconnect(): Promise<void> {
    this.stopKeepAlive();

    if (!this.isConnected || !this.ws) {
      this.logger.warn('Not connected to Deepgram TTS');
      return;
    }

    try {
      this.logger.debug('Disconnecting from Deepgram TTS WebSocket');

      // Flush remaining audio, then request graceful close
      try {
        this.ws.send(JSON.stringify({ type: 'Flush' }));
        this.ws.send(JSON.stringify({ type: 'Close' }));
      } catch {
        // Ignore — connection may already be closing
      }

      // Wait for close event with a 1s safety timeout
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.ws?.close();
          resolve();
        }, 1000);

        const ws = this.ws;
        if (ws) {
          const existingOnClose = ws.onclose;
          ws.onclose = (event) => {
            clearTimeout(timeout);
            if (existingOnClose) {
              existingOnClose.call(ws, event);
            }
            resolve();
          };
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.isConnected = false;
      this.ws = null;

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
