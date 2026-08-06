/**
 * Soniox real-time speech-to-text provider using the WebSocket
 * transcription API.
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { WebSocketManager, type WebSocketManagerOptions } from '../../../utils/websocket';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * Configuration options for the {@link SonioxSTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with Soniox-specific settings.
 * You must provide **either** `apiKey` (for direct browser-to-Soniox
 * connections) or `proxyUrl` (for a server-side proxy that injects the
 * API key). If both are provided, `proxyUrl` takes precedence.
 *
 * For direct browser connections, Soniox recommends temporary API keys
 * generated server-side. Pass an async factory as `apiKey` to fetch a
 * fresh temporary key on each connection.
 *
 * @example
 * ```ts
 * // Direct connection with a temporary API key factory
 * const config: SonioxSTTConfig = {
 *   apiKey: async () => {
 *     const res = await fetch('/api/soniox-temp-key');
 *     const { apiKey } = await res.json();
 *     return apiKey;
 *   },
 *   sampleRate: 16000,
 * };
 *
 * // Proxy connection (recommended for production)
 * const config: SonioxSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/soniox',
 *   languageHints: ['en', 'es'],
 * };
 * ```
 *
 * @see {@link SonioxSTT} for the provider class
 */
export interface SonioxSTTConfig extends STTProviderConfig {
  /**
   * The Soniox real-time model to use.
   * @default 'stt-rt-v5'
   */
  model?: string;
  /**
   * Audio format of the streamed audio.
   *
   * @remarks
   * Use a raw format such as `'pcm_s16le'`, `'mulaw'`, or `'alaw'`
   * (requires `sampleRate` and `numChannels`), or `'auto'` to let Soniox
   * detect a container format (wav, mp3, ogg, flac, ...) from the stream.
   *
   * @default 'pcm_s16le'
   */
  audioFormat?: string;
  /**
   * Audio sample rate in Hz. Required for raw audio formats.
   * @default 16000
   */
  sampleRate?: number;
  /**
   * Number of audio channels. Required for raw audio formats.
   * @default 1
   */
  numChannels?: number;
  /**
   * Language hints to bias recognition, as ISO 639-1 codes
   * (e.g. `['en', 'es']`).
   *
   * @remarks
   * When omitted, falls back to `[language]` if the base `language`
   * option is set. Soniox auto-detects among 60+ languages either way.
   */
  languageHints?: string[];
  /**
   * Restrict recognition to the specified `languageHints` only.
   * @default false
   */
  languageHintsStrict?: boolean;
  /**
   * Detect when the speaker stops talking, finalize all pending tokens,
   * and mark the utterance complete.
   *
   * @remarks
   * Required for automatic turn-taking in the CompositeVoice pipeline —
   * without it, no `utteranceComplete` result is emitted until the
   * stream ends.
   *
   * @default true
   */
  enableEndpointDetection?: boolean;
  /**
   * Maximum silence in milliseconds before an endpoint is forced.
   * Accepted range is 500 to 3000.
   * @default 2000 (Soniox server default)
   */
  maxEndpointDelayMs?: number;
  /**
   * Label each token with the speaker who said it.
   * @default false
   */
  enableSpeakerDiarization?: boolean;
  /**
   * Identify the language of each token.
   * @default false
   */
  enableLanguageIdentification?: boolean;
  /**
   * Domain context to improve recognition of specialized vocabulary.
   *
   * @remarks
   * Supports Soniox context fields such as `general`, `text`, and
   * `terms`. See the Soniox docs for the full structure.
   */
  context?: Record<string, unknown>;
  /**
   * Optional identifier (max 256 characters) logged by Soniox for
   * request tracking.
   */
  clientReferenceId?: string;
}

/**
 * A single token from the Soniox real-time token stream.
 * @internal
 */
interface SonioxToken {
  text: string;
  start_ms?: number;
  end_ms?: number;
  confidence?: number;
  is_final: boolean;
  speaker?: string;
  language?: string;
}

/**
 * A response message from the Soniox real-time WebSocket.
 * @internal
 */
interface SonioxResponse {
  tokens?: SonioxToken[];
  final_audio_proc_ms?: number;
  total_audio_proc_ms?: number;
  finished?: boolean;
  error_code?: number;
  error_type?: string;
  error_message?: string;
}

/** @internal Special token emitted by Soniox when an endpoint is detected. */
const END_TOKEN = '<end>';

/** @internal Default Soniox real-time WebSocket base URL. */
const SONIOX_WS_URL = 'wss://stt-rt.soniox.com';

/**
 * Soniox real-time STT provider using a raw WebSocket connection.
 *
 * @remarks
 * `SonioxSTT` extends {@link LiveSTTProvider} and connects to Soniox's
 * real-time transcription WebSocket API. After the connection opens, a
 * JSON configuration message is sent, then audio is streamed as binary
 * frames. Soniox returns a continuous stream of tokens flagged as
 * provisional (`is_final: false`) or confirmed (`is_final: true`).
 *
 * The provider accumulates confirmed tokens into the current utterance
 * and emits interim results as provisional tokens arrive. When Soniox
 * detects an endpoint (the speaker stops talking), it finalizes all
 * pending tokens and emits a special `<end>` token — the provider then
 * emits the utterance with `isFinal: true` and `utteranceComplete: true`,
 * triggering the next pipeline stage.
 *
 * Key features:
 *
 * - Interim (provisional) and final transcription results
 * - Automatic language detection across 60+ languages, with hints
 * - Endpoint detection for automatic turn-taking
 * - Optional speaker diarization and language identification
 * - Automatic WebSocket reconnection with exponential backoff (via
 *   {@link WebSocketManager})
 * - Proxy mode via {@link SonioxSTTConfig.proxyUrl} (recommended for
 *   production so the API key stays server-side)
 *
 * **Transport:** WebSocket (via {@link WebSocketManager})
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 * No peer dependencies required -- the provider uses a raw WebSocket
 * connection managed by the SDK's built-in {@link WebSocketManager}.
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> binary frames -> Soniox WS
 *                                                                       |
 * CompositeVoice <- onTranscription(result) <--- token accumulation <---+
 * ```
 *
 * @example
 * ```ts
 * import { SonioxSTT } from 'composite-voice';
 *
 * const stt = new SonioxSTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/soniox',
 *   languageHints: ['en'],
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
 * @see {@link SonioxSTTConfig} for configuration options
 * @see {@link DeepgramSTT} for an alternative real-time STT provider
 */
export class SonioxSTT extends LiveSTTProvider {
  declare public config: SonioxSTTConfig;

  /** The WebSocket connection manager. */
  private wsManager: WebSocketManager | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /** Confirmed (final) text accumulated for the current utterance. */
  private finalText = '';

  /** Sum of confidences of confirmed tokens in the current utterance. */
  private confidenceSum = 0;

  /** Count of confirmed tokens in the current utterance. */
  private confidenceCount = 0;

  /** Confirmed tokens (with timing/speaker/language) for the current utterance. */
  private utteranceTokens: SonioxToken[] = [];

  /** Resolves the pending disconnect wait when the `finished` message arrives. */
  private finishedResolver: (() => void) | null = null;

  /**
   * Create a new SonioxSTT provider.
   *
   * @param config - Soniox STT configuration. Must include either
   *   `apiKey` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new SonioxSTT({
   *   apiKey: 'soniox_abc123...',
   *   sampleRate: 16000,
   * });
   * ```
   */
  constructor(config: SonioxSTTConfig, logger?: Logger) {
    const finalConfig: SonioxSTTConfig = {
      model: 'stt-rt-v5',
      audioFormat: 'pcm_s16le',
      sampleRate: 16000,
      numChannels: 1,
      interimResults: true,
      enableEndpointDetection: true,
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
        'SonioxSTT',
        new Error('SonioxSTT requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    this.logger.info('Soniox STT initialized', {
      model: this.config.model,
      audioFormat: this.config.audioFormat,
      sampleRate: this.config.sampleRate,
      hasLanguageHints: !!(this.config.languageHints && this.config.languageHints.length > 0),
      hasProxy: !!this.config.proxyUrl,
    });
  }

  /** Disconnect the WebSocket (if connected) and release the manager. */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      try {
        await this.disconnect();
      } catch (error) {
        this.logger.warn('Error disconnecting during dispose', error as Error);
      }
    }
    this.wsManager = null;
    this.logger.info('Soniox STT disposed');
  }

  /**
   * Build the WebSocket URL for Soniox real-time transcription.
   *
   * @remarks
   * Proxy mode: `ws(s)://<proxyUrl>/transcribe-websocket`
   * Direct mode: `wss://stt-rt.soniox.com/transcribe-websocket`
   *
   * Authentication happens via the initial configuration message (direct
   * mode) or a proxy-injected header, not the URL.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private buildWebSocketUrl(): string {
    const base = this.config.proxyUrl ? this.config.proxyUrl.replace(/^http/, 'ws') : SONIOX_WS_URL;

    return `${base}/transcribe-websocket`;
  }

  /**
   * Build the initial JSON configuration message for the Soniox session.
   *
   * @remarks
   * In direct mode the resolved API key is included as `api_key` — this
   * is how Soniox authenticates the WebSocket session. In proxy mode the
   * key is omitted; the proxy injects an `Authorization: Bearer` header
   * into the upstream connection instead.
   */
  private async buildStartMessage(): Promise<Record<string, unknown>> {
    const message: Record<string, unknown> = {
      model: this.config.model ?? 'stt-rt-v5',
      audio_format: this.config.audioFormat ?? 'pcm_s16le',
    };

    if (!this.isProxyMode) {
      message.api_key = await this.resolveApiKey();
    }

    if (message.audio_format !== 'auto') {
      message.sample_rate = this.config.sampleRate ?? 16000;
      message.num_channels = this.config.numChannels ?? 1;
    }

    const languageHints =
      this.config.languageHints ?? (this.config.language ? [this.config.language] : undefined);
    if (languageHints && languageHints.length > 0) {
      message.language_hints = languageHints;
      if (this.config.languageHintsStrict != null) {
        message.language_hints_strict = this.config.languageHintsStrict;
      }
    }

    if (this.config.enableEndpointDetection !== false) {
      message.enable_endpoint_detection = true;
      if (this.config.maxEndpointDelayMs != null) {
        message.max_endpoint_delay_ms = this.config.maxEndpointDelayMs;
      }
    }

    if (this.config.enableSpeakerDiarization) {
      message.enable_speaker_diarization = true;
    }

    if (this.config.enableLanguageIdentification) {
      message.enable_language_identification = true;
    }

    if (this.config.context) {
      message.context = this.config.context;
    }

    if (this.config.clientReferenceId) {
      message.client_reference_id = this.config.clientReferenceId;
    }

    return message;
  }

  /**
   * Open a WebSocket connection to Soniox for real-time transcription.
   *
   * @remarks
   * Creates a {@link WebSocketManager} with reconnection enabled, waits
   * for the connection to open, then sends the initial configuration
   * message that starts the transcription session. The connection
   * timeout defaults to {@link SonioxSTTConfig.timeout | config.timeout}
   * (10 000 ms).
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized or the connection fails.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Soniox STT');
      return;
    }

    try {
      this.logger.debug('Connecting to Soniox STT WebSocket');

      const wsUrl = this.buildWebSocketUrl();

      const wsOptions: WebSocketManagerOptions = {
        url: wsUrl,
        connectionTimeout: this.config.timeout ?? 10000,
        // Auto-reconnect is disabled: reopening the socket cannot replay the
        // start-message handshake, so a reconnected socket would be a dead
        // session. Unexpected closes surface immediately via onConnectionLost;
        // SDK-level recovery (or a FallbackSTT chain) owns reconnection.
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
          this.logger.info('Soniox STT WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('Soniox STT WebSocket error', error);
        },
        onConnectionLost: (error: Error) => {
          this.isConnected = false;
          this.emitConnectionLost(`Soniox STT connection lost: ${error.message}`);
        },
      });

      // Connect and wait for open
      await this.wsManager.connect();

      // Start the session with the initial configuration message
      const startMessage = await this.buildStartMessage();
      this.wsManager.send(JSON.stringify(startMessage));

      this.isConnected = true;
      this.resetUtterance();

      this.logger.info('Connected to Soniox STT WebSocket', {
        model: this.config.model,
        audioFormat: this.config.audioFormat,
        sampleRate: this.config.sampleRate,
      });
    } catch (error) {
      // Close any half-open socket (e.g. connected but the start message
      // failed to build or send) before dropping the manager reference.
      if (this.wsManager) {
        try {
          await this.wsManager.disconnect();
        } catch {
          // Best-effort cleanup
        }
      }
      this.wsManager = null;
      this.isConnected = false;
      throw new ProviderConnectionError('SonioxSTT', error as Error);
    }
  }

  /** Reset the per-utterance accumulation state. @internal */
  private resetUtterance(): void {
    this.finalText = '';
    this.confidenceSum = 0;
    this.confidenceCount = 0;
    this.utteranceTokens = [];
  }

  /**
   * Parse and dispatch incoming WebSocket messages from Soniox.
   *
   * @remarks
   * Confirmed tokens are accumulated into the current utterance;
   * provisional tokens produce interim results. When the special
   * `<end>` token arrives (endpoint detected) or the stream finishes,
   * the accumulated utterance is emitted with `isFinal: true` and
   * `utteranceComplete: true` via {@link emitTranscription}.
   *
   * @param event - The raw WebSocket `MessageEvent`.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      if (typeof event.data !== 'string') {
        this.logger.warn('Received non-string message from Soniox, ignoring');
        return;
      }

      const message: SonioxResponse = JSON.parse(event.data);

      // Handle error messages
      if (message.error_code != null) {
        this.logger.error('Soniox error', {
          errorCode: message.error_code,
          errorType: message.error_type,
          errorMessage: message.error_message,
        });
        this.emitTranscription({
          text: '',
          isFinal: true,
          confidence: 0,
          metadata: {
            error: message.error_message,
            errorCode: message.error_code,
            errorType: message.error_type,
          },
        });
        return;
      }

      let endpointDetected = false;
      let nonFinalText = '';

      for (const token of message.tokens ?? []) {
        if (token.text === END_TOKEN) {
          endpointDetected = true;
          continue;
        }

        if (token.is_final) {
          this.finalText += token.text;
          this.utteranceTokens.push(token);
          if (token.confidence != null) {
            this.confidenceSum += token.confidence;
            this.confidenceCount += 1;
          }
        } else {
          nonFinalText += token.text;
        }
      }

      if (endpointDetected || message.finished) {
        const text = this.finalText.trim();
        if (text) {
          this.emitTranscription({
            text,
            isFinal: true,
            speechFinal: true,
            utteranceComplete: true,
            ...(this.confidenceCount > 0
              ? { confidence: this.confidenceSum / this.confidenceCount }
              : {}),
            metadata: {
              // Confirmed tokens with per-token timing, and speaker/language
              // labels when diarization/language identification are enabled.
              tokens: this.utteranceTokens,
              finalAudioProcMs: message.final_audio_proc_ms,
              totalAudioProcMs: message.total_audio_proc_ms,
            },
          });
        }
        this.resetUtterance();

        if (message.finished) {
          this.logger.info('Soniox session finished');
          this.finishedResolver?.();
        }
        return;
      }

      if (this.config.interimResults !== false) {
        const interimText = (this.finalText + nonFinalText).trim();
        if (interimText) {
          this.emitTranscription({
            text: interimText,
            isFinal: false,
            metadata: {
              totalAudioProcMs: message.total_audio_proc_ms,
            },
          });
        }
      }
    } catch (error) {
      this.logger.error('Error processing Soniox WebSocket message', error);
    }
  }

  /**
   * Send a raw audio chunk to Soniox for real-time transcription.
   *
   * @remarks
   * The `ArrayBuffer` is forwarded as a binary WebSocket frame, which is
   * the format required by Soniox's real-time API. If the connection is
   * not open, the chunk is silently dropped and a warning is logged.
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
   * Force Soniox to finalize all pending provisional tokens immediately.
   *
   * @remarks
   * Sends a `{ "type": "finalize" }` control message. Useful for manual
   * turn-taking when endpoint detection is disabled.
   */
  finalize(): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot finalize: not connected');
      return;
    }

    try {
      this.wsManager.send(JSON.stringify({ type: 'finalize' }));
    } catch (error) {
      this.logger.error('Failed to send finalize message', error);
    }
  }

  /**
   * Gracefully close the Soniox WebSocket connection.
   *
   * @remarks
   * Sends an empty frame to signal end-of-stream (Soniox finalizes all
   * pending tokens and responds with a `finished` message), waits for
   * that `finished` message (up to 1 s), then disconnects the underlying
   * {@link WebSocketManager}.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.wsManager) {
      this.logger.warn('Not connected to Soniox STT');
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
      this.logger.debug('Disconnecting from Soniox STT WebSocket');

      // The server usually closes in response to the end-of-stream message
      // below; tell the manager that close is expected so it is not
      // reported as a lost connection.
      this.wsManager.expectClose();

      // Send an empty frame to signal end-of-stream
      try {
        this.wsManager.send(new ArrayBuffer(0));
      } catch {
        // Ignore send errors during disconnect
      }

      // Wait for the finished response (with a 1s fallback), then disconnect
      await new Promise<void>((resolve) => {
        const settle = (): void => {
          clearTimeout(timeout);
          this.finishedResolver = null;
          resolve();
        };
        const timeout = setTimeout(settle, 1000);
        this.finishedResolver = settle;

        if (!this.wsManager?.isConnected()) {
          settle();
        }
      });

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;

      this.logger.info('Disconnected from Soniox STT WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Soniox STT', error);
      throw error;
    }
  }

  /**
   * Check whether the Soniox WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
