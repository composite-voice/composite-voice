/**
 * Auto-configuration of STT providers from input audio metadata.
 *
 * @remarks
 * When separate `input` and `stt` providers are used in the 5-role pipeline,
 * the STT provider needs to know the audio format (encoding, sample rate,
 * channels) of the incoming stream. Rather than requiring users to duplicate
 * these settings on both the input and STT configs, this module reads
 * {@link AudioMetadata} from the input provider and applies matching values
 * to the STT provider's config — but only for fields the user has not
 * explicitly set.
 *
 * Supported STT providers:
 * - Anything exposing `configureInputFormat(metadata)` (all agent providers)
 *   — the provider decides what to do with the format itself
 * - **DeepgramSTT** / **DeepgramFlux** — `config.options.encoding`,
 *   `config.options.sampleRate`, `config.options.channels`
 * - **AssemblyAISTT** — `config.sampleRate`
 * - **AzureSTT** — `config.sampleRate`, `config.numChannels`, `config.bitsPerSample`
 * - **ElevenLabsSTT** — `config.audioFormat` (`pcm_<rate>` or `mulaw_8000`)
 * - **GladiaSTT** — `config.encoding`, `config.sampleRate`, `config.channels`,
 *   `config.bitDepth`
 * - **SpeechmaticsSTT** — `config.audioFormat`, `config.sampleRate`
 * - **SonioxSTT** — `config.audioFormat`, `config.sampleRate`, `config.numChannels`
 * - **OpenAIRealtimeSTT** — `config.inputAudioFormat`
 * - **TranscribeSTT** — `config.mediaEncoding`, `config.sampleRate`
 * - **RevAISTT** — `config.sampleRate`, `config.audioFormat`, `config.numChannels`
 *
 * Providers without compatible config fields (NativeSTT) are silently ignored.
 * Fallback chains recurse into every member so a failover lands on a provider
 * that already knows the input format.
 *
 * ```
 * [InputProvider] ──getMetadata()──▶ configureSTTFromMetadata(stt, metadata)
 *                                         │
 *                  ┌──────────────────────┴──────────────────────┐
 *                  ▼                                             ▼
 *         DeepgramSTT.config.options          AssemblyAISTT.config
 *         { encoding, sampleRate, channels }  { sampleRate }
 * ```
 *
 * @see {@link AudioMetadata} for the metadata shape provided by input providers
 * @see {@link AudioInputProvider} for the `getMetadata()` contract
 *
 * @packageDocumentation
 */

import type { AudioEncoding, AudioMetadata } from '../types/audio';
import type { BaseProvider } from '../types/providers';
import { isProviderChain } from '../../utils/providerChain';

/**
 * Maps {@link AudioMetadata.encoding} values to Deepgram encoding strings.
 *
 * @remarks
 * Deepgram uses its own encoding identifiers that mostly match the SDK's
 * {@link AudioEncoding} type, but the mapping is made explicit to avoid
 * silent mismatches if either side evolves independently.
 *
 * @see {@link https://developers.deepgram.com/docs/streaming | Deepgram Streaming API}
 */
const ENCODING_TO_DEEPGRAM: Record<string, string> = {
  linear16: 'linear16',
  mulaw: 'mulaw',
  alaw: 'alaw',
  opus: 'opus',
  mp3: 'mp3',
};

/** ElevenLabs sample rates that have a documented `pcm_<rate>` format string. */
const ELEVENLABS_PCM_RATES = new Set([16000, 22050, 24000, 44100]);

/**
 * A mutable config bag. Each provider exposes a public `config` object;
 * only the fields that exist on that provider are written.
 *
 * @internal
 */
interface MutableAudioConfig {
  options?: {
    encoding?: string;
    sampleRate?: number;
    channels?: number;
  };
  sampleRate?: number;
  numChannels?: number;
  channels?: number;
  bitsPerSample?: number;
  bitDepth?: number;
  audioFormat?: string;
  encoding?: string;
  inputAudioFormat?: string;
  mediaEncoding?: string;
}

/**
 * A provider whose public `config` can receive audio-format fields.
 *
 * @internal
 */
interface ConfigurableSTT {
  config: MutableAudioConfig;
}

/**
 * A provider that accepts the input format directly instead of having its
 * config fields filled in by class-name detection.
 *
 * @remarks
 * {@link BaseAgentProvider} declares `configureInputFormat`, so every agent
 * provider matches this shape.
 *
 * @internal
 */
interface SelfConfiguringSTT {
  configureInputFormat?: (metadata: AudioMetadata) => void;
}

/**
 * Auto-configures an STT provider's audio format settings from input metadata.
 *
 * @remarks
 * This function bridges the gap between the `input` provider (which knows
 * what audio format it produces) and the `stt` provider (which needs to
 * know what format to expect). It identifies the STT provider by class name
 * and fills in any unset audio format fields.
 *
 * **Detection:** Uses `provider.constructor.name` to identify supported
 * providers. This is reliable because the SDK is published as ES modules
 * and class names are never minified.
 *
 * **Rules:**
 * - Only sets fields that are currently `undefined` — never overwrites
 *   user-specified values.
 * - Fallback chains are unwrapped so every member is configured.
 * - Providers exposing `configureInputFormat` receive the metadata verbatim.
 * - NativeSTT and unknown providers are no-ops.
 *
 * @param stt - The STT provider to auto-configure. Must have a public
 *   `config` property (all SDK STT providers expose this).
 * @param metadata - Audio metadata from the input provider's
 *   {@link AudioInputProvider.getMetadata | getMetadata()} method.
 *
 * @example
 * ```typescript
 * import { configureSTTFromMetadata } from 'composite-voice';
 * import type { AudioMetadata } from 'composite-voice';
 *
 * // Input provider reports its audio format
 * const metadata: AudioMetadata = {
 *   sampleRate: 16000,
 *   encoding: 'linear16',
 *   channels: 1,
 *   bitDepth: 16,
 * };
 *
 * // DeepgramSTT with no explicit encoding/sampleRate/channels
 * const deepgramSTT = new DeepgramSTT({ apiKey: 'dg_...' });
 * configureSTTFromMetadata(deepgramSTT, metadata);
 * // deepgramSTT.config.options is now { encoding: 'linear16', sampleRate: 16000, channels: 1 }
 *
 * // AssemblyAISTT with no explicit sampleRate
 * const assemblySTT = new AssemblyAISTT({ apiKey: 'aai_...' });
 * configureSTTFromMetadata(assemblySTT, metadata);
 * // assemblySTT.config.sampleRate is now 16000
 *
 * // NativeSTT — no-op (browser manages its own audio)
 * const nativeSTT = new NativeSTT();
 * configureSTTFromMetadata(nativeSTT, metadata);
 * // No changes made
 * ```
 *
 * @see {@link AudioMetadata} for the metadata structure
 * @see {@link AudioInputProvider.getMetadata} for how metadata is obtained
 */
export function configureSTTFromMetadata(stt: BaseProvider, metadata: AudioMetadata): void {
  // Fallback chains wrap multiple providers — configure every member so a
  // failover lands on a provider that already knows the input audio format.
  if (isProviderChain<BaseProvider>(stt)) {
    for (const inner of stt.providers) {
      configureSTTFromMetadata(inner, metadata);
    }
    return;
  }

  const providerName = stt.constructor?.name ?? '';
  const configurable = stt as unknown as ConfigurableSTT;

  // Providers that handle the format themselves (agent providers) get the
  // metadata verbatim rather than having config fields poked from outside.
  const selfConfiguring = stt as unknown as SelfConfiguringSTT;
  if (typeof selfConfiguring.configureInputFormat === 'function') {
    selfConfiguring.configureInputFormat(metadata);
    return;
  }

  switch (providerName) {
    case 'DeepgramSTT':
    case 'DeepgramFlux':
      configureDeepgram(configurable, metadata);
      return;
    case 'AssemblyAISTT':
      setIfUnset(configurable.config, 'sampleRate', metadata.sampleRate);
      return;
    case 'AzureSTT':
      setIfUnset(configurable.config, 'sampleRate', metadata.sampleRate);
      setIfUnset(configurable.config, 'numChannels', metadata.channels);
      setIfUnset(configurable.config, 'bitsPerSample', metadata.bitDepth);
      return;
    case 'ElevenLabsSTT':
      setIfUnset(configurable.config, 'audioFormat', mapElevenLabsAudioFormat(metadata));
      return;
    case 'GladiaSTT':
      setIfUnset(configurable.config, 'encoding', mapGladiaEncoding(metadata.encoding));
      setIfUnset(configurable.config, 'sampleRate', metadata.sampleRate);
      setIfUnset(configurable.config, 'channels', metadata.channels);
      setIfUnset(configurable.config, 'bitDepth', metadata.bitDepth);
      return;
    case 'SpeechmaticsSTT':
      setIfUnset(configurable.config, 'audioFormat', mapSpeechmaticsAudioFormat(metadata.encoding));
      setIfUnset(configurable.config, 'sampleRate', metadata.sampleRate);
      return;
    case 'SonioxSTT':
      setIfUnset(configurable.config, 'audioFormat', mapSonioxAudioFormat(metadata.encoding));
      setIfUnset(configurable.config, 'sampleRate', metadata.sampleRate);
      setIfUnset(configurable.config, 'numChannels', metadata.channels);
      return;
    case 'OpenAIRealtimeSTT':
      setIfUnset(configurable.config, 'inputAudioFormat', mapOpenAIAudioFormat(metadata.encoding));
      return;
    case 'TranscribeSTT':
      setIfUnset(configurable.config, 'mediaEncoding', mapTranscribeEncoding(metadata.encoding));
      setIfUnset(configurable.config, 'sampleRate', metadata.sampleRate);
      return;
    case 'RevAISTT':
      setIfUnset(configurable.config, 'sampleRate', metadata.sampleRate);
      setIfUnset(configurable.config, 'audioFormat', mapRevAIAudioFormat(metadata.encoding));
      setIfUnset(configurable.config, 'numChannels', metadata.channels);
      return;
    default:
      // No-op for NativeSTT and unknown providers.
      return;
  }
}

/**
 * Writes `value` onto `object[key]` when the field is unset and `value` is defined.
 *
 * @internal
 */
function setIfUnset<T extends object, K extends keyof T>(
  object: T,
  key: K,
  value: T[K] | undefined
): void {
  if (value !== undefined && object[key] === undefined) {
    object[key] = value;
  }
}

/**
 * Fills Deepgram-style STT config from audio metadata.
 *
 * @param stt - A Deepgram-like STT provider
 * @param metadata - Input audio metadata
 *
 * @internal
 */
function configureDeepgram(stt: ConfigurableSTT, metadata: AudioMetadata): void {
  if (stt.config.options === undefined) {
    stt.config.options = {};
  }

  const opts = stt.config.options;
  setIfUnset(opts, 'encoding', ENCODING_TO_DEEPGRAM[metadata.encoding]);
  setIfUnset(opts, 'sampleRate', metadata.sampleRate);
  setIfUnset(opts, 'channels', metadata.channels);
}

/** Maps SDK encoding + sample rate to an ElevenLabs `audio_format` string. */
function mapElevenLabsAudioFormat(metadata: AudioMetadata): string | undefined {
  if (metadata.encoding === 'mulaw' && metadata.sampleRate === 8000) {
    return 'mulaw_8000';
  }
  if (metadata.encoding === 'linear16' && ELEVENLABS_PCM_RATES.has(metadata.sampleRate)) {
    return `pcm_${metadata.sampleRate}`;
  }
  return undefined;
}

/** Maps SDK encoding to Gladia's `wav/<codec>` identifiers. */
function mapGladiaEncoding(encoding: AudioEncoding): string | undefined {
  switch (encoding) {
    case 'linear16':
      return 'wav/pcm';
    case 'alaw':
      return 'wav/alaw';
    case 'mulaw':
      return 'wav/ulaw';
    default:
      return undefined;
  }
}

/** Maps SDK encoding to Speechmatics raw-audio format identifiers. */
function mapSpeechmaticsAudioFormat(encoding: AudioEncoding): string | undefined {
  switch (encoding) {
    case 'linear16':
      return 'pcm_s16le';
    case 'mulaw':
      return 'mulaw';
    default:
      return undefined;
  }
}

/** Maps SDK encoding to Soniox raw-audio format identifiers. */
function mapSonioxAudioFormat(encoding: AudioEncoding): string | undefined {
  switch (encoding) {
    case 'linear16':
      return 'pcm_s16le';
    case 'mulaw':
      return 'mulaw';
    case 'alaw':
      return 'alaw';
    default:
      return undefined;
  }
}

/** Maps SDK encoding to OpenAI Realtime `input_audio_format` values. */
function mapOpenAIAudioFormat(encoding: AudioEncoding): string | undefined {
  switch (encoding) {
    case 'linear16':
      return 'audio/pcm';
    case 'mulaw':
      return 'audio/pcmu';
    case 'alaw':
      return 'audio/pcma';
    default:
      return undefined;
  }
}

/** Maps SDK encoding to Amazon Transcribe `media-encoding` values. */
function mapTranscribeEncoding(encoding: AudioEncoding): string | undefined {
  switch (encoding) {
    case 'linear16':
      return 'pcm';
    case 'opus':
      return 'ogg-opus';
    default:
      return undefined;
  }
}

/** Maps SDK encoding to Rev AI GStreamer format strings. */
function mapRevAIAudioFormat(encoding: AudioEncoding): string | undefined {
  return encoding === 'linear16' ? 'S16LE' : undefined;
}
