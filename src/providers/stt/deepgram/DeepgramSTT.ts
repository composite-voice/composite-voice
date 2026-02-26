/**
 * Deepgram real-time speech-to-text provider using the official Deepgram SDK V5.
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig, TranscriptionResult } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * Shape of the V5 DeepgramClient returned by `new DeepgramClient(...)`.
 * We use this instead of importing the type directly since the SDK is a
 * peer dependency loaded via dynamic `import()`.
 */
interface V5DeepgramClient {
  listen: {
    v1: {
      connect(args: Record<string, string>): Promise<V5Socket>;
    };
  };
}

/**
 * Shape of the V5 socket returned by `listen.v1.connect()`.
 */
interface V5Socket {
  on(event: 'open', handler: () => void): void;
  on(event: 'close', handler: (event: unknown) => void): void;
  on(event: 'error', handler: (error: Error) => void): void;
  on(event: 'message', handler: (msg: V5Message) => void): void;
  connect(): void;
  waitForOpen(): Promise<void>;
  sendMedia(data: ArrayBufferLike | Blob | ArrayBufferView): void;
  sendFinalize(msg: { type: 'Finalize' }): void;
  sendCloseStream(msg: { type: 'CloseStream' }): void;
  sendKeepAlive(msg: { type: 'KeepAlive' }): void;
}

/**
 * Union of V5 message types received via the single `'message'` handler.
 */
interface V5Message {
  type: 'Results' | 'Metadata' | 'UtteranceEnd' | 'SpeechStarted';
  /** Present when type === 'Results' */
  channel_index?: number[];
  duration?: number;
  start?: number;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: {
    alternatives: Array<{
      transcript: string;
      confidence: number;
      words?: Array<{
        word: string;
        start: number;
        end: number;
        confidence: number;
      }>;
    }>;
  };
  metadata?: {
    request_id: string;
    model_info?: { name: string; version: string; arch: string };
    model_uuid?: string;
  };
  from_finalize?: boolean;
  entities?: Array<{
    label: string;
    value: string;
    raw_value: string;
    confidence: number;
    start_word: number;
    end_word: number;
  }>;
}

/**
 * Deepgram-specific transcription options passed to the WebSocket connection.
 *
 * @remarks
 * These options map to Deepgram's
 * {@link https://developers.deepgram.com/docs/streaming | real-time streaming API}
 * parameters. They are set on the {@link DeepgramSTTConfig.options} property
 * and forwarded when the WebSocket connection is established.
 *
 * @see {@link DeepgramSTTConfig} for the full provider configuration
 */
export interface DeepgramTranscriptionOptions {
  /**
   * Nova model to use for V1 transcription.
   *
   * Available models: `'nova-3'` (default), `'nova-3-medical'`, `'nova-2'`,
   * `'nova-2-general'`, `'nova-2-meeting'`, `'nova-2-finance'`,
   * `'nova-2-conversationalai'`, `'nova-2-voicemail'`, `'nova-2-video'`,
   * `'nova-2-medical'`, `'nova-2-drivethru'`, `'nova-2-automotive'`,
   * `'nova'`, `'enhanced'`, `'base'`.
   *
   * For Flux (V2) models, use {@link DeepgramFlux} instead.
   */
  model?: string;

  /** Language code (e.g., `'en-US'`, `'es'`). */
  language?: string;

  /**
   * Audio encoding format.
   *
   * Supported: `'linear16'`, `'linear32'`, `'flac'`, `'alaw'`, `'mulaw'`,
   * `'amr-nb'`, `'amr-wb'`, `'opus'`, `'ogg-opus'`, `'speex'`, `'g729'`.
   */
  encoding?: string;

  /** Sample rate for audio data in Hz (required when `encoding` is set). */
  sampleRate?: number;

  /** Number of audio channels. */
  channels?: number;

  /**
   * Specialized terminology to boost recognition.
   *
   * Unlike {@link keywords}, keyterms use a more advanced boosting algorithm.
   *
   * @example `['CompositeVoice', 'WebSocket']`
   */
  keyterms?: string[];

  /** Label for usage reporting in the Deepgram console. */
  tag?: string;

  /** Opt out of the Deepgram Model Improvement Program. */
  mipOptOut?: boolean;

  // ── V1-only options (Nova models) ──────────────────────────────────

  /** Enable punctuation (V1 only). */
  punctuation?: boolean;

  /** Enable profanity filter (V1 only). */
  profanityFilter?: boolean;

  /**
   * Enable redaction of sensitive information (V1 only).
   *
   * @example `['pci', 'ssn', 'numbers']`
   */
  redact?: string[];

  /** Enable diarization / speaker detection (V1 only). */
  diarize?: boolean;

  /** Enable smart formatting — auto-punctuation and readability improvements (V1 only). */
  smartFormat?: boolean;

  /**
   * Custom vocabulary or keywords to boost or suppress recognition (V1 only).
   *
   * Append a weight to boost/suppress: e.g. `'Deepgram:2'` or `'erm:-10'`.
   *
   * @see {@link keyterms} for the newer boosting API (V1 & V2).
   */
  keywords?: string[];

  /** Number of transcription alternatives to return (V1 only). */
  alternatives?: number;

  /** Enable utterance segmentation (V1 only). */
  utterances?: boolean;

  /** Enable interim results (V1 only). */
  interimResults?: boolean;

  /**
   * Automatic endpointing — milliseconds of silence before end-of-speech.
   * Set to `false` to disable (V1 only).
   *
   * @defaultValue `10`
   */
  endpointing?: boolean | number;

  /** Emit Voice Activity Detection events (`SpeechStarted`) (V1 only). */
  vadEvents?: boolean;

  /** Extract named entities from the transcript (V1 only). */
  detectEntities?: boolean;

  /** Convert spoken numbers to digit form, e.g. "twenty one" → "21" (V1 only). */
  numerals?: boolean;

  /** Transcribe each audio channel independently (V1 only). */
  multichannel?: boolean;

  /** Enable dictation mode (V1 only). */
  dictation?: boolean;

  /**
   * Term replacement — swap recognized terms for preferred forms (V1 only).
   *
   * @example `['colour:color', 'grey:gray']`
   */
  replace?: string[];

  /**
   * Search for specific terms or phrases in the transcript (V1 only).
   *
   * @example `['action item', 'follow up']`
   */
  search?: string[];

  /**
   * Delay in milliseconds before emitting an `UtteranceEnd` event (V1 only).
   *
   * Controls the gap required between utterances.
   *
   * @example `1000`
   */
  utteranceEndMs?: number;

  /** Model version override (V1 only). */
  version?: string;

  /** Arbitrary key:value metadata passed through to the API (V1 only). */
  extra?: string[];

}

/**
 * Configuration options for the {@link DeepgramSTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with Deepgram-specific settings. You must
 * provide **either** `apiKey` (for direct browser-to-Deepgram connections) or
 * `proxyUrl` (for server-side proxy that injects the API key). If both are
 * provided, `proxyUrl` takes precedence.
 *
 * @example
 * ```ts
 * // Direct connection (API key exposed to browser -- development only)
 * const config: DeepgramSTTConfig = {
 *   apiKey: 'dg_abc123...',
 *   options: { model: 'nova-3', smartFormat: true },
 * };
 *
 * // Proxy connection (recommended for production)
 * const config: DeepgramSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/deepgram',
 *   options: { model: 'nova-3', punctuation: true },
 * };
 * ```
 *
 * @see {@link DeepgramTranscriptionOptions} for transcription-specific settings
 * @see {@link DeepgramSTT} for the provider class
 */
export interface DeepgramSTTConfig extends STTProviderConfig {
  /**
   * Deepgram API key.
   * Required when connecting directly to Deepgram.
   * Omit when using `proxyUrl` — the proxy server supplies the key.
   */
  apiKey?: string;
  /**
   * URL of the CompositeVoice proxy server's Deepgram endpoint.
   * Example: `'http://localhost:3000/api/proxy/deepgram'`
   *
   * When set, the Deepgram SDK connects to this URL instead of
   * `wss://api.deepgram.com`, allowing browsers to reach Deepgram through a
   * same-origin proxy that injects the real API key server-side.
   */
  proxyUrl?: string;
  /** Deepgram transcription options */
  options?: DeepgramTranscriptionOptions;
}

/**
 * Deepgram real-time STT provider using the official `@deepgram/sdk` V5.
 *
 * @remarks
 * `DeepgramSTT` extends {@link LiveSTTProvider} and connects to Deepgram's
 * V1 WebSocket-based streaming transcription API via the SDK V5 client. It supports:
 *
 * - Real-time interim and final transcription results
 * - Multi-segment utterance buffering (accumulates `is_final` segments
 *   until `speech_final` to deliver a complete utterance)
 * - Proxy mode via {@link DeepgramSTTConfig.proxyUrl} (recommended for
 *   production so the API key stays server-side)
 * - All V1 query parameters (model, language, punctuate, smart_format, etc.)
 * - Keep-alive and finalize (flush) methods
 *
 * For Flux (V2) models with eager end-of-turn / preflight signals, use
 * {@link DeepgramFlux} instead.
 *
 * **Transport:** WebSocket (via `@deepgram/sdk` V5)
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 * Requires the `@deepgram/sdk` (>= 5.0.0-beta.1) peer dependency to be installed.
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> AudioCapture -> sendAudio(chunk) -> Deepgram WebSocket
 *                                                       |
 * CompositeVoice <- onTranscription(result) <----------+
 * ```
 *
 * @example
 * ```ts
 * import { DeepgramSTT } from 'composite-voice';
 *
 * const stt = new DeepgramSTT({
 *   proxyUrl: 'http://localhost:3001/api/proxy/deepgram',
 *   language: 'en-US',
 *   interimResults: true,
 *   options: {
 *     model: 'nova-3',
 *     smartFormat: true,
 *     punctuation: true,
 *   },
 * });
 *
 * await stt.initialize();
 *
 * stt.onTranscription((result) => {
 *   if (result.isFinal && result.speechFinal) {
 *     console.log('Complete utterance:', result.text);
 *   }
 * });
 *
 * await stt.connect();
 * // ... send audio chunks via stt.sendAudio(chunk) ...
 * stt.sendFinalize(); // flush pending audio
 * await stt.disconnect();
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link DeepgramSTTConfig} for configuration options
 * @see {@link DeepgramTranscriptionOptions} for transcription parameters
 * @see {@link AssemblyAISTT} for an alternative real-time STT provider
 */
export class DeepgramSTT extends LiveSTTProvider {
  declare public config: DeepgramSTTConfig;

  /** The V5 Deepgram SDK client instance. */
  private deepgram: V5DeepgramClient | null = null;

  /** The active V5 socket for streaming transcription. */
  private socket: V5Socket | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /**
   * Accumulates `is_final` transcript segments within an utterance.
   *
   * @remarks
   * Deepgram may split one utterance into multiple `is_final` chunks before
   * emitting `speech_final`. We buffer them so we can hand the complete
   * utterance text to CompositeVoice as a single `speechFinal` result.
   */
  private utteranceBuffer: string[] = [];

  /**
   * Create a new DeepgramSTT provider.
   *
   * @param config - Deepgram STT configuration. Must include either
   *   `apiKey` or `proxyUrl`.
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new DeepgramSTT({
   *   apiKey: 'dg_abc123...',
   *   options: { model: 'nova-3' },
   * });
   * ```
   */
  constructor(config: DeepgramSTTConfig, logger?: Logger) {
    const finalConfig = {
      language: config.language ?? 'en-US',
      interimResults: config.interimResults ?? true,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Dynamically import the Deepgram SDK V5 and create the client.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when neither `apiKey` nor `proxyUrl` is configured, or when
   * the `@deepgram/sdk` peer dependency is not installed.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'DeepgramSTT',
        new Error('DeepgramSTT requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    try {
      // Dynamically import Deepgram SDK V5 (peer dependency).
      // We use `as any` on the constructor call because the installed
      // types may be V4 while we target the V5 API shape. At runtime
      // the SDK must be >= 5.0.0-beta.1.
      const DeepgramModule = await import('@deepgram/sdk');
      const DGClient = (DeepgramModule as Record<string, unknown>).DeepgramClient as new (
        opts: Record<string, unknown>
      ) => V5DeepgramClient;

      if (this.config.proxyUrl) {
        // Proxy mode: redirect all SDK connections to the proxy server.
        // The proxy injects the real Deepgram API key server-side.
        // Convert http(s) to ws(s) for the SDK's WebSocket URL.
        const wsUrl = this.config.proxyUrl.replace(/^http/, 'ws');
        this.deepgram = new DGClient({ apiKey: 'proxy', baseUrl: wsUrl });
        this.logger.info('Deepgram STT initialized (proxy mode)', { proxyUrl: wsUrl });
      } else {
        this.deepgram = new DGClient({ apiKey: this.config.apiKey as string });
        this.logger.info('Deepgram STT initialized (WebSocket mode)', {
          model: this.config.options?.model ?? 'nova-3',
          language: this.config.language,
        });
      }
    } catch (error) {
      if ((error as Error).message?.includes('Cannot find module')) {
        throw new ProviderInitializationError(
          'DeepgramSTT',
          new Error(
            'Deepgram SDK not found. Install with: npm install @deepgram/sdk@^5.0.0-beta.1\n' +
              'The Deepgram SDK is a peer dependency and must be installed separately.'
          )
        );
      }
      throw new ProviderInitializationError('DeepgramSTT', error as Error);
    }
  }

  /** Disconnect the WebSocket (if connected) and release SDK resources. */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.utteranceBuffer = [];
    this.socket = null;
    this.deepgram = null;
    this.logger.info('Deepgram STT disposed');
  }

  /**
   * Build the V1 connect args from the config.
   *
   * @remarks
   * V5's `listen.v1.connect()` expects ALL values as strings. This method
   * converts booleans, numbers, and arrays into their string representations.
   */
  private buildConnectArgs(): Record<string, string> {
    const opts = this.config.options;
    const args: Record<string, string> = {};

    // Authorization header
    if (this.config.proxyUrl) {
      args.Authorization = 'Token proxy';
    } else {
      args.Authorization = `Token ${this.config.apiKey}`;
    }

    // Core params (always set)
    args.model = opts?.model ?? 'nova-3';
    args.language = this.config.language ?? 'en-US';
    args.punctuate = String(opts?.punctuation ?? true);
    args.smart_format = String(opts?.smartFormat ?? true);
    args.interim_results = String(this.config.interimResults ?? true);
    args.endpointing = String(opts?.endpointing ?? false);
    args.vad_events = String(opts?.vadEvents ?? false);
    args.profanity_filter = String(opts?.profanityFilter ?? false);
    args.diarize = String(opts?.diarize ?? false);
    args.utterances = String(opts?.utterances ?? false);

    // Optional params (only include if set)
    if (opts?.encoding !== undefined) {
      args.encoding = opts.encoding;
    }
    if (opts?.sampleRate !== undefined) {
      args.sample_rate = String(opts.sampleRate);
    }
    if (opts?.channels !== undefined) {
      args.channels = String(opts.channels);
    }
    if (opts?.redact && opts.redact.length > 0) {
      args.redact = opts.redact.join(',');
    }
    if (opts?.keywords && opts.keywords.length > 0) {
      args.keywords = opts.keywords.join(',');
    }
    if (opts?.keyterms && opts.keyterms.length > 0) {
      args.keyterm = opts.keyterms.join(',');
    }
    if (opts?.alternatives !== undefined) {
      args.alternatives = String(opts.alternatives);
    }
    if (opts?.detectEntities !== undefined) {
      args.detect_entities = String(opts.detectEntities);
    }
    if (opts?.numerals !== undefined) {
      args.numerals = String(opts.numerals);
    }
    if (opts?.multichannel !== undefined) {
      args.multichannel = String(opts.multichannel);
    }
    if (opts?.dictation !== undefined) {
      args.dictation = String(opts.dictation);
    }
    if (opts?.replace && opts.replace.length > 0) {
      args.replace = opts.replace.join(',');
    }
    if (opts?.search && opts.search.length > 0) {
      args.search = opts.search.join(',');
    }
    if (opts?.utteranceEndMs !== undefined) {
      args.utterance_end_ms = String(opts.utteranceEndMs);
    }
    if (opts?.version !== undefined) {
      args.version = opts.version;
    }
    if (opts?.tag !== undefined) {
      args.tag = opts.tag;
    }
    if (opts?.mipOptOut !== undefined) {
      args.mip_opt_out = String(opts.mipOptOut);
    }
    if (opts?.extra && opts.extra.length > 0) {
      args.extra = opts.extra.join(',');
    }

    return args;
  }

  /**
   * Open a WebSocket connection to Deepgram for real-time transcription.
   *
   * @remarks
   * Builds V1 connection args from {@link DeepgramSTTConfig}, calls
   * `listen.v1.connect()` to obtain a V5 socket, then waits for the
   * WebSocket `open` event before resolving. The connection timeout
   * defaults to {@link DeepgramSTTConfig.timeout | config.timeout} (10 000 ms).
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized, the Deepgram client is
   * missing, or the connection times out / errors.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Deepgram');
      return;
    }

    if (!this.deepgram) {
      throw new ProviderConnectionError(
        'DeepgramSTT',
        new Error('Deepgram client not initialized')
      );
    }

    try {
      this.logger.debug('Connecting to Deepgram WebSocket (V5 SDK)');

      const connectArgs = this.buildConnectArgs();

      // V5: connect() returns a Promise<V5Socket>
      this.socket = await this.deepgram.listen.v1.connect(connectArgs);

      // Set up the unified message handler and lifecycle events
      this.setupEventHandlers();

      // Initiate the connection and wait for open
      this.socket.connect();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, this.config.timeout ?? 10000);

        this.socket!.on('open', () => {
          clearTimeout(timeout);
          this.isConnected = true;
          this.logger.info('Connected to Deepgram WebSocket');
          resolve();
        });

        this.socket!.on('error', (error: Error) => {
          clearTimeout(timeout);
          this.logger.error('Failed to connect to Deepgram WebSocket', error);
          reject(error);
        });
      });
    } catch (error) {
      this.socket = null;
      throw new ProviderConnectionError('DeepgramSTT', error as Error);
    }
  }

  /**
   * Wire up the V5 unified `message` handler and lifecycle events on the
   * socket for `Results`, `Metadata`, `UtteranceEnd`, and `SpeechStarted`
   * message types, plus `error` and `close` socket events.
   */
  private setupEventHandlers(): void {
    if (!this.socket) return;

    // V5 unified message handler — all STT events arrive here
    this.socket.on('message', (msg: V5Message) => {
      try {
        switch (msg.type) {
          case 'Results':
            this.handleResults(msg);
            break;

          case 'Metadata':
            this.logger.debug('Metadata received', msg);
            break;

          case 'UtteranceEnd':
            this.handleUtteranceEnd(msg);
            break;

          case 'SpeechStarted':
            this.handleSpeechStarted(msg);
            break;

          default:
            this.logger.debug('Unknown message type', { type: (msg as V5Message).type });
            break;
        }
      } catch (error) {
        this.logger.error('Error processing message', error);
      }
    });

    // Handle errors
    this.socket.on('error', (error: Error) => {
      this.logger.error('Deepgram WebSocket error', error);

      const errorResult: TranscriptionResult = {
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: error.message,
        },
      };

      this.emitTranscription(errorResult);
    });

    // Handle close
    this.socket.on('close', () => {
      this.logger.info('Deepgram WebSocket closed');
      this.isConnected = false;
    });
  }

  /**
   * Process a V5 `Results` message (transcription data).
   *
   * Handles interim results, final segments, and speech_final utterance
   * completion. Preflight/eager signals are not supported in V1 — use
   * {@link DeepgramFlux} for speculative end-of-turn detection.
   */
  private handleResults(msg: V5Message): void {
    const alternative = msg.channel?.alternatives?.[0];
    if (!alternative) return;

    const transcript = alternative.transcript;
    const confidence = alternative.confidence;
    const isFinal = msg.is_final ?? false;
    const speechFinal = msg.speech_final ?? false;

    if (isFinal) {
      // Accumulate this segment into the current utterance
      if (transcript) {
        this.utteranceBuffer.push(transcript);
      }

      if (speechFinal) {
        // Utterance complete — emit with the fully accumulated text
        const fullText = this.utteranceBuffer.join(' ').trim();
        this.utteranceBuffer = [];

        this.logger.debug('Deepgram speech_final — full utterance', { fullText });

        // Always emit the final-segment event first so interim displays update
        if (transcript) {
          this.emitTranscription({
            text: transcript,
            isFinal: true,
            speechFinal: false,
            confidence,
            metadata: { speechFinal: false, duration: msg.duration },
          });
        }

        // Emit the complete utterance as the speech-final result
        this.emitTranscription({
          text: fullText,
          isFinal: true,
          speechFinal: true,
          confidence,
          metadata: { speechFinal: true, duration: msg.duration },
        });
      } else {
        // Mid-utterance final segment — emit for display but not for LLM
        if (transcript) {
          this.emitTranscription({
            text: transcript,
            isFinal: true,
            speechFinal: false,
            confidence,
            metadata: { speechFinal: false, duration: msg.duration },
          });
        }
      }
    } else {
      // Interim result — pass through as-is for real-time display
      if (transcript) {
        this.emitTranscription({
          text: transcript,
          isFinal: false,
          confidence,
          metadata: { duration: msg.duration },
        });
      }
    }
  }

  /**
   * Process a V5 `UtteranceEnd` message.
   */
  private handleUtteranceEnd(msg: V5Message): void {
    this.logger.debug('Utterance end', msg);

    const result: TranscriptionResult = {
      text: '',
      isFinal: true,
      confidence: 1,
      metadata: {
        event: 'utterance_end',
        data: msg,
      },
    };

    this.emitTranscription(result);
  }

  /**
   * Process a V5 `SpeechStarted` message.
   */
  private handleSpeechStarted(msg: V5Message): void {
    this.logger.debug('Speech started', msg);

    const result: TranscriptionResult = {
      text: '',
      isFinal: false,
      confidence: 1,
      metadata: {
        event: 'speech_started',
        data: msg,
      },
    };

    this.emitTranscription(result);
  }

  /**
   * Send a raw audio chunk to Deepgram for real-time transcription.
   *
   * @remarks
   * Uses the V5 `socket.sendMedia()` method. If the connection is not
   * open, the chunk is silently dropped and a warning is logged.
   *
   * @param chunk - Raw audio data captured from the microphone.
   */
  sendAudio(chunk: ArrayBuffer): void {
    if (!this.isConnected || !this.socket) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    try {
      this.socket.sendMedia(chunk);
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Send a keep-alive signal to prevent the WebSocket from timing out.
   *
   * @remarks
   * Useful for long pauses where no audio is being sent but the
   * connection should remain open.
   */
  sendKeepAlive(): void {
    if (!this.isConnected || !this.socket) {
      this.logger.warn('Cannot send keep-alive: not connected');
      return;
    }

    try {
      this.socket.sendKeepAlive({ type: 'KeepAlive' });
      this.logger.debug('Sent keep-alive');
    } catch (error) {
      this.logger.error('Failed to send keep-alive', error);
    }
  }

  /**
   * Send a finalize signal to flush any pending audio and force a final
   * transcription result from Deepgram.
   *
   * @remarks
   * This tells Deepgram to process any buffered audio and return a final
   * result with `from_finalize: true`. Useful before disconnecting or
   * when you need an immediate result.
   */
  sendFinalize(): void {
    if (!this.isConnected || !this.socket) {
      this.logger.warn('Cannot send finalize: not connected');
      return;
    }

    try {
      this.socket.sendFinalize({ type: 'Finalize' });
      this.logger.debug('Sent finalize');
    } catch (error) {
      this.logger.error('Failed to send finalize', error);
    }
  }

  /**
   * Gracefully close the Deepgram WebSocket connection.
   *
   * @remarks
   * Sends a `CloseStream` message via the V5 socket, then waits up to
   * 1 second for the `close` event before force-resolving. Resets the
   * utterance buffer and internal connection state.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.socket) {
      this.logger.warn('Not connected to Deepgram');
      return;
    }

    try {
      this.logger.debug('Disconnecting from Deepgram WebSocket');

      // V5: send CloseStream to gracefully end
      this.socket.sendCloseStream({ type: 'CloseStream' });

      // Wait for close event
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 1000); // Force resolve after 1 second

        this.socket?.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });

      this.isConnected = false;
      this.utteranceBuffer = [];
      this.socket = null;

      this.logger.info('Disconnected from Deepgram WebSocket');
    } catch (error) {
      this.logger.error('Error disconnecting from Deepgram', error);
      throw error;
    }
  }

  /**
   * Check whether the Deepgram WebSocket connection is currently open.
   *
   * @returns `true` when connected and ready to receive audio.
   */
  isWebSocketConnected(): boolean {
    return this.isConnected;
  }
}
