/**
 * Smallest.ai Waves TTS provider using native `fetch`.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by
 * Smallest.ai's Lightning models. Each call to `synthesize()` makes a single
 * HTTP request to the Waves API and returns the complete audio as a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Audio format: Configurable (wav, mp3, pcm, ulaw, alaw); default is `wav`
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
 * Supported Smallest.ai Waves TTS models.
 *
 * @remarks
 * - `'lightning_v3.1'` -- Lightning v3.1, 44 kHz model with natural, expressive
 *   speech across 12 languages (default)
 * - `'lightning_v3.1_pro'` -- Lightning v3.1 Pro, curated 44 kHz voice pool
 *   with improved naturalness across American, British, and Indian accents
 *
 * Older Lightning models (`lightning`, `lightning-large`, `lightning-v2`) are
 * deprecated by Smallest.ai and are not supported by this provider.
 */
export type SmallestTTSModel = 'lightning_v3.1' | 'lightning_v3.1_pro';

/**
 * Supported Smallest.ai Waves TTS audio output formats.
 *
 * @remarks
 * The format affects both playability and latency.
 * - `wav` -- Uncompressed with a WAV header, directly playable in browsers (default)
 * - `mp3` -- Good compression, widely supported
 * - `pcm` -- Raw 16-bit PCM, lowest latency but requires a decoder to play
 * - `ulaw` -- mu-law encoded audio (telephony)
 * - `alaw` -- A-law encoded audio (telephony)
 */
export type SmallestTTSFormat = 'wav' | 'mp3' | 'pcm' | 'ulaw' | 'alaw';

/**
 * Supported output sample rates (Hz) for the Waves TTS API.
 */
export type SmallestTTSSampleRate = 8000 | 16000 | 24000 | 44100;

/**
 * Configuration for the {@link SmallestTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client. The `voiceId` is always required.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: SmallestTTSConfig = {
 *   apiKey: 'sk_xxxxxxxxxxxx',
 *   voiceId: 'meher',
 *   model: 'lightning_v3.1',
 *   outputFormat: 'wav',
 * };
 *
 * // Via proxy server
 * const proxyConfig: SmallestTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/smallest',
 *   voiceId: 'meher',
 * };
 * ```
 *
 * @see {@link SmallestTTSModel} - Available model options.
 * @see {@link SmallestTTSFormat} - Available audio format options.
 */
export interface SmallestTTSConfig extends TTSProviderConfig {
  /**
   * The voice to use for synthesis.
   *
   * @remarks
   * Required. A catalog voice ID (e.g. `'meher'`, `'magnus'`, `'olivia'`) or a
   * cloned voice ID. List available voices in the
   * {@link https://waves.smallest.ai/ | Waves console}.
   */
  voiceId: string;

  /**
   * The TTS model to use.
   *
   * @defaultValue `'lightning_v3.1'`
   * @see {@link SmallestTTSModel}
   */
  model?: SmallestTTSModel;

  /**
   * The audio output format.
   *
   * @defaultValue `'wav'`
   * @see {@link SmallestTTSFormat}
   */
  outputFormat?: SmallestTTSFormat;

  /**
   * Sample rate of the output audio in Hz.
   *
   * @remarks
   * One of `8000`, `16000`, `24000`, or `44100`.
   *
   * @defaultValue `44100` (API default)
   */
  sampleRate?: SmallestTTSSampleRate;

  /**
   * Speech speed multiplier.
   *
   * @remarks
   * Accepted range is 0.5 to 2.0, where 1.0 is normal speed.
   *
   * @defaultValue `1.0` (API default)
   */
  speed?: number;

  /**
   * Language of the input text.
   *
   * @remarks
   * An ISO 639-1 code matching the chosen voice, e.g. `'en'`, `'hi'`, or
   * `'es'`. Lightning v3.1 supports 12 languages: `en`, `hi`, `mr`, `kn`,
   * `ta`, `bn`, `gu`, `te`, `ml`, `pa`, `or`, and `es`.
   *
   * @defaultValue `'en'` (API default)
   */
  language?: string;

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link SmallestTTSFormat} values to their corresponding MIME types.
 *
 * @remarks
 * Also used as the `Accept` request header — the Waves API requires an
 * `Accept` header and mirrors it in the response `Content-Type`.
 *
 * @internal
 */
const FORMAT_MIME_TYPES: Record<SmallestTTSFormat, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  pcm: 'audio/pcm',
  ulaw: 'audio/basic',
  alaw: 'audio/alaw',
};

/** @internal Default Smallest.ai Waves API base URL. */
const SMALLEST_DEFAULT_URL = 'https://api.smallest.ai';

/** @internal Path of the unified Waves TTS synthesis endpoint. */
const SMALLEST_TTS_PATH = '/waves/v1/tts';

/**
 * Smallest.ai Waves TTS provider using native `fetch` for text-to-speech synthesis.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single HTTP
 * request to the unified Waves `POST /waves/v1/tts` endpoint, selecting the
 * Lightning model via the `model` body field. The API returns the audio as
 * raw bytes, which this provider wraps in a `Blob`. Smallest.ai recommends
 * keeping each request under roughly 250 characters of text for the lowest
 * latency.
 *
 * Audio flow: `Text -> Waves REST API (raw audio bytes) -> Complete audio Blob`
 *
 * @example
 * ```typescript
 * import { SmallestTTS } from 'composite-voice';
 *
 * const tts = new SmallestTTS({
 *   apiKey: 'sk_xxxxxxxxxxxx',
 *   voiceId: 'meher',
 *   model: 'lightning_v3.1',
 *   outputFormat: 'wav',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello, world!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link SmallestTTSConfig} - Configuration options for this provider.
 */
export class SmallestTTS extends RestTTSProvider {
  declare public config: SmallestTTSConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new SmallestTTS provider instance.
   *
   * @param config - Configuration for the Smallest.ai TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: SmallestTTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the HTTP client for the Smallest.ai Waves TTS API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if `voiceId` is not provided.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'SmallestTTS',
        new Error('SmallestTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.config.voiceId) {
      throw new ProviderInitializationError(
        'SmallestTTS',
        new Error('SmallestTTS requires "voiceId" to be configured.')
      );
    }

    const baseUrl = this.resolveBaseUrl(SMALLEST_DEFAULT_URL);
    if (!baseUrl) throw new Error('Smallest TTS base URL could not be resolved');
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
      providerName: 'SmallestTTS',
    });

    this.logger.info('Smallest TTS initialized', {
      voiceId: this.config.voiceId,
      model: this.config.model ?? 'lightning_v3.1',
      outputFormat: this.config.outputFormat ?? 'wav',
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Smallest TTS disposed');
  }

  /**
   * Synthesizes text to audio using the Smallest.ai Waves TTS REST API.
   *
   * @param text - The text to synthesize into speech.
   * @returns A `Blob` containing the synthesized audio in the configured format.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the Waves API request fails.
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('Smallest TTS client not initialized');
    }

    const model = this.config.model ?? 'lightning_v3.1';
    const outputFormat = this.config.outputFormat ?? 'wav';
    const mimeType = FORMAT_MIME_TYPES[outputFormat];

    this.logger.debug('Smallest TTS synthesize request', {
      model,
      voiceId: this.config.voiceId,
      outputFormat,
      textLength: text.length,
    });

    const body: Record<string, unknown> = {
      text,
      voice_id: this.config.voiceId,
      model,
      output_format: outputFormat,
    };

    if (this.config.sampleRate != null) {
      body.sample_rate = this.config.sampleRate;
    }

    if (this.config.speed != null) {
      body.speed = this.config.speed;
    }

    if (this.config.language) {
      body.language = this.config.language;
    }

    const response = await this.client.request(SMALLEST_TTS_PATH, {
      body,
      headers: { accept: mimeType },
    });

    const arrayBuffer = await response.arrayBuffer();

    this.logger.debug('Smallest TTS synthesize complete', {
      audioBytes: arrayBuffer.byteLength,
    });

    return new Blob([arrayBuffer], { type: mimeType });
  }
}
