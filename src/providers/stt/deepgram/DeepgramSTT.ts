/**
 * Deepgram real-time speech-to-text provider using native WebSocket.
 *
 * @remarks
 * Connects directly to the Deepgram V1 WebSocket API without the `@deepgram/sdk`.
 * Protocol: {@link https://developers.deepgram.com/docs/streaming | Deepgram Streaming API}
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig, TranscriptionResult } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { ProviderConnectionError } from '../../../utils/errors';
import { buildQueryParams } from '../../../utils/queryParams';

/**
 * Deepgram-specific transcription options passed as query parameters
 * on the WebSocket connection URL.
 *
 * @remarks
 * These options map to Deepgram's
 * {@link https://developers.deepgram.com/docs/streaming | real-time streaming API}
 * query parameters. They are set on the {@link DeepgramSTTConfig.options} property
 * and appended to the WebSocket URL when the connection is established.
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
  keyterms?: string | string[];

  /** Labels for usage reporting in the Deepgram console. Multiple values are sent as separate `tag=` query parameters. */
  tag?: string | string[];

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
  redact?: string | string[];

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
  keywords?: string | string[];

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
  replace?: string | string[];

  /**
   * Search for specific terms or phrases in the transcript (V1 only).
   *
   * @example `['action item', 'follow up']`
   */
  search?: string | string[];

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
  extra?: string | string[];
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
  /** Deepgram transcription options */
  options?: DeepgramTranscriptionOptions;
}

/** Deepgram's base WebSocket URL for streaming transcription. */
const DEEPGRAM_WS_URL = 'wss://api.deepgram.com';

/**
 * Deepgram real-time STT provider using native WebSocket (no SDK required).
 *
 * @remarks
 * `DeepgramSTT` extends {@link LiveSTTProvider} and connects to Deepgram's
 * V1 WebSocket streaming transcription API directly. It supports:
 *
 * - Real-time interim and final transcription results
 * - Multi-segment utterance buffering (accumulates `is_final` segments
 *   until `speech_final` to deliver a complete utterance)
 * - Proxy mode via {@link DeepgramSTTConfig.proxyUrl} (recommended for
 *   production so the API key stays server-side)
 * - All V1 query parameters (model, language, punctuate, smart_format, etc.)
 * - Keep-alive and finalize (flush) methods
 *
 * **Transport:** Native WebSocket (no `@deepgram/sdk` required)
 *
 * **Browser support:** All modern browsers (Chrome, Firefox, Safari, Edge).
 *
 * **Auth in browser:** Direct mode uses WebSocket subprotocol `["token", apiKey]`;
 * proxy mode omits auth (the proxy injects the key via HTTP headers).
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
 */
export class DeepgramSTT extends LiveSTTProvider {
  declare public config: DeepgramSTTConfig;

  /** The raw WebSocket connection to Deepgram. */
  private ws: WebSocket | null = null;

  /** Whether the WebSocket connection is currently open. */
  private isConnected = false;

  /**
   * Accumulates `is_final` transcript segments within an utterance.
   *
   * @remarks
   * When endpointing is enabled, Deepgram may split one utterance into
   * multiple `is_final` chunks before emitting `speech_final`. We buffer
   * them so we can hand the complete utterance text to CompositeVoice as
   * a single `utteranceComplete` result.
   *
   * When endpointing is disabled, each `is_final` is a standalone segment
   * and the buffer is flushed immediately.
   */
  private utteranceBuffer: string[] = [];

  /**
   * Whether endpointing (speech_final detection) is active for this session.
   *
   * @remarks
   * When `true`, Deepgram sends `speech_final: true` on the last segment
   * of an utterance. We buffer `is_final` segments and wait for `speech_final`.
   *
   * When `false`, Deepgram never sends `speech_final: true`, so each
   * `is_final: true` result is treated as a complete utterance.
   */
  private get endpointingEnabled(): boolean {
    const ep = this.config.options?.endpointing;
    // endpointing is enabled if it's a positive number or not explicitly false/0
    // Default in buildConnectionUrl is false, so if not set we check what we sent
    return ep !== false && ep !== 0 && ep !== undefined;
  }

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
   * Validate configuration — no SDK import required.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when neither `apiKey` nor `proxyUrl` is configured.
   */
  protected async onInitialize(): Promise<void> {
    this.assertAuth();

    if (this.isProxyMode) {
      this.logger.info('Deepgram STT initialized (proxy mode)', {
        proxyUrl: this.config.proxyUrl,
      });
    } else {
      this.logger.info('Deepgram STT initialized (direct mode)', {
        model: this.config.options?.model ?? 'nova-3',
        language: this.config.language,
      });
    }
  }

  /** Disconnect the WebSocket (if connected) and release resources. */
  protected async onDispose(): Promise<void> {
    if (this.isConnected) {
      await this.disconnect();
    }
    this.utteranceBuffer = [];
    this.ws = null;
    this.logger.info('Deepgram STT disposed');
  }

  /**
   * Build the full WebSocket connection URL with query parameters.
   *
   * @remarks
   * Proxy mode: `ws(s)://<proxyUrl>/v1/listen?model=nova-3&...`
   * Direct mode: `wss://api.deepgram.com/v1/listen?model=nova-3&...`
   */
  private buildConnectionUrl(): string {
    const base = this.resolveBaseUrl(DEEPGRAM_WS_URL);
    if (!base) {
      throw new ProviderConnectionError(
        'DeepgramSTT',
        new Error('Failed to resolve base WebSocket URL')
      );
    }
    const opts = this.config.options;

    const params = buildQueryParams(
      {
        // Core params (always set)
        model: opts?.model ?? 'nova-3',
        language: this.config.language ?? 'en-US',
        punctuation: opts?.punctuation ?? true,
        smartFormat: opts?.smartFormat ?? true,
        interimResults: this.config.interimResults ?? true,
        endpointing: opts?.endpointing ?? false,
        vadEvents: opts?.vadEvents ?? false,
        profanityFilter: opts?.profanityFilter ?? false,
        diarize: opts?.diarize ?? false,
        // Optional params (undefined values are skipped)
        encoding: opts?.encoding,
        sampleRate: opts?.sampleRate,
        channels: opts?.channels,
        redact: opts?.redact,
        keywords: opts?.keywords,
        keyterms: opts?.keyterms,
        numerals: opts?.numerals,
        multichannel: opts?.multichannel,
        dictation: opts?.dictation,
        replace: opts?.replace,
        search: opts?.search,
        utteranceEndMs: opts?.utteranceEndMs,
        version: opts?.version,
        tag: opts?.tag,
        mipOptOut: opts?.mipOptOut,
        extra: opts?.extra,
        detectEntities: opts?.detectEntities,
        alternatives: opts?.alternatives,
        utterances: opts?.utterances,
      },
      {
        // Naming exceptions where camelToSnake doesn't match the API
        punctuation: 'punctuate',
        keyterms: 'keyterm',
      }
    );

    return `${base}/v1/listen?${params.toString()}`;
  }

  /**
   * Open a WebSocket connection to Deepgram for real-time transcription.
   *
   * @remarks
   * Builds the connection URL with all query parameters, creates a native
   * WebSocket, and waits for the `open` event before resolving.
   *
   * In direct mode, auth is sent via WebSocket subprotocol `["token", apiKey]`
   * (the standard Deepgram browser auth mechanism). In proxy mode, no auth is
   * sent — the proxy injects the real API key via HTTP headers.
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized, or the connection times out / errors.
   */
  async connect(): Promise<void> {
    this.assertReady();

    if (this.isConnected) {
      this.logger.warn('Already connected to Deepgram');
      return;
    }

    try {
      this.logger.debug('Connecting to Deepgram WebSocket');

      const url = this.buildConnectionUrl();

      const protocols = await this.resolveWsProtocols('token');
      this.ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url);

      // Wait for the connection to open (with timeout)
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
          this.logger.info('Connected to Deepgram WebSocket');
          resolve();
        };

        ws.onerror = (event) => {
          clearTimeout(timeout);
          reject(
            new Error(`WebSocket error: ${(event as ErrorEvent).message ?? 'connection failed'}`)
          );
        };
      });

      // Register event handlers after connection is open
      this.setupEventHandlers();
    } catch (error) {
      this.ws = null;
      throw new ProviderConnectionError('DeepgramSTT', error as Error);
    }
  }

  /**
   * Wire up WebSocket message handlers for Deepgram V1 events:
   * `Results`, `UtteranceEnd`, `SpeechStarted`, `Metadata`.
   */
  private setupEventHandlers(): void {
    if (!this.ws) return;

    this.ws.onmessage = (event: MessageEvent) => {
      // All Deepgram control messages are JSON text frames
      if (typeof event.data === 'string') {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case 'Results':
              this.handleResults(msg);
              break;
            case 'UtteranceEnd':
              this.handleUtteranceEnd(msg);
              break;
            case 'SpeechStarted':
              this.handleSpeechStarted(msg);
              break;
            case 'Metadata':
              this.logger.debug('Metadata received', msg);
              break;
            default:
              this.logger.debug('Unknown message type', msg);
          }
        } catch (error) {
          this.logger.error('Error parsing Deepgram message', error);
        }
      }
    };

    this.ws.onerror = (event) => {
      this.logger.error('Deepgram WebSocket error', event);

      const errorResult: TranscriptionResult = {
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: (event as ErrorEvent).message ?? 'WebSocket error',
        },
      };

      this.emitTranscription(errorResult);
    };

    this.ws.onclose = (event) => {
      this.logger.info('Deepgram WebSocket closed', {
        code: event.code,
        reason: event.reason,
      });
      this.isConnected = false;
    };
  }

  /**
   * Process a V1 `Results` message from Deepgram.
   *
   * Handles three configurations:
   *
   * 1. **Endpointing enabled** (`endpointing` > 0):
   *    Deepgram sends `speech_final: true` when it detects silence.
   *    Multiple `is_final` segments may arrive before `speech_final`.
   *    We buffer them and only emit `utteranceComplete` on `speech_final`.
   *
   * 2. **Endpointing disabled, interim_results on** (default):
   *    Deepgram never sends `speech_final: true`. Each `is_final: true`
   *    result is a standalone completed segment → `utteranceComplete`.
   *
   * 3. **Endpointing disabled, interim_results off**:
   *    Every result is `is_final: true`. Each is a complete segment
   *    → `utteranceComplete`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleResults(data: any): void {
    const alternative = data.channel?.alternatives?.[0];
    if (!alternative) return;

    const transcript = alternative.transcript;
    const confidence = alternative.confidence;
    const isFinal = data.is_final ?? false;
    const speechFinal = data.speech_final ?? false;

    if (!isFinal) {
      // ── Interim result — pass through for real-time display ────────────
      if (transcript) {
        this.emitTranscription({
          text: transcript,
          isFinal: false,
          confidence,
          metadata: { duration: data.duration },
        });
      }
      return;
    }

    // ── is_final: true ───────────────────────────────────────────────────

    if (!this.endpointingEnabled) {
      // No endpointing → each is_final is a complete utterance.
      // No buffering needed — emit directly with utteranceComplete.
      if (transcript) {
        this.emitTranscription({
          text: transcript,
          isFinal: true,
          speechFinal: true,
          utteranceComplete: true,
          confidence,
          metadata: { duration: data.duration },
        });
      }
      return;
    }

    // ── Endpointing enabled — buffer segments until speech_final ─────────

    if (transcript) {
      this.utteranceBuffer.push(transcript);
    }

    if (speechFinal) {
      // Utterance complete — flush the buffer
      const fullText = this.utteranceBuffer.join(' ').trim();
      this.utteranceBuffer = [];

      this.logger.debug('Deepgram speech_final — full utterance', { fullText });

      // Emit the segment first so interim displays update
      if (transcript) {
        this.emitTranscription({
          text: transcript,
          isFinal: true,
          speechFinal: false,
          confidence,
          metadata: { speechFinal: false, duration: data.duration },
        });
      }

      // Emit the complete utterance — this triggers LLM processing
      if (fullText) {
        this.emitTranscription({
          text: fullText,
          isFinal: true,
          speechFinal: true,
          utteranceComplete: true,
          confidence,
          metadata: { speechFinal: true, duration: data.duration },
        });
      }
    } else {
      // Mid-utterance final segment — emit for display but not for LLM
      if (transcript) {
        this.emitTranscription({
          text: transcript,
          isFinal: true,
          speechFinal: false,
          confidence,
          metadata: { speechFinal: false, duration: data.duration },
        });
      }
    }
  }

  /**
   * Process a V1 `UtteranceEnd` event.
   *
   * @remarks
   * Sent when `utterance_end_ms` is configured and Deepgram detects a
   * sufficient gap between transcribed words. This acts as a fallback
   * utterance boundary — particularly useful in noisy environments where
   * `speech_final` may not fire because the VAD can't detect silence.
   *
   * If the utterance buffer has accumulated text that hasn't been flushed
   * by a `speech_final`, we flush it here with `utteranceComplete: true`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleUtteranceEnd(data: any): void {
    this.logger.debug('Utterance end', data);

    // Flush any buffered segments that speech_final didn't catch
    if (this.utteranceBuffer.length > 0) {
      const fullText = this.utteranceBuffer.join(' ').trim();
      this.utteranceBuffer = [];

      if (fullText) {
        this.logger.debug('UtteranceEnd flushing buffer', { fullText });
        this.emitTranscription({
          text: fullText,
          isFinal: true,
          speechFinal: true,
          utteranceComplete: true,
          confidence: 1,
          metadata: { event: 'utterance_end', data },
        });
        return;
      }
    }

    // No buffered text — emit as informational event only
    this.emitTranscription({
      text: '',
      isFinal: true,
      confidence: 1,
      metadata: { event: 'utterance_end', data },
    });
  }

  /**
   * Process a V1 `SpeechStarted` event.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleSpeechStarted(data: any): void {
    this.logger.debug('Speech started', data);

    const result: TranscriptionResult = {
      text: '',
      isFinal: false,
      confidence: 1,
      metadata: {
        event: 'speech_started',
        data,
      },
    };

    this.emitTranscription(result);
  }

  /**
   * Send a raw audio chunk to Deepgram for real-time transcription.
   *
   * @remarks
   * Sends the audio data as a binary WebSocket frame. If the connection is
   * not open, the chunk is silently dropped and a warning is logged.
   *
   * Called by the base class's {@link LiveSTTProvider.sendAudio} method.
   *
   * @param chunk - Raw audio data captured from the microphone.
   */
  protected sendAudioToSocket(chunk: ArrayBuffer): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    try {
      this.ws.send(chunk);
    } catch (error) {
      this.logger.error('Failed to send audio chunk', error);
    }
  }

  /**
   * Send a keep-alive signal to prevent the WebSocket from timing out.
   *
   * @remarks
   * Sends `{ "type": "KeepAlive" }` JSON message. Useful for long pauses
   * where no audio is being sent but the connection should remain open.
   */
  sendKeepAlive(): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot send keep-alive: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify({ type: 'KeepAlive' }));
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
   * Sends `{ "type": "Finalize" }` JSON message. This tells Deepgram to
   * process any buffered audio and return a final result. Useful before
   * disconnecting or when you need an immediate result.
   */
  sendFinalize(): void {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Cannot send finalize: not connected');
      return;
    }

    try {
      this.ws.send(JSON.stringify({ type: 'Finalize' }));
      this.logger.debug('Sent finalize');
    } catch (error) {
      this.logger.error('Failed to send finalize', error);
    }
  }

  /**
   * Gracefully close the Deepgram WebSocket connection.
   *
   * @remarks
   * Sends a `CloseStream` control message for graceful server-side cleanup,
   * then closes the WebSocket. Waits up to 1 second for the `close` event
   * before force-resolving. Resets the utterance buffer and internal state.
   *
   * @throws Re-throws any unexpected error during disconnection.
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.ws) {
      this.logger.warn('Not connected to Deepgram');
      return;
    }

    try {
      this.logger.debug('Disconnecting from Deepgram WebSocket');

      // Send CloseStream for graceful server-side cleanup
      try {
        this.ws.send(JSON.stringify({ type: 'CloseStream' }));
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
      this.utteranceBuffer = [];
      this.ws = null;

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
