/**
 * Gladia real-time speech-to-text provider using the v2 live
 * transcription API (Solaria model family).
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { HttpClient } from '../../../utils/http';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * Audio encodings accepted by the Gladia live API.
 *
 * @remarks
 * - `'wav/pcm'` -- 16-bit linear PCM (default)
 * - `'wav/alaw'` -- A-law companded audio
 * - `'wav/ulaw'` -- mu-law companded audio
 */
export type GladiaSTTEncoding = 'wav/pcm' | 'wav/alaw' | 'wav/ulaw';

/**
 * Gladia processing regions.
 *
 * @remarks
 * Passed as the `region` query parameter on the session-init request.
 */
export type GladiaSTTRegion = 'us-west' | 'eu-west';

/**
 * Configuration options for the {@link GladiaSTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with Gladia-specific settings.
 * You must provide **either** `apiKey` (for direct browser-to-Gladia
 * session initiation) or `proxyUrl` (for a server-side proxy that
 * injects the `x-gladia-key` header). If both are provided, `proxyUrl`
 * takes precedence.
 *
 * Authentication only happens on the HTTP session-init request. The
 * WebSocket URL returned by Gladia embeds a single-use session token,
 * so the audio stream always connects directly to Gladia -- even in
 * proxy mode.
 *
 * @example
 * ```ts
 * // Direct connection (development)
 * const config: GladiaSTTConfig = {
 *   apiKey: 'YOUR_GLADIA_API_KEY',
 *   sampleRate: 16000,
 *   languages: ['en'],
 * };
 *
 * // Proxy connection (recommended for production)
 * const config: GladiaSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/gladia',
 *   endpointing: 0.3,
 * };
 * ```
 *
 * @see {@link GladiaSTT} for the provider class
 */
export interface GladiaSTTConfig extends STTProviderConfig {
  /**
   * The Gladia live transcription model to use.
   * @default 'solaria-1'
   */
  model?: string;
  /**
   * Encoding of the streamed audio.
   * @default 'wav/pcm'
   */
  encoding?: GladiaSTTEncoding;
  /**
   * Audio sample rate in Hz. Gladia accepts 8000, 16000, 32000, 44100,
   * or 48000.
   * @default 16000
   */
  sampleRate?: number;
  /**
   * Bit depth of the audio stream. Gladia accepts 8, 16, 24, or 32.
   * @default 16
   */
  bitDepth?: number;
  /**
   * Number of audio channels (1-8).
   * @default 1
   */
  channels?: number;
  /**
   * Processing region for the session (`region` query parameter on the
   * session-init request).
   *
   * @default undefined (Gladia default region)
   */
  region?: GladiaSTTRegion;
  /**
   * Silence duration in seconds before Gladia ends an utterance and
   * emits a final transcript. Accepted range is 0.01 to 10.
   *
   * @remarks
   * Endpointing drives turn-taking in the CompositeVoice pipeline:
   * every final transcript is emitted with `utteranceComplete: true`.
   * The Gladia default (0.05 s) is aggressive for conversational
   * agents -- values around 0.3-0.8 s give more natural turns.
   *
   * @default 0.05 (Gladia server default)
   */
  endpointing?: number;
  /**
   * Maximum utterance duration in seconds before Gladia forces an
   * endpoint even while speech continues. Accepted range is 5 to 60.
   * @default 5 (Gladia server default)
   */
  maximumDurationWithoutEndpointing?: number;
  /**
   * Languages spoken in the audio, as ISO 639-1 codes (e.g. `['en', 'es']`).
   *
   * @remarks
   * When omitted, falls back to `[language]` if the base `language`
   * option is set; otherwise Gladia auto-detects the language. A single
   * entry pins the language; multiple entries restrict detection to
   * that set.
   */
  languages?: string[];
  /**
   * Re-detect the language for every utterance instead of once per
   * session. Useful for conversations that switch languages mid-stream.
   * @default false
   */
  codeSwitching?: boolean;
  /**
   * Gladia `pre_processing` options (e.g. `audio_enhancer`,
   * `speech_threshold`), passed through verbatim.
   *
   * @remarks
   * See the Gladia session-init reference for the full structure.
   */
  preProcessing?: Record<string, unknown>;
  /**
   * Gladia `realtime_processing` options (custom vocabulary, translation,
   * named entity recognition, sentiment analysis), passed through verbatim.
   *
   * @remarks
   * See the Gladia session-init reference for the full structure.
   */
  realtimeProcessing?: Record<string, unknown>;
  /**
   * Extra `messages_config` flags merged on top of the provider defaults
   * (`receive_partial_transcripts` from `interimResults`,
   * `receive_final_transcripts: true`).
   */
  messagesConfig?: Record<string, unknown>;
  /**
   * Arbitrary metadata attached to the session (`custom_metadata`),
   * visible in Gladia's session results.
   */
  customMetadata?: Record<string, unknown>;
  /**
   * Maximum number of retries for the session-init HTTP request.
   * @default 3
   */
  maxRetries?: number;
}

/**
 * Response from Gladia's `POST /v2/live` session-init endpoint.
 * @internal
 */
interface GladiaInitResponse {
  /** Session identifier (also usable with `GET /v2/live/{id}`). */
  id: string;
  /** WebSocket URL with an embedded single-use session token. */
  url: string;
}

/**
 * A word within a Gladia utterance.
 * @internal
 */
interface GladiaWord {
  word: string;
  start?: number;
  end?: number;
  confidence?: number;
}

/**
 * The utterance payload of a Gladia `transcript` message.
 * @internal
 */
interface GladiaUtterance {
  text: string;
  start?: number;
  end?: number;
  confidence?: number;
  language?: string;
  channel?: number;
  words?: GladiaWord[];
}

/**
 * An error object attached to Gladia WebSocket messages.
 * @internal
 */
interface GladiaError {
  status_code?: number;
  exception?: string;
  message?: string;
}

/**
 * A message from the Gladia live WebSocket.
 * @internal
 */
interface GladiaMessage {
  type?: string;
  session_id?: string;
  created_at?: string;
  error?: GladiaError | null;
  data?: {
    id?: string;
    is_final?: boolean;
    utterance?: GladiaUtterance;
    [key: string]: unknown;
  };
}

/** @internal Default Gladia REST API base URL (session initiation). */
const GLADIA_API_URL = 'https://api.gladia.io';

/** @internal Path of the live session-init endpoint. */
const GLADIA_LIVE_PATH = '/v2/live';

/**
 * Gladia real-time STT provider using the v2 live API.
 *
 * @remarks
 * `GladiaSTT` extends {@link LiveSTTProvider} and implements Gladia's
 * two-step live flow:
 *
 * 1. **Session init (HTTP):** `POST /v2/live` with the session
 *    configuration. Authentication happens here via the `x-gladia-key`
 *    header (direct mode) or a proxy that injects it (proxy mode).
 *    Gladia responds with a WebSocket `url` containing a single-use
 *    session token.
 * 2. **Streaming (WebSocket):** the provider connects to the returned
 *    URL -- straight to Gladia in both modes, since the token is
 *    embedded in the URL -- and streams raw audio as binary frames.
 *
 * Gladia segments speech into utterances using server-side endpointing
 * and sends `transcript` messages flagged `is_final: false` (partial)
 * or `is_final: true` (final). Each final transcript closes an
 * utterance, so the provider emits it with `isFinal: true` and
 * `utteranceComplete: true`, triggering the next pipeline stage.
 *
 * Key features:
 *
 * - Interim (partial) and final transcription results
 * - Server-side endpointing for automatic turn-taking (configurable
 *   via {@link GladiaSTTConfig.endpointing})
 * - Language detection, pinning, and per-utterance code switching
 * - Word-level timestamps and confidence on final results
 * - Automatic WebSocket reconnection with exponential backoff (via
 *   {@link WebSocketManager}) -- the session URL stays valid, so
 *   reconnects resume the same session
 * - Proxy mode via {@link GladiaSTTConfig.proxyUrl} (recommended for
 *   production so the API key stays server-side)
 *
 * **Transport:** HTTP session init + WebSocket streaming (via
 * {@link HttpClient} and {@link WebSocketManager})
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 * No peer dependencies required -- the provider uses native `fetch` and a
 * raw WebSocket connection managed by the SDK's built-in utilities.
 *
 * **Data flow:**
 *
 * ```
 * POST /v2/live (x-gladia-key) -> { id, url }
 *                                     |
 * Microphone -> sendAudio(chunk) -> binary frames -> wss://api.gladia.io/v2/live?token=...
 *                                                                  |
 * CompositeVoice <- onTranscription(result) <- transcript messages +
 * ```
 *
 * @example
 * ```ts
 * import { GladiaSTT } from 'composite-voice';
 *
 * const stt = new GladiaSTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/gladia',
 *   languages: ['en'],
 *   endpointing: 0.3,
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
 * @see {@link GladiaSTTConfig} for configuration options
 * @see {@link SonioxSTT} for an alternative real-time STT provider
 */
export class GladiaSTT extends LiveSTTProvider {
  declare public config: GladiaSTTConfig;

  /** HTTP client for the session-init request. */
  private httpClient: HttpClient | null = null;

  /** The WebSocket connection manager. */
  private wsManager: WebSocketManager | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /** Identifier of the current Gladia session (from the init response). */
  private sessionId: string | null = null;

  /** Resolves the pending disconnect wait when post-processing completes. */
  private endedResolver: (() => void) | null = null;

  /**
   * Create a new GladiaSTT provider.
   *
   * @param config - Gladia STT configuration. Must include either
   *   `apiKey` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new GladiaSTT({
   *   apiKey: 'YOUR_GLADIA_API_KEY',
   *   sampleRate: 16000,
   * });
   * ```
   */
  constructor(config: GladiaSTTConfig, logger?: Logger) {
    const finalConfig: GladiaSTTConfig = {
      model: 'solaria-1',
      encoding: 'wav/pcm',
      sampleRate: 16000,
      bitDepth: 16,
      channels: 1,
      interimResults: true,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Validate auth and create the HTTP client for session initiation.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when neither `apiKey` nor `proxyUrl` is set.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'GladiaSTT',
        new Error('GladiaSTT requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    // The session-init request is plain HTTP even though this is a
    // WebSocket provider, so the proxy URL must keep its http(s) scheme
    // (resolveBaseUrl would rewrite it to ws(s) for websocket providers).
    const baseUrl = this.config.proxyUrl ?? this.config.endpoint ?? GLADIA_API_URL;

    this.httpClient = new HttpClient({
      baseUrl,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 10000,
      logger: this.logger,
      providerName: 'GladiaSTT',
    });

    this.logger.info('Gladia STT initialized', {
      model: this.config.model,
      encoding: this.config.encoding,
      sampleRate: this.config.sampleRate,
      hasLanguages: !!(this.config.languages && this.config.languages.length > 0),
      hasProxy: !!this.config.proxyUrl,
    });
  }

  /** Disconnect the WebSocket (if connected) and release the clients. */
  protected async onDispose(): Promise<void> {
    if (this.wsManager) {
      try {
        await this.disconnect();
      } catch (error) {
        this.logger.warn('Error disconnecting during dispose', error as Error);
      }
    }
    this.wsManager = null;
    this.httpClient = null;
    this.logger.info('Gladia STT disposed');
  }

  /**
   * Build the session configuration body for `POST /v2/live`.
   *
   * @remarks
   * Field names follow Gladia's snake_case wire format. The
   * `messages_config` defaults enable partial transcripts when
   * `interimResults` is on; {@link GladiaSTTConfig.messagesConfig}
   * entries are merged on top for full control.
   */
  private buildSessionConfig(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      encoding: this.config.encoding ?? 'wav/pcm',
      sample_rate: this.config.sampleRate ?? 16000,
      bit_depth: this.config.bitDepth ?? 16,
      channels: this.config.channels ?? 1,
      model: this.config.model ?? 'solaria-1',
    };

    if (this.config.endpointing != null) {
      body.endpointing = this.config.endpointing;
    }

    if (this.config.maximumDurationWithoutEndpointing != null) {
      body.maximum_duration_without_endpointing = this.config.maximumDurationWithoutEndpointing;
    }

    const languages =
      this.config.languages ?? (this.config.language ? [this.config.language] : undefined);
    if ((languages && languages.length > 0) || this.config.codeSwitching != null) {
      body.language_config = {
        ...(languages && languages.length > 0 ? { languages } : {}),
        ...(this.config.codeSwitching != null ? { code_switching: this.config.codeSwitching } : {}),
      };
    }

    body.messages_config = {
      receive_partial_transcripts: this.config.interimResults !== false,
      receive_final_transcripts: true,
      ...this.config.messagesConfig,
    };

    if (this.config.preProcessing) {
      body.pre_processing = this.config.preProcessing;
    }

    if (this.config.realtimeProcessing) {
      body.realtime_processing = this.config.realtimeProcessing;
    }

    if (this.config.customMetadata) {
      body.custom_metadata = this.config.customMetadata;
    }

    return body;
  }

  /**
   * Initiate a live session via `POST /v2/live`.
   *
   * @remarks
   * Direct mode sends the resolved API key in the `x-gladia-key` header
   * (async `apiKey` factories are resolved per call). Proxy mode sends
   * no credentials -- the proxy injects the header server-side.
   *
   * @returns The init response containing the session `id` and the
   *   tokenized WebSocket `url`.
   */
  private async initiateSession(): Promise<GladiaInitResponse> {
    if (!this.httpClient) {
      throw new Error('Gladia STT HTTP client not initialized');
    }

    const headers: Record<string, string> = {};
    if (!this.isProxyMode) {
      headers['x-gladia-key'] = await this.resolveApiKey();
    }

    const path = this.config.region
      ? `${GLADIA_LIVE_PATH}?region=${this.config.region}`
      : GLADIA_LIVE_PATH;

    const response = await this.httpClient.request(path, {
      method: 'POST',
      body: this.buildSessionConfig(),
      headers,
    });

    const data = (await response.json()) as GladiaInitResponse;

    if (!data.url) {
      throw new Error('Gladia session-init response did not contain a WebSocket URL');
    }

    return data;
  }

  /**
   * Initiate a Gladia live session and open the streaming WebSocket.
   *
   * @remarks
   * Performs the session-init POST (authenticated directly or through
   * the proxy), then connects a {@link WebSocketManager} to the
   * Gladia-returned URL with reconnection disabled. The session token is
   * embedded in that URL, so the WebSocket needs no further authentication.
   * The SDK drives reconnection through {@link connect} (and FallbackSTT
   * owns failover).
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized, the session-init
   * request fails, or the WebSocket connection fails.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Gladia STT');
      return;
    }

    try {
      this.logger.debug('Initiating Gladia live session');

      const session = await this.initiateSession();
      this.sessionId = session.id;

      this.logger.debug('Connecting to Gladia STT WebSocket', { sessionId: session.id });

      const wsOptions: WebSocketManagerOptions = {
        url: session.url,
        connectionTimeout: this.config.timeout ?? 10000,
        // Auto-reconnect is disabled: silent background retries drop every
        // audio chunk for the length of the backoff, so a dead socket must
        // surface immediately via onConnectionLost instead. The SDK drives
        // reconnection through connect() (and FallbackSTT owns failover).
        reconnection: { enabled: false },
        logger: this.logger,
      };

      this.wsManager = new WebSocketManager(wsOptions);

      // Set up message handlers
      this.wsManager.setHandlers({
        onMessage: (event: MessageEvent) => {
          this.handleMessage(event);
        },
        onClose: () => {
          this.logger.info('Gladia STT WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('Gladia STT WebSocket error', error);
        },
        onConnectionLost: (error: Error) => {
          this.isConnected = false;
          this.emitConnectionLost(`Gladia STT connection lost: ${error.message}`);
        },
      });

      // Connect and wait for open — the session config was already sent
      // in the init POST, so no start message is needed here.
      await this.wsManager.connect();

      this.isConnected = true;

      this.logger.info('Connected to Gladia STT WebSocket', {
        sessionId: session.id,
        model: this.config.model,
        encoding: this.config.encoding,
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
      this.sessionId = null;
      throw new ProviderConnectionError('GladiaSTT', error as Error);
    }
  }

  /**
   * Parse and dispatch incoming WebSocket messages from Gladia.
   *
   * @remarks
   * `transcript` messages with `is_final: false` produce interim results;
   * `is_final: true` closes the utterance (Gladia's endpointing decides
   * the boundary) and is emitted with `isFinal: true` and
   * `utteranceComplete: true` via {@link emitTranscription}. Lifecycle
   * and speech events are logged; `post_final_transcript` resolves a
   * pending graceful disconnect.
   *
   * @param event - The raw WebSocket `MessageEvent`.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      if (typeof event.data !== 'string') {
        this.logger.warn('Received non-string message from Gladia, ignoring');
        return;
      }

      const message: GladiaMessage = JSON.parse(event.data);

      // Handle attached errors (any message type may carry one)
      if (message.error != null) {
        this.logger.error('Gladia error', {
          type: message.type,
          statusCode: message.error.status_code,
          exception: message.error.exception,
          errorMessage: message.error.message,
        });
        this.emitTranscription({
          text: '',
          isFinal: true,
          confidence: 0,
          metadata: {
            error: message.error.message,
            errorCode: message.error.status_code,
            errorType: message.error.exception,
          },
        });
        return;
      }

      switch (message.type) {
        case 'transcript':
          this.handleTranscript(message);
          break;

        case 'speech_start':
        case 'speech_end':
          this.logger.debug(`Gladia ${message.type}`, message.data);
          break;

        case 'post_final_transcript':
          // Post-processing done — the server closes the socket next.
          this.logger.info('Gladia session post-processing complete');
          this.endedResolver?.();
          break;

        default:
          // Acknowledgments, lifecycle events, add-on results, ...
          this.logger.debug('Gladia message', { type: message.type });
          break;
      }
    } catch (error) {
      this.logger.error('Error processing Gladia WebSocket message', error);
    }
  }

  /**
   * Emit a transcription result for a Gladia `transcript` message.
   *
   * @remarks
   * Gladia's server-side endpointing closes an utterance before the
   * final transcript is sent, so every final transcript is a complete
   * utterance (`utteranceComplete: true`). Word-level timing, language,
   * and channel details are exposed on `metadata`.
   */
  private handleTranscript(message: GladiaMessage): void {
    const utterance = message.data?.utterance;
    const text = utterance?.text?.trim();
    if (!text) return;

    if (message.data?.is_final) {
      this.emitTranscription({
        text,
        isFinal: true,
        speechFinal: true,
        utteranceComplete: true,
        ...(utterance?.confidence != null ? { confidence: utterance.confidence } : {}),
        metadata: {
          utteranceId: message.data?.id,
          language: utterance?.language,
          channel: utterance?.channel,
          start: utterance?.start,
          end: utterance?.end,
          words: utterance?.words,
        },
      });
      return;
    }

    if (this.config.interimResults !== false) {
      this.emitTranscription({
        text,
        isFinal: false,
        metadata: {
          utteranceId: message.data?.id,
          language: utterance?.language,
        },
      });
    }
  }

  /**
   * Send a raw audio chunk to Gladia for real-time transcription.
   *
   * @remarks
   * The `ArrayBuffer` is forwarded as a binary WebSocket frame -- the
   * bytes must match the session's `encoding`, `sample_rate`,
   * `bit_depth`, and `channels`. If the connection is not open, the
   * chunk is silently dropped and a warning is logged.
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
   * Signal Gladia that no more audio will be sent.
   *
   * @remarks
   * Sends a `{ "type": "stop_recording" }` control message. Gladia
   * transcribes any buffered audio, runs post-processing, and closes
   * the connection with code 1000. Called automatically by
   * {@link disconnect}.
   */
  stopRecording(): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot stop recording: not connected');
      return;
    }

    try {
      this.wsManager.send(JSON.stringify({ type: 'stop_recording' }));
    } catch (error) {
      this.logger.error('Failed to send stop_recording message', error);
    }
  }

  /**
   * Gracefully close the Gladia WebSocket connection.
   *
   * @remarks
   * Sends a `stop_recording` message so Gladia finalizes any pending
   * audio, waits for the `post_final_transcript` message (up to 1 s),
   * then disconnects the underlying {@link WebSocketManager}.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.wsManager) {
      this.logger.warn('Not connected to Gladia STT');
      return;
    }

    if (!this.isConnected) {
      // The session is already dead, but the manager (and possibly a live
      // socket) may still exist — tear it down for real so nothing leaks.
      const manager = this.wsManager;
      this.wsManager = null;
      this.sessionId = null;
      await manager.disconnect();
      return;
    }

    try {
      this.logger.debug('Disconnecting from Gladia STT WebSocket');

      // The server usually closes in response to the end-of-stream message
      // below; tell the manager that close is expected so it is not
      // reported as a lost connection.
      this.wsManager.expectClose();

      // Signal end-of-stream so Gladia finalizes pending audio
      try {
        this.wsManager.send(JSON.stringify({ type: 'stop_recording' }));
      } catch {
        // Ignore send errors during disconnect
      }

      // Wait for post_final_transcript (with a 1s fallback), then disconnect
      await new Promise<void>((resolve) => {
        const settle = (): void => {
          clearTimeout(timeout);
          this.endedResolver = null;
          resolve();
        };
        const timeout = setTimeout(settle, 1000);
        this.endedResolver = settle;

        if (!this.wsManager?.isConnected()) {
          settle();
        }
      });

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;
      this.sessionId = null;

      this.logger.info('Disconnected from Gladia STT WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Gladia STT', error);
      throw error;
    }
  }

  /**
   * Check whether the Gladia WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get the identifier of the current Gladia live session.
   *
   * @remarks
   * Useful for fetching the full session result afterwards via
   * `GET /v2/live/{id}`.
   *
   * @returns The session id, or `null` when not connected.
   */
  getSessionId(): string | null {
    return this.sessionId;
  }
}
