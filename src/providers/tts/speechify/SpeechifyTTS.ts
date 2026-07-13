/**
 * Speechify TTS provider using native `fetch`.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by
 * Speechify's Simba models. Each call to `synthesize()` makes a single HTTP
 * request to the Speechify API and returns the complete audio as a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Audio format: Configurable (mp3, wav, ogg, aac); default is `mp3`
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
 * Supported Speechify TTS models.
 *
 * @remarks
 * - `'simba-english'` -- English-only model, optimized for latency (default)
 * - `'simba-multilingual'` -- Multilingual model
 * - `'simba-3.0'` -- Simba 3.0 generation model
 * - `'simba-3.2'` -- Simba 3.2 generation model
 */
export type SpeechifyTTSModel = 'simba-english' | 'simba-multilingual' | 'simba-3.0' | 'simba-3.2';

/**
 * Supported Speechify TTS audio output formats.
 *
 * @remarks
 * The format affects both file size and audio quality.
 * - `mp3` -- Good compression, widely supported (default)
 * - `wav` -- Uncompressed, highest quality
 * - `ogg` -- Good compression, open format
 * - `aac` -- Good for mobile devices
 */
export type SpeechifyTTSFormat = 'mp3' | 'wav' | 'ogg' | 'aac';

/**
 * Configuration for the {@link SpeechifyTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client. The `voiceId` is always required.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: SpeechifyTTSConfig = {
 *   apiKey: 'sk_xxxxxxxxxxxx',
 *   voiceId: 'geffen_32',
 *   model: 'simba-3.2',
 *   audioFormat: 'mp3',
 * };
 *
 * // Via proxy server
 * const proxyConfig: SpeechifyTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/speechify',
 *   voiceId: 'geffen_32',
 * };
 * ```
 *
 * @see {@link SpeechifyTTSModel} - Available model options.
 * @see {@link SpeechifyTTSFormat} - Available audio format options.
 */
export interface SpeechifyTTSConfig extends TTSProviderConfig {
  /**
   * The voice to use for synthesis.
   *
   * @remarks
   * Required. List available voices via Speechify's `GET /v1/voices` endpoint,
   * or use a cloned voice ID.
   */
  voiceId: string;

  /**
   * The TTS model to use.
   *
   * @defaultValue `'simba-english'`
   * @see {@link SpeechifyTTSModel}
   */
  model?: SpeechifyTTSModel;

  /**
   * The audio output format.
   *
   * @defaultValue `'mp3'`
   * @see {@link SpeechifyTTSFormat}
   */
  audioFormat?: SpeechifyTTSFormat;

  /**
   * Language of the input text.
   *
   * @remarks
   * An ISO 639-1 language code, optionally followed by an ISO 3166-1 region
   * code separated by a hyphen (e.g. `'en-US'`). When omitted, Speechify
   * detects the language automatically.
   *
   * @defaultValue `undefined` (automatic detection)
   */
  language?: string;

  /**
   * Whether to apply loudness normalization to the output audio.
   *
   * @defaultValue `false`
   */
  loudnessNormalization?: boolean;

  /**
   * Whether to apply text normalization (numbers, dates, abbreviations)
   * before synthesis.
   *
   * @defaultValue `false`
   */
  textNormalization?: boolean;

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link SpeechifyTTSFormat} values to their corresponding MIME types.
 *
 * @internal
 */
const FORMAT_MIME_TYPES: Record<SpeechifyTTSFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  aac: 'audio/aac',
};

/** @internal Default Speechify API base URL. */
const SPEECHIFY_DEFAULT_URL = 'https://api.speechify.ai';

/**
 * Shape of the JSON response from Speechify's `POST /v1/audio/speech` endpoint.
 *
 * @internal
 */
interface SpeechifySpeechResponse {
  /** Base64-encoded audio data. */
  audio_data: string;
  /** Format of the returned audio. */
  audio_format?: string;
  /** Number of characters billed for this request. */
  billable_characters_count?: number;
}

/**
 * Speechify TTS provider using native `fetch` for text-to-speech synthesis.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single HTTP
 * request to Speechify's `POST /v1/audio/speech` endpoint. The API returns the
 * audio as base64-encoded JSON, which this provider decodes into a `Blob`.
 * Speech input may be plain text or SSML — emotion, pitch, and speed are
 * controlled via SSML `<prosody>` tags in the input text.
 *
 * Audio flow: `Text -> Speechify REST API (base64 JSON) -> Complete audio Blob`
 *
 * @example
 * ```typescript
 * import { SpeechifyTTS } from 'composite-voice';
 *
 * const tts = new SpeechifyTTS({
 *   apiKey: 'sk_xxxxxxxxxxxx',
 *   voiceId: 'geffen_32',
 *   model: 'simba-3.2',
 *   audioFormat: 'mp3',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello, world!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link SpeechifyTTSConfig} - Configuration options for this provider.
 */
export class SpeechifyTTS extends RestTTSProvider {
  declare public config: SpeechifyTTSConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new SpeechifyTTS provider instance.
   *
   * @param config - Configuration for the Speechify TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: SpeechifyTTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the HTTP client for the Speechify TTS API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if `voiceId` is not provided.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'SpeechifyTTS',
        new Error('SpeechifyTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.config.voiceId) {
      throw new ProviderInitializationError(
        'SpeechifyTTS',
        new Error('SpeechifyTTS requires "voiceId" to be configured.')
      );
    }

    const baseUrl = this.resolveBaseUrl(SPEECHIFY_DEFAULT_URL);
    if (!baseUrl) throw new Error('Speechify TTS base URL could not be resolved');
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
      providerName: 'SpeechifyTTS',
    });

    this.logger.info('Speechify TTS initialized', {
      voiceId: this.config.voiceId,
      model: this.config.model ?? 'simba-english',
      audioFormat: this.config.audioFormat ?? 'mp3',
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Speechify TTS disposed');
  }

  /**
   * Synthesizes text to audio using the Speechify TTS REST API.
   *
   * @param text - The text (or SSML) to synthesize into speech.
   * @returns A `Blob` containing the synthesized audio in the configured format.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the Speechify API request fails or returns no audio.
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('Speechify TTS client not initialized');
    }

    const model = this.config.model ?? 'simba-english';
    const audioFormat = this.config.audioFormat ?? 'mp3';

    this.logger.debug('Speechify TTS synthesize request', {
      model,
      voiceId: this.config.voiceId,
      audioFormat,
      textLength: text.length,
    });

    const body: Record<string, unknown> = {
      input: text,
      voice_id: this.config.voiceId,
      audio_format: audioFormat,
      model,
    };

    if (this.config.language) {
      body.language = this.config.language;
    }

    if (this.config.loudnessNormalization != null || this.config.textNormalization != null) {
      body.options = {
        ...(this.config.loudnessNormalization != null
          ? { loudness_normalization: this.config.loudnessNormalization }
          : {}),
        ...(this.config.textNormalization != null
          ? { text_normalization: this.config.textNormalization }
          : {}),
      };
    }

    const response = await this.client.request('/v1/audio/speech', { body });
    const data = (await response.json()) as SpeechifySpeechResponse;

    if (!data.audio_data) {
      throw new Error('Speechify TTS response did not contain audio data');
    }

    const bytes = this.decodeBase64(data.audio_data);
    const mimeType = FORMAT_MIME_TYPES[audioFormat];

    this.logger.debug('Speechify TTS synthesize complete', {
      audioBytes: bytes.byteLength,
      billableCharacters: data.billable_characters_count,
    });

    return new Blob([bytes], { type: mimeType });
  }

  /**
   * Decodes a base64 string into raw bytes.
   *
   * @remarks
   * The Speechify REST API returns audio base64-encoded in the `audio_data`
   * field rather than as raw bytes.
   */
  private decodeBase64(base64: string): Uint8Array<ArrayBuffer> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
