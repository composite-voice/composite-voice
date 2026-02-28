/**
 * Provider resolution algorithm for the 5-role audio pipeline.
 *
 * @remarks
 * This module exports the {@link resolveProviders} function, which maps a flat
 * array of {@link BaseProvider} instances to a fully typed {@link ResolvedPipeline}.
 * The algorithm:
 *
 * 1. Reads the `roles` property from each provider and assigns it to the
 *    corresponding pipeline slot(s).
 * 2. Auto-fills default providers when both roles in a pair are uncovered:
 *    - `input` + `stt` uncovered → `new NativeSTT()` (covers both)
 *    - `tts` + `output` uncovered → `new NativeTTS()` (covers both)
 * 3. Validates that every slot is filled (throws {@link ConfigurationError} for
 *    uncovered roles).
 * 4. Validates that no slot is claimed by more than one provider (throws
 *    {@link ConfigurationError} for duplicates).
 * 5. Duck-type checks that each slot's provider implements the required methods
 *    for its role interface.
 *
 * ```
 * providers: BaseProvider[]
 *       │
 *       ▼
 * ┌─────────────────────┐
 * │  Read roles from     │
 * │  each provider       │
 * ├─────────────────────┤
 * │  Auto-fill defaults  │
 * │  (NativeSTT/TTS)    │
 * ├─────────────────────┤
 * │  Validate coverage   │
 * │  & no duplicates     │
 * ├─────────────────────┤
 * │  Duck-type check     │
 * │  interface methods   │
 * └──────────┬──────────┘
 *            ▼
 *    ResolvedPipeline
 * ```
 *
 * @example
 * ```typescript
 * import { resolveProviders } from 'composite-voice';
 *
 * // Minimal: just an LLM, defaults fill input+stt and tts+output
 * const pipeline = resolveProviders([new AnthropicLLM({ model: 'claude-haiku-4-5' })]);
 *
 * // Explicit 5-provider pipeline
 * const pipeline5 = resolveProviders([
 *   new MicrophoneInput(),
 *   new DeepgramSTT({ apiKey: '...' }),
 *   new AnthropicLLM({ model: 'claude-haiku-4-5' }),
 *   new DeepgramTTS({ apiKey: '...' }),
 *   new BrowserAudioOutput(),
 * ]);
 * ```
 *
 * @see {@link ResolvedPipeline} for the output type
 * @see {@link BaseProvider} for the input provider interface
 * @see {@link ConfigurationError} for errors thrown on invalid configurations
 *
 * @packageDocumentation
 */

import type {
  BaseProvider,
  AudioInputProvider,
  AudioOutputProvider,
  STTProvider,
  LLMProvider,
  TTSProvider,
  ResolvedPipeline,
} from '../types/providers';
import type { ProviderRole } from '../types/roles';
import { ALL_PROVIDER_ROLES } from '../types/roles';
import { ConfigurationError } from '../../utils/errors';
import { NativeSTT } from '../../providers/stt/native/NativeSTT';
import { NativeTTS } from '../../providers/tts/native/NativeTTS';

/**
 * Required method names for each pipeline role.
 *
 * @remarks
 * Used by the duck-type validation step to verify that each assigned provider
 * implements the methods required by its role interface. STT and TTS roles
 * accept either REST or live (WebSocket) variants:
 *
 * - **input**: {@link AudioInputProvider} methods
 * - **stt**: Either {@link RestSTTProvider} (`transcribe`) or {@link LiveSTTProvider} (`connect`, `sendAudio`, `disconnect`) + shared `onTranscription`
 * - **llm**: {@link LLMProvider} methods
 * - **tts**: Either {@link RestTTSProvider} (`synthesize`) or {@link LiveTTSProvider} (`connect`, `sendText`, `finalize`, `disconnect`) + shared `onAudio`
 * - **output**: {@link AudioOutputProvider} methods
 *
 * @see {@link validateSlotInterface} for where this map is consumed
 */
const ROLE_REQUIRED_METHODS: Record<ProviderRole, string[][]> = {
  input: [['start', 'stop', 'pause', 'resume', 'isActive', 'onAudio', 'getMetadata']],
  stt: [
    // RestSTTProvider
    ['transcribe', 'onTranscription'],
    // LiveSTTProvider
    ['connect', 'sendAudio', 'disconnect', 'onTranscription'],
  ],
  llm: [['generate', 'generateFromMessages']],
  tts: [
    // RestTTSProvider
    ['synthesize'],
    // LiveTTSProvider
    ['connect', 'sendText', 'finalize', 'disconnect', 'onAudio', 'onMetadata'],
  ],
  output: [
    [
      'configure',
      'enqueue',
      'flush',
      'stop',
      'pause',
      'resume',
      'isPlaying',
      'onPlaybackStart',
      'onPlaybackEnd',
      'onPlaybackError',
    ],
  ],
};

/**
 * Validate that a provider has the required methods for a given role.
 *
 * @remarks
 * For roles with multiple valid interface shapes (STT: rest vs live,
 * TTS: rest vs live), the provider must match **at least one** of the
 * method sets.
 *
 * @param provider - The provider to validate
 * @param role - The role to validate against
 *
 * @throws {@link ConfigurationError}
 * If the provider does not implement any of the valid method sets for the role.
 */
function validateSlotInterface(provider: BaseProvider, role: ProviderRole): void {
  const methodSets = ROLE_REQUIRED_METHODS[role];
  const providerName = provider.constructor.name;

  // Provider must match at least one of the valid method sets
  const matchesAny = methodSets.some((methods) =>
    methods.every((method) => typeof (provider as unknown as Record<string, unknown>)[method] === 'function')
  );

  if (!matchesAny) {
    const expected = methodSets
      .map((methods) => `[${methods.join(', ')}]`)
      .join(' or ');
    throw new ConfigurationError(
      `Provider "${providerName}" assigned to role "${role}" does not implement the required interface. ` +
        `Expected methods: ${expected}`
    );
  }
}

/**
 * Resolve a flat array of providers into a fully typed {@link ResolvedPipeline}.
 *
 * @remarks
 * This is the main entry point of the provider resolution algorithm. It:
 *
 * 1. Iterates over each provider's `roles` array and assigns it to pipeline slots.
 * 2. Detects and reports duplicate role assignments (two providers claiming the
 *    same role).
 * 3. Auto-fills default providers when both roles in a natural pair are uncovered:
 *    - `input` + `stt` → `new NativeSTT()` (multi-role, covers both)
 *    - `tts` + `output` → `new NativeTTS()` (multi-role, covers both)
 * 4. Reports any uncovered roles as a {@link ConfigurationError}.
 * 5. Duck-type validates each slot's provider against its role interface.
 *
 * Only the `llm` role is strictly required — there is no default LLM provider.
 *
 * @param providers - Array of provider instances, each declaring their `roles`
 * @returns A {@link ResolvedPipeline} with a typed provider in every slot
 *
 * @throws {@link ConfigurationError}
 * If the providers array is empty, a role is missing with no applicable default,
 * two providers claim the same role, or a provider lacks required interface methods.
 *
 * @example Minimal config (LLM only, defaults fill the rest)
 * ```typescript
 * const pipeline = resolveProviders([
 *   new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
 * ]);
 * // pipeline.input === NativeSTT instance (also pipeline.stt)
 * // pipeline.tts === NativeTTS instance (also pipeline.output)
 * ```
 *
 * @example 3-provider config (multi-role NativeSTT + NativeTTS)
 * ```typescript
 * const pipeline = resolveProviders([
 *   new NativeSTT(),       // covers input + stt
 *   new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
 *   new NativeTTS(),       // covers tts + output
 * ]);
 * ```
 *
 * @example 5-provider config (all explicit)
 * ```typescript
 * const pipeline = resolveProviders([
 *   new MicrophoneInput(),
 *   new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
 *   new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
 *   new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
 *   new BrowserAudioOutput(),
 * ]);
 * ```
 *
 * @see {@link ResolvedPipeline} for the output type
 * @see {@link ConfigurationError} for error details
 */
export function resolveProviders(providers: BaseProvider[]): ResolvedPipeline {
  if (!providers || !Array.isArray(providers) || providers.length === 0) {
    throw new ConfigurationError(
      'resolveProviders requires a non-empty providers array'
    );
  }

  // Step 1: Assign providers to slots based on their declared roles
  const slots: Partial<Record<ProviderRole, BaseProvider>> = {};

  for (const provider of providers) {
    const providerName = provider.constructor.name;

    if (!provider.roles || provider.roles.length === 0) {
      throw new ConfigurationError(
        `Provider "${providerName}" declares no roles. Every provider must declare at least one role.`
      );
    }

    for (const role of provider.roles) {
      if (slots[role]) {
        const existingName = slots[role].constructor.name;
        throw new ConfigurationError(
          `Duplicate role "${role}": both "${existingName}" and "${providerName}" claim this role`
        );
      }
      slots[role] = provider;
    }
  }

  // Step 2: Auto-fill defaults for uncovered role pairs
  // NativeSTT covers input + stt; NativeTTS covers tts + output
  // Only auto-fill when BOTH roles in the pair are uncovered
  if (!slots.input && !slots.stt) {
    const defaultSTT = new NativeSTT();
    slots.input = defaultSTT;
    slots.stt = defaultSTT;
  }

  if (!slots.tts && !slots.output) {
    const defaultTTS = new NativeTTS();
    slots.tts = defaultTTS;
    slots.output = defaultTTS;
  }

  // Step 3: Validate all roles are covered
  const uncovered = ALL_PROVIDER_ROLES.filter((role) => !slots[role]);
  if (uncovered.length > 0) {
    throw new ConfigurationError(
      `Uncovered pipeline role(s): ${uncovered.join(', ')}. ` +
        'Provide a provider for each uncovered role, or use a multi-role provider that covers them.'
    );
  }

  // Step 4: Duck-type validate each slot
  for (const role of ALL_PROVIDER_ROLES) {
    validateSlotInterface(slots[role]!, role);
  }

  // Step 5: Return the typed pipeline
  return {
    input: slots.input as unknown as AudioInputProvider,
    stt: slots.stt as unknown as STTProvider,
    llm: slots.llm as unknown as LLMProvider,
    tts: slots.tts as unknown as TTSProvider,
    output: slots.output as unknown as AudioOutputProvider,
  };
}
