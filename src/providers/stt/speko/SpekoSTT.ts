/**
 * Speko Relay real-time speech-to-text provider using the WebSocket
 * streaming transcription API.
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import type { SpekoRouting, SpekoAudioEncoding } from '../../tts/speko/SpekoTTS';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * Configuration options for the {@link SpekoSTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with Speko-specific settings.
 *
 * The Speko Relay authenticates WebSocket upgrades with `Authorization` and
 * `Idempotency-Key` **headers**, which browsers cannot set on a WebSocket
 * handshake. `SpekoSTT` therefore always connects through a server-side
 * relay: set `proxyUrl` to a CompositeVoice proxy with `spekoApiKey`
 * configured (the proxy injects both headers, generating a fresh
 * idempotency key per connection), or set `endpoint` to your own backend
 * that terminates the Speko WebSocket. A bare `apiKey` is not sufficient
 * and is ignored for the WebSocket connection.
 *
 * @example
 * ```ts
 * // Via the CompositeVoice proxy (recommended)
 * const config: SpekoSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/speko',
 *   routing: { mode: 'auto', objective: 'latency' },
 *   sampleRate: 16000,
 * };
 * ```
 *
 * @see {@link SpekoSTT} for the provider class
 * @see {@link SpekoRouting} for the routing object shape
 */
export interface SpekoSTTConfig extends STTProviderConfig {
  /**
   * Routing object controlling which upstream STT provider the relay selects.
   *
   * @defaultValue `undefined` (relay default: `{ mode: 'auto', objective: 'balanced' }`)
   * @see {@link SpekoRouting}
   */
  routing?: SpekoRouting;

  /**
   * Audio encoding of the streamed audio.
   *
   * @defaultValue `'pcm_s16le'`
   */
  audioFormat?: SpekoAudioEncoding;

  /**
   * Audio sample rate in Hz. Accepted range is 8000 to 192000.
   *
   * @defaultValue `16000`
   */
  sampleRate?: number;

  /**
   * Number of audio channels. Accepted range is 1 to 8.
   *
   * @defaultValue `1`
   */
  numChannels?: number;

  /**
   * Language of the audio as an ISO 639-1 code.
   *
   * @remarks
   * The Speko Relay is currently English-only.
   *
   * @defaultValue `'en'`
   */
  language?: string;
}

/**
 * A message frame received from the Speko Relay streaming WebSocket.
 *
 * @remarks
 * Every session ends with exactly one terminal frame: `session.closed`
 * (clean termination) or `error` (carrying the standard Speko error
 * envelope, e.g. `budget_exhausted` or `lease_expired`).
 *
 * @internal
 */
interface SpekoServerMessage {
  type: string;
  /** Transcript text carried by `transcript.delta` and `transcript.final` frames. */
  text?: string;
  /** Finalized transcript segments carried by `transcript.final` frames. */
  segments?: unknown[];
  /** Request ID carried by `session.ready` frames. */
  request_id?: string;
  /** Usage snapshot carried by `usage.updated` frames. */
  usage?: Record<string, unknown>;
  /** Standard Speko error envelope carried by terminal `error` frames. */
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
    request_id?: string;
  };
}

/**
 * Speko Relay real-time STT provider using a raw WebSocket connection.
 *
 * @remarks
 * `SpekoSTT` extends {@link LiveSTTProvider} and connects to the Speko
 * Relay's streaming transcription WebSocket (`/v1/stt/stream`). Speko is a
 * voice-model router: the relay benchmarks STT providers in real time and
 * routes the session to the best one for the configured
 * {@link SpekoSTTConfig.routing | routing} objective, with automatic
 * failover across healthy providers in `auto` mode.
 *
 * After the connection opens, a `session.configure` message is sent (the
 * relay requires it within 10 seconds), then audio is streamed as binary
 * frames. The relay responds with `transcript.delta` frames (interim text
 * fragments, accumulated and emitted as interim results) and
 * `transcript.final` frames (finalized utterances, emitted with
 * `isFinal: true` and `utteranceComplete: true` to trigger the next
 * pipeline stage).
 *
 * Key features:
 *
 * - Interim (`transcript.delta`) and final (`transcript.final`) results
 * - Objective-based routing (latency, quality, cost, balanced) or explicit
 *   provider/model pinning across Speko's STT provider pool
 * - Proxy mode via {@link SpekoSTTConfig.proxyUrl} — **required** for
 *   browsers, because the relay authenticates WebSocket upgrades with
 *   headers that browsers cannot set (the CompositeVoice proxy injects
 *   `Authorization` and a fresh `Idempotency-Key` per connection)
 *
 * **Transport:** WebSocket (via {@link WebSocketManager})
 *
 * **Browser support:** All modern browsers, through a proxy. No peer
 * dependencies required.
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> binary frames -> Speko Relay WS
 *                                                                        |
 * CompositeVoice <- onTranscription(result) <-- delta/final frames <-----+
 * ```
 *
 * @example
 * ```ts
 * import { SpekoSTT } from 'composite-voice';
 *
 * const stt = new SpekoSTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/speko',
 *   routing: { mode: 'auto', objective: 'latency' },
 * });
 *
 * await stt.initialize();
 *
 * stt.onTranscription((result) => {
 *   if (result.isFinal) {
 *     console.log('Final:', result.text);
 *   } else {
 *     console.log('Interim:', result.text);
 *   }
 * });
 *
 * await stt.connect();
 * // ... send audio chunks via stt.sendAudio(chunk) ...
 * await stt.disconnect();
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link SpekoSTTConfig} for configuration options
 * @see {@link SpekoTTS} for the companion REST TTS provider
 */
export class SpekoSTT extends LiveSTTProvider {
  declare public config: SpekoSTTConfig;

  /** The WebSocket connection manager. */
  private wsManager: WebSocketManager | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /** Interim text accumulated from `transcript.delta` frames. */
  private interimText = '';

  /** Resolves the pending disconnect wait when `session.closed` arrives. */
  private closedResolver: (() => void) | null = null;

  /**
   * Create a new SpekoSTT provider.
   *
   * @param config - Speko STT configuration. Must include either
   *   `proxyUrl` or `endpoint`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new SpekoSTT({
   *   proxyUrl: '/api/proxy/speko',
   *   sampleRate: 16000,
   * });
   * ```
   */
  constructor(config: SpekoSTTConfig, logger?: Logger) {
    const finalConfig: SpekoSTTConfig = {
      audioFormat: 'pcm_s16le',
      sampleRate: 16000,
      numChannels: 1,
      language: 'en',
      interimResults: true,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Validate that `proxyUrl` or `endpoint` is configured.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when neither `proxyUrl` nor `endpoint` is set. A bare `apiKey`
   * cannot work: the Speko Relay authenticates WebSocket upgrades with
   * `Authorization` and `Idempotency-Key` headers, which cannot be set on
   * a browser WebSocket handshake.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.proxyUrl && !this.config.endpoint) {
      throw new ProviderInitializationError(
        'SpekoSTT',
        new Error(
          'SpekoSTT requires "proxyUrl" (or "endpoint") to be configured. The Speko Relay ' +
            'authenticates WebSocket upgrades with headers that cannot be set from a browser ' +
            'WebSocket — connect through the CompositeVoice proxy (spekoApiKey) or your own backend.'
        )
      );
    }

    this.logger.info('Speko STT initialized', {
      routing: this.config.routing,
      audioFormat: this.config.audioFormat,
      sampleRate: this.config.sampleRate,
      language: this.config.language,
    });
  }

  /** Disconnect the WebSocket (if connected) and release the manager. */
  protected async onDispose(): Promise<void> {
    if (this.wsManager) {
      try {
        await this.disconnect();
      } catch (error) {
        this.logger.warn('Error disconnecting during dispose', error as Error);
      }
    }
    this.wsManager = null;
    this.logger.info('Speko STT disposed');
  }

  /**
   * Build the WebSocket URL for Speko streaming transcription.
   *
   * @remarks
   * Proxy mode: `ws(s)://<proxyUrl>/v1/stt/stream`
   * Custom endpoint: `ws(s)://<endpoint>/v1/stt/stream`
   *
   * Authentication happens via headers injected by the proxy (or backend)
   * on the upstream upgrade, not the URL.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private buildWebSocketUrl(): string {
    // resolveBaseUrl prefers proxyUrl over endpoint and rewrites http(s)
    // to ws(s) for websocket-type providers. There is no default URL: a
    // direct browser-to-relay connection cannot authenticate.
    const base = this.resolveBaseUrl();
    if (!base) {
      throw new Error('Speko STT WebSocket URL could not be resolved');
    }
    return `${base}/v1/stt/stream`;
  }

  /**
   * Build the initial `session.configure` message for the Speko session.
   *
   * @remarks
   * The relay requires this to be the first message, within 10 seconds of
   * the upgrade. Authentication is not part of the message — it happens on
   * the upgrade request headers, injected server-side.
   */
  private buildConfigureMessage(): Record<string, unknown> {
    const message: Record<string, unknown> = {
      type: 'session.configure',
      audio: {
        encoding: this.config.audioFormat ?? 'pcm_s16le',
        sample_rate_hz: this.config.sampleRate ?? 16000,
        channels: this.config.numChannels ?? 1,
      },
      language: this.config.language ?? 'en',
    };

    if (this.config.routing) {
      message.routing = this.config.routing;
    }

    return message;
  }

  /**
   * Open a WebSocket connection to the Speko Relay for real-time transcription.
   *
   * @remarks
   * Creates a {@link WebSocketManager} with reconnection disabled — a dead
   * socket must surface immediately via onConnectionLost so the SDK (or a
   * FallbackSTT chain) can recover. The SDK drives reconnection through
   * {@link connect}. Waits for the connection to open, then sends the
   * `session.configure` message that starts the transcription session.
   * The connection timeout defaults to
   * {@link SpekoSTTConfig.timeout | config.timeout} (10 000 ms).
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized or the connection fails.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Speko STT');
      return;
    }

    try {
      this.logger.debug('Connecting to Speko STT WebSocket');

      const wsUrl = this.buildWebSocketUrl();

      const wsOptions: WebSocketManagerOptions = {
        url: wsUrl,
        connectionTimeout: this.config.timeout ?? 10000,
        // Auto-reconnect is disabled: a reconnected socket would be a new
        // relay session (new Idempotency-Key, replayed session.configure),
        // not a resumed one. Unexpected closes surface immediately via
        // onConnectionLost; SDK-level recovery (or a FallbackSTT chain)
        // owns reconnection.
        reconnection: { enabled: false },
        logger: this.logger,
      };

      this.wsManager = new WebSocketManager(wsOptions);

      this.wsManager.setHandlers({
        onMessage: (event: MessageEvent) => {
          this.handleMessage(event);
        },
        onClose: () => {
          this.logger.info('Speko STT WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('Speko STT WebSocket error', error);
        },
        onConnectionLost: (error: Error) => {
          this.isConnected = false;
          this.emitConnectionLost(`Speko STT connection lost: ${error.message}`);
        },
      });

      // Connect and wait for open
      await this.wsManager.connect();

      // Start the session — the relay expects session.configure first
      this.wsManager.send(JSON.stringify(this.buildConfigureMessage()));

      this.isConnected = true;
      this.interimText = '';

      this.logger.info('Connected to Speko STT WebSocket', {
        routing: this.config.routing,
        audioFormat: this.config.audioFormat,
        sampleRate: this.config.sampleRate,
      });
    } catch (error) {
      // Close any half-open socket before dropping the manager reference.
      if (this.wsManager) {
        try {
          await this.wsManager.disconnect();
        } catch {
          // Best-effort cleanup
        }
      }
      this.wsManager = null;
      this.isConnected = false;
      throw new ProviderConnectionError('SpekoSTT', error as Error);
    }
  }

  /**
   * Parse and dispatch incoming WebSocket messages from the Speko Relay.
   *
   * @remarks
   * `transcript.delta` frames carry interim text fragments, which are
   * accumulated and emitted as interim results. `transcript.final` frames
   * carry the finalized utterance text and are emitted with
   * `isFinal: true` and `utteranceComplete: true` via
   * {@link emitTranscription}. Terminal `error` frames are surfaced as an
   * error-shaped transcription result.
   *
   * @param event - The raw WebSocket `MessageEvent`.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      if (typeof event.data !== 'string') {
        this.logger.warn('Received non-string message from Speko, ignoring');
        return;
      }

      const message: SpekoServerMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'session.ready':
          this.logger.info('Speko session ready', { requestId: message.request_id });
          return;

        case 'transcript.delta':
          this.interimText += message.text ?? '';
          if (this.config.interimResults !== false && this.interimText.trim()) {
            this.emitTranscription({
              text: this.interimText.trim(),
              isFinal: false,
            });
          }
          return;

        case 'transcript.final': {
          const text = (message.text ?? this.interimText).trim();
          this.interimText = '';
          if (text) {
            this.emitTranscription({
              text,
              isFinal: true,
              speechFinal: true,
              utteranceComplete: true,
              metadata: {
                ...(message.segments ? { segments: message.segments } : {}),
              },
            });
          }
          return;
        }

        case 'usage.updated':
          this.logger.debug('Speko usage updated', { usage: message.usage });
          return;

        case 'session.closed':
          this.logger.info('Speko session closed');
          this.closedResolver?.();
          return;

        case 'error':
          this.logger.error('Speko error', {
            code: message.error?.code,
            message: message.error?.message,
            retryable: message.error?.retryable,
            requestId: message.error?.request_id,
          });
          this.emitTranscription({
            text: '',
            isFinal: true,
            confidence: 0,
            metadata: {
              error: message.error?.message ?? 'Speko relay error',
              errorCode: message.error?.code,
              retryable: message.error?.retryable,
            },
          });
          return;

        default:
          this.logger.debug('Unhandled Speko message type', { type: message.type });
          return;
      }
    } catch (error) {
      this.logger.error('Error processing Speko WebSocket message', error);
    }
  }

  /**
   * Send a raw audio chunk to the Speko Relay for real-time transcription.
   *
   * @remarks
   * The `ArrayBuffer` is forwarded as a binary WebSocket frame in the
   * configured audio format. Frames are capped at 1 MiB by the relay. If
   * the connection is not open, the chunk is silently dropped and a
   * warning is logged.
   *
   * @param chunk - Raw audio data captured from the microphone.
   */
  protected sendAudioToSocket(chunk: ArrayBuffer): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    try {
      this.wsManager.send(chunk);
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Ask the relay to finalize all pending audio immediately.
   *
   * @remarks
   * Sends an `input.commit` control message, which makes the relay emit
   * final results for everything received so far. Useful for manual
   * turn-taking.
   */
  finalize(): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot finalize: not connected');
      return;
    }

    try {
      this.wsManager.send(JSON.stringify({ type: 'input.commit' }));
    } catch (error) {
      this.logger.error('Failed to send input.commit message', error);
    }
  }

  /**
   * Gracefully close the Speko WebSocket connection.
   *
   * @remarks
   * Sends a `session.close` control message (the relay responds with a
   * terminal `session.closed` frame and closes the socket), waits for that
   * frame (up to 1 s), then disconnects the underlying
   * {@link WebSocketManager}.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.wsManager) {
      this.logger.warn('Not connected to Speko STT');
      return;
    }

    if (!this.isConnected) {
      // The session is already dead, but the manager (and possibly a live
      // socket) may still exist — tear it down for real so nothing leaks.
      const manager = this.wsManager;
      this.wsManager = null;
      await manager.disconnect();
      return;
    }

    try {
      this.logger.debug('Disconnecting from Speko STT WebSocket');

      // The server closes in response to session.close below; tell the
      // manager that close is expected so it is not reported as lost.
      this.wsManager.expectClose();

      try {
        this.wsManager.send(JSON.stringify({ type: 'session.close' }));
      } catch {
        // Ignore send errors during disconnect
      }

      // Wait for the session.closed frame (with a 1s fallback), then disconnect
      await new Promise<void>((resolve) => {
        const settle = (): void => {
          clearTimeout(timeout);
          this.closedResolver = null;
          resolve();
        };
        const timeout = setTimeout(settle, 1000);
        this.closedResolver = settle;

        if (!this.wsManager?.isConnected()) {
          settle();
        }
      });

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;

      this.logger.info('Disconnected from Speko STT WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Speko STT', error);
      throw error;
    }
  }

  /**
   * Check whether the Speko WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
