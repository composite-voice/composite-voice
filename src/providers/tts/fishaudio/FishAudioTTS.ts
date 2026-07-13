/**
 * Fish Audio TTS provider using native `fetch` with msgpack-encoded requests.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by
 * Fish Audio's speech models (S1, S2 Pro, S2.1 Pro). Each call to
 * `synthesize()` makes a single HTTP POST to the Fish Audio API and buffers
 * the returned audio bytes into a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Wire format: MessagePack request body (`Content-Type: application/msgpack`)
 * Audio format: Configurable (mp3, wav, pcm, opus); default is `mp3`
 *
 * **Requires the optional peer dependency `@msgpack/msgpack`** (the only
 * provider in the SDK with a request-encoding dependency). The Fish Audio
 * API also accepts JSON for text-only requests, but msgpack is required for
 * inline reference audio (instant voice cloning), so this provider always
 * encodes requests as msgpack. Install the encoder with:
 *
 * ```bash
 * pnpm add @msgpack/msgpack
 * ```
 *
 * @packageDocumentation
 */

import { RestTTSProvider } from '../../base/RestTTSProvider';
import type { TTSProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { HttpClient } from '../../../utils/http';
import { ProviderInitializationError } from '../../../utils/errors';
import { importPeerDep } from '../../../utils/importPeerDep';

/**
 * Supported Fish Audio TTS model generations.
 *
 * @remarks
 * Selected via the `model` HTTP header on every request (not a body field).
 *
 * - `'s2.1-pro'` -- Recommended production model; improved quality, latency,
 *   and throughput over S2 Pro
 * - `'s2.1-pro-free'` -- Free tier of S2.1 Pro for testing and development
 *   (the API default)
 * - `'s2-pro'` -- Previous generation
 * - `'s1'` -- Oldest generation still available
 */
export type FishAudioTTSModel = 's1' | 's2-pro' | 's2.1-pro' | 's2.1-pro-free';

/**
 * Supported Fish Audio TTS audio output formats.
 *
 * @remarks
 * - `mp3` -- Good compression, widely supported (default)
 * - `wav` -- Uncompressed, highest quality
 * - `pcm` -- Raw samples, no container
 * - `opus` -- Efficient compression for voice
 */
export type FishAudioTTSFormat = 'mp3' | 'wav' | 'pcm' | 'opus';

/**
 * Latency mode for Fish Audio synthesis.
 *
 * @remarks
 * - `'normal'` -- Most stable output at slightly higher latency
 * - `'balanced'` -- Lower time-to-first-audio (~300ms), suited to
 *   interactive voice agents
 */
export type FishAudioTTSLatency = 'normal' | 'balanced';

/**
 * An inline reference audio sample for instant voice cloning.
 *
 * @remarks
 * Reference audio is sent as raw binary inside the msgpack request body --
 * this is why {@link FishAudioTTS} requires `@msgpack/msgpack` instead of
 * JSON (which would need base64 inflation). Best results come from a clean
 * 10-30s sample; no training step is required.
 */
export interface FishAudioReference {
  /** Raw audio bytes of the reference sample (e.g., a WAV file's contents). */
  audio: Uint8Array | ArrayBuffer;

  /** Transcript of the reference audio sample. */
  text: string;
}

/**
 * Configuration for the {@link FishAudioTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for
 * server-side proxy). At least one must be set. If both are provided,
 * `proxyUrl` takes precedence and the API key is not sent to the client.
 *
 * The optional peer dependency `@msgpack/msgpack` must be installed --
 * it is loaded lazily during `initialize()`.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: FishAudioTTSConfig = {
 *   apiKey: 'fa_xxxxxxxxxxxx',
 *   referenceId: 'your-voice-id',
 *   model: 's2.1-pro',
 *   format: 'mp3',
 * };
 *
 * // Via proxy server
 * const proxyConfig: FishAudioTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/fishaudio',
 *   referenceId: 'your-voice-id',
 * };
 * ```
 *
 * @see {@link FishAudioTTSModel} - Available model generations.
 * @see {@link FishAudioTTSFormat} - Available audio format options.
 */
export interface FishAudioTTSConfig extends TTSProviderConfig {
  /**
   * The voice model to synthesize with, from Fish Audio's voice catalog
   * (or a voice you created).
   *
   * @remarks
   * Sent as `reference_id` in the request body. When omitted, the model's
   * default voice is used -- or provide inline {@link references} for
   * instant voice cloning.
   *
   * @defaultValue `undefined` (model default voice)
   */
  referenceId?: string;

  /**
   * The TTS model generation, sent as the `model` HTTP header.
   *
   * @remarks
   * Use `'s2.1-pro'` in production; `'s2.1-pro-free'` (the default, matching
   * the API's own default) is a free tier for testing and development.
   *
   * @defaultValue `'s2.1-pro-free'`
   * @see {@link FishAudioTTSModel}
   */
  model?: FishAudioTTSModel;

  /**
   * The audio output format.
   *
   * @defaultValue `'mp3'`
   * @see {@link FishAudioTTSFormat}
   */
  format?: FishAudioTTSFormat;

  /**
   * Bitrate for `mp3` output, in kbps.
   *
   * @defaultValue `128` (server-side)
   */
  mp3Bitrate?: 64 | 128 | 192;

  /**
   * Maximum characters per internal synthesis chunk (100-300).
   *
   * @defaultValue `300` (server-side)
   */
  chunkLength?: number;

  /**
   * Whether to normalize numbers, dates, and other text before synthesis.
   *
   * @defaultValue `true` (server-side)
   */
  normalize?: boolean;

  /**
   * Latency mode trading stability for time-to-first-audio.
   *
   * @defaultValue `'normal'` (server-side)
   * @see {@link FishAudioTTSLatency}
   */
  latency?: FishAudioTTSLatency;

  /**
   * Speech speed multiplier, sent as `prosody.speed` (0.5-2.0).
   *
   * @defaultValue `undefined` (server default, 1.0)
   */
  speed?: number;

  /**
   * Volume adjustment, sent as `prosody.volume`.
   *
   * @defaultValue `undefined` (server default, 0)
   */
  volume?: number;

  /**
   * Inline reference audio samples for instant voice cloning.
   *
   * @remarks
   * Binary reference audio is the reason this provider speaks msgpack --
   * the JSON encoding cannot carry raw bytes.
   *
   * @defaultValue `undefined` (no cloning; uses `referenceId` or model default)
   * @see {@link FishAudioReference}
   */
  references?: FishAudioReference[];

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link FishAudioTTSFormat} values to their corresponding MIME types.
 *
 * @internal
 */
const FORMAT_MIME_TYPES: Record<FishAudioTTSFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pcm: 'audio/pcm',
  opus: 'audio/opus',
};

/** @internal Default Fish Audio API base URL. */
const FISHAUDIO_DEFAULT_URL = 'https://api.fish.audio';

/**
 * @internal
 * The subset of `@msgpack/msgpack` used by this provider.
 */
interface MsgpackEncoder {
  encode(value: unknown): Uint8Array;
}

/**
 * Fish Audio TTS provider using native `fetch` with msgpack-encoded requests.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single
 * HTTP POST to Fish Audio's `POST /v1/tts` endpoint with a MessagePack
 * request body (`Content-Type: application/msgpack`) and the `model` header
 * selecting the model generation. The API streams back raw audio bytes
 * (`Transfer-Encoding: chunked`), which this provider buffers into a `Blob`.
 *
 * **Peer dependency:** requires `@msgpack/msgpack` (optional peer, loaded
 * lazily in `initialize()`). Fish Audio also accepts JSON for text-only
 * requests, but inline reference audio for voice cloning needs binary
 * encoding, so msgpack is used for all requests.
 *
 * Audio flow: `Text -> msgpack encode -> Fish Audio REST API -> Complete audio Blob`
 *
 * @example
 * ```typescript
 * import { FishAudioTTS } from 'composite-voice';
 *
 * const tts = new FishAudioTTS({
 *   apiKey: 'fa_xxxxxxxxxxxx',
 *   referenceId: 'your-voice-id',
 *   model: 's2.1-pro',
 *   format: 'mp3',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello, world!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link FishAudioTTSConfig} - Configuration options for this provider.
 */
export class FishAudioTTS extends RestTTSProvider {
  declare public config: FishAudioTTSConfig;
  private client: HttpClient | null = null;
  private msgpack: MsgpackEncoder | null = null;

  /**
   * Creates a new FishAudioTTS provider instance.
   *
   * @param config - Configuration for the Fish Audio TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: FishAudioTTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the msgpack encoder and HTTP client for the Fish Audio API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if the optional peer dependency
   *   `@msgpack/msgpack` is not installed.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'FishAudioTTS',
        new Error('FishAudioTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    // Lazily import the optional peer dependency used for request encoding.
    try {
      this.msgpack = await importPeerDep<typeof import('@msgpack/msgpack')>(
        () => import('@msgpack/msgpack'),
        '@msgpack/msgpack',
        'FishAudioTTS'
      );
    } catch {
      throw new ProviderInitializationError(
        'FishAudioTTS',
        new Error(
          'FishAudioTTS requires the optional peer dependency @msgpack/msgpack — ' +
            'install it with `pnpm add @msgpack/msgpack`.'
        )
      );
    }

    const baseUrl = this.resolveBaseUrl(FISHAUDIO_DEFAULT_URL);
    if (!baseUrl) throw new Error('Fish Audio TTS base URL could not be resolved');
    const apiKey = await this.resolveApiKey();

    const model = this.config.model ?? 's2.1-pro-free';

    const headers: Record<string, string> = {
      // Request bodies are msgpack-encoded (binary-safe for reference audio)
      'content-type': 'application/msgpack',
      // Fish Audio selects the model generation via an HTTP header
      model,
    };

    if (!this.isProxyMode) {
      headers['authorization'] = `Bearer ${apiKey}`;
    }

    this.client = new HttpClient({
      baseUrl,
      headers,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 60000,
      logger: this.logger,
      providerName: 'FishAudioTTS',
    });

    this.logger.info('Fish Audio TTS initialized', {
      model,
      referenceId: this.config.referenceId,
      format: this.config.format ?? 'mp3',
    });
  }

  /**
   * Disposes the provider and releases the HTTP client and encoder.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.msgpack = null;
    this.logger.info('Fish Audio TTS disposed');
  }

  /**
   * Synthesizes text to audio using the Fish Audio TTS REST API.
   *
   * @param text - The text to synthesize into speech.
   * @returns A `Blob` containing the synthesized audio in the configured format.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the Fish Audio API request fails.
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client || !this.msgpack) {
      throw new Error('Fish Audio TTS client not initialized');
    }

    const format = this.config.format ?? 'mp3';

    this.logger.debug('Fish Audio TTS synthesize request', {
      referenceId: this.config.referenceId,
      format,
      textLength: text.length,
    });

    const body: Record<string, unknown> = {
      text,
      format,
    };

    if (this.config.referenceId != null) {
      body.reference_id = this.config.referenceId;
    }

    if (this.config.mp3Bitrate != null) {
      body.mp3_bitrate = this.config.mp3Bitrate;
    }

    if (this.config.chunkLength != null) {
      body.chunk_length = this.config.chunkLength;
    }

    if (this.config.normalize != null) {
      body.normalize = this.config.normalize;
    }

    if (this.config.latency != null) {
      body.latency = this.config.latency;
    }

    if (this.config.speed != null || this.config.volume != null) {
      body.prosody = {
        ...(this.config.speed != null ? { speed: this.config.speed } : {}),
        ...(this.config.volume != null ? { volume: this.config.volume } : {}),
      };
    }

    if (this.config.references?.length) {
      body.references = this.config.references.map((ref) => ({
        audio: ref.audio instanceof ArrayBuffer ? new Uint8Array(ref.audio) : ref.audio,
        text: ref.text,
      }));
    }

    const response = await this.client.request('/v1/tts', {
      body: this.msgpack.encode(body),
    });

    // The API streams raw audio bytes (possibly chunked); buffer them fully.
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = FORMAT_MIME_TYPES[format];

    this.logger.debug('Fish Audio TTS synthesize complete', {
      audioBytes: arrayBuffer.byteLength,
    });

    return new Blob([arrayBuffer], { type: mimeType });
  }
}
