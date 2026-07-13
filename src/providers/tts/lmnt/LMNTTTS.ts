/**
 * LMNT TTS provider using native `fetch`.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by
 * LMNT's Blizzard model. Each call to `synthesize()` makes a single HTTP
 * request to the LMNT API and returns the complete audio as a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Audio format: Configurable (mp3, wav, aac, ulaw, webm, pcm_s16le, pcm_f32le);
 * default is `mp3`
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
 * Supported LMNT TTS models.
 *
 * @remarks
 * - `'blizzard'` -- LMNT's current speech model (Blizzard 2.0). Supports voice
 *   cloning and 31 languages, and receives regular updates from LMNT.
 *
 * See the {@link https://docs.lmnt.com/models/overview | LMNT model overview}
 * for the latest model availability.
 */
export type LMNTTTSModel = 'blizzard';

/**
 * Supported LMNT TTS audio output formats.
 *
 * @remarks
 * The format affects both file size and audio quality.
 * - `mp3` -- 96kbps MP3 audio; good compression, widely supported (default)
 * - `wav` -- 16-bit PCM audio in a WAV container; uncompressed, highest quality
 * - `aac` -- AAC audio codec; good for mobile devices
 * - `ulaw` -- 8-bit G711 µ-law audio with a WAV header (telephony)
 * - `webm` -- WebM container with Opus audio codec
 * - `pcm_s16le` -- Raw PCM, signed 16-bit little-endian (no container)
 * - `pcm_f32le` -- Raw PCM, 32-bit floating-point little-endian (no container)
 */
export type LMNTTTSFormat = 'mp3' | 'wav' | 'aac' | 'ulaw' | 'webm' | 'pcm_s16le' | 'pcm_f32le';

/**
 * Supported LMNT TTS output sample rates in Hz.
 *
 * @remarks
 * The LMNT API defaults to `24000` for all formats except `ulaw`, which
 * defaults to `8000`.
 */
export type LMNTTTSSampleRate = 8000 | 16000 | 24000;

/**
 * Configuration for the {@link LMNTTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client. The `voice` is always required.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: LMNTTTSConfig = {
 *   apiKey: 'xxxxxxxxxxxx',
 *   voice: 'leah',
 *   model: 'blizzard',
 *   format: 'mp3',
 * };
 *
 * // Via proxy server
 * const proxyConfig: LMNTTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/lmnt',
 *   voice: 'leah',
 * };
 * ```
 *
 * @see {@link LMNTTTSModel} - Available model options.
 * @see {@link LMNTTTSFormat} - Available audio format options.
 */
export interface LMNTTTSConfig extends TTSProviderConfig {
  /**
   * The voice to use for synthesis.
   *
   * @remarks
   * Required. A voice ID from LMNT's `GET /v1/ai/voice/list` endpoint (e.g.
   * `'leah'`), or the ID of a cloned voice.
   */
  voice: string;

  /**
   * The TTS model to use.
   *
   * @defaultValue `'blizzard'`
   * @see {@link LMNTTTSModel}
   */
  model?: LMNTTTSModel;

  /**
   * The audio output format.
   *
   * @defaultValue `'mp3'`
   * @see {@link LMNTTTSFormat}
   */
  format?: LMNTTTSFormat;

  /**
   * The desired output sample rate in Hz.
   *
   * @remarks
   * When omitted, the LMNT API defaults to `24000` for all formats except
   * `ulaw`, which defaults to `8000`.
   *
   * @defaultValue `undefined` (API default)
   * @see {@link LMNTTTSSampleRate}
   */
  sampleRate?: LMNTTTSSampleRate;

  /**
   * Language of the input text.
   *
   * @remarks
   * A two-letter ISO 639-1 code (e.g. `'en'`), or `'auto'` for automatic
   * detection. Specifying the language is recommended for faster generation.
   *
   * @defaultValue `undefined` (automatic detection)
   */
  language?: string;

  /**
   * Influences how expressive and emotionally varied the speech becomes.
   *
   * @remarks
   * Lower values (like `0.3`) create more neutral, consistent speaking
   * styles. Higher values (like `1.0`) allow for more dynamic emotional
   * range and speaking styles.
   *
   * @defaultValue `undefined` (API default)
   */
  temperature?: number;

  /**
   * Controls the stability of the generated speech.
   *
   * @remarks
   * A lower value (like `0.3`) produces more consistent, reliable speech.
   * A higher value (like `0.9`) gives more flexibility in how words are
   * spoken, but might occasionally produce unusual intonations.
   *
   * @defaultValue `undefined` (API default)
   */
  topP?: number;

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link LMNTTTSFormat} values to their corresponding MIME types.
 *
 * @remarks
 * LMNT's `ulaw` output carries a WAV header, so it maps to `audio/wav`.
 * The raw PCM formats have no container and map to `audio/pcm`.
 *
 * @internal
 */
const FORMAT_MIME_TYPES: Record<LMNTTTSFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ulaw: 'audio/wav',
  webm: 'audio/webm',
  pcm_s16le: 'audio/pcm',
  pcm_f32le: 'audio/pcm',
};

/** @internal Default LMNT API base URL. */
const LMNT_DEFAULT_URL = 'https://api.lmnt.com';

/** @internal LMNT API version sent in the `lmnt-version` header. */
const LMNT_API_VERSION = '1.2';

/**
 * LMNT TTS provider using native `fetch` for text-to-speech synthesis.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single HTTP
 * request to LMNT's `POST /v1/ai/speech/bytes` endpoint, which returns the
 * complete audio as raw binary bytes. The provider wraps those bytes in a
 * `Blob` typed with the MIME type of the configured format.
 *
 * Audio flow: `Text -> LMNT REST API (binary bytes) -> Complete audio Blob`
 *
 * LMNT also offers a full-duplex streaming WebSocket API (speech sessions);
 * this provider intentionally implements the simpler REST path. Streaming
 * support may be added as a separate `LiveTTSProvider` in the future.
 *
 * @example
 * ```typescript
 * import { LMNTTTS } from 'composite-voice';
 *
 * const tts = new LMNTTTS({
 *   apiKey: 'xxxxxxxxxxxx',
 *   voice: 'leah',
 *   model: 'blizzard',
 *   format: 'mp3',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello, world!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link LMNTTTSConfig} - Configuration options for this provider.
 */
export class LMNTTTS extends RestTTSProvider {
  declare public config: LMNTTTSConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new LMNTTTS provider instance.
   *
   * @param config - Configuration for the LMNT TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: LMNTTTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the HTTP client for the LMNT TTS API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if `voice` is not provided.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'LMNTTTS',
        new Error('LMNTTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.config.voice) {
      throw new ProviderInitializationError(
        'LMNTTTS',
        new Error('LMNTTTS requires "voice" to be configured.')
      );
    }

    const baseUrl = this.resolveBaseUrl(LMNT_DEFAULT_URL);
    if (!baseUrl) throw new Error('LMNT TTS base URL could not be resolved');
    const apiKey = await this.resolveApiKey();

    const headers: Record<string, string> = {
      'lmnt-version': LMNT_API_VERSION,
    };

    if (!this.isProxyMode) {
      headers['X-API-Key'] = apiKey;
    }

    this.client = new HttpClient({
      baseUrl,
      headers,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 60000,
      logger: this.logger,
      providerName: 'LMNTTTS',
    });

    this.logger.info('LMNT TTS initialized', {
      voice: this.config.voice,
      model: this.config.model ?? 'blizzard',
      format: this.config.format ?? 'mp3',
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('LMNT TTS disposed');
  }

  /**
   * Synthesizes text to audio using the LMNT TTS REST API.
   *
   * @param text - The text to synthesize into speech (max 5000 characters).
   * @returns A `Blob` containing the synthesized audio in the configured format.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the LMNT API request fails.
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('LMNT TTS client not initialized');
    }

    const model = this.config.model ?? 'blizzard';
    const format = this.config.format ?? 'mp3';

    this.logger.debug('LMNT TTS synthesize request', {
      model,
      voice: this.config.voice,
      format,
      textLength: text.length,
    });

    const body: Record<string, unknown> = {
      text,
      voice: this.config.voice,
      model,
      format,
    };

    if (this.config.sampleRate != null) {
      body.sample_rate = this.config.sampleRate;
    }

    if (this.config.language) {
      body.language = this.config.language;
    }

    if (this.config.temperature != null) {
      body.temperature = this.config.temperature;
    }

    if (this.config.topP != null) {
      body.top_p = this.config.topP;
    }

    const response = await this.client.request('/v1/ai/speech/bytes', { body });

    const arrayBuffer = await response.arrayBuffer();
    const mimeType = FORMAT_MIME_TYPES[format];

    this.logger.debug('LMNT TTS synthesize complete', {
      audioBytes: arrayBuffer.byteLength,
    });

    return new Blob([arrayBuffer], { type: mimeType });
  }
}
