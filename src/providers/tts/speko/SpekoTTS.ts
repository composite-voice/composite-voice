/**
 * Speko Relay TTS provider using native `fetch`.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by the
 * Speko Relay — a voice-model router that benchmarks TTS providers in real
 * time and routes each request to the best one for the configured objective
 * (latency, quality, cost, or balanced). Each call to `synthesize()` makes a
 * single HTTP request to `POST /v1/tts/speech` and returns the complete audio
 * as a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Audio format: `pcm_s16le` (returned as a WAV Blob for playback) or raw
 * `opus`, at a configurable sample rate; default is `pcm_s16le` at 24000 Hz
 *
 * No SDK dependency required.
 *
 * @packageDocumentation
 */

import { RestTTSProvider } from '../../base/RestTTSProvider';
import type { TTSProviderConfig } from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { HttpClient } from '../../../utils/http';
import { createWavHeader } from '../../../utils/audio';
import { ProviderInitializationError } from '../../../utils/errors';

/**
 * Routing objectives accepted by the Speko Relay in `auto` mode.
 *
 * @remarks
 * Determines how the relay ranks candidate providers:
 * - `'balanced'` -- balance latency, quality, and cost (relay default)
 * - `'quality'` -- prefer the highest-scoring provider
 * - `'latency'` -- prefer the fastest provider
 * - `'cost'` -- prefer the cheapest provider
 */
export type SpekoRoutingObjective = 'balanced' | 'quality' | 'latency' | 'cost';

/**
 * The Speko Relay routing object, shared by the STT and TTS providers.
 *
 * @remarks
 * A closed tagged union determined by `mode`, sent verbatim to the relay:
 *
 * - `mode: 'auto'` -- Speko selects the provider. `objective` controls the
 *   ranking (defaults to `'balanced'`), `allow_providers` restricts candidates
 *   to the listed provider IDs in preference order, and `deny_providers`
 *   excludes providers. Healthy candidates are attempted first, with
 *   automatic failover.
 * - `mode: 'explicit'` -- pin a specific `provider` and `model` with no
 *   substitution or failover. Both fields are required, and the auto-mode
 *   fields are rejected by the relay.
 *
 * When omitted from the config, the relay defaults to
 * `{ mode: 'auto', objective: 'balanced' }`.
 *
 * @example
 * ```typescript
 * // Route for lowest latency across Speko's provider pool
 * const routing: SpekoRouting = { mode: 'auto', objective: 'latency' };
 *
 * // Pin a specific provider and model (no failover)
 * const pinned: SpekoRouting = { mode: 'explicit', provider: 'cartesia', model: 'sonic-2' };
 * ```
 *
 * @see {@link https://docs.speko.ai/relay/routing | Speko routing documentation}
 */
export type SpekoRouting =
  | {
      mode: 'auto';
      /** Provider ranking objective. @defaultValue `'balanced'` */
      objective?: SpekoRoutingObjective;
      /** Restrict candidates to these provider IDs, in preference order. */
      allow_providers?: string[];
      /** Exclude these provider IDs from consideration. */
      deny_providers?: string[];
    }
  | {
      mode: 'explicit';
      /** The provider ID to pin (e.g. `'elevenlabs'`). Required. */
      provider: string;
      /** The provider's model ID to pin. Required. */
      model: string;
    };

/**
 * Audio encodings supported by the Speko Relay.
 *
 * @remarks
 * - `'pcm_s16le'` -- Raw PCM, signed 16-bit little-endian (no container)
 * - `'opus'` -- Opus-encoded audio
 */
export type SpekoAudioEncoding = 'pcm_s16le' | 'opus';

/**
 * Configuration for the {@link SpekoTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for
 * server-side proxy). At least one must be set. If both are provided,
 * `proxyUrl` takes precedence and the API key is not sent to the client.
 *
 * `voice` is optional -- when omitted, the relay uses the routed provider's
 * default voice.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: SpekoTTSConfig = {
 *   apiKey: 'sk_speko_...',
 *   routing: { mode: 'auto', objective: 'latency' },
 * };
 *
 * // Via proxy server
 * const proxyConfig: SpekoTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/speko',
 *   sampleRate: 24000,
 * };
 * ```
 *
 * @see {@link SpekoRouting} - Routing object shape and semantics.
 * @see {@link SpekoAudioEncoding} - Available audio encodings.
 */
export interface SpekoTTSConfig extends TTSProviderConfig {
  /**
   * Routing object controlling which upstream provider the relay selects.
   *
   * @defaultValue `undefined` (relay default: `{ mode: 'auto', objective: 'balanced' }`)
   * @see {@link SpekoRouting}
   */
  routing?: SpekoRouting;

  /**
   * Provider voice ID for the routed provider.
   *
   * @remarks
   * Only meaningful with explicit routing (voice IDs are provider-specific).
   *
   * @defaultValue `undefined` (route default voice)
   */
  voice?: string;

  /**
   * The audio output encoding.
   *
   * @defaultValue `'pcm_s16le'`
   * @see {@link SpekoAudioEncoding}
   */
  encoding?: SpekoAudioEncoding;

  /**
   * The audio output sample rate in Hz. Accepted range is 8000 to 192000.
   *
   * @defaultValue `24000`
   */
  sampleRate?: number;

  /**
   * Number of audio output channels. Accepted range is 1 to 8.
   *
   * @defaultValue `1`
   */
  channels?: number;

  /**
   * Maximum number of retries for failed API requests.
   *
   * @remarks
   * Retries reuse the same `Idempotency-Key`, so a request the relay has
   * already accepted is never dispatched twice.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link SpekoAudioEncoding} values to their corresponding MIME types.
 *
 * @remarks
 * The relay returns raw streams without a container. `pcm_s16le` responses
 * are wrapped in a WAV header before being returned (so the browser's
 * `decodeAudioData` can play them); `opus` responses are returned raw for
 * custom audio pipelines.
 *
 * @internal
 */
const ENCODING_MIME_TYPES: Record<SpekoAudioEncoding, string> = {
  pcm_s16le: 'audio/wav',
  opus: 'audio/opus',
};

/** @internal Default Speko Relay API base URL. */
const SPEKO_DEFAULT_URL = 'https://relay.speko.dev';

/**
 * Generate a unique `Idempotency-Key` value for a Speko Relay request.
 *
 * @remarks
 * The relay rejects any POST or WebSocket upgrade without an
 * `Idempotency-Key` header. The key is opaque to Speko (any non-blank string
 * up to 256 bytes); a UUID per logical request is the recommended form.
 * Falls back to a random token when `crypto.randomUUID` is unavailable
 * (e.g. non-secure contexts). Shared with {@link SpekoSTT} for direct
 * server-side WebSocket connections.
 *
 * @internal
 */
export function generateIdempotencyKey(): string {
  const webCrypto = globalThis.crypto as Crypto | undefined;
  if (webCrypto?.randomUUID) {
    return webCrypto.randomUUID();
  }
  return `speko-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Speko Relay TTS provider using native `fetch` for text-to-speech synthesis.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single HTTP
 * request to the Speko Relay's `POST /v1/tts/speech` endpoint, which routes
 * the request to the best upstream TTS provider for the configured
 * {@link SpekoTTSConfig.routing | routing} objective and returns the complete
 * audio as raw bytes. The provider wraps those bytes in a `Blob` typed with
 * the MIME type of the configured encoding.
 *
 * Audio flow: `Text -> Speko Relay (routed provider, raw bytes) -> Complete audio Blob`
 *
 * Every request carries a unique `Idempotency-Key` header (required by the
 * relay). Routing details for each response — the provider and model the
 * relay selected, and the metered character count — are logged at debug
 * level from the `Speko-*` response headers.
 *
 * Speko also offers a full-duplex streaming WebSocket API (`/v1/tts/stream`);
 * this provider intentionally implements the simpler REST path. The relay's
 * TTS endpoints are currently English-only.
 *
 * @example
 * ```typescript
 * import { SpekoTTS } from 'composite-voice';
 *
 * const tts = new SpekoTTS({
 *   apiKey: 'sk_speko_...',
 *   routing: { mode: 'auto', objective: 'latency' },
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Your table is ready.');
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link SpekoTTSConfig} - Configuration options for this provider.
 * @see {@link SpekoSTT} - The companion streaming STT provider.
 */
export class SpekoTTS extends RestTTSProvider {
  declare public config: SpekoTTSConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new SpekoTTS provider instance.
   *
   * @param config - Configuration for the Speko TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: SpekoTTSConfig, logger?: Logger) {
    const finalConfig: SpekoTTSConfig = {
      encoding: 'pcm_s16le',
      sampleRate: 24000,
      channels: 1,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Initializes the HTTP client for the Speko Relay API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'SpekoTTS',
        new Error('SpekoTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    const baseUrl = this.resolveBaseUrl(SPEKO_DEFAULT_URL);
    if (!baseUrl) throw new Error('Speko TTS base URL could not be resolved');
    const apiKey = await this.resolveApiKey();

    const headers: Record<string, string> = {};

    if (!this.isProxyMode) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    this.client = new HttpClient({
      baseUrl,
      headers,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 60000,
      logger: this.logger,
      providerName: 'SpekoTTS',
    });

    this.logger.info('Speko TTS initialized', {
      routing: this.config.routing,
      encoding: this.config.encoding ?? 'pcm_s16le',
      sampleRate: this.config.sampleRate ?? 24000,
      hasProxy: !!this.config.proxyUrl,
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Speko TTS disposed');
  }

  /**
   * Synthesizes text to audio through the Speko Relay.
   *
   * @param text - The text to synthesize into speech. Must be non-empty.
   * @returns A `Blob` containing the synthesized audio in the configured encoding.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the Speko Relay request fails.
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('Speko TTS client not initialized');
    }

    const encoding = this.config.encoding ?? 'pcm_s16le';

    this.logger.debug('Speko TTS synthesize request', {
      routing: this.config.routing,
      encoding,
      textLength: text.length,
    });

    const body: Record<string, unknown> = {
      input: text,
      audio: {
        encoding,
        sample_rate_hz: this.config.sampleRate ?? 24000,
        channels: this.config.channels ?? 1,
      },
    };

    if (this.config.routing) {
      body.routing = this.config.routing;
    }

    if (this.config.voice) {
      body.voice = this.config.voice;
    }

    const response = await this.client.request('/v1/tts/speech', {
      body,
      headers: { 'Idempotency-Key': generateIdempotencyKey() },
    });

    const arrayBuffer = await response.arrayBuffer();

    this.logger.debug('Speko TTS synthesize complete', {
      audioBytes: arrayBuffer.byteLength,
      spekoProvider: response.headers.get('Speko-Provider'),
      spekoModel: response.headers.get('Speko-Model'),
      spekoRequestId: response.headers.get('Speko-Request-ID'),
      usageCharacters: response.headers.get('Speko-Usage-Characters'),
    });

    // The relay returns containerless audio. Raw PCM cannot be decoded by
    // the browser's decodeAudioData, so wrap it in a WAV header; opus is
    // returned raw for custom pipelines.
    if (encoding === 'pcm_s16le') {
      const header = createWavHeader(
        arrayBuffer.byteLength,
        this.config.sampleRate ?? 24000,
        this.config.channels ?? 1,
        16
      );
      return new Blob([header, arrayBuffer], { type: ENCODING_MIME_TYPES[encoding] });
    }

    return new Blob([arrayBuffer], { type: ENCODING_MIME_TYPES[encoding] });
  }
}
