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
 * - **DeepgramSTT** / **DeepgramFlux** — sets `config.options.encoding`,
 *   `config.options.sampleRate`, and `config.options.channels`
 * - **AssemblyAISTT** — sets `config.sampleRate`
 *
 * Providers without compatible config fields (NativeSTT, ElevenLabsSTT, etc.)
 * are silently ignored.
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

import type { AudioMetadata } from '../types/audio';
import type { BaseProvider } from '../types/providers';

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

/**
 * Provider class names that use the Deepgram-style nested `options` config.
 *
 * @remarks
 * Detection is based on `constructor.name` because the `options` property
 * may not be physically present on the config object when the user hasn't
 * set any transcription options. The SDK is published as ES modules (never
 * minified), so class names are stable at runtime.
 *
 * @internal
 */
const DEEPGRAM_LIKE_NAMES = new Set(['DeepgramSTT', 'DeepgramFlux']);

/**
 * Provider class names that use the AssemblyAI-style flat `sampleRate` config.
 *
 * @internal
 */
const ASSEMBLYAI_LIKE_NAMES = new Set(['AssemblyAISTT']);

/**
 * A minimal structural type representing a provider with a Deepgram-style config.
 *
 * @remarks
 * Used after identity detection to safely access and mutate the nested
 * `options` object on the provider's config.
 *
 * @internal
 */
interface DeepgramLikeSTT {
  config: {
    options?: {
      encoding?: string;
      sampleRate?: number;
      channels?: number;
    };
  };
}

/**
 * A minimal structural type representing a provider with an AssemblyAI-style config.
 *
 * @internal
 */
interface AssemblyAILikeSTT {
  config: {
    sampleRate?: number;
  };
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
 * - For DeepgramSTT / DeepgramFlux: fills `options.encoding`,
 *   `options.sampleRate`, and `options.channels`. Creates the `options`
 *   object if it does not exist.
 * - For AssemblyAISTT: fills `sampleRate` on the top-level config.
 * - For all other providers (NativeSTT, ElevenLabsSTT, etc.): no-op.
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
  const providerName = stt.constructor?.name ?? '';

  // Providers that handle the format themselves (agent providers) get the
  // metadata verbatim rather than having config fields poked from outside.
  const selfConfiguring = stt as unknown as SelfConfiguringSTT;
  if (typeof selfConfiguring.configureInputFormat === 'function') {
    selfConfiguring.configureInputFormat(metadata);
    return;
  }

  if (DEEPGRAM_LIKE_NAMES.has(providerName)) {
    configureDeepgram(stt as unknown as DeepgramLikeSTT, metadata);
    return;
  }

  if (ASSEMBLYAI_LIKE_NAMES.has(providerName)) {
    configureAssemblyAI(stt as unknown as AssemblyAILikeSTT, metadata);
    return;
  }

  // No-op for NativeSTT, ElevenLabsSTT, and other providers.
}

/**
 * Fills Deepgram-style STT config from audio metadata.
 *
 * @param stt - A Deepgram-like STT provider
 * @param metadata - Input audio metadata
 *
 * @internal
 */
function configureDeepgram(stt: DeepgramLikeSTT, metadata: AudioMetadata): void {
  // Ensure the options object exists
  if (stt.config.options === undefined) {
    stt.config.options = {};
  }

  const opts = stt.config.options;

  // encoding: map from AudioEncoding to Deepgram encoding string
  if (opts.encoding === undefined) {
    const deepgramEncoding = ENCODING_TO_DEEPGRAM[metadata.encoding];
    if (deepgramEncoding !== undefined) {
      opts.encoding = deepgramEncoding;
    }
  }

  // sampleRate
  if (opts.sampleRate === undefined) {
    opts.sampleRate = metadata.sampleRate;
  }

  // channels
  if (opts.channels === undefined) {
    opts.channels = metadata.channels;
  }
}

/**
 * Fills AssemblyAI-style STT config from audio metadata.
 *
 * @param stt - An AssemblyAI-like STT provider
 * @param metadata - Input audio metadata
 *
 * @internal
 */
function configureAssemblyAI(stt: AssemblyAILikeSTT, metadata: AudioMetadata): void {
  // AssemblyAI only exposes sampleRate at the top-level config.
  // encoding and channels are implicit in AssemblyAI's protocol.
  if (stt.config.sampleRate === undefined) {
    stt.config.sampleRate = metadata.sampleRate;
  }
}
