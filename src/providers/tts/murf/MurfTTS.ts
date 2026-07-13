/**
 * Murf AI TTS provider using native `fetch`.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by
 * Murf AI's Gen2 speech model. Each call to `synthesize()` makes a single
 * HTTP request to the Murf API and returns the complete audio as a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Audio format: Configurable (mp3, wav, flac, alaw, ulaw); default is `mp3`
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
 * Supported Murf TTS model versions.
 *
 * @remarks
 * - `'GEN2'` -- Murf's current generation model (default). Outputs sound more
 *   natural and higher quality than earlier generations.
 */
export type MurfTTSModelVersion = 'GEN2';

/**
 * Supported Murf TTS audio output formats.
 *
 * @remarks
 * The format affects both file size and audio quality.
 * - `mp3` -- Good compression, widely supported (default)
 * - `wav` -- Uncompressed, highest quality
 * - `flac` -- Lossless compression
 * - `alaw` -- A-law telephony encoding
 * - `ulaw` -- u-law telephony encoding
 */
export type MurfTTSFormat = 'mp3' | 'wav' | 'flac' | 'alaw' | 'ulaw';

/**
 * Supported Murf TTS output sample rates in Hz.
 */
export type MurfTTSSampleRate = 8000 | 24000 | 44100 | 48000;

/**
 * Supported Murf TTS channel types.
 */
export type MurfTTSChannelType = 'MONO' | 'STEREO';

/**
 * Configuration for the {@link MurfTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client. The `voiceId` is always required.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: MurfTTSConfig = {
 *   apiKey: 'your-murf-api-key',
 *   voiceId: 'en-US-natalie',
 *   format: 'mp3',
 *   style: 'Conversational',
 * };
 *
 * // Via proxy server
 * const proxyConfig: MurfTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/murf',
 *   voiceId: 'en-US-natalie',
 * };
 * ```
 *
 * @see {@link MurfTTSModelVersion} - Available model version options.
 * @see {@link MurfTTSFormat} - Available audio format options.
 */
export interface MurfTTSConfig extends TTSProviderConfig {
  /**
   * The voice to use for synthesis.
   *
   * @remarks
   * Required. Murf voice IDs follow a `{locale}-{name}` pattern
   * (e.g. `'en-US-natalie'`). List available voices via Murf's
   * `GET /v1/speech/voices` endpoint.
   */
  voiceId: string;

  /**
   * The Murf model generation used for synthesis.
   *
   * @defaultValue `'GEN2'`
   * @see {@link MurfTTSModelVersion}
   */
  modelVersion?: MurfTTSModelVersion;

  /**
   * The audio output format.
   *
   * @defaultValue `'mp3'`
   * @see {@link MurfTTSFormat}
   */
  format?: MurfTTSFormat;

  /**
   * Sample rate of the output audio in Hz.
   *
   * @remarks
   * Murf supports 8000, 24000, 44100, and 48000 Hz.
   *
   * @defaultValue `undefined` (Murf's server default, 44100 Hz)
   */
  sampleRate?: MurfTTSSampleRate;

  /**
   * Channel type of the output audio.
   *
   * @defaultValue `undefined` (Murf's server default, `'MONO'`)
   */
  channelType?: MurfTTSChannelType;

  /**
   * Speaking style for the voice.
   *
   * @remarks
   * Available styles vary per voice (e.g. `'Conversational'`, `'Promo'`).
   * Check the voice's supported styles via Murf's voices endpoint.
   *
   * @defaultValue `undefined` (the voice's default style)
   */
  style?: string;

  /**
   * Speech rate adjustment.
   *
   * @remarks
   * An integer from -50 (slowest) to 50 (fastest), where 0 is normal speed.
   * Note: Murf uses this -50..50 scale rather than the generic multiplier
   * documented on the base TTS config.
   *
   * @defaultValue `undefined` (normal speed)
   */
  rate?: number;

  /**
   * Voice pitch adjustment.
   *
   * @remarks
   * An integer from -50 (lowest) to 50 (highest), where 0 is the voice's
   * natural pitch. Note: Murf uses this -50..50 scale rather than the
   * semitone scale documented on the base TTS config.
   *
   * @defaultValue `undefined` (natural pitch)
   */
  pitch?: number;

  /**
   * Variation in pause, pitch, and speed across the generated speech.
   *
   * @remarks
   * An integer from 0 (least variation) to 5 (most variation).
   *
   * @defaultValue `undefined` (Murf's server default, 1)
   */
  variation?: number;

  /**
   * Locale of the input text for native multilingual synthesis.
   *
   * @remarks
   * A language code such as `'en-US'` or `'es-ES'`. When omitted, the
   * voice's native locale is used.
   *
   * @defaultValue `undefined` (the voice's native locale)
   */
  locale?: string;

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link MurfTTSFormat} values to their corresponding MIME types.
 *
 * @internal
 */
const FORMAT_MIME_TYPES: Record<MurfTTSFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  alaw: 'audio/alaw',
  ulaw: 'audio/mulaw',
};

/**
 * Maps {@link MurfTTSFormat} values to the uppercase identifiers expected by
 * the Murf API's `format` field.
 *
 * @internal
 */
const FORMAT_API_VALUES: Record<MurfTTSFormat, string> = {
  mp3: 'MP3',
  wav: 'WAV',
  flac: 'FLAC',
  alaw: 'ALAW',
  ulaw: 'ULAW',
};

/** @internal Default Murf API base URL. */
const MURF_DEFAULT_URL = 'https://api.murf.ai';

/**
 * Shape of the JSON response from Murf's `POST /v1/speech/generate` endpoint.
 *
 * @internal
 */
interface MurfGenerateResponse {
  /** Base64-encoded audio data (present when `encodeAsBase64: true`). */
  encodedAudio?: string;
  /** URL of the generated audio file (present when `encodeAsBase64` is off). */
  audioFile?: string;
  /** Length of the generated audio in seconds. */
  audioLengthInSeconds?: number;
  /** Characters remaining in the account's quota. */
  remainingCharacterCount?: number;
  /** Warning message, if any. */
  warning?: string;
}

/**
 * Murf AI TTS provider using native `fetch` for text-to-speech synthesis.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single HTTP
 * request to Murf's `POST /v1/speech/generate` endpoint with
 * `encodeAsBase64: true`, so the API returns the audio as base64-encoded JSON,
 * which this provider decodes into a `Blob` without a second request. If the
 * API returns an `audioFile` URL instead, the provider fetches it as a
 * fallback. Synthesis uses Murf's Gen2 model by default.
 *
 * Audio flow: `Text -> Murf REST API (base64 JSON) -> Complete audio Blob`
 *
 * @example
 * ```typescript
 * import { MurfTTS } from 'composite-voice';
 *
 * const tts = new MurfTTS({
 *   apiKey: 'your-murf-api-key',
 *   voiceId: 'en-US-natalie',
 *   format: 'mp3',
 *   style: 'Conversational',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello, world!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link MurfTTSConfig} - Configuration options for this provider.
 */
export class MurfTTS extends RestTTSProvider {
  declare public config: MurfTTSConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new MurfTTS provider instance.
   *
   * @param config - Configuration for the Murf TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: MurfTTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the HTTP client for the Murf TTS API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if `voiceId` is not provided.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'MurfTTS',
        new Error('MurfTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.config.voiceId) {
      throw new ProviderInitializationError(
        'MurfTTS',
        new Error('MurfTTS requires "voiceId" to be configured.')
      );
    }

    const baseUrl = this.resolveBaseUrl(MURF_DEFAULT_URL);
    if (!baseUrl) throw new Error('Murf TTS base URL could not be resolved');
    const apiKey = await this.resolveApiKey();

    const headers: Record<string, string> = {};

    if (!this.isProxyMode) {
      headers['api-key'] = apiKey;
    }

    this.client = new HttpClient({
      baseUrl,
      headers,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 60000,
      logger: this.logger,
      providerName: 'MurfTTS',
    });

    this.logger.info('Murf TTS initialized', {
      voiceId: this.config.voiceId,
      modelVersion: this.config.modelVersion ?? 'GEN2',
      format: this.config.format ?? 'mp3',
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Murf TTS disposed');
  }

  /**
   * Synthesizes text to audio using the Murf TTS REST API.
   *
   * @param text - The text to synthesize into speech.
   * @returns A `Blob` containing the synthesized audio in the configured format.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the Murf API request fails or returns no audio.
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('Murf TTS client not initialized');
    }

    const modelVersion = this.config.modelVersion ?? 'GEN2';
    const format = this.config.format ?? 'mp3';

    this.logger.debug('Murf TTS synthesize request', {
      modelVersion,
      voiceId: this.config.voiceId,
      format,
      textLength: text.length,
    });

    const body: Record<string, unknown> = {
      text,
      voiceId: this.config.voiceId,
      modelVersion,
      format: FORMAT_API_VALUES[format],
      encodeAsBase64: true,
    };

    if (this.config.sampleRate != null) body.sampleRate = this.config.sampleRate;
    if (this.config.channelType != null) body.channelType = this.config.channelType;
    if (this.config.style != null) body.style = this.config.style;
    if (this.config.rate != null) body.rate = this.config.rate;
    if (this.config.pitch != null) body.pitch = this.config.pitch;
    if (this.config.variation != null) body.variation = this.config.variation;
    if (this.config.locale != null) body.locale = this.config.locale;

    const response = await this.client.request('/v1/speech/generate', { body });
    const data = (await response.json()) as MurfGenerateResponse;

    const mimeType = FORMAT_MIME_TYPES[format];

    if (data.encodedAudio) {
      const bytes = this.decodeBase64(data.encodedAudio);

      this.logger.debug('Murf TTS synthesize complete', {
        audioBytes: bytes.byteLength,
        audioLengthInSeconds: data.audioLengthInSeconds,
        remainingCharacterCount: data.remainingCharacterCount,
      });

      return new Blob([bytes], { type: mimeType });
    }

    if (data.audioFile) {
      // Fallback: the API returned a URL instead of inline base64 audio.
      const blob = await this.fetchAudioFile(data.audioFile, mimeType);

      this.logger.debug('Murf TTS synthesize complete (fetched audio file)', {
        audioBytes: blob.size,
        audioLengthInSeconds: data.audioLengthInSeconds,
        remainingCharacterCount: data.remainingCharacterCount,
      });

      return blob;
    }

    throw new Error('Murf TTS response did not contain audio data');
  }

  /**
   * Downloads a generated audio file from the URL returned by the Murf API.
   *
   * @remarks
   * Only used as a fallback when the response lacks inline base64 audio.
   * The audio file URL is pre-signed, so no auth headers are sent.
   */
  private async fetchAudioFile(url: string, mimeType: string): Promise<Blob> {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Murf TTS audio file download failed with status ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    return new Blob([buffer], { type: mimeType });
  }

  /**
   * Decodes a base64 string into raw bytes.
   *
   * @remarks
   * With `encodeAsBase64: true`, the Murf REST API returns audio
   * base64-encoded in the `encodedAudio` field rather than as raw bytes.
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
