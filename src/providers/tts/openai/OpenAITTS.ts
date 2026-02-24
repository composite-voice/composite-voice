/**
 * OpenAI TTS provider using the official OpenAI SDK
 */

import { RestTTSProvider } from '../../base/RestTTSProvider';
import type { TTSProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError } from '../../../utils/errors';

// Type-safe imports for optional peer dependency
type OpenAI = typeof import('openai').default;
type OpenAIInstance = InstanceType<OpenAI>;

/** Supported OpenAI TTS voices */
export type OpenAITTSVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/** Supported OpenAI TTS audio formats */
export type OpenAITTSFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav';

/**
 * OpenAI TTS provider configuration.
 * Provide either `apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set; if both are provided `proxyUrl` takes precedence.
 */
export interface OpenAITTSConfig extends TTSProviderConfig {
  /**
   * OpenAI API key.
   * Required when connecting directly to OpenAI.
   * Omit when using `proxyUrl` — the proxy server supplies the key.
   */
  apiKey?: string;
  /**
   * URL of the CompositeVoice proxy server's OpenAI endpoint.
   * Example: `'http://localhost:3000/api/proxy/openai'`
   */
  proxyUrl?: string;
  /** TTS model: 'tts-1' (fast) or 'tts-1-hd' (quality). Default: 'tts-1' */
  model?: string;
  /** Voice to use. Default: 'alloy' */
  voice?: OpenAITTSVoice;
  /** Audio output format. Default: 'mp3' */
  responseFormat?: OpenAITTSFormat;
  /** Speech speed (0.25 to 4.0). Default: 1.0 */
  speed?: number;
  /** Organization ID (optional) */
  organizationId?: string;
  /** Base URL for API (optional, for custom endpoints — use `proxyUrl` for proxy) */
  baseURL?: string;
  /** Maximum retries for failed requests */
  maxRetries?: number;
}

/** Map response format to MIME type */
const FORMAT_MIME_TYPES: Record<OpenAITTSFormat, string> = {
  mp3: 'audio/mpeg',
  opus: 'audio/opus',
  aac: 'audio/aac',
  flac: 'audio/flac',
  wav: 'audio/wav',
};

/**
 * OpenAI TTS provider
 * Uses the official OpenAI SDK for text-to-speech synthesis
 */
export class OpenAITTS extends RestTTSProvider {
  declare public config: OpenAITTSConfig;
  private client: OpenAIInstance | null = null;

  constructor(config: OpenAITTSConfig, logger?: Logger) {
    super(config, logger);
  }

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

      const baseURL = this.config.proxyUrl ?? this.config.baseURL;
      const apiKey = this.config.proxyUrl ? 'proxy' : (this.config.apiKey as string);

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

  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('OpenAI TTS disposed');
  }

  /**
   * Synthesize text to audio using OpenAI TTS API
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
