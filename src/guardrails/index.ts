/**
 * Built-in guardrails — the pluggable async filters between LLM output and TTS.
 *
 * @remarks
 * Each factory returns a plain {@link Guardrail} object, so they compose freely
 * with each other and with guardrails you write yourself. Order matters: the
 * chain runs left to right, each filter receiving the previous one's output,
 * and stops at the first block.
 *
 * A useful default ordering is cheap-and-local first, network-bound last:
 *
 * ```typescript
 * guardrails: {
 *   filters: [
 *     createBlocklistGuardrail({ terms: codenames }),   // local, catches early
 *     createPIIRedactionGuardrail(),                    // local, rewrites
 *     createPronunciationGuardrail({ replacements }),   // local, last word on wording
 *     createModerationGuardrail({ moderate }),          // network, final stage only
 *   ],
 * }
 * ```
 *
 * @see {@link Guardrail} for the interface every filter implements.
 * @see {@link GuardrailsConfig} for chain-level settings.
 *
 * @packageDocumentation
 */

export { createPatternRedactionGuardrail, createPIIRedactionGuardrail } from './redaction';
export type {
  PIIType,
  RedactionPattern,
  PatternRedactionOptions,
  PIIRedactionOptions,
} from './redaction';

export { createPronunciationGuardrail } from './pronunciation';
export type { PronunciationOptions } from './pronunciation';

export { createBlocklistGuardrail } from './blocklist';
export type { BlocklistAction, BlocklistOptions } from './blocklist';

export { createModerationGuardrail } from './moderation';
export type { ModerationFn, ModerationOptions, ModerationVerdict } from './moderation';
