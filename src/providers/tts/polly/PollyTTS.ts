/**
 * Amazon Polly TTS provider using native `fetch` with SigV4 request signing.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by
 * Amazon Polly. Each call to `synthesize()` makes a single SigV4-signed
 * HTTP request to Polly's `SynthesizeSpeech` endpoint and returns the raw
 * audio bytes as a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Audio format: Configurable (mp3, ogg_vorbis, ogg_opus, pcm); default is `mp3`
 *
 * No AWS SDK dependency required — signing is implemented locally with
 * WebCrypto (see {@link signAwsRequestHeaders}).
 *
 * @packageDocumentation
 */

import { RestTTSProvider } from '../../base/RestTTSProvider';
import type { TTSProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { HttpClient } from '../../../utils/http';
import { ProviderInitializationError } from '../../../utils/errors';
import {
  signAwsRequestHeaders,
  resolveAwsCredentials,
  type AwsCredentialsProvider,
} from '../../../utils/aws/sigv4';

/**
 * Amazon Polly synthesis engines.
 *
 * @remarks
 * - `'neural'` -- Neural TTS voices, high quality (default)
 * - `'generative'` -- Most human-like, generative voices
 * - `'long-form'` -- Optimized for long-form content (articles, training)
 * - `'standard'` -- Legacy concatenative voices, lowest cost
 *
 * Each voice supports a subset of engines — see the
 * {@link https://docs.aws.amazon.com/polly/latest/dg/voicelist.html | Polly voice list}.
 */
export type PollyEngine = 'neural' | 'generative' | 'long-form' | 'standard';

/**
 * Supported Amazon Polly audio output formats.
 *
 * @remarks
 * - `mp3` -- Good compression, widely supported (default)
 * - `ogg_vorbis` -- Good compression, open format
 * - `ogg_opus` -- Modern low-latency codec (48 kHz only)
 * - `pcm` -- Raw signed 16-bit little-endian mono samples
 */
export type PollyOutputFormat = 'mp3' | 'ogg_vorbis' | 'ogg_opus' | 'pcm';

/**
 * Configuration for the {@link PollyTTS} provider.
 *
 * @remarks
 * Provide either `credentials` + `region` (for direct AWS access) or
 * `proxyUrl` (for a server-side proxy that SigV4-signs upstream requests).
 * At least one must be set. If both are provided, `proxyUrl` takes
 * precedence and no credentials are used client-side.
 *
 * For browsers, prefer `proxyUrl`, or pass an async `credentials` factory
 * that fetches **temporary** credentials (STS/Cognito) from your backend —
 * never embed long-lived AWS keys in client code.
 *
 * @example
 * ```typescript
 * // Server-side with static credentials
 * const config: PollyTTSConfig = {
 *   credentials: {
 *     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
 *     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
 *   },
 *   region: 'us-east-1',
 *   voiceId: 'Joanna',
 *   engine: 'neural',
 * };
 *
 * // Browser with temporary credentials from your backend
 * const browserConfig: PollyTTSConfig = {
 *   credentials: async () => (await fetch('/api/aws-credentials')).json(),
 *   region: 'us-east-1',
 *   voiceId: 'Joanna',
 * };
 *
 * // Via proxy server (recommended for production browsers)
 * const proxyConfig: PollyTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/polly',
 *   voiceId: 'Joanna',
 * };
 * ```
 *
 * @see {@link PollyEngine} - Available engine options.
 * @see {@link PollyOutputFormat} - Available audio format options.
 */
export interface PollyTTSConfig extends TTSProviderConfig {
  /**
   * AWS credentials, static or as an async factory.
   *
   * @remarks
   * Required in direct mode (no `proxyUrl`). Pass a factory to fetch fresh
   * temporary credentials (STS/Cognito) on each request — the browser-safe
   * pattern, mirroring the SDK's async `apiKey` factories.
   */
  credentials?: AwsCredentialsProvider;

  /**
   * AWS region hosting the Polly endpoint (e.g. `'us-east-1'`).
   *
   * @remarks
   * Required in direct mode; ignored in proxy mode (the proxy holds the region).
   */
  region?: string;

  /**
   * Voice ID to use for synthesis (e.g. `'Joanna'`, `'Matthew'`, `'Amy'`).
   *
   * @remarks
   * Required. List available voices with Polly's `DescribeVoices` API, and
   * check which engines each voice supports.
   */
  voiceId: string;

  /**
   * The synthesis engine.
   *
   * @defaultValue `'neural'`
   * @see {@link PollyEngine}
   */
  engine?: PollyEngine;

  /**
   * The audio output format.
   *
   * @defaultValue `'mp3'`
   * @see {@link PollyOutputFormat}
   */
  outputFormat?: PollyOutputFormat;

  /**
   * Audio sample rate in Hz.
   *
   * @remarks
   * Valid values depend on `outputFormat`: 8000–48000 for `mp3` /
   * `ogg_vorbis`, 8000 or 16000 for `pcm`, 48000 for `ogg_opus`.
   * When omitted, Polly uses its engine-specific default (24000 for
   * neural/generative/long-form, 22050 for standard).
   */
  sampleRate?: number;

  /**
   * Whether the input is plain text or SSML.
   *
   * @defaultValue `'text'`
   */
  textType?: 'text' | 'ssml';

  /**
   * Optional language code for bilingual voices (e.g. `'en-IN'` vs `'hi-IN'`
   * for Aditi). Most voices don't need this.
   */
  languageCode?: string;

  /**
   * Pronunciation lexicon names (max 5) to apply during synthesis.
   *
   * @see {@link https://docs.aws.amazon.com/polly/latest/dg/API_PutLexicon.html | PutLexicon}
   */
  lexiconNames?: string[];

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link PollyOutputFormat} values to their corresponding MIME types.
 *
 * @internal
 */
const FORMAT_MIME_TYPES: Record<PollyOutputFormat, string> = {
  mp3: 'audio/mpeg',
  ogg_vorbis: 'audio/ogg',
  ogg_opus: 'audio/ogg',
  pcm: 'audio/pcm',
};

/** @internal Polly SynthesizeSpeech REST path. */
const POLLY_SPEECH_PATH = '/v1/speech';

/**
 * Amazon Polly TTS provider using native `fetch` with SigV4-signed requests.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single
 * HTTP request to Polly's `POST /v1/speech` (`SynthesizeSpeech`) endpoint,
 * which returns the synthesized audio as raw bytes. Requests are signed
 * with AWS Signature Version 4 using the SDK's built-in WebCrypto signer —
 * no AWS SDK required.
 *
 * Speech input may be plain text or SSML (`textType: 'ssml'`) — prosody,
 * breaks, and pronunciation are controlled via SSML tags.
 *
 * Audio flow: `Text -> Polly SynthesizeSpeech (SigV4) -> raw audio bytes -> Blob`
 *
 * **Auth modes:**
 * - **Direct** — `credentials` + `region`; each request is SigV4-signed
 *   client-side. Use an async `credentials` factory for temporary
 *   STS/Cognito credentials in browsers.
 * - **Proxy** — `proxyUrl`; the request is sent unsigned to your
 *   CompositeVoice proxy, which signs it server-side with its own AWS
 *   credentials (see the proxy `aws` config).
 *
 * @example
 * ```typescript
 * import { PollyTTS } from 'composite-voice';
 *
 * const tts = new PollyTTS({
 *   credentials: { accessKeyId: '...', secretAccessKey: '...' },
 *   region: 'us-east-1',
 *   voiceId: 'Joanna',
 *   engine: 'neural',
 *   outputFormat: 'mp3',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello from Amazon Polly!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link PollyTTSConfig} - Configuration options for this provider.
 * @see {@link TranscribeSTT} - The matching AWS speech-to-text provider.
 */
export class PollyTTS extends RestTTSProvider {
  declare public config: PollyTTSConfig;
  private client: HttpClient | null = null;
  private baseUrl = '';

  /**
   * Creates a new PollyTTS provider instance.
   *
   * @param config - Configuration for the Polly TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: PollyTTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the HTTP client for the Amazon Polly API.
   *
   * @throws {@link ProviderInitializationError} if neither `credentials` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if `region` is missing in direct mode.
   * @throws {@link ProviderInitializationError} if `voiceId` is not provided.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.credentials && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'PollyTTS',
        new Error('PollyTTS requires either "credentials" or "proxyUrl" to be configured.')
      );
    }

    if (!this.isProxyMode && !this.config.region) {
      throw new ProviderInitializationError(
        'PollyTTS',
        new Error('PollyTTS requires "region" when using direct AWS credentials.')
      );
    }

    if (!this.config.voiceId) {
      throw new ProviderInitializationError(
        'PollyTTS',
        new Error('PollyTTS requires "voiceId" to be configured.')
      );
    }

    const baseUrl = this.resolveBaseUrl(`https://polly.${this.config.region}.amazonaws.com`);
    if (!baseUrl) throw new Error('Polly TTS base URL could not be resolved');
    this.baseUrl = baseUrl.replace(/\/$/, '');

    this.client = new HttpClient({
      baseUrl: this.baseUrl,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 60000,
      logger: this.logger,
      providerName: 'PollyTTS',
    });

    this.logger.info('Polly TTS initialized', {
      voiceId: this.config.voiceId,
      engine: this.config.engine ?? 'neural',
      outputFormat: this.config.outputFormat ?? 'mp3',
      region: this.config.region,
      hasProxy: !!this.config.proxyUrl,
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Polly TTS disposed');
  }

  /**
   * Synthesizes text to audio using Amazon Polly's `SynthesizeSpeech` API.
   *
   * @remarks
   * In direct mode, the request is SigV4-signed per call so async
   * `credentials` factories always contribute fresh temporary credentials.
   * In proxy mode, the unsigned request is sent to the proxy, which signs it.
   *
   * @param text - The text (or SSML, when `textType: 'ssml'`) to synthesize.
   * @returns A `Blob` containing the synthesized audio in the configured format.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the Polly API request fails (e.g. `EngineNotSupportedException`).
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('Polly TTS client not initialized');
    }

    const engine = this.config.engine ?? 'neural';
    const outputFormat = this.config.outputFormat ?? 'mp3';

    this.logger.debug('Polly TTS synthesize request', {
      engine,
      voiceId: this.config.voiceId,
      outputFormat,
      textLength: text.length,
    });

    const body: Record<string, unknown> = {
      Text: text,
      TextType: this.config.textType ?? 'text',
      VoiceId: this.config.voiceId,
      Engine: engine,
      OutputFormat: outputFormat,
    };

    if (this.config.sampleRate != null) {
      // Polly's API models SampleRate as a string
      body.SampleRate = String(this.config.sampleRate);
    }

    if (this.config.languageCode) {
      body.LanguageCode = this.config.languageCode;
    }

    if (this.config.lexiconNames && this.config.lexiconNames.length > 0) {
      body.LexiconNames = this.config.lexiconNames;
    }

    let headers: Record<string, string> | undefined;
    if (!this.isProxyMode) {
      // Sign the exact JSON bytes HttpClient will send. JSON.stringify is
      // deterministic for a given object, so serializing here for the
      // signature and again inside HttpClient yields identical bytes.
      const credentials = await resolveAwsCredentials(
        this.config.credentials as AwsCredentialsProvider
      );
      headers = await signAwsRequestHeaders({
        method: 'POST',
        url: `${this.baseUrl}${POLLY_SPEECH_PATH}`,
        service: 'polly',
        region: this.config.region as string,
        credentials,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    }

    const response = await this.client.request(POLLY_SPEECH_PATH, {
      body,
      ...(headers ? { headers } : {}),
    });

    const audio = await response.arrayBuffer();
    if (audio.byteLength === 0) {
      throw new Error('Polly TTS response did not contain audio data');
    }

    this.logger.debug('Polly TTS synthesize complete', {
      audioBytes: audio.byteLength,
      requestCharacters: response.headers.get('x-amzn-requestcharacters'),
    });

    return new Blob([audio], { type: FORMAT_MIME_TYPES[outputFormat] });
  }
}
