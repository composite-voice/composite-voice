/**
 * Rev AI streaming speech-to-text provider using the WebSocket
 * transcription API.
 *
 * @remarks
 * Connects directly to Rev AI's V1 streaming WebSocket API without a vendor SDK.
 * Protocol: {@link https://docs.rev.ai/api/streaming/ | Rev AI Streaming API}
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';
import { buildQueryParams } from '../../../utils/queryParams';

/**
 * Configuration options for the {@link RevAISTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with Rev AI-specific settings.
 * You must provide **either** `apiKey` (for direct browser-to-Rev AI
 * connections) or `proxyUrl` (for a server-side proxy that injects the
 * access token). If both are provided, `proxyUrl` takes precedence.
 *
 * Rev AI authenticates the streaming WebSocket via an `access_token`
 * query parameter. In direct mode the resolved `apiKey` is placed on the
 * connection URL; pass an async factory as `apiKey` to fetch a fresh
 * token on each connection. In proxy mode the token is omitted and the
 * proxy appends it server-side.
 *
 * @example
 * ```ts
 * // Direct connection (API key exposed to browser -- development only)
 * const config: RevAISTTConfig = {
 *   apiKey: '02.abc123...',
 *   sampleRate: 16000,
 * };
 *
 * // Proxy connection (recommended for production)
 * const config: RevAISTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/revai',
 *   language: 'en',
 * };
 * ```
 *
 * @see {@link RevAISTT} for the provider class
 */
export interface RevAISTTConfig extends STTProviderConfig {
  /**
   * Full `content_type` string describing the streamed audio, overriding
   * the value built from `layout`, `sampleRate`, `audioFormat`, and
   * `numChannels`.
   *
   * @remarks
   * Rev AI supports `audio/x-raw` (with layout/rate/format/channels
   * parameters), `audio/x-flac`, and `audio/x-wav`.
   *
   * @example 'audio/x-flac'
   * @default built from the raw audio options, e.g.
   * `'audio/x-raw;layout=interleaved;rate=16000;format=S16LE;channels=1'`
   */
  contentType?: string;
  /**
   * Channel layout for raw audio (`audio/x-raw` only).
   * @default 'interleaved'
   */
  layout?: 'interleaved' | 'non-interleaved';
  /**
   * Audio sample rate in Hz for raw audio (8000-48000).
   * @default 16000
   */
  sampleRate?: number;
  /**
   * Raw audio sample format as a case-sensitive GStreamer format string
   * (e.g. `'S16LE'`, `'F32LE'`).
   * @default 'S16LE'
   */
  audioFormat?: string;
  /**
   * Number of audio channels for raw audio (1-10).
   * @default 1
   */
  numChannels?: number;
  /**
   * Metadata string attached to the streaming job for request tracking.
   */
  metadata?: string;
  /**
   * Custom vocabulary identifier for domain-specific terms.
   *
   * @remarks
   * Cannot be combined with a non-English `language`.
   */
  customVocabularyId?: string;
  /**
   * Replace recognized profanities with asterisks.
   *
   * @remarks
   * English only -- cannot be combined with a non-English `language`.
   *
   * @default false
   */
  filterProfanity?: boolean;
  /**
   * Remove filler words ("ums" and "uhs") from the transcription.
   *
   * @remarks
   * English only -- cannot be combined with a non-English `language`.
   *
   * @default false
   */
  removeDisfluencies?: boolean;
  /**
   * Include per-element timestamps and confidence scores in partial
   * hypotheses (finals always include them).
   *
   * @remarks
   * Enabling this slightly degrades accuracy (about 1% WER).
   *
   * @default false
   */
  detailedPartials?: boolean;
  /**
   * Positive offset in seconds added to all hypothesis timestamps.
   */
  startTs?: number;
  /**
   * Maximum duration in seconds (5-30) of a transcription segment before
   * Rev AI forces a final hypothesis.
   *
   * @remarks
   * Lower values produce final results sooner at a small accuracy cost.
   * The actual segment may extend up to 0.5 s beyond this value.
   */
  maxSegmentDurationSeconds?: number;
  /**
   * Seconds (0-2592000) after which Rev AI deletes the job and its
   * transcript automatically.
   */
  deleteAfterSeconds?: number;
  /**
   * Transcription model to use (e.g. `'machine_v2'`).
   * @default Rev AI's default streaming model
   */
  transcriber?: string;
  /**
   * Add a `speaker_id` field to final hypothesis elements when the
   * speaker changes.
   *
   * @remarks
   * Requires the `machine_v2` transcriber.
   *
   * @default false
   */
  enableSpeakerSwitch?: boolean;
  /**
   * Disable capitalization, punctuation, and inverse text normalization
   * to reduce latency.
   *
   * @remarks
   * English and Spanish only.
   *
   * @default false
   */
  skipPostprocessing?: boolean;
  /**
   * Trade-off between result frequency and accuracy.
   *
   * @remarks
   * `'speed'` emits results more frequently; `'accuracy'` emits fewer,
   * more accurate results. English and Spanish with `machine_v2` only.
   *
   * @default 'speed' (Rev AI server default)
   */
  priority?: 'speed' | 'accuracy';
  /**
   * Seconds (60-600) to wait for an available Rev AI worker before the
   * connection is closed with code 4013.
   * @default 60 (Rev AI server default)
   */
  maxConnectionWaitSeconds?: number;
}

/**
 * A single element of a Rev AI hypothesis message.
 *
 * @remarks
 * `'text'` elements carry recognized words (with timing and confidence
 * on final hypotheses); `'punct'` elements carry punctuation and spaces
 * (final hypotheses only).
 *
 * @internal
 */
interface RevAIElement {
  type: 'text' | 'punct';
  value: string;
  ts?: number;
  end_ts?: number;
  confidence?: number;
  speaker_id?: string;
}

/**
 * A message from the Rev AI streaming WebSocket.
 * @internal
 */
interface RevAIMessage {
  type: 'connected' | 'partial' | 'final';
  id?: string;
  ts?: number;
  end_ts?: number;
  elements?: RevAIElement[];
}

/** @internal Default Rev AI streaming WebSocket base URL (host only). */
const REVAI_WS_URL = 'wss://api.rev.ai';

/** @internal Path of the Rev AI streaming endpoint, appended to the base URL. */
const REVAI_STREAM_PATH = '/speechtotext/v1/stream';

/** @internal Human-readable descriptions of Rev AI-specific close codes. */
const REVAI_CLOSE_CODES: Record<number, string> = {
  4001: 'Invalid or missing access token',
  4002: 'Invalid or missing content_type',
  4013: 'Connection timed out waiting for an available worker',
};

/**
 * Rev AI streaming STT provider using a raw WebSocket connection.
 *
 * @remarks
 * `RevAISTT` extends {@link LiveSTTProvider} and connects to Rev AI's
 * streaming speech-to-text WebSocket API. All session options (audio
 * `content_type`, language, profanity filtering, ...) are passed as query
 * parameters on the connection URL. After the upgrade, Rev AI sends a
 * `connected` message -- the provider waits for it before resolving
 * {@link RevAISTT.connect | connect()}, as required by the API -- and audio
 * is then streamed as binary frames.
 *
 * Rev AI responds with hypothesis messages: `partial` hypotheses contain
 * the words recognized so far (emitted as interim results), and `final`
 * hypotheses contain the punctuated, confidence-scored transcript of a
 * completed segment. Each final hypothesis is emitted with
 * `isFinal: true` and `utteranceComplete: true`, triggering the next
 * pipeline stage.
 *
 * Key features:
 *
 * - Interim (partial) and final transcription results
 * - Nine languages (en, fr, de, it, ja, ko, cmn, pt, es)
 * - Profanity filtering, disfluency removal, and custom vocabularies
 * - Per-word timestamps and confidence scores on final hypotheses
 * - Automatic WebSocket reconnection with exponential backoff (via
 *   {@link WebSocketManager})
 * - Proxy mode via {@link RevAISTTConfig.proxyUrl} (recommended for
 *   production so the access token stays server-side)
 *
 * **Transport:** WebSocket (via {@link WebSocketManager})
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 * No peer dependencies required -- the provider uses a raw WebSocket
 * connection managed by the SDK's built-in {@link WebSocketManager}.
 *
 * **Auth in browser:** Rev AI authenticates the WebSocket via an
 * `access_token` query parameter (headers are not supported on the
 * upgrade). Direct mode places the resolved `apiKey` on the URL; proxy
 * mode omits it and the proxy appends the token server-side.
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> binary frames -> Rev AI WS
 *                                                                        |
 * CompositeVoice <- onTranscription(result) <---- hypothesis messages <--+
 * ```
 *
 * @example
 * ```ts
 * import { RevAISTT } from 'composite-voice';
 *
 * const stt = new RevAISTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/revai',
 *   language: 'en',
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
 * await stt.disconnect(); // sends "EOS" and awaits the last hypothesis
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link RevAISTTConfig} for configuration options
 * @see {@link SonioxSTT} for an alternative real-time STT provider
 */
export class RevAISTT extends LiveSTTProvider {
  declare public config: RevAISTTConfig;

  /** The WebSocket connection manager. */
  private wsManager: WebSocketManager | null = null;

  /** Whether the Rev AI session is established (socket open + `connected` received). */
  private isConnected = false;

  /** The Rev AI job identifier from the `connected` message. */
  private jobId: string | null = null;

  /** Resolves the pending connect wait when the `connected` message arrives. */
  private connectedResolver: (() => void) | null = null;

  /** Rejects the pending connect wait when the socket closes during the handshake. */
  private connectedRejecter: ((error: Error) => void) | null = null;

  /** Resolves the pending disconnect wait when the server closes the socket. */
  private closeResolver: (() => void) | null = null;

  /**
   * Create a new RevAISTT provider.
   *
   * @param config - Rev AI STT configuration. Must include either
   *   `apiKey` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new RevAISTT({
   *   apiKey: '02.abc123...',
   *   sampleRate: 16000,
   * });
   * ```
   */
  constructor(config: RevAISTTConfig, logger?: Logger) {
    const finalConfig: RevAISTTConfig = {
      layout: 'interleaved',
      sampleRate: 16000,
      audioFormat: 'S16LE',
      numChannels: 1,
      interimResults: true,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Validate that either `apiKey` or `proxyUrl` is configured.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when neither `apiKey` nor `proxyUrl` is set.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'RevAISTT',
        new Error('RevAISTT requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    this.logger.info('Rev AI STT initialized', {
      contentType: this.buildContentType(),
      language: this.config.language,
      hasProxy: !!this.config.proxyUrl,
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
    this.logger.info('Rev AI STT disposed');
  }

  /**
   * Build the `content_type` query parameter describing the audio stream.
   *
   * @remarks
   * Returns {@link RevAISTTConfig.contentType} verbatim when set;
   * otherwise builds an `audio/x-raw` content type from the raw audio
   * options (layout, rate, format, channels).
   */
  private buildContentType(): string {
    if (this.config.contentType) return this.config.contentType;

    const layout = this.config.layout ?? 'interleaved';
    const rate = this.config.sampleRate ?? 16000;
    const format = this.config.audioFormat ?? 'S16LE';
    const channels = this.config.numChannels ?? 1;

    return `audio/x-raw;layout=${layout};rate=${rate};format=${format};channels=${channels}`;
  }

  /**
   * Build the WebSocket URL for Rev AI streaming transcription.
   *
   * @remarks
   * Proxy mode: `ws(s)://<proxyUrl>/speechtotext/v1/stream?content_type=...`
   * Direct mode: `wss://api.rev.ai/speechtotext/v1/stream?access_token=...&content_type=...`
   *
   * Rev AI authenticates via the `access_token` query parameter. In direct
   * mode the resolved API key is placed on the URL; in proxy mode it is
   * omitted and the proxy appends the token server-side. All other session
   * options are query parameters and pass through the proxy unchanged.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private async buildWebSocketUrl(): Promise<string> {
    const params = new URLSearchParams();

    if (!this.isProxyMode) {
      params.set('access_token', await this.resolveApiKey());
    }

    params.set('content_type', this.buildContentType());

    const options = buildQueryParams({
      language: this.config.language,
      metadata: this.config.metadata,
      customVocabularyId: this.config.customVocabularyId,
      filterProfanity: this.config.filterProfanity,
      removeDisfluencies: this.config.removeDisfluencies,
      detailedPartials: this.config.detailedPartials,
      startTs: this.config.startTs,
      maxSegmentDurationSeconds: this.config.maxSegmentDurationSeconds,
      deleteAfterSeconds: this.config.deleteAfterSeconds,
      transcriber: this.config.transcriber,
      enableSpeakerSwitch: this.config.enableSpeakerSwitch,
      skipPostprocessing: this.config.skipPostprocessing,
      priority: this.config.priority,
      maxConnectionWaitSeconds: this.config.maxConnectionWaitSeconds,
    });
    options.forEach((value, key) => params.append(key, value));

    const base = this.config.proxyUrl ? this.config.proxyUrl.replace(/^http/, 'ws') : REVAI_WS_URL;

    return `${base}${REVAI_STREAM_PATH}?${params.toString()}`;
  }

  /**
   * Open a WebSocket connection to Rev AI for streaming transcription.
   *
   * @remarks
   * Creates a {@link WebSocketManager} with reconnection disabled — a dead
   * socket must surface immediately via onConnectionLost so the SDK (or a
   * FallbackSTT chain) can recover. The SDK drives reconnection through
   * {@link connect}. Waits for the socket to open, then waits for Rev AI's
   * `connected` message -- the API requires it before any audio is sent.
   * The connection timeout defaults to
   * {@link RevAISTTConfig.timeout | config.timeout} (10 000 ms)
   * and applies to both waits independently.
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized, the connection fails, or
   * the `connected` message does not arrive in time (e.g. close code 4001
   * for an invalid access token).
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Rev AI STT');
      return;
    }

    try {
      this.logger.debug('Connecting to Rev AI STT WebSocket');

      const wsUrl = await this.buildWebSocketUrl();

      const wsOptions: WebSocketManagerOptions = {
        url: wsUrl,
        connectionTimeout: this.config.timeout ?? 10000,
        // Auto-reconnect is disabled: a reconnected socket starts a brand-new
        // Rev AI job without the 'connected' handshake this provider waits
        // for, so it would be a dead session. Unexpected closes surface
        // immediately via onConnectionLost; SDK-level recovery (or a
        // FallbackSTT chain) owns reconnection.
        reconnection: { enabled: false },
        logger: this.logger,
      };

      this.wsManager = new WebSocketManager(wsOptions);

      // Set up message handlers
      this.wsManager.setHandlers({
        onMessage: (event: MessageEvent) => {
          this.handleMessage(event);
        },
        onClose: (event: CloseEvent) => {
          this.handleClose(event);
        },
        onError: (error: Error) => {
          this.logger.error('Rev AI STT WebSocket error', error);
        },
        onConnectionLost: (error: Error) => {
          this.isConnected = false;
          this.emitConnectionLost(`Rev AI STT connection lost: ${error.message}`);
        },
      });

      // Connect and wait for open
      await this.wsManager.connect();

      // Rev AI requires waiting for the "connected" message before
      // sending any audio data.
      await this.waitForConnectedMessage();

      this.isConnected = true;

      this.logger.info('Connected to Rev AI STT WebSocket', {
        jobId: this.jobId,
        contentType: this.buildContentType(),
      });
    } catch (error) {
      // Close any half-open socket (e.g. open but the "connected"
      // message never arrived) before dropping the manager reference.
      if (this.wsManager) {
        try {
          await this.wsManager.disconnect();
        } catch {
          // Best-effort cleanup
        }
      }
      this.wsManager = null;
      this.isConnected = false;
      throw new ProviderConnectionError('RevAISTT', error as Error);
    }
  }

  /**
   * Wait for Rev AI's `{"type": "connected"}` handshake message.
   *
   * @remarks
   * Rejects if the socket closes first (e.g. close code 4001 for an
   * invalid token) or the configured timeout elapses.
   *
   * @internal
   */
  private waitForConnectedMessage(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeoutMs = this.config.timeout ?? 10000;
      const timeout = setTimeout(() => {
        settle();
        reject(new Error(`Timed out waiting for Rev AI "connected" message (${timeoutMs}ms)`));
      }, timeoutMs);

      const settle = (): void => {
        clearTimeout(timeout);
        this.connectedResolver = null;
        this.connectedRejecter = null;
      };

      this.connectedResolver = () => {
        settle();
        resolve();
      };
      this.connectedRejecter = (error: Error) => {
        settle();
        reject(error);
      };
    });
  }

  /**
   * Parse and dispatch incoming WebSocket messages from Rev AI.
   *
   * @remarks
   * The `connected` message completes the connection handshake. `partial`
   * hypotheses are emitted as interim results (text elements joined with
   * spaces -- partials carry no punctuation). `final` hypotheses carry
   * text and punct elements (including spaces) that are concatenated into
   * the finished transcript and emitted with `isFinal: true` and
   * `utteranceComplete: true` via {@link emitTranscription}.
   *
   * @param event - The raw WebSocket `MessageEvent`.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      if (typeof event.data !== 'string') {
        this.logger.warn('Received non-string message from Rev AI, ignoring');
        return;
      }

      const message: RevAIMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'connected':
          this.jobId = message.id ?? null;
          this.logger.debug('Rev AI session connected', { jobId: this.jobId });
          this.connectedResolver?.();
          return;

        case 'partial': {
          if (this.config.interimResults === false) return;

          // Partial hypotheses contain only "text" elements without
          // punctuation or spaces -- join words with spaces.
          const text = (message.elements ?? [])
            .filter((el) => el.type === 'text')
            .map((el) => el.value)
            .join(' ')
            .trim();

          if (text) {
            this.emitTranscription({
              text,
              isFinal: false,
              metadata: {
                ts: message.ts,
                endTs: message.end_ts,
              },
            });
          }
          return;
        }

        case 'final': {
          // Final hypotheses interleave "text" elements with "punct"
          // elements (spaces and punctuation) -- concatenate verbatim.
          const elements = message.elements ?? [];
          const text = elements
            .map((el) => el.value)
            .join('')
            .trim();

          const confidences = elements
            .filter((el) => el.type === 'text' && el.confidence != null)
            .map((el) => el.confidence as number);

          if (text) {
            this.emitTranscription({
              text,
              isFinal: true,
              speechFinal: true,
              utteranceComplete: true,
              ...(confidences.length > 0
                ? { confidence: confidences.reduce((sum, c) => sum + c, 0) / confidences.length }
                : {}),
              metadata: {
                // Hypothesis elements with per-word timing and confidence,
                // and speaker_id labels when enableSpeakerSwitch is on.
                elements,
                ts: message.ts,
                endTs: message.end_ts,
                jobId: this.jobId,
              },
            });
          }
          return;
        }

        default:
          this.logger.debug('Ignoring unknown Rev AI message type', {
            type: (message as { type?: string }).type,
          });
      }
    } catch (error) {
      this.logger.error('Error processing Rev AI WebSocket message', error);
    }
  }

  /**
   * Handle WebSocket close events from Rev AI.
   *
   * @remarks
   * Rev AI signals errors via close codes rather than error messages:
   * 4001 (invalid access token), 4002 (invalid content type), and 4013
   * (worker wait timeout). Abnormal closes reject a pending connect,
   * emit an error transcription result, and are logged; a pending
   * graceful disconnect is resolved either way.
   *
   * @param event - The `CloseEvent` with close code and reason.
   */
  private handleClose(event: CloseEvent): void {
    const description = REVAI_CLOSE_CODES[event.code];
    const wasConnected = this.isConnected;
    this.isConnected = false;

    if (description) {
      this.logger.error('Rev AI STT WebSocket closed with error', {
        code: event.code,
        reason: event.reason,
        description,
      });
    } else {
      this.logger.info('Rev AI STT WebSocket closed', {
        code: event.code,
        reason: event.reason,
      });
    }

    // Reject a pending connect (e.g. auth failure during the handshake).
    this.connectedRejecter?.(
      new Error(
        `Rev AI closed the connection with code ${event.code}${
          description ? ` (${description})` : ''
        }`
      )
    );

    // Surface abnormal closes on an established session as an error result.
    if (description && wasConnected) {
      this.emitTranscription({
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: description,
          closeCode: event.code,
          closeReason: event.reason,
        },
      });
    }

    // Resolve a pending graceful disconnect.
    this.closeResolver?.();
  }

  /**
   * Send a raw audio chunk to Rev AI for streaming transcription.
   *
   * @remarks
   * The `ArrayBuffer` is forwarded as a binary WebSocket frame, which is
   * the format required by Rev AI's streaming API. The audio must match
   * the declared `content_type`. If the connection is not open, the chunk
   * is silently dropped and a warning is logged.
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
   * Gracefully close the Rev AI WebSocket connection.
   *
   * @remarks
   * Sends the `"EOS"` text frame (exact capitalization required by Rev
   * AI) so the service returns the last final hypothesis and closes the
   * socket with code 1000, waits for that close (up to 3 s), then
   * disconnects the underlying {@link WebSocketManager}. Closing the
   * socket without sending `EOS` would trigger a 1007 (Invalid Payload)
   * error upstream.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.wsManager) {
      this.logger.warn('Not connected to Rev AI STT');
      return;
    }

    if (!this.isConnected) {
      // The session is already dead, but the manager (and possibly a live
      // socket) may still exist — tear it down for real so nothing leaks.
      const manager = this.wsManager;
      this.wsManager = null;
      this.jobId = null;
      await manager.disconnect();
      return;
    }

    try {
      this.logger.debug('Disconnecting from Rev AI STT WebSocket');

      // The server usually closes in response to the end-of-stream message
      // below; tell the manager that close is expected so it is not
      // reported as a lost connection.
      this.wsManager.expectClose();

      // Signal end-of-stream. Rev AI responds with the last final
      // hypothesis and then closes the connection.
      try {
        this.wsManager.send('EOS');
      } catch {
        // Ignore send errors during disconnect
      }

      // Wait for the server-side close (with a 3s fallback), then disconnect
      await new Promise<void>((resolve) => {
        const settle = (): void => {
          clearTimeout(timeout);
          this.closeResolver = null;
          resolve();
        };
        const timeout = setTimeout(settle, 3000);
        this.closeResolver = settle;

        if (!this.wsManager?.isConnected()) {
          settle();
        }
      });

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;
      this.jobId = null;

      this.logger.info('Disconnected from Rev AI STT WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Rev AI STT', error);
      throw error;
    }
  }

  /**
   * Check whether the Rev AI WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
