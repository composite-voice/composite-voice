/**
 * Microsoft Azure Speech TTS provider using native `fetch`.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by Azure
 * AI Speech neural voices. Each call to `synthesize()` POSTs an SSML document
 * to the regional `cognitiveservices/v1` endpoint and returns the raw audio
 * bytes as a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Audio format: Configurable via `X-Microsoft-OutputFormat` (mp3, wav, ogg,
 * webm, raw pcm); default is `audio-24khz-48kbitrate-mono-mp3`
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
 * Supported Azure Speech TTS output formats.
 *
 * @remarks
 * A typed subset of the formats accepted by the `X-Microsoft-OutputFormat`
 * header. Each format encodes a container, sample rate, and bitrate:
 *
 * - `audio-*-mp3` -- MP3, best browser compatibility (default)
 * - `riff-*-pcm` -- WAV (RIFF container, 16-bit PCM), uncompressed
 * - `ogg-*-opus` -- Ogg Opus, good compression, open format
 * - `webm-*-opus` -- WebM Opus, good for MediaSource playback
 * - `raw-*-pcm` -- headerless 16-bit PCM for custom audio pipelines
 *
 * See the Azure "Text to speech REST API" documentation for the full list.
 */
export type AzureTTSOutputFormat =
  // MP3
  | 'audio-16khz-32kbitrate-mono-mp3'
  | 'audio-16khz-64kbitrate-mono-mp3'
  | 'audio-16khz-128kbitrate-mono-mp3'
  | 'audio-24khz-48kbitrate-mono-mp3'
  | 'audio-24khz-96kbitrate-mono-mp3'
  | 'audio-24khz-160kbitrate-mono-mp3'
  | 'audio-48khz-96kbitrate-mono-mp3'
  | 'audio-48khz-192kbitrate-mono-mp3'
  // WAV (RIFF)
  | 'riff-8khz-16bit-mono-pcm'
  | 'riff-22050hz-16bit-mono-pcm'
  | 'riff-24khz-16bit-mono-pcm'
  | 'riff-44100hz-16bit-mono-pcm'
  | 'riff-48khz-16bit-mono-pcm'
  // Ogg Opus
  | 'ogg-16khz-16bit-mono-opus'
  | 'ogg-24khz-16bit-mono-opus'
  | 'ogg-48khz-16bit-mono-opus'
  // WebM Opus
  | 'webm-16khz-16bit-mono-opus'
  | 'webm-24khz-16bit-24kbps-mono-opus'
  | 'webm-24khz-16bit-mono-opus'
  // Raw PCM
  | 'raw-16khz-16bit-mono-pcm'
  | 'raw-24khz-16bit-mono-pcm'
  | 'raw-48khz-16bit-mono-pcm';

/**
 * Configuration for the {@link AzureTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for a
 * server-side proxy). At least one must be set. If both are provided,
 * `proxyUrl` takes precedence and the key is not sent from the client.
 *
 * In direct mode, `region` is required (it selects the
 * `https://<region>.tts.speech.microsoft.com` endpoint) unless a custom
 * `endpoint` is configured. In proxy mode the region lives server-side in
 * the proxy configuration (`azureSpeechRegion`).
 *
 * Authentication in direct mode defaults to the `Ocp-Apim-Subscription-Key`
 * header with your Speech resource key. To use a short-lived bearer token
 * instead (recommended for browsers), pass an async `apiKey` factory that
 * fetches a token from your server (which calls Azure's
 * `POST https://<region>.api.cognitive.microsoft.com/sts/v1.0/issueToken`)
 * — factories are sent as `Authorization: Bearer` automatically. Set
 * `authType` explicitly to override either default.
 *
 * @example
 * ```typescript
 * // Direct API access with a resource key
 * const config: AzureTTSConfig = {
 *   apiKey: 'your-speech-resource-key',
 *   region: 'eastus',
 *   voiceName: 'en-US-AriaNeural',
 *   outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
 * };
 *
 * // Via proxy server (recommended for production)
 * const proxyConfig: AzureTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/azure-tts',
 *   voiceName: 'en-US-AriaNeural',
 * };
 * ```
 *
 * @see {@link AzureTTSOutputFormat} - Available audio format options.
 */
export interface AzureTTSConfig extends TTSProviderConfig {
  /**
   * The neural voice to use for synthesis (e.g. `'en-US-AriaNeural'`).
   *
   * @remarks
   * Required. List available voices via Azure's
   * `GET /tts/cognitiveservices/voices/list` endpoint or the "Language and
   * voice support" documentation.
   */
  voiceName: string;

  /**
   * Azure region of your Speech resource (e.g. `'eastus'`, `'westeurope'`).
   *
   * @remarks
   * Required in direct mode (ignored when `proxyUrl` or `endpoint` is set).
   * Selects the `https://<region>.tts.speech.microsoft.com` endpoint.
   */
  region?: string;

  /**
   * The audio output format sent via the `X-Microsoft-OutputFormat` header.
   *
   * @defaultValue `'audio-24khz-48kbitrate-mono-mp3'`
   * @see {@link AzureTTSOutputFormat}
   */
  outputFormat?: AzureTTSOutputFormat;

  /**
   * Language for the SSML `xml:lang` attribute (BCP 47, e.g. `'en-US'`).
   *
   * @remarks
   * When omitted, the locale is derived from `voiceName` (the first two
   * segments, e.g. `en-US-AriaNeural` -> `en-US`).
   */
  language?: string;

  /**
   * Speaking style applied via `<mstts:express-as>` (e.g. `'cheerful'`).
   *
   * @remarks
   * Only some neural voices support styles — check the voice's `StyleList`
   * in the voices-list response.
   */
  style?: string;

  /**
   * Intensity of the speaking style, from 0.01 to 2 (default 1).
   * Only used when {@link AzureTTSConfig.style | style} is set.
   */
  styleDegree?: number;

  /**
   * Speech rate multiplier applied via `<prosody rate>`.
   *
   * @remarks
   * `1.0` is normal speed; `1.5` renders as `+50.00%`, `0.8` as `-20.00%`.
   */
  rate?: number;

  /**
   * Pitch adjustment in semitones applied via `<prosody pitch>`.
   *
   * @remarks
   * `2` renders as `+2st`, `-3` as `-3st`.
   */
  pitch?: number;

  /**
   * Value for the `User-Agent` request header (application name).
   *
   * @remarks
   * The Azure REST docs list this header as required; browsers set their own
   * `User-Agent` automatically (and ignore this option), so it only takes
   * effect in server-side runtimes.
   */
  userAgent?: string;

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/** @internal Default Azure TTS output format. */
const DEFAULT_OUTPUT_FORMAT: AzureTTSOutputFormat = 'audio-24khz-48kbitrate-mono-mp3';

/** @internal Path of the Azure TTS synthesis endpoint. */
const AZURE_TTS_PATH = '/cognitiveservices/v1';

/**
 * Escape a string for safe interpolation into SSML/XML text content
 * or attribute values.
 *
 * @internal
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Map an {@link AzureTTSOutputFormat} to the MIME type of the returned audio.
 *
 * @internal
 */
function mimeTypeForFormat(format: string): string {
  if (format.includes('mp3')) return 'audio/mpeg';
  if (format.startsWith('riff')) return 'audio/wav';
  if (format.startsWith('ogg')) return 'audio/ogg';
  if (format.startsWith('webm')) return 'audio/webm';
  return 'application/octet-stream';
}

/**
 * Microsoft Azure Speech TTS provider using native `fetch`.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call POSTs an SSML
 * document (`Content-Type: application/ssml+xml`) to Azure's regional
 * `https://<region>.tts.speech.microsoft.com/cognitiveservices/v1` endpoint
 * and receives the complete audio bytes in the response body. The output
 * format is selected via the `X-Microsoft-OutputFormat` header.
 *
 * User text is XML-escaped before being embedded in the SSML document.
 * Speaking style (`<mstts:express-as>`) and rate/pitch (`<prosody>`) are
 * exposed as config options.
 *
 * Audio flow: `Text -> SSML -> Azure REST API -> Complete audio Blob`
 *
 * @example
 * ```typescript
 * import { AzureTTS } from 'composite-voice';
 *
 * const tts = new AzureTTS({
 *   apiKey: 'your-speech-resource-key',
 *   region: 'eastus',
 *   voiceName: 'en-US-AriaNeural',
 *   style: 'cheerful',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello, world!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link AzureTTSConfig} - Configuration options for this provider.
 * @see {@link AzureSTT} - The companion Azure real-time STT provider.
 */
export class AzureTTS extends RestTTSProvider {
  declare public config: AzureTTSConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new AzureTTS provider instance.
   *
   * @param config - Configuration for the Azure TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: AzureTTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the HTTP client for the Azure TTS API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if `voiceName` is not provided.
   * @throws {@link ProviderInitializationError} if direct mode is used without `region` or `endpoint`.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'AzureTTS',
        new Error('AzureTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.config.voiceName) {
      throw new ProviderInitializationError(
        'AzureTTS',
        new Error('AzureTTS requires "voiceName" to be configured (e.g. "en-US-AriaNeural").')
      );
    }

    if (!this.isProxyMode && !this.config.region && !this.config.endpoint) {
      throw new ProviderInitializationError(
        'AzureTTS',
        new Error('AzureTTS requires "region" (e.g. "eastus") in direct mode.')
      );
    }

    const defaultUrl = this.config.region
      ? `https://${this.config.region}.tts.speech.microsoft.com`
      : undefined;
    const baseUrl = this.resolveBaseUrl(defaultUrl);
    if (!baseUrl) throw new Error('Azure TTS base URL could not be resolved');

    const headers: Record<string, string> = {
      'content-type': 'application/ssml+xml',
      'x-microsoft-outputformat': this.config.outputFormat ?? DEFAULT_OUTPUT_FORMAT,
    };
    if (this.config.userAgent) {
      headers['user-agent'] = this.config.userAgent;
    }

    this.client = new HttpClient({
      baseUrl,
      headers,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 60000,
      logger: this.logger,
      providerName: 'AzureTTS',
    });

    this.logger.info('Azure TTS initialized', {
      region: this.config.region,
      voiceName: this.config.voiceName,
      outputFormat: this.config.outputFormat ?? DEFAULT_OUTPUT_FORMAT,
      hasProxy: !!this.config.proxyUrl,
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Azure TTS disposed');
  }

  /**
   * Resolve the authentication headers for a synthesis request.
   *
   * @remarks
   * Direct mode only (proxy mode injects the key server-side). Resolved per
   * request so async `apiKey` factories can return fresh 10-minute bearer
   * tokens. A string key is sent as `Ocp-Apim-Subscription-Key`; a factory
   * result is sent as `Authorization: Bearer` unless `authType` says
   * otherwise.
   *
   * @internal
   */
  private async resolveAuthHeaders(): Promise<Record<string, string>> {
    if (this.isProxyMode) return {};

    const key = await this.resolveApiKey();
    const useBearer =
      this.config.authType === 'bearer' ||
      (this.config.authType == null && typeof this.config.apiKey === 'function');

    return useBearer ? { authorization: `Bearer ${key}` } : { 'ocp-apim-subscription-key': key };
  }

  /**
   * Build the SSML document for the given text.
   *
   * @remarks
   * The user text is XML-escaped, then optionally wrapped in `<prosody>`
   * (rate/pitch) and `<mstts:express-as>` (style) elements inside the
   * `<voice>` element. The `xmlns:mstts` namespace is only declared when a
   * style is configured.
   *
   * @param text - The plain text to synthesize (will be escaped).
   * @returns The complete `<speak>` SSML document.
   *
   * @internal
   */
  private buildSsml(text: string): string {
    const language = this.config.language ?? this.deriveLanguageFromVoice() ?? 'en-US';

    let inner = escapeXml(text);

    if (this.config.rate != null || this.config.pitch != null) {
      const attrs: string[] = [];
      if (this.config.rate != null) {
        const percent = (this.config.rate - 1) * 100;
        attrs.push(`rate='${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%'`);
      }
      if (this.config.pitch != null) {
        attrs.push(`pitch='${this.config.pitch >= 0 ? '+' : ''}${this.config.pitch}st'`);
      }
      inner = `<prosody ${attrs.join(' ')}>${inner}</prosody>`;
    }

    if (this.config.style) {
      const degree =
        this.config.styleDegree != null ? ` styledegree='${this.config.styleDegree}'` : '';
      inner = `<mstts:express-as style='${escapeXml(this.config.style)}'${degree}>${inner}</mstts:express-as>`;
    }

    const msttsNs = this.config.style ? " xmlns:mstts='https://www.w3.org/2001/mstts'" : '';

    return (
      `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis'${msttsNs} xml:lang='${escapeXml(language)}'>` +
      `<voice name='${escapeXml(this.config.voiceName)}'>${inner}</voice>` +
      `</speak>`
    );
  }

  /**
   * Derive the SSML locale from the configured voice name.
   *
   * @remarks
   * Azure voice names embed their locale as the first two hyphen-separated
   * segments (e.g. `en-US-AriaNeural` -> `en-US`).
   *
   * @internal
   */
  private deriveLanguageFromVoice(): string | undefined {
    const parts = this.config.voiceName?.split('-');
    if (parts && parts.length >= 3) {
      return `${parts[0]}-${parts[1]}`;
    }
    return undefined;
  }

  /**
   * Synthesizes text to audio using the Azure Speech TTS REST API.
   *
   * @param text - The text to synthesize into speech. It is XML-escaped and
   *   embedded in an SSML document.
   * @returns A `Blob` containing the synthesized audio in the configured format.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the Azure API request fails or returns no audio.
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('Azure TTS client not initialized');
    }

    const outputFormat = this.config.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
    const ssml = this.buildSsml(text);

    this.logger.debug('Azure TTS synthesize request', {
      voiceName: this.config.voiceName,
      outputFormat,
      textLength: text.length,
    });

    const response = await this.client.request(AZURE_TTS_PATH, {
      body: ssml,
      headers: await this.resolveAuthHeaders(),
    });

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0) {
      throw new Error('Azure TTS response did not contain audio data');
    }

    this.logger.debug('Azure TTS synthesize complete', {
      audioBytes: bytes.byteLength,
    });

    return new Blob([bytes], { type: mimeTypeForFormat(outputFormat) });
  }
}
