/**
 * Provider role definitions for the 5-role audio pipeline.
 *
 * @remarks
 * This module defines the five pipeline roles that providers can declare via
 * their {@link ProviderRole} property. The roles map directly to stages in the
 * CompositeVoice audio pipeline:
 *
 * ```
 * [input] -> InputQueue -> [stt] -> [llm] -> [tts] -> OutputQueue -> [output]
 * ```
 *
 * A single provider may cover multiple roles. For example, NativeSTT covers
 * both `'input'` and `'stt'` because the Web Speech API manages its own
 * microphone access internally.
 *
 * @see {@link AudioInputProvider} for the `'input'` role contract
 * @see {@link LiveSTTProvider} and {@link RestSTTProvider} for `'stt'` role contracts
 * @see {@link LLMProvider} for the `'llm'` role contract
 * @see {@link LiveTTSProvider} and {@link RestTTSProvider} for `'tts'` role contracts
 * @see {@link AudioOutputProvider} for the `'output'` role contract
 *
 * @packageDocumentation
 */

/**
 * Pipeline role a provider can fulfil.
 *
 * @remarks
 * Each value corresponds to a stage in the CompositeVoice audio pipeline:
 *
 * - `'input'`  — captures audio from a source (e.g. microphone, buffer)
 * - `'stt'`    — converts audio to text (speech-to-text)
 * - `'llm'`    — generates a text response (large language model)
 * - `'tts'`    — converts text to audio (text-to-speech)
 * - `'output'` — plays audio to a destination (e.g. speakers, null sink)
 *
 * Providers declare which roles they cover via `BaseProvider.roles`.
 * Multi-role providers list every role they handle (e.g. `['input', 'stt']`).
 *
 * @see {@link ALL_PROVIDER_ROLES} for the complete ordered list
 */
export type ProviderRole = 'input' | 'stt' | 'llm' | 'tts' | 'output';

/**
 * All provider roles in pipeline order.
 *
 * @remarks
 * This constant provides the canonical ordering of roles as they appear in the
 * audio pipeline, from audio capture through to audio playback. It is used by
 * the provider resolution algorithm to iterate over roles and validate that
 * every pipeline slot is filled.
 *
 * @example
 * ```typescript
 * import { ALL_PROVIDER_ROLES } from 'composite-voice';
 *
 * for (const role of ALL_PROVIDER_ROLES) {
 *   console.log(`Checking role: ${role}`);
 * }
 * // Output: input, stt, llm, tts, output
 * ```
 *
 * @see {@link ProviderRole} for the individual role type
 */
export const ALL_PROVIDER_ROLES: readonly ProviderRole[] = [
  'input',
  'stt',
  'llm',
  'tts',
  'output',
] as const;
