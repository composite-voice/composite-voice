/**
 * Google Cloud STT provider using native `fetch`.
 *
 * @remarks
 * This module provides a REST-based (batch) speech-to-text provider powered
 * by Google Cloud Speech-to-Text. Each call to `transcribe()` uploads a
 * complete audio recording to the synchronous `speech:recognize` endpoint
 * and emits the transcript through the standard `onTranscription` callback.
 *
 * **Why batch and not streaming?** Google's streaming recognition API
 * (`StreamingRecognize`, in both v1 and v2) is gRPC-only -- there is no
 * public WebSocket endpoint, so a browser-side live STT provider cannot be
 * built without heavyweight gRPC/protobuf dependencies. This provider
 * therefore implements per-utterance batch transcription instead
 * (up to 60 seconds of audio per request).
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 *
 * No SDK dependency required.
 *
 * @packageDocumentation
 */

import { RestSTTProvider } from '../../base/RestSTTProvider';
import type { STTProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { HttpClient } from '../../../utils/http';
import { ProviderInitializationError } from '../../../utils/errors';

/**
 * Supported Google Cloud STT (v1) audio encodings.
 *
 * @remarks
 * - `'LINEAR16'` -- Uncompressed 16-bit signed little-endian PCM (or WAV)
 * - `'FLAC'` -- Free Lossless Audio Codec; recommended for lossless upload
 * - `'MULAW'` -- G.711 mu-law, 8-bit companded PCM
 * - `'AMR'` / `'AMR_WB'` -- Adaptive Multi-Rate (narrowband/wideband)
 * - `'OGG_OPUS'` -- Opus frames in an Ogg container
 * - `'WEBM_OPUS'` -- Opus frames in a WebM container (what
 *   `MediaRecorder` produces in most browsers)
 * - `'MP3'` -- MPEG audio layer 3
 * - `'ALAW'` -- G.711 A-law, 8-bit companded PCM
 * - `'SPEEX_WITH_HEADER_BYTE'` -- Speex wideband with header byte
 *
 * For WAV and FLAC files the encoding and sample rate are read from the
 * file header, so they may be omitted from the configuration.
 */
export type GoogleSTTEncoding =
  | 'LINEAR16'
  | 'FLAC'
  | 'MULAW'
  | 'ALAW'
  | 'AMR'
  | 'AMR_WB'
  | 'OGG_OPUS'
  | 'WEBM_OPUS'
  | 'MP3'
  | 'SPEEX_WITH_HEADER_BYTE';

/**
 * Configuration for the {@link GoogleSTT} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client.
 *
 * Direct mode authenticates with a Google Cloud API key via the
 * `X-goog-api-key` header. Google also supports OAuth2 service-account
 * credentials, but those require token minting/refresh and are out of scope
 * for this SDK -- use an API key (restricted to the Speech-to-Text API) or
 * the proxy instead.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: GoogleSTTConfig = {
 *   apiKey: 'AIza...',
 *   language: 'en-US',
 *   encoding: 'WEBM_OPUS',
 *   sampleRate: 48000,
 *   model: 'latest_short',
 * };
 *
 * // Via proxy server
 * const proxyConfig: GoogleSTTConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/google-stt',
 *   language: 'en-US',
 * };
 * ```
 *
 * @see {@link GoogleSTTEncoding} - Available audio encoding options.
 */
export interface GoogleSTTConfig extends STTProviderConfig {
  /**
   * Encoding of the audio passed to `transcribe()`.
   *
   * @remarks
   * May be omitted for WAV and FLAC audio -- Google reads the encoding and
   * sample rate from the file header. Required for raw or Opus audio.
   *
   * @defaultValue `undefined` (derived from the file header where possible)
   * @see {@link GoogleSTTEncoding}
   */
  encoding?: GoogleSTTEncoding;

  /**
   * Sample rate of the audio in Hz.
   *
   * @remarks
   * Should match the actual sample rate of the recording (e.g. 16000 for
   * raw LINEAR16 capture, 48000 for browser `MediaRecorder` WEBM_OPUS).
   * May be omitted for WAV and FLAC audio.
   *
   * @defaultValue `undefined` (derived from the file header where possible)
   */
  sampleRate?: number;

  /**
   * Recognition model to use.
   *
   * @remarks
   * v1 model identifiers include `'latest_long'` (media, conversations),
   * `'latest_short'` (short utterances and commands -- a good fit for
   * voice-agent turns), `'telephony'`, `'telephony_short'`,
   * `'medical_dictation'`, `'medical_conversation'`, `'phone_call'`,
   * `'video'`, `'command_and_search'`, and `'default'`. Note that Google's
   * Chirp models are v2-API-only (regional endpoints) and are not valid here.
   *
   * @defaultValue `undefined` (Google selects a default for the language)
   */
  model?: string;

  /**
   * Whether to include word-level start/end time offsets in the result
   * metadata.
   *
   * @defaultValue `false`
   */
  enableWordTimeOffsets?: boolean;

  /**
   * Up to three additional BCP-47 language codes that the audio might be
   * in. Google picks the language that best matches the audio.
   *
   * @defaultValue `undefined` (single-language recognition)
   */
  alternativeLanguageCodes?: string[];

  /**
   * Whether to filter profanity from the transcript.
   *
   * @defaultValue `false`
   */
  profanityFilter?: boolean;

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/** @internal Default Google Cloud Speech-to-Text API base URL. */
const GOOGLE_STT_DEFAULT_URL = 'https://speech.googleapis.com';

/**
 * Word-level timing information from the Google Cloud STT response.
 *
 * @remarks
 * Present on final results in `metadata.words` when
 * {@link GoogleSTTConfig.enableWordTimeOffsets | enableWordTimeOffsets} is `true`.
 * Times are protobuf `Duration` strings, e.g. `'1.300s'`.
 */
export interface GoogleSTTWordInfo {
  /** Start of the word relative to the beginning of the audio, e.g. `'0.400s'`. */
  startTime?: string;
  /** End of the word relative to the beginning of the audio, e.g. `'0.800s'`. */
  endTime?: string;
  /** The recognized word. */
  word: string;
}

/**
 * Shape of the JSON response from Google's `POST /v1/speech:recognize` endpoint.
 *
 * @internal
 */
interface GoogleRecognizeResponse {
  results?: Array<{
    alternatives?: Array<{
      transcript?: string;
      confidence?: number;
      words?: GoogleSTTWordInfo[];
    }>;
    languageCode?: string;
  }>;
  totalBilledTime?: string;
  requestId?: string;
}

/**
 * Google Cloud STT provider using native `fetch` for batch (per-utterance)
 * speech-to-text.
 *
 * @remarks
 * This is a **REST/batch** provider, not a live streaming one: each
 * `transcribe(blob)` call uploads a complete recording (base64-encoded) to
 * Google's synchronous `POST /v1/speech:recognize` endpoint, which accepts
 * up to **60 seconds** (~10 MB) of audio per request. The top alternative
 * of the response is emitted as a single final result with
 * `utteranceComplete: true`, which is the flag CompositeVoice checks to
 * trigger LLM processing.
 *
 * There is deliberately no `GoogleLiveSTT`: Google's streaming recognition
 * (`StreamingRecognize`) is exposed only over gRPC in both the v1 and v2
 * APIs. There is no public WebSocket endpoint, so real-time browser
 * streaming would require gRPC/protobuf dependencies that conflict with
 * this SDK's zero-dependency design. For live streaming STT, use a
 * WebSocket provider such as DeepgramSTT, AssemblyAISTT, or SonioxSTT.
 *
 * Audio flow: `Complete audio Blob -> transcribe() -> Google STT REST API -> emitTranscription (final)`
 *
 * @example
 * ```typescript
 * import { GoogleSTT } from 'composite-voice';
 *
 * const stt = new GoogleSTT({
 *   apiKey: 'AIza...',
 *   language: 'en-US',
 *   encoding: 'WEBM_OPUS',
 *   sampleRate: 48000,
 *   model: 'latest_short',
 * });
 *
 * await stt.initialize();
 * stt.onTranscription((result) => console.log(result.text, result.confidence));
 *
 * // Record an utterance (e.g. via MediaRecorder), then:
 * await stt.transcribe(recordedBlob);
 * ```
 *
 * @see {@link RestSTTProvider} - The base class this provider extends.
 * @see {@link GoogleSTTConfig} - Configuration options for this provider.
 */
export class GoogleSTT extends RestSTTProvider {
  declare public config: GoogleSTTConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new GoogleSTT provider instance.
   *
   * @param config - Configuration for the Google Cloud STT provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: GoogleSTTConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the HTTP client for the Google Cloud STT API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'GoogleSTT',
        new Error('GoogleSTT requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    const baseUrl = this.resolveBaseUrl(GOOGLE_STT_DEFAULT_URL);
    if (!baseUrl) throw new Error('Google Cloud STT base URL could not be resolved');
    const apiKey = await this.resolveApiKey();

    const headers: Record<string, string> = {};

    if (!this.isProxyMode) {
      headers['X-goog-api-key'] = apiKey;
    }

    this.client = new HttpClient({
      baseUrl,
      headers,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 60000,
      logger: this.logger,
      providerName: 'GoogleSTT',
    });

    this.logger.info('Google Cloud STT initialized', {
      language: this.config.language ?? 'en-US',
      encoding: this.config.encoding,
      model: this.config.model,
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Google Cloud STT disposed');
  }

  /**
   * Transcribes a complete audio recording using the Google Cloud STT
   * synchronous REST API.
   *
   * @remarks
   * The audio is base64-encoded and sent inline (`audio.content`), so it is
   * limited to **60 seconds / ~10 MB** per request -- one utterance at a
   * time, not long-form transcription. The transcripts of all returned
   * result segments are concatenated and emitted as a single final
   * {@link TranscriptionResult} with `utteranceComplete: true`. When
   * {@link GoogleSTTConfig.enableWordTimeOffsets | enableWordTimeOffsets} is
   * enabled, word timings are exposed in `metadata.words`.
   *
   * If Google detects no speech in the audio, no result is emitted.
   *
   * @param audio - Complete audio data as a `Blob` (raw PCM, WAV, FLAC, Ogg/WebM Opus, ...).
   *
   * @throws Error if the provider is not initialized.
   * @throws {@link ProviderResponseError} if the Google Cloud STT API request fails.
   */
  async transcribe(audio: Blob): Promise<void> {
    this.assertReady();

    if (!this.client) {
      throw new Error('Google Cloud STT client not initialized');
    }

    const config: Record<string, unknown> = {
      languageCode: this.config.language ?? 'en-US',
      enableAutomaticPunctuation: this.config.punctuation ?? true,
    };

    if (this.config.encoding) config.encoding = this.config.encoding;
    if (this.config.sampleRate != null) config.sampleRateHertz = this.config.sampleRate;
    if (this.config.model) config.model = this.config.model;
    if (this.config.enableWordTimeOffsets) config.enableWordTimeOffsets = true;
    if (this.config.alternativeLanguageCodes)
      config.alternativeLanguageCodes = this.config.alternativeLanguageCodes;
    if (this.config.profanityFilter) config.profanityFilter = true;
    if (this.config.keywords?.length) {
      config.speechContexts = [{ phrases: this.config.keywords }];
    }

    const bytes = new Uint8Array(await audio.arrayBuffer());

    this.logger.debug('Google Cloud STT recognize request', {
      audioBytes: bytes.byteLength,
      languageCode: config.languageCode,
      encoding: this.config.encoding,
      model: this.config.model,
    });

    const response = await this.client.request('/v1/speech:recognize', {
      body: {
        config,
        audio: { content: this.encodeBase64(bytes) },
      },
    });

    const data = (await response.json()) as GoogleRecognizeResponse;
    const results = data.results ?? [];

    // Google may split one recording into multiple result segments (e.g.
    // around pauses). Take the top alternative of each and concatenate.
    const tops = results
      .map((result) => result.alternatives?.[0])
      .filter((alt): alt is NonNullable<typeof alt> & { transcript: string } => !!alt?.transcript);

    if (tops.length === 0) {
      this.logger.info('Google Cloud STT detected no speech in the audio');
      return;
    }

    const text = tops.map((alt) => alt.transcript.trim()).join(' ');
    const confidences = tops
      .map((alt) => alt.confidence)
      .filter((c): c is number => typeof c === 'number');
    const confidence =
      confidences.length > 0
        ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
        : undefined;
    const words = tops.flatMap((alt) => alt.words ?? []);

    this.logger.debug('Google Cloud STT recognize complete', {
      textLength: text.length,
      segments: tops.length,
      confidence,
    });

    this.emitTranscription({
      text,
      isFinal: true,
      utteranceComplete: true,
      ...(confidence != null ? { confidence } : {}),
      metadata: {
        ...(words.length > 0 ? { words } : {}),
        ...(data.results?.[0]?.languageCode ? { languageCode: data.results[0].languageCode } : {}),
        ...(data.totalBilledTime ? { totalBilledTime: data.totalBilledTime } : {}),
        ...(data.requestId ? { requestId: data.requestId } : {}),
      },
    });
  }

  /**
   * Encodes raw bytes into a base64 string.
   *
   * @remarks
   * The synchronous `speech:recognize` endpoint accepts inline audio only
   * as base64 (`audio.content`). Encoding is chunked to avoid exceeding
   * the JavaScript engine's argument-count limit on large recordings.
   */
  private encodeBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }
}
