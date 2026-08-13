/**
 * Speechmatics real-time speech-to-text provider using the WebSocket
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
 * Configuration options for the {@link SpeechmaticsSTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with Speechmatics-specific settings.
 * You must provide **either** `apiKey` (for direct browser-to-Speechmatics
 * connections) or `proxyUrl` (for a server-side proxy that injects the
 * API key). If both are provided, `proxyUrl` takes precedence.
 *
 * For direct browser connections, Speechmatics requires a short-lived
 * temporary key (JWT) passed as a `jwt` query parameter — browsers cannot
 * set WebSocket headers. Generate temporary keys server-side via
 * `POST https://mp.speechmatics.com/v1/api_keys?type=rt` and pass an
 * async factory as `apiKey` to fetch a fresh key on each connection.
 *
 * @example
 * ```ts
 * // Direct connection with a temporary key factory
 * const config: SpeechmaticsSTTConfig = {
 *   apiKey: async () => {
 *     const res = await fetch('/api/speechmatics-temp-key');
 *     const { keyValue } = await res.json();
 *     return keyValue;
 *   },
 *   language: 'en',
 * };
 *
 * // Proxy connection (recommended for production)
 * const config: SpeechmaticsSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/speechmatics',
 *   language: 'en',
 * };
 * ```
 *
 * @see {@link SpeechmaticsSTT} for the provider class
 */
export interface SpeechmaticsSTTConfig extends STTProviderConfig {
  /**
   * Speechmatics real-time SaaS region for direct connections.
   *
   * @remarks
   * Builds the WebSocket URL `wss://{region}.rt.speechmatics.com/v2`.
   * Available regions are `'eu'` (Europe) and `'us'` (USA). Ignored in
   * proxy mode — the proxy targets the EU endpoint.
   *
   * @default 'eu'
   */
  region?: string;
  /**
   * Audio format of the streamed audio.
   *
   * @remarks
   * Use a raw encoding — `'pcm_s16le'`, `'pcm_f32le'`, or `'mulaw'`
   * (requires `sampleRate`) — or `'file'` to stream a container format
   * (wav, mp3, ogg, flac, ...) that Speechmatics detects from the stream.
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
   * Accuracy/latency trade-off for the underlying model.
   *
   * @remarks
   * `'enhanced'` is more accurate but adds latency; `'standard'` is the
   * Speechmatics default. When omitted, the server default is used.
   */
  operatingPoint?: 'standard' | 'enhanced';
  /**
   * Maximum delay in seconds between the end of a spoken word and the
   * final (`AddTranscript`) result that contains it.
   *
   * @remarks
   * Accepted range is 0.7 to 4. Lower values reduce latency at a small
   * accuracy cost. Must be greater than
   * {@link SpeechmaticsSTTConfig.endOfUtteranceSilenceTrigger}.
   *
   * @default 1
   */
  maxDelay?: number;
  /**
   * Whether `maxDelay` may flex to keep entities (numbers, dates, ...)
   * intact (`'flexible'`) or is enforced strictly (`'fixed'`).
   *
   * @remarks
   * When omitted, the Speechmatics server default (`'flexible'`) is used.
   */
  maxDelayMode?: 'flexible' | 'fixed';
  /**
   * Seconds of silence after speech before Speechmatics emits an
   * `EndOfUtterance` message, which the provider maps to
   * `utteranceComplete: true`.
   *
   * @remarks
   * Accepted range is 0 to 2; `0` disables end-of-utterance detection
   * entirely. Must be lower than {@link SpeechmaticsSTTConfig.maxDelay}.
   * Speechmatics recommends 0.5–0.8 s for voice agents. Required for
   * automatic turn-taking in the CompositeVoice pipeline — when disabled,
   * no `utteranceComplete` result is emitted until the stream ends,
   * though you can call {@link SpeechmaticsSTT.forceEndOfUtterance}
   * manually.
   *
   * @default 0.75
   */
  endOfUtteranceSilenceTrigger?: number;
  /**
   * Label each word with the speaker who said it (Speechmatics
   * `diarization: 'speaker'`).
   * @default false
   */
  enableSpeakerDiarization?: boolean;
  /**
   * Custom dictionary entries to improve recognition of specialized
   * vocabulary.
   *
   * @remarks
   * Each entry is either a plain string or an object with `content` and
   * optional `sounds_like` pronunciations, passed through to
   * `transcription_config.additional_vocab`.
   *
   * @example
   * ```ts
   * additionalVocab: ['CompositeVoice', { content: 'Speechmatics', sounds_like: ['speech matics'] }]
   * ```
   */
  additionalVocab?: Array<string | { content: string; sounds_like?: string[] }>;
  /**
   * Locale for the transcript spelling (e.g. `'en-GB'`, `'en-US'`).
   * When omitted, the Speechmatics default for the language is used.
   */
  outputLocale?: string;
  /**
   * Optional language-pack domain (e.g. `'finance'`, `'medical'`) to
   * bias recognition toward a specialized field.
   */
  domain?: string;
}

/**
 * A single result entry (word/punctuation/entity) from a Speechmatics
 * transcript message.
 * @internal
 */
interface SpeechmaticsResult {
  type?: string;
  start_time?: number;
  end_time?: number;
  is_eos?: boolean;
  attaches_to?: string;
  alternatives?: Array<{
    content: string;
    confidence?: number;
    language?: string;
    speaker?: string;
  }>;
}

/**
 * A JSON message from the Speechmatics real-time WebSocket.
 * @internal
 */
interface SpeechmaticsMessage {
  message: string;
  id?: string;
  seq_no?: number;
  format?: string;
  type?: string;
  reason?: string;
  code?: number;
  metadata?: {
    transcript?: string;
    start_time?: number;
    end_time?: number;
  };
  results?: SpeechmaticsResult[];
}

/** @internal Default Speechmatics real-time region. */
const DEFAULT_REGION = 'eu';

/** @internal Build the Speechmatics real-time host for a region. */
function realtimeHost(region: string): string {
  return `wss://${region}.rt.speechmatics.com`;
}

/**
 * Speechmatics real-time STT provider using a raw WebSocket connection.
 *
 * @remarks
 * `SpeechmaticsSTT` extends {@link LiveSTTProvider} and connects to the
 * Speechmatics real-time SaaS WebSocket API (`/v2`). After the connection
 * opens, a `StartRecognition` JSON message is sent and the provider waits
 * for the server's `RecognitionStarted` acknowledgement, then audio is
 * streamed as binary `AddAudio` frames. Speechmatics replies with
 * `AddPartialTranscript` (work-in-progress) and `AddTranscript` (final
 * segment) messages.
 *
 * The provider accumulates final segments into the current utterance and
 * emits interim results as partials arrive. When Speechmatics detects
 * end of utterance (silence after speech, configured via
 * {@link SpeechmaticsSTTConfig.endOfUtteranceSilenceTrigger}), it sends
 * an `EndOfUtterance` message — the provider then emits the utterance
 * with `isFinal: true` and `utteranceComplete: true`, triggering the
 * next pipeline stage.
 *
 * Key features:
 *
 * - Interim (partial) and final transcription results
 * - 50+ languages with configurable output locale and domain packs
 * - End-of-utterance detection for automatic turn-taking
 * - Optional speaker diarization and custom vocabulary
 * - Automatic WebSocket reconnection with exponential backoff (via
 *   {@link WebSocketManager})
 * - Proxy mode via {@link SpeechmaticsSTTConfig.proxyUrl} (recommended
 *   for production so the API key stays server-side)
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
 * Microphone -> AudioCapture -> sendAudio(chunk) -> AddAudio frames -> Speechmatics WS
 *                                                                          |
 * CompositeVoice <- onTranscription(result) <-- segment accumulation <-----+
 * ```
 *
 * @example
 * ```ts
 * import { SpeechmaticsSTT } from 'composite-voice';
 *
 * const stt = new SpeechmaticsSTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/speechmatics',
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
 * await stt.disconnect();
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link SpeechmaticsSTTConfig} for configuration options
 * @see {@link SonioxSTT} for an alternative real-time STT provider
 */
export class SpeechmaticsSTT extends LiveSTTProvider {
  declare public config: SpeechmaticsSTTConfig;

  /** The WebSocket connection manager. */
  private wsManager: WebSocketManager | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /** Final segment text accumulated for the current utterance. */
  private finalText = '';

  /** Sum of word confidences for the current utterance. */
  private confidenceSum = 0;

  /** Count of word confidences for the current utterance. */
  private confidenceCount = 0;

  /** Final results (with timing/speaker) for the current utterance. */
  private utteranceResults: SpeechmaticsResult[] = [];

  /** Sequence number of the last binary audio chunk sent (`AddAudio`). */
  private lastSeqNo = 0;

  /** Settles the pending `connect()` wait for `RecognitionStarted`. */
  private recognitionStartedResolver: (() => void) | null = null;

  /** Rejects the pending `connect()` wait when an `Error` message arrives. */
  private recognitionStartedRejecter: ((error: Error) => void) | null = null;

  /** Resolves the pending disconnect wait when `EndOfTranscript` arrives. */
  private endOfTranscriptResolver: (() => void) | null = null;

  /**
   * Create a new SpeechmaticsSTT provider.
   *
   * @param config - Speechmatics STT configuration. Must include either
   *   `apiKey` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new SpeechmaticsSTT({
   *   apiKey: async () => fetchTemporaryKey(),
   *   language: 'en',
   * });
   * ```
   */
  constructor(config: SpeechmaticsSTTConfig, logger?: Logger) {
    const finalConfig: SpeechmaticsSTTConfig = {
      region: DEFAULT_REGION,
      audioFormat: 'pcm_s16le',
      sampleRate: 16000,
      language: 'en',
      interimResults: true,
      maxDelay: 1,
      endOfUtteranceSilenceTrigger: 0.75,
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
        'SpeechmaticsSTT',
        new Error('SpeechmaticsSTT requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    this.logger.info('Speechmatics STT initialized', {
      region: this.config.region,
      language: this.config.language,
      audioFormat: this.config.audioFormat,
      sampleRate: this.config.sampleRate,
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
    this.logger.info('Speechmatics STT disposed');
  }

  /**
   * Build the WebSocket URL for Speechmatics real-time transcription.
   *
   * @remarks
   * Proxy mode: `ws(s)://<proxyUrl>/v2` — the proxy injects an
   * `Authorization: Bearer` header into the upstream connection.
   *
   * Direct mode: `wss://<region>.rt.speechmatics.com/v2?jwt=<key>` —
   * browsers cannot set WebSocket headers, so the resolved API key
   * (ideally a short-lived temporary key from an async `apiKey` factory)
   * is passed via the documented `jwt` query parameter.
   *
   * @returns The fully-qualified WebSocket URL string.
   */
  private async buildWebSocketUrl(): Promise<string> {
    if (this.config.proxyUrl) {
      return `${this.config.proxyUrl.replace(/^http/, 'ws')}/v2`;
    }

    const base = `${realtimeHost(this.config.region ?? DEFAULT_REGION)}/v2`;
    const key = await this.resolveApiKey();

    return key ? `${base}?jwt=${encodeURIComponent(key)}` : base;
  }

  /**
   * Build the `StartRecognition` message that opens the session.
   *
   * @remarks
   * Combines `audio_format` (raw encoding + sample rate, or `file` for
   * container formats) with `transcription_config` (language, partials,
   * max delay, end-of-utterance detection, diarization, vocabulary).
   */
  private buildStartRecognitionMessage(): Record<string, unknown> {
    const format = this.config.audioFormat ?? 'pcm_s16le';
    const audioFormat: Record<string, unknown> =
      format === 'file'
        ? { type: 'file' }
        : { type: 'raw', encoding: format, sample_rate: this.config.sampleRate ?? 16000 };

    const transcriptionConfig: Record<string, unknown> = {
      language: this.config.language ?? 'en',
    };

    if (this.config.interimResults !== false) {
      transcriptionConfig.enable_partials = true;
    }

    transcriptionConfig.max_delay = this.config.maxDelay ?? 1;

    if (this.config.maxDelayMode) {
      transcriptionConfig.max_delay_mode = this.config.maxDelayMode;
    }

    const silenceTrigger = this.config.endOfUtteranceSilenceTrigger ?? 0.75;
    if (silenceTrigger > 0) {
      transcriptionConfig.conversation_config = {
        end_of_utterance_silence_trigger: silenceTrigger,
      };
    }

    if (this.config.operatingPoint) {
      transcriptionConfig.operating_point = this.config.operatingPoint;
    }

    if (this.config.enableSpeakerDiarization) {
      transcriptionConfig.diarization = 'speaker';
    }

    if (this.config.additionalVocab && this.config.additionalVocab.length > 0) {
      transcriptionConfig.additional_vocab = this.config.additionalVocab;
    }

    if (this.config.outputLocale) {
      transcriptionConfig.output_locale = this.config.outputLocale;
    }

    if (this.config.domain) {
      transcriptionConfig.domain = this.config.domain;
    }

    return {
      message: 'StartRecognition',
      audio_format: audioFormat,
      transcription_config: transcriptionConfig,
    };
  }

  /**
   * Wait for the server's `RecognitionStarted` acknowledgement.
   *
   * @remarks
   * The Speechmatics protocol requires clients to wait for
   * `RecognitionStarted` before sending audio. Rejects when the server
   * responds with an `Error` message (e.g. `not_authorised`) or the
   * configured timeout elapses.
   */
  private waitForRecognitionStarted(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        settle();
        reject(new Error('Timed out waiting for RecognitionStarted'));
      }, this.config.timeout ?? 10000);

      const settle = (): void => {
        clearTimeout(timeout);
        this.recognitionStartedResolver = null;
        this.recognitionStartedRejecter = null;
      };

      this.recognitionStartedResolver = () => {
        settle();
        resolve();
      };
      this.recognitionStartedRejecter = (error: Error) => {
        settle();
        reject(error);
      };
    });
  }

  /**
   * Open a WebSocket connection to Speechmatics for real-time
   * transcription.
   *
   * @remarks
   * Creates a {@link WebSocketManager} with reconnection disabled — a dead
   * socket must surface immediately via onConnectionLost so the SDK (or a
   * FallbackSTT chain) can recover. The SDK drives reconnection through
   * {@link connect}. Waits for the connection to open, sends the
   * `StartRecognition` message, and waits for the server's
   * `RecognitionStarted` acknowledgement before resolving. The connection
   * timeout defaults to
   * {@link SpeechmaticsSTTConfig.timeout | config.timeout} (10 000 ms).
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized, the connection fails,
   * or the server rejects the session (e.g. `not_authorised`).
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Speechmatics STT');
      return;
    }

    try {
      this.logger.debug('Connecting to Speechmatics STT WebSocket');

      const wsUrl = await this.buildWebSocketUrl();

      const wsOptions: WebSocketManagerOptions = {
        url: wsUrl,
        connectionTimeout: this.config.timeout ?? 10000,
        // Auto-reconnect is disabled: reopening the socket cannot replay the
        // StartRecognition handshake, so a reconnected socket would be a dead
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
          this.logger.info('Speechmatics STT WebSocket closed');
          this.isConnected = false;
        },
        onError: (error: Error) => {
          this.logger.error('Speechmatics STT WebSocket error', error);
        },
        onConnectionLost: (error: Error) => {
          this.isConnected = false;
          this.emitConnectionLost(`Speechmatics STT connection lost: ${error.message}`);
        },
      });

      // Connect and wait for open
      await this.wsManager.connect();

      // Start the session and wait for the server acknowledgement.
      // The resolver is registered synchronously after the send, before
      // any WebSocket message event can be dispatched.
      this.wsManager.send(JSON.stringify(this.buildStartRecognitionMessage()));
      await this.waitForRecognitionStarted();

      this.isConnected = true;
      this.lastSeqNo = 0;
      this.resetUtterance();

      this.logger.info('Connected to Speechmatics STT WebSocket', {
        region: this.config.region,
        language: this.config.language,
        audioFormat: this.config.audioFormat,
        sampleRate: this.config.sampleRate,
      });
    } catch (error) {
      // Close any half-open socket (e.g. connected but the session was
      // rejected) before dropping the manager reference.
      if (this.wsManager) {
        try {
          await this.wsManager.disconnect();
        } catch {
          // Best-effort cleanup
        }
      }
      this.wsManager = null;
      this.isConnected = false;
      throw new ProviderConnectionError('SpeechmaticsSTT', error as Error);
    }
  }

  /** Reset the per-utterance accumulation state. @internal */
  private resetUtterance(): void {
    this.finalText = '';
    this.confidenceSum = 0;
    this.confidenceCount = 0;
    this.utteranceResults = [];
  }

  /** Join two transcript fragments with a single space. @internal */
  private joinTranscript(base: string, addition: string): string {
    const trimmed = addition.trim();
    if (!trimmed) return base;
    return base ? `${base} ${trimmed}` : trimmed;
  }

  /**
   * Parse and dispatch incoming WebSocket messages from Speechmatics.
   *
   * @remarks
   * `AddTranscript` segments are accumulated into the current utterance;
   * `AddPartialTranscript` messages produce interim results. When the
   * `EndOfUtterance` message arrives (silence detected) or the stream
   * ends with `EndOfTranscript`, the accumulated utterance is emitted
   * with `isFinal: true` and `utteranceComplete: true` via
   * {@link emitTranscription}.
   *
   * @param event - The raw WebSocket `MessageEvent`.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      if (typeof event.data !== 'string') {
        this.logger.warn('Received non-string message from Speechmatics, ignoring');
        return;
      }

      const message: SpeechmaticsMessage = JSON.parse(event.data);

      switch (message.message) {
        case 'RecognitionStarted':
          this.logger.info('Speechmatics recognition started', { sessionId: message.id });
          this.recognitionStartedResolver?.();
          break;

        case 'AudioAdded':
          // Routine acknowledgement of a binary AddAudio chunk
          break;

        case 'AddPartialTranscript':
          this.handlePartialTranscript(message);
          break;

        case 'AddTranscript':
          this.handleFinalTranscript(message);
          break;

        case 'EndOfUtterance':
          this.emitUtterance(message);
          break;

        case 'EndOfTranscript':
          this.logger.info('Speechmatics stream finished (EndOfTranscript)');
          this.emitUtterance(message);
          this.endOfTranscriptResolver?.();
          break;

        case 'Warning':
          this.logger.warn('Speechmatics warning', {
            warningType: message.type,
            reason: message.reason,
          });
          break;

        case 'Error':
          this.handleErrorMessage(message);
          break;

        default:
          this.logger.debug('Unhandled Speechmatics message', { message: message.message });
      }
    } catch (error) {
      this.logger.error('Error processing Speechmatics WebSocket message', error);
    }
  }

  /**
   * Handle an `AddPartialTranscript` message by emitting an interim
   * result combining accumulated final segments with the partial tail.
   * @internal
   */
  private handlePartialTranscript(message: SpeechmaticsMessage): void {
    if (this.config.interimResults === false) return;

    const interimText = this.joinTranscript(this.finalText, message.metadata?.transcript ?? '');
    if (interimText) {
      this.emitTranscription({
        text: interimText,
        isFinal: false,
      });
    }
  }

  /**
   * Handle an `AddTranscript` message by accumulating the final segment
   * into the current utterance and emitting an interim update.
   *
   * @remarks
   * Speechmatics may emit several final segments per utterance, so the
   * segment is not emitted as a final result — the utterance completes
   * on `EndOfUtterance` (or `EndOfTranscript`).
   * @internal
   */
  private handleFinalTranscript(message: SpeechmaticsMessage): void {
    this.finalText = this.joinTranscript(this.finalText, message.metadata?.transcript ?? '');

    for (const result of message.results ?? []) {
      this.utteranceResults.push(result);
      const confidence = result.alternatives?.[0]?.confidence;
      if (result.type === 'word' && confidence != null) {
        this.confidenceSum += confidence;
        this.confidenceCount += 1;
      }
    }

    if (this.config.interimResults !== false && this.finalText) {
      this.emitTranscription({
        text: this.finalText,
        isFinal: false,
      });
    }
  }

  /**
   * Emit the accumulated utterance as a final, utterance-complete
   * result and reset the accumulation state.
   * @internal
   */
  private emitUtterance(message: SpeechmaticsMessage): void {
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
          // Final word/punctuation results with per-word timing, plus
          // speaker labels when diarization is enabled.
          results: this.utteranceResults,
          startTime: message.metadata?.start_time,
          endTime: message.metadata?.end_time,
        },
      });
    }
    this.resetUtterance();
  }

  /**
   * Handle a Speechmatics `Error` message.
   *
   * @remarks
   * During the connection handshake the pending `connect()` promise is
   * rejected (e.g. `not_authorised`, `invalid_config`); afterwards an
   * error result is emitted so consumers can surface the failure.
   * @internal
   */
  private handleErrorMessage(message: SpeechmaticsMessage): void {
    this.logger.error('Speechmatics error', {
      errorType: message.type,
      reason: message.reason,
    });

    if (this.recognitionStartedRejecter) {
      this.recognitionStartedRejecter(
        new Error(`Speechmatics error: ${message.type ?? 'unknown'} - ${message.reason ?? ''}`)
      );
      return;
    }

    this.emitTranscription({
      text: '',
      isFinal: true,
      confidence: 0,
      metadata: {
        error: message.reason,
        errorType: message.type,
      },
    });
  }

  /**
   * Send a raw audio chunk to Speechmatics for real-time transcription.
   *
   * @remarks
   * The `ArrayBuffer` is forwarded as a binary `AddAudio` WebSocket
   * frame. Each successfully sent chunk increments the sequence counter
   * used for the final `EndOfStream` message. If the connection is not
   * open, the chunk is silently dropped and a warning is logged.
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
      this.lastSeqNo += 1;
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Force Speechmatics to finalize the current utterance immediately.
   *
   * @remarks
   * Sends a `ForceEndOfUtterance` control message; the server responds
   * with any remaining `AddTranscript` segments followed by an
   * `EndOfUtterance` message. Useful for manual turn-taking when
   * end-of-utterance detection is disabled
   * (`endOfUtteranceSilenceTrigger: 0`).
   */
  forceEndOfUtterance(): void {
    if (!this.isConnected || !this.wsManager) {
      this.logger.warn('Cannot force end of utterance: not connected');
      return;
    }

    try {
      this.wsManager.send(JSON.stringify({ message: 'ForceEndOfUtterance' }));
    } catch (error) {
      this.logger.error('Failed to send ForceEndOfUtterance message', error);
    }
  }

  /**
   * Gracefully close the Speechmatics WebSocket connection.
   *
   * @remarks
   * Sends an `EndOfStream` message with the sequence number of the last
   * audio chunk (Speechmatics finalizes all pending transcripts and
   * responds with `EndOfTranscript`), waits for that `EndOfTranscript`
   * message (up to 1 s), then disconnects the underlying
   * {@link WebSocketManager}.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.wsManager) {
      this.logger.warn('Not connected to Speechmatics STT');
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
      this.logger.debug('Disconnecting from Speechmatics STT WebSocket');

      // The server usually closes in response to the end-of-stream message
      // below; tell the manager that close is expected so it is not
      // reported as a lost connection.
      this.wsManager.expectClose();

      // Signal end-of-stream so pending transcripts are finalized
      try {
        this.wsManager.send(
          JSON.stringify({ message: 'EndOfStream', last_seq_no: this.lastSeqNo })
        );
      } catch {
        // Ignore send errors during disconnect
      }

      // Wait for the EndOfTranscript response (with a 1s fallback)
      await new Promise<void>((resolve) => {
        const settle = (): void => {
          clearTimeout(timeout);
          this.endOfTranscriptResolver = null;
          resolve();
        };
        const timeout = setTimeout(settle, 1000);
        this.endOfTranscriptResolver = settle;

        if (!this.wsManager?.isConnected()) {
          settle();
        }
      });

      await this.wsManager.disconnect();

      this.isConnected = false;
      this.wsManager = null;

      this.logger.info('Disconnected from Speechmatics STT WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Speechmatics STT', error);
      throw error;
    }
  }

  /**
   * Check whether the Speechmatics WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
