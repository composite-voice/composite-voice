/**
 * OpenAI TTS provider using the official OpenAI SDK.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by
 * OpenAI's TTS models (`tts-1` and `tts-1-hd`). Each call to `synthesize()`
 * makes a single HTTP request and returns the complete audio as a `Blob`.
 *
 * Transport: REST (HTTP POST via `openai` SDK)
 * Audio format: Configurable (mp3, opus, aac, flac, wav); default is `mp3`
 *
 * The `openai` package is a peer dependency and must be installed separately.
 *
 * @packageDocumentation
 */

import { RestTTSProvider } from '../../base/RestTTSProvider';
import type { TTSProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError } from '../../../utils/errors';

// Type-safe imports for optional peer dependency
type OpenAI = typeof import('openai').default;
type OpenAIInstance = InstanceType<OpenAI>;

/**
 * Supported OpenAI TTS voice identifiers.
 *
 * @remarks
 * Each voice has distinct characteristics. Preview them in the
 * {@link https://platform.openai.com/docs/guides/text-to-speech | OpenAI TTS Guide}.
 */
export type OpenAITTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/**
 * Supported OpenAI TTS audio output formats.
 *
 * @remarks
 * The format affects both file size and audio quality.
 * - `mp3` -- Good compression, widely supported (default)
 * - `opus` -- Best for streaming and low latency
 * - `aac` -- Good for mobile devices
 * - `flac` -- Lossless compression
 * - `wav` -- Uncompressed, highest quality
 */
export type OpenAITTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';

/**
 * Configuration for the {@link OpenAITTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: OpenAITTSConfig = {
 *   apiKey: 'sk-xxxxxxxxxxxx',
 *   model: 'tts-1',
 *   voice: 'nova',
 *   responseFormat: 'mp3',
 *   speed: 1.0,
 * };
 *
 * // Via proxy server
 * const proxyConfig: OpenAITTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/openai',
 *   model: 'tts-1-hd',
 *   voice: 'alloy',
 * };
 * ```
 *
 * @see {@link OpenAITTSVoice} - Available voice options.
 * @see {@link OpenAITTSFormat} - Available audio format options.
 */
export interface OpenAITTSConfig extends TTSProviderConfig {
  /**
   * The TTS model to use.
   *
   * @remarks
   * - `'tts-1'` -- Optimized for speed and low latency
   * - `'tts-1-hd'` -- Optimized for audio quality
   *
   * @defaultValue `'tts-1'`
   */
  model?: string;

  /**
   * The voice to use for synthesis.
   *
   * @defaultValue `'alloy'`
   * @see {@link OpenAITTSVoice}
   */
  voice?: OpenAITTSVoice;

  /**
   * The audio output format.
   *
   * @defaultValue `'mp3'`
   * @see {@link OpenAITTSFormat}
   */
  responseFormat?: OpenAITTSFormat;

  /**
   * Speech speed multiplier.
   *
   * @remarks
   * Accepted range is 0.25 to 4.0, where 1.0 is normal speed.
   *
   * @defaultValue `1.0`
   */
  speed?: number;

  /**
   * OpenAI organization ID for billing attribution.
   *
   * @defaultValue `undefined`
   */
  organizationId?: string;

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link OpenAITTSFormat} values to their corresponding MIME types.
 *
 * @internal
 */
const FORMAT_MIME_TYPES: Record<OpenAITTSFormat, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
};

/**
 * OpenAI TTS provider using the official OpenAI SDK for text-to-speech synthesis.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single HTTP request
 * to the OpenAI TTS API and returns the complete audio response as a `Blob`. It supports
 * both the standard `tts-1` (fast) and `tts-1-hd` (high quality) models, with six
 * available voices and five audio formats.
 *
 * The lifecycle is:
 * 1. Construct with {@link OpenAITTSConfig}
 * 2. Call `initialize()` to load the OpenAI SDK and create the client
 * 3. Call `synthesize(text)` to convert text to audio
 * 4. Call `dispose()` to release resources
 *
 * Audio flow: `Text -> OpenAI REST API -> Complete audio Blob`
 *
 * @example
 * ```typescript
 * import { OpenAITTS } from 'composite-voice';
 *
 * const tts = new OpenAITTS({
 *   apiKey: 'sk-xxxxxxxxxxxx',
 *   model: 'tts-1',
 *   voice: 'nova',
 *   responseFormat: 'mp3',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello, world!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link OpenAITTSConfig} - Configuration options for this provider.
 */
export class OpenAITTS extends RestTTSProvider {
  declare public config: OpenAITTSConfig;
  private client: OpenAIInstance | null = null;

  /**
   * Creates a new OpenAITTS provider instance.
   *
   * @param config - Configuration for the OpenAI TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   *
   * @example
   * ```typescript
   * const tts = new OpenAITTS({
   *   apiKey: 'sk-xxxxxxxxxxxx',
   *   voice: 'alloy',
   * });
   * ```
   */
  constructor(config: OpenAITTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the OpenAI client by dynamically importing the SDK.
   *
   * @remarks
   * The `openai` package is loaded dynamically as a peer dependency. If using
   * `proxyUrl`, the client is configured with a placeholder API key and the
   * proxy URL as the base URL. The client is created with
   * `dangerouslyAllowBrowser: true` to enable browser usage.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if the `openai` package is not installed.
   * @throws {@link ProviderInitializationError} if any other initialization error occurs.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'OpenAITTS',
        new Error('OpenAITTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    try {
      // Dynamically import OpenAI SDK (peer dependency)
      const OpenAIModule = await import('openai');
      const OpenAI = OpenAIModule.default;

      const baseURL = this.resolveBaseUrl();
      const apiKey = this.resolveApiKey();

      // Initialize OpenAI client
      this.client = new OpenAI({
        apiKey,
        organization: this.config.organizationId,
        baseURL,
        maxRetries: this.config.maxRetries ?? 3,
        timeout: this.config.timeout ?? 60000,
        dangerouslyAllowBrowser: true,
      });

      this.logger.info('OpenAI TTS initialized', {
        model: this.config.model ?? 'tts-1',
        voice: this.config.voice ?? 'alloy',
        responseFormat: this.config.responseFormat ?? 'mp3',
      });
    } catch (error) {
      if ((error as Error).message?.includes('Cannot find module')) {
        throw new ProviderInitializationError(
          'OpenAITTS',
          new Error(
            'OpenAI SDK not found. Install with: npm install openai\n' +
              'The OpenAI SDK is a peer dependency and must be installed separately.'
          )
        );
      }
      throw new ProviderInitializationError('OpenAITTS', error as Error);
    }
  }

  /**
   * Disposes the provider and releases the OpenAI client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('OpenAI TTS disposed');
  }

  /**
   * Synthesizes text to audio using the OpenAI TTS REST API.
   *
   * @remarks
   * Makes a single HTTP POST request to the OpenAI `audio.speech.create` endpoint.
   * The complete audio response is returned as a `Blob` with the appropriate MIME type
   * based on the configured `responseFormat`.
   *
   * @param text - The text to synthesize into speech. Maximum length depends on the
   *   OpenAI API limits (currently 4096 characters).
   * @returns A `Blob` containing the synthesized audio in the configured format.
   *
   * @throws Error if the provider is not initialized or the OpenAI client is null.
   * @throws Error if the OpenAI API request fails (network error, rate limit, etc.).
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const model = this.config.model ?? 'tts-1';
    const voice = this.config.voice ?? 'alloy';
    const responseFormat = this.config.responseFormat ?? 'mp3';

    this.logger.debug('OpenAI TTS synthesize request', {
      model,
      voice,
      responseFormat,
      textLength: text.length,
    });

    const params: Parameters<OpenAIInstance['audio']['speech']['create']>[0] = {
      model,
      voice,
      input: text,
      response_format: responseFormat,
    };

    if (this.config.speed != null) {
      params.speed = this.config.speed;
    }

    const response = await this.client.audio.speech.create(params);

    const arrayBuffer = await response.arrayBuffer();
    const mimeType = FORMAT_MIME_TYPES[responseFormat];

    this.logger.debug('OpenAI TTS synthesize complete', {
      audioBytes: arrayBuffer.byteLength,
    });

    return new Blob([arrayBuffer], { type: mimeType });
  }
}
