/**
 * Google Cloud TTS provider using native `fetch`.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by
 * Google Cloud Text-to-Speech. Each call to `synthesize()` makes a single
 * HTTP request to the `text:synthesize` endpoint and returns the complete
 * audio as a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Audio format: Configurable (MP3, OGG_OPUS, LINEAR16, MULAW, ALAW); default is `MP3`
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
 * Supported Google Cloud TTS audio encodings.
 *
 * @remarks
 * The encoding affects both file size and audio quality.
 * - `'MP3'` -- 32 kbps MP3, good compression, widely supported (default)
 * - `'OGG_OPUS'` -- Opus in an Ogg container, good compression, open format
 * - `'LINEAR16'` -- Uncompressed 16-bit signed PCM with a WAV header, highest quality
 * - `'MULAW'` -- G.711 mu-law with a WAV header, telephony use cases
 * - `'ALAW'` -- G.711 A-law with a WAV header, telephony use cases
 */
export type GoogleTTSAudioEncoding = 'MP3' | 'OGG_OPUS' | 'LINEAR16' | 'MULAW' | 'ALAW';

/**
 * SSML voice gender preference for Google Cloud TTS voice selection.
 *
 * @remarks
 * Only used when no specific voice `name` is configured -- Google picks a
 * voice of the requested gender for the language. Note that this is a
 * preference, not a guarantee.
 */
export type GoogleTTSSsmlGender = 'MALE' | 'FEMALE' | 'NEUTRAL';

/**
 * Configuration for the {@link GoogleTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client.
 *
 * Direct mode authenticates with a Google Cloud API key via the
 * `X-goog-api-key` header. Google also supports OAuth2 service-account
 * credentials, but those require token minting/refresh and are out of scope
 * for this SDK -- use an API key (restricted to the Text-to-Speech API) or
 * the proxy instead.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: GoogleTTSConfig = {
 *   apiKey: 'AIza...',
 *   languageCode: 'en-US',
 *   voiceName: 'en-US-Chirp3-HD-Kore',
 *   audioEncoding: 'MP3',
 * };
 *
 * // Via proxy server
 * const proxyConfig: GoogleTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/google-tts',
 *   voiceName: 'en-US-Neural2-F',
 * };
 * ```
 *
 * @see {@link GoogleTTSAudioEncoding} - Available audio encoding options.
 */
export interface GoogleTTSConfig extends TTSProviderConfig {
  /**
   * BCP-47 language (and optionally region) code for the voice.
   *
   * @remarks
   * For example `'en-US'`, `'en-GB'`, `'de-DE'`. When {@link GoogleTTSConfig.voiceName | voiceName}
   * is set, the language code should match the voice's language prefix.
   *
   * @defaultValue `'en-US'`
   */
  languageCode?: string;

  /**
   * The specific Google Cloud voice to use.
   *
   * @remarks
   * Voice names encode the language, voice family, and variant, e.g.
   * `'en-US-Chirp3-HD-Kore'` (Chirp 3: HD), `'en-US-Neural2-F'` (Neural2),
   * `'en-US-Studio-O'` (Studio), or `'en-US-Wavenet-D'` (WaveNet). List
   * available voices via Google's `GET /v1/voices` endpoint.
   *
   * When omitted, Google selects a default voice for the
   * {@link GoogleTTSConfig.languageCode | languageCode} (optionally biased by
   * {@link GoogleTTSConfig.ssmlGender | ssmlGender}).
   *
   * @defaultValue `undefined` (Google's default voice for the language)
   */
  voiceName?: string;

  /**
   * Preferred voice gender when no specific voice name is configured.
   *
   * @defaultValue `undefined` (no preference)
   * @see {@link GoogleTTSSsmlGender}
   */
  ssmlGender?: GoogleTTSSsmlGender;

  /**
   * The audio encoding of the synthesized output.
   *
   * @defaultValue `'MP3'`
   * @see {@link GoogleTTSAudioEncoding}
   */
  audioEncoding?: GoogleTTSAudioEncoding;

  /**
   * Speaking rate multiplier, from `0.25` to `2.0` (v1 range is 0.25--4.0,
   * but values above 2.0 are increasingly unnatural). `1.0` is normal speed.
   *
   * @defaultValue `undefined` (API default, `1.0`)
   */
  speakingRate?: number;

  /**
   * Volume gain in dB, from `-96.0` to `16.0`. `0.0` is normal volume.
   *
   * @defaultValue `undefined` (API default, `0.0`)
   */
  volumeGainDb?: number;

  /**
   * Sample rate of the returned audio in Hz.
   *
   * @remarks
   * When omitted, the voice's native sample rate is used (typically 24000 Hz).
   *
   * @defaultValue `undefined` (voice's native sample rate)
   */
  sampleRateHertz?: number;

  /**
   * Audio effects profiles to post-process the audio for a playback device,
   * e.g. `['headphone-class-device']` or `['telephony-class-application']`.
   *
   * @defaultValue `undefined` (no effects profile)
   */
  effectsProfileId?: string[];

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link GoogleTTSAudioEncoding} values to their corresponding MIME types.
 *
 * @remarks
 * LINEAR16, MULAW, and ALAW audio returned by Google includes a WAV
 * container header, so all three are typed as `audio/wav`.
 *
 * @internal
 */
const ENCODING_MIME_TYPES: Record<GoogleTTSAudioEncoding, string> = {
  MP3: 'audio/mpeg',
  OGG_OPUS: 'audio/ogg',
  LINEAR16: 'audio/wav',
  MULAW: 'audio/wav',
  ALAW: 'audio/wav',
};

/** @internal Default Google Cloud Text-to-Speech API base URL. */
const GOOGLE_TTS_DEFAULT_URL = 'https://texttospeech.googleapis.com';

/**
 * Shape of the JSON response from Google's `POST /v1/text:synthesize` endpoint.
 *
 * @internal
 */
interface GoogleSynthesizeResponse {
  /** Base64-encoded audio data. */
  audioContent: string;
}

/**
 * Google Cloud TTS provider using native `fetch` for text-to-speech synthesis.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single HTTP
 * request to Google's `POST /v1/text:synthesize` endpoint. The API returns the
 * audio as base64-encoded JSON (`audioContent`), which this provider decodes
 * into a `Blob`.
 *
 * Input starting with `<speak` is sent as SSML (`input.ssml`); everything
 * else is sent as plain text (`input.text`). Use SSML for fine-grained
 * control over pronunciation, pauses, and prosody.
 *
 * Direct mode authenticates via the `X-goog-api-key` header; in proxy mode
 * the CompositeVoice proxy injects the key server-side (route `google-tts`,
 * configured with `googleCloudApiKey`).
 *
 * Audio flow: `Text -> Google Cloud TTS REST API (base64 JSON) -> Complete audio Blob`
 *
 * @example
 * ```typescript
 * import { GoogleTTS } from 'composite-voice';
 *
 * const tts = new GoogleTTS({
 *   apiKey: 'AIza...',
 *   languageCode: 'en-US',
 *   voiceName: 'en-US-Chirp3-HD-Kore',
 *   audioEncoding: 'MP3',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello, world!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link GoogleTTSConfig} - Configuration options for this provider.
 */
export class GoogleTTS extends RestTTSProvider {
  declare public config: GoogleTTSConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new GoogleTTS provider instance.
   *
   * @param config - Configuration for the Google Cloud TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: GoogleTTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the HTTP client for the Google Cloud TTS API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'GoogleTTS',
        new Error('GoogleTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    const baseUrl = this.resolveBaseUrl(GOOGLE_TTS_DEFAULT_URL);
    if (!baseUrl) throw new Error('Google Cloud TTS base URL could not be resolved');
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
      providerName: 'GoogleTTS',
    });

    this.logger.info('Google Cloud TTS initialized', {
      languageCode: this.config.languageCode ?? 'en-US',
      voiceName: this.config.voiceName,
      audioEncoding: this.config.audioEncoding ?? 'MP3',
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Google Cloud TTS disposed');
  }

  /**
   * Synthesizes text to audio using the Google Cloud TTS REST API.
   *
   * @param text - The text (or SSML, starting with `<speak`) to synthesize into speech.
   * @returns A `Blob` containing the synthesized audio in the configured encoding.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the Google Cloud TTS API request fails or returns no audio.
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('Google Cloud TTS client not initialized');
    }

    const languageCode = this.config.languageCode ?? 'en-US';
    const audioEncoding = this.config.audioEncoding ?? 'MP3';
    const isSsml = text.trimStart().startsWith('<speak');

    this.logger.debug('Google Cloud TTS synthesize request', {
      languageCode,
      voiceName: this.config.voiceName,
      audioEncoding,
      isSsml,
      textLength: text.length,
    });

    const voice: Record<string, unknown> = { languageCode };
    if (this.config.voiceName) voice.name = this.config.voiceName;
    if (this.config.ssmlGender) voice.ssmlGender = this.config.ssmlGender;

    const audioConfig: Record<string, unknown> = { audioEncoding };
    if (this.config.speakingRate != null) audioConfig.speakingRate = this.config.speakingRate;
    if (this.config.pitch != null) audioConfig.pitch = this.config.pitch;
    if (this.config.volumeGainDb != null) audioConfig.volumeGainDb = this.config.volumeGainDb;
    if (this.config.sampleRateHertz != null)
      audioConfig.sampleRateHertz = this.config.sampleRateHertz;
    if (this.config.effectsProfileId) audioConfig.effectsProfileId = this.config.effectsProfileId;

    const body = {
      input: isSsml ? { ssml: text } : { text },
      voice,
      audioConfig,
    };

    const response = await this.client.request('/v1/text:synthesize', { body });
    const data = (await response.json()) as GoogleSynthesizeResponse;

    if (!data.audioContent) {
      throw new Error('Google Cloud TTS response did not contain audio content');
    }

    const bytes = this.decodeBase64(data.audioContent);
    const mimeType = ENCODING_MIME_TYPES[audioEncoding];

    this.logger.debug('Google Cloud TTS synthesize complete', {
      audioBytes: bytes.byteLength,
    });

    return new Blob([bytes], { type: mimeType });
  }

  /**
   * Decodes a base64 string into raw bytes.
   *
   * @remarks
   * The Google Cloud TTS REST API returns audio base64-encoded in the
   * `audioContent` field rather than as raw bytes.
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
