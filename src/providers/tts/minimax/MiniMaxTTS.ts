/**
 * MiniMax TTS provider using native `fetch`.
 *
 * @remarks
 * This module provides a REST-based text-to-speech provider powered by
 * MiniMax's Speech models. Each call to `synthesize()` makes a single HTTP
 * request to the MiniMax `POST /v1/t2a_v2` endpoint and returns the complete
 * audio as a `Blob`.
 *
 * Transport: REST (HTTP POST via native `fetch` + {@link HttpClient})
 * Audio format: Configurable (mp3, wav, flac, pcm); default is `mp3`
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
 * Supported MiniMax TTS models.
 *
 * @remarks
 * - `'speech-02-hd'` -- Speech-02 HD model, superior audio quality (default)
 * - `'speech-02-turbo'` -- Speech-02 Turbo model, optimized for latency
 * - `'speech-2.6-hd'` / `'speech-2.6-turbo'` -- Speech 2.6 generation models
 * - `'speech-2.8-hd'` / `'speech-2.8-turbo'` -- Speech 2.8 generation models (latest)
 * - `'speech-01-hd'` / `'speech-01-turbo'` -- Previous generation models
 */
export type MiniMaxTTSModel =
  | 'speech-2.8-hd'
  | 'speech-2.8-turbo'
  | 'speech-2.6-hd'
  | 'speech-2.6-turbo'
  | 'speech-02-hd'
  | 'speech-02-turbo'
  | 'speech-01-hd'
  | 'speech-01-turbo';

/**
 * Supported MiniMax TTS audio output formats.
 *
 * @remarks
 * The format affects both file size and audio quality.
 * - `mp3` -- Good compression, widely supported (default)
 * - `wav` -- Uncompressed with WAV container
 * - `flac` -- Lossless compression
 * - `pcm` -- Raw uncompressed samples (no container)
 */
export type MiniMaxTTSFormat = 'mp3' | 'wav' | 'flac' | 'pcm';

/**
 * Supported MiniMax TTS voice emotions.
 *
 * @remarks
 * Passed via `voice_setting.emotion` to color the delivery of the
 * synthesized speech. When omitted, MiniMax chooses a neutral delivery.
 */
export type MiniMaxTTSEmotion =
  | 'happy'
  | 'sad'
  | 'angry'
  | 'fearful'
  | 'disgusted'
  | 'surprised'
  | 'calm'
  | 'fluent'
  | 'whisper';

/**
 * Configuration for the {@link MiniMaxTTS} provider.
 *
 * @remarks
 * Provide either `apiKey` (for direct API access) or `proxyUrl` (for server-side proxy).
 * At least one must be set. If both are provided, `proxyUrl` takes precedence and the
 * API key is not sent to the client. The `voiceId` is always required.
 *
 * @example
 * ```typescript
 * // Direct API access
 * const config: MiniMaxTTSConfig = {
 *   apiKey: 'eyJhbGciOi...',
 *   voiceId: 'English_expressive_narrator',
 *   model: 'speech-02-hd',
 *   audioFormat: 'mp3',
 * };
 *
 * // Via proxy server
 * const proxyConfig: MiniMaxTTSConfig = {
 *   proxyUrl: 'http://localhost:3001/api/proxy/minimax',
 *   voiceId: 'English_expressive_narrator',
 * };
 * ```
 *
 * @see {@link MiniMaxTTSModel} - Available model options.
 * @see {@link MiniMaxTTSFormat} - Available audio format options.
 */
export interface MiniMaxTTSConfig extends TTSProviderConfig {
  /**
   * The voice to use for synthesis.
   *
   * @remarks
   * Required. A MiniMax system voice ID (e.g. `'English_expressive_narrator'`,
   * `'English_Graceful_Lady'`) or a cloned voice ID. List available voices via
   * MiniMax's `POST /v1/get_voice` endpoint.
   */
  voiceId: string;

  /**
   * The TTS model to use.
   *
   * @defaultValue `'speech-02-hd'`
   * @see {@link MiniMaxTTSModel}
   */
  model?: MiniMaxTTSModel;

  /**
   * MiniMax Group ID, appended to the request URL as `?GroupId=<id>`.
   *
   * @remarks
   * Older MiniMax API keys are scoped to a group and require this query
   * parameter; newer keys embed the group and work without it. Find your
   * Group ID in the MiniMax platform console under account settings. Omit
   * it if your key authenticates without one.
   *
   * @defaultValue `undefined` (no `GroupId` query parameter)
   */
  groupId?: string;

  /**
   * The audio output format.
   *
   * @defaultValue `'mp3'`
   * @see {@link MiniMaxTTSFormat}
   */
  audioFormat?: MiniMaxTTSFormat;

  /**
   * Output sample rate in Hz.
   *
   * @remarks
   * One of `8000`, `16000`, `22050`, `24000`, `32000`, or `44100`.
   *
   * @defaultValue `undefined` (MiniMax default, 32000)
   */
  sampleRate?: number;

  /**
   * Output bitrate in bits per second (mp3 only).
   *
   * @remarks
   * One of `32000`, `64000`, `128000`, or `256000`.
   *
   * @defaultValue `undefined` (MiniMax default, 128000)
   */
  bitrate?: number;

  /**
   * Number of audio channels: `1` (mono) or `2` (stereo).
   *
   * @defaultValue `undefined` (MiniMax default, 1)
   */
  channel?: 1 | 2;

  /**
   * Speech speed multiplier, range `[0.5, 2]`.
   *
   * @defaultValue `undefined` (MiniMax default, 1)
   */
  speed?: number;

  /**
   * Speech volume, range `(0, 10]`.
   *
   * @defaultValue `undefined` (MiniMax default, 1)
   */
  volume?: number;

  /**
   * Voice pitch adjustment in semitones, range `[-12, 12]`.
   *
   * @defaultValue `undefined` (MiniMax default, 0)
   */
  pitch?: number;

  /**
   * Emotion to apply to the synthesized speech.
   *
   * @defaultValue `undefined` (neutral delivery)
   * @see {@link MiniMaxTTSEmotion}
   */
  emotion?: MiniMaxTTSEmotion;

  /**
   * Language hint to improve pronunciation for a specific language or dialect.
   *
   * @remarks
   * For example `'English'`, `'Chinese'`, `'Japanese'`, or `'auto'` for
   * automatic detection. See the MiniMax T2A docs for the full list.
   *
   * @defaultValue `undefined` (no language boost)
   */
  languageBoost?: string;

  /**
   * Custom pronunciation dictionary.
   *
   * @remarks
   * Each entry in `tone` replaces a token with an explicit pronunciation,
   * e.g. `{ tone: ['omg/oh my god'] }`.
   *
   * @defaultValue `undefined` (no custom pronunciations)
   */
  pronunciationDict?: { tone: string[] };

  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Maps {@link MiniMaxTTSFormat} values to their corresponding MIME types.
 *
 * @internal
 */
const FORMAT_MIME_TYPES: Record<MiniMaxTTSFormat, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  flac: 'audio/flac',
  pcm: 'audio/pcm',
};

/** @internal Default MiniMax API base URL (global endpoint). */
const MINIMAX_DEFAULT_URL = 'https://api.minimax.io';

/**
 * Shape of the JSON response from MiniMax's `POST /v1/t2a_v2` endpoint.
 *
 * @internal
 */
interface MiniMaxT2AResponse {
  /** Synthesized audio payload. */
  data?: {
    /** Hex-encoded audio bytes. */
    audio?: string;
    /** Synthesis status: 1 = synthesizing, 2 = complete. */
    status?: number;
  };
  /** Usage metadata for the request. */
  extra_info?: {
    audio_length?: number;
    audio_size?: number;
    usage_characters?: number;
  };
  /** Request identifier for support enquiries. */
  trace_id?: string;
  /** API status envelope; `status_code` 0 means success. */
  base_resp?: {
    status_code?: number;
    status_msg?: string;
  };
}

/**
 * MiniMax TTS provider using native `fetch` for text-to-speech synthesis.
 *
 * @remarks
 * This is a REST-based provider: each `synthesize()` call makes a single HTTP
 * request to MiniMax's `POST /v1/t2a_v2` endpoint. The API returns the audio
 * as hex-encoded JSON, which this provider decodes into a `Blob`. Emotion,
 * speed, volume, and pitch are controlled via config options mapped to the
 * request's `voice_setting`.
 *
 * The default base URL is the global endpoint (`https://api.minimax.io`).
 * Use the `endpoint` option to target a regional host such as
 * `https://api-uw.minimax.io` (western US) or the mainland-China platform.
 *
 * Audio flow: `Text -> MiniMax REST API (hex JSON) -> Complete audio Blob`
 *
 * @example
 * ```typescript
 * import { MiniMaxTTS } from 'composite-voice';
 *
 * const tts = new MiniMaxTTS({
 *   apiKey: 'eyJhbGciOi...',
 *   voiceId: 'English_expressive_narrator',
 *   model: 'speech-02-hd',
 *   audioFormat: 'mp3',
 * });
 *
 * await tts.initialize();
 * const audioBlob = await tts.synthesize('Hello, world!');
 * // Play the audio blob, e.g., via an <audio> element
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link MiniMaxTTSConfig} - Configuration options for this provider.
 */
export class MiniMaxTTS extends RestTTSProvider {
  declare public config: MiniMaxTTSConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new MiniMaxTTS provider instance.
   *
   * @param config - Configuration for the MiniMax TTS provider.
   * @param logger - Optional logger instance for debug and diagnostic output.
   */
  constructor(config: MiniMaxTTSConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initializes the HTTP client for the MiniMax TTS API.
   *
   * @throws {@link ProviderInitializationError} if neither `apiKey` nor `proxyUrl` is configured.
   * @throws {@link ProviderInitializationError} if `voiceId` is not provided.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'MiniMaxTTS',
        new Error('MiniMaxTTS requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    if (!this.config.voiceId) {
      throw new ProviderInitializationError(
        'MiniMaxTTS',
        new Error('MiniMaxTTS requires "voiceId" to be configured.')
      );
    }

    const baseUrl = this.resolveBaseUrl(MINIMAX_DEFAULT_URL);
    if (!baseUrl) throw new Error('MiniMax TTS base URL could not be resolved');
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
      providerName: 'MiniMaxTTS',
    });

    this.logger.info('MiniMax TTS initialized', {
      voiceId: this.config.voiceId,
      model: this.config.model ?? 'speech-02-hd',
      audioFormat: this.config.audioFormat ?? 'mp3',
      groupId: this.config.groupId,
    });
  }

  /**
   * Disposes the provider and releases the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('MiniMax TTS disposed');
  }

  /**
   * Synthesizes text to audio using the MiniMax TTS REST API.
   *
   * @param text - The text to synthesize into speech (up to 10,000 characters).
   * @returns A `Blob` containing the synthesized audio in the configured format.
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the MiniMax API request fails, reports a non-zero
   *   `base_resp.status_code`, or returns no audio.
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    if (!this.client) {
      throw new Error('MiniMax TTS client not initialized');
    }

    const model = this.config.model ?? 'speech-02-hd';
    const audioFormat = this.config.audioFormat ?? 'mp3';

    this.logger.debug('MiniMax TTS synthesize request', {
      model,
      voiceId: this.config.voiceId,
      audioFormat,
      textLength: text.length,
    });

    const voiceSetting: Record<string, unknown> = {
      voice_id: this.config.voiceId,
    };
    if (this.config.speed != null) voiceSetting.speed = this.config.speed;
    if (this.config.volume != null) voiceSetting.vol = this.config.volume;
    if (this.config.pitch != null) voiceSetting.pitch = this.config.pitch;
    if (this.config.emotion) voiceSetting.emotion = this.config.emotion;

    const audioSetting: Record<string, unknown> = {
      format: audioFormat,
    };
    if (this.config.sampleRate != null) audioSetting.sample_rate = this.config.sampleRate;
    if (this.config.bitrate != null) audioSetting.bitrate = this.config.bitrate;
    if (this.config.channel != null) audioSetting.channel = this.config.channel;

    const body: Record<string, unknown> = {
      model,
      text,
      stream: false,
      voice_setting: voiceSetting,
      audio_setting: audioSetting,
    };

    if (this.config.languageBoost) {
      body.language_boost = this.config.languageBoost;
    }

    if (this.config.pronunciationDict) {
      body.pronunciation_dict = this.config.pronunciationDict;
    }

    const path = this.config.groupId
      ? `/v1/t2a_v2?GroupId=${encodeURIComponent(this.config.groupId)}`
      : '/v1/t2a_v2';

    const response = await this.client.request(path, { body });
    const data = (await response.json()) as MiniMaxT2AResponse;

    const statusCode = data.base_resp?.status_code ?? 0;
    if (statusCode !== 0) {
      throw new Error(
        `MiniMax TTS request failed (status_code ${statusCode}): ${
          data.base_resp?.status_msg ?? 'unknown error'
        }`
      );
    }

    if (!data.data?.audio) {
      throw new Error('MiniMax TTS response did not contain audio data');
    }

    const bytes = this.decodeHex(data.data.audio);
    const mimeType = FORMAT_MIME_TYPES[audioFormat];

    this.logger.debug('MiniMax TTS synthesize complete', {
      audioBytes: bytes.byteLength,
      usageCharacters: data.extra_info?.usage_characters,
    });

    return new Blob([bytes], { type: mimeType });
  }

  /**
   * Decodes a hex string into raw bytes.
   *
   * @remarks
   * The MiniMax REST API returns audio hex-encoded (not base64) in the
   * `data.audio` field rather than as raw bytes.
   */
  private decodeHex(hex: string): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(hex.length >> 1);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
}
