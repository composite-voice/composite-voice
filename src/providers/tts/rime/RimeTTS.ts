/**
 * Rime TTS provider using native `fetch`.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by
 * Rime's TTS models (Coda, Arcana, and Mist families). Each call to
 * `synthesize()` makes a single HTTP request to the Rime API and returns
 * the complete audio as a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Audio format: Configurable (mp3, wav, ogg, webm, pcm, mulaw); default is `mp3`
 *
 * No SDK dependency required.
 *
 * @packageDocumentation
 */

import { RestTTSProvider } from '../../base/RestTTSProvider';
import type { TTSProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { HttpClient } from '../../../utils/http';
import { ProviderInitializationError } from '../../../utils/errors';

/**
 * Supported Rime TTS models.
 *
 * @remarks
 * - `'coda'` -- Flagship conversational model with sub-100ms model latency
 * - `'arcana'` -- Highly expressive, natural-sounding speech with emotional nuance (default)
 * - `'arcanav3'` -- Latest Arcana variant with enhanced capabilities
 * - `'arcanav2'` -- Earlier Arcana iteration
 * - `'mistv3'` -- Fastest Mist generation, optimized for time-to-first-byte
 * - `'mistv2'` -- Ultra-fast legacy model with custom pronunciation support
 */
export type RimeTTSModel = 'coda' | 'arcana' | 'arcanav3' | 'arcanav2' | 'mistv3' | 'mistv2';

/**
 * Supported Rime TTS audio output formats.
 *
 * @remarks
 * The format is selected via the request's `Accept` header and affects both
 * file size and audio quality.
 * - `mp3` -- Good compression, widely supported (default)
 * - `wav` -- Uncompressed 16-bit PCM with RIFF header
 * - `ogg` -- Opus in an OGG container, good compression
 * - `webm` -- Opus in a WebM container, native browser streaming
 * - `pcm` -- Headerless 16-bit linear PCM (`audio/L16`)
 * - `mulaw` -- Headerless G.711 mu-law (`audio/PCMU`), common in telephony
 */
export type RimeTTSFormat = 'mp3' | 'wav' | 'ogg' | 'webm' | 'pcm' | 'mulaw';

/**
 * Configuration for the {@link RimeTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client. The `speaker` is always required.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: RimeTTSConfig = {
 *   apiKey: 'rime_xxxxxxxxxxxx',
 *   speaker: 'astra',
 *   model: 'arcana',
 *   audioFormat: 'mp3',
 * };
 *
 * // Via proxy server
 * const proxyConfig: RimeTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/rime',
 *   speaker: 'astra',
 * };
 * ```
 *
 * @see {@link RimeTTSModel} - Available model options.
 * @see {@link RimeTTSFormat} - Available audio format options.
 */
export interface RimeTTSConfig extends TTSProviderConfig {
  /**
   * The voice to use for synthesis.
   *
   * @remarks
   * Required. Voice availability depends on the selected model -- see Rime's
   * {@link https://docs.rime.ai/api-reference/voices | voices documentation}
   * for the per-model catalogs (e.g. `'astra'`, `'celeste'`, `'luna'`).
   */
  speaker: string;

  /**
   * The TTS model to use.
   *
   * @defaultValue `'arcana'`
   * @see {@link RimeTTSModel}
   */
  model?: RimeTTSModel;

  /**
   * The audio output format.
   *
   * @remarks
   * Sent to the Rime API via the `Accept` header; the response body contains
   * the raw audio bytes in this format.
   *
   * @defaultValue `'mp3'`
   * @see {@link RimeTTSFormat}
   */
  audioFormat?: RimeTTSFormat;

  /**
   * Language of the input text.
   *
   * @remarks
   * An ISO 639-1 (e.g. `'en'`, `'es'`) or ISO 639-2/3 (e.g. `'eng'`, `'spa'`)
   * language code, sent to the Rime API as the `lang` field. It must match
   * the selected speaker's language. Multilingual synthesis is supported on
   * the Coda and Arcana models.
   *
   * @defaultValue `undefined` (Rime's server-side default is `'en'`/`'eng'`, varying by model)
   */
  language?: string;

  /**
   * Output sampling rate in Hz.
   *
   * @defaultValue `undefined` (Rime's server-side default is `24000`)
   */
  samplingRate?: number;

  /**
   * Speech speed multiplier.
   *
   * @remarks
   * Supported on `mistv2`: values below `1.0` produce faster speech and
   * values above `1.0` produce slower speech. On other models, use
   * {@link RimeTTSConfig.timeScaleFactor} instead.
   *
   * @defaultValue `undefined` (Rime's server-side default is `1.0`)
   */
  speedAlpha?: number;

  /**
   * Whether to skip text normalization to reduce latency.
   *
   * @remarks
   * Supported on `mistv2` only. Skipping normalization reduces latency at
   * the cost of possible mispronunciation of digits and abbreviations.
   *
   * @defaultValue `undefined` (Rime's server-side default is `false`)
   */
  noTextNormalization?: boolean;

  /**
   * Time scaling factor for the output audio.
   *
   * @remarks
   * Values above `1.0` slow the audio down; values below `1.0` speed it up.
   *
   * @defaultValue `undefined` (Rime's server-side default is `1.0`)
   */
  timeScaleFactor?: number;

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link RimeTTSFormat} values to their `Accept` header and Blob MIME types.
 *
 * @remarks
 * The Rime API selects the response encoding from the request's `Accept`
 * header. The `accept` value is sent on the request; the `mime` value is
 * applied to the returned `Blob`.
 *
 * @internal
 */
const FORMAT_TYPES: Record<RimeTTSFormat, { accept: string; mime: string }> = {
  mp3: { accept: 'audio/mpeg', mime: 'audio/mpeg' },
  wav: { accept: 'audio/wav', mime: 'audio/wav' },
  ogg: { accept: 'audio/ogg;codecs=opus', mime: 'audio/ogg' },
  webm: { accept: 'audio/webm;codecs=opus', mime: 'audio/webm' },
  pcm: { accept: 'audio/L16', mime: 'audio/L16' },
  mulaw: { accept: 'audio/PCMU', mime: 'audio/PCMU' },
};

/** @internal Default Rime API base URL. */
const RIME_DEFAULT_URL = 'https://users.rime.ai';

/**
 * Rime TTS provider using native `fetch` for text-to-speech synthesis.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single HTTP
 * request to Rime's `POST /v1/rime-tts` endpoint. The API returns the raw
 * audio bytes in the format requested via the `Accept` header, which this
 * provider wraps in a `Blob`. It supports the flagship `coda` model, the
 * expressive `arcana` family, and the low-latency `mist` family.
 *
 * Audio flow: `Text -> Rime REST API (raw bytes) -> Complete audio Blob`
 *
 * @example
 * ```typescript
 * import { RimeTTS } from 'composite-voice';
 *
 * const tts = new RimeTTS({
 *   apiKey: 'rime_xxxxxxxxxxxx',
 *   speaker: 'astra',
 *   model: 'arcana',
 *   audioFormat: 'mp3',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello, world!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link RimeTTSConfig} - Configuration options for this provider.
 */
export class RimeTTS extends RestTTSProvider {
  declare public config: RimeTTSConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new RimeTTS provider instance.
   *
   * @param config - Configuration for the Rime TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: RimeTTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the HTTP client for the Rime TTS API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if `speaker` is not provided.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'RimeTTS',
        new Error('RimeTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.config.speaker) {
      throw new ProviderInitializationError(
        'RimeTTS',
        new Error('RimeTTS requires "speaker" to be configured.')
      );
    }

    const baseUrl = this.resolveBaseUrl(RIME_DEFAULT_URL);
    if (!baseUrl) throw new Error('Rime TTS base URL could not be resolved');
    const apiKey = await this.resolveApiKey();

    const headers: Record<string, string> = {};

    if (!this.isProxyMode) {
      headers['authorization'] = `Bearer ${apiKey}`;
    }

    this.client = new HttpClient({
      baseUrl,
      headers,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 60000,
      logger: this.logger,
      providerName: 'RimeTTS',
    });

    this.logger.info('Rime TTS initialized', {
      speaker: this.config.speaker,
      model: this.config.model ?? 'arcana',
      audioFormat: this.config.audioFormat ?? 'mp3',
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Rime TTS disposed');
  }

  /**
   * Synthesizes text to audio using the Rime TTS REST API.
   *
   * @param text - The text to synthesize into speech.
   * @returns A `Blob` containing the synthesized audio in the configured format.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the Rime API request fails.
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('Rime TTS client not initialized');
    }

    const model = this.config.model ?? 'arcana';
    const audioFormat = this.config.audioFormat ?? 'mp3';
    const { accept, mime } = FORMAT_TYPES[audioFormat];

    this.logger.debug('Rime TTS synthesize request', {
      model,
      speaker: this.config.speaker,
      audioFormat,
      textLength: text.length,
    });

    const body: Record<string, unknown> = {
      speaker: this.config.speaker,
      text,
      modelId: model,
    };

    if (this.config.language) {
      body.lang = this.config.language;
    }

    if (this.config.samplingRate != null) {
      body.samplingRate = this.config.samplingRate;
    }

    if (this.config.speedAlpha != null) {
      body.speedAlpha = this.config.speedAlpha;
    }

    if (this.config.noTextNormalization != null) {
      body.noTextNormalization = this.config.noTextNormalization;
    }

    if (this.config.timeScaleFactor != null) {
      body.timeScaleFactor = this.config.timeScaleFactor;
    }

    const response = await this.client.request('/v1/rime-tts', {
      body,
      headers: { accept },
    });

    const arrayBuffer = await response.arrayBuffer();

    this.logger.debug('Rime TTS synthesize complete', {
      audioBytes: arrayBuffer.byteLength,
    });

    return new Blob([arrayBuffer], { type: mime });
  }
}
