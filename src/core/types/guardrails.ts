/**
 * Guardrail types — the pluggable async filter between LLM output and TTS.
 *
 * @remarks
 * A guardrail sits on the last hop of the pipeline, after the LLM has produced
 * text but before that text reaches the TTS provider:
 *
 * ```
 * [LLM] → [Guardrails] → [TTS] → OutputQueue → [OutputProvider]
 * ```
 *
 * Every guardrail implements one method, {@link Guardrail.check}, which may be
 * synchronous or asynchronous. It receives text and returns a
 * {@link GuardrailResult} describing what should be spoken — the text
 * unchanged, a rewritten version (redaction, pronunciation fixes), or nothing
 * at all (blocked). Guardrails run in configuration order, each receiving the
 * output of the previous one.
 *
 * Guardrails only affect what is *spoken*. The `llm.chunk` and `llm.complete`
 * events still carry the raw model output, so a chat transcript rendered from
 * those events is unchanged. Subscribe to `guardrail.applied` /
 * `guardrail.blocked` if the UI needs to reflect the filtered text.
 *
 * @packageDocumentation
 */

import type { LLMMessage } from './providers';

/**
 * Pipeline point at which a guardrail runs.
 *
 * @remarks
 * - `'chunk'` — text is filtered while the LLM streams, before it is forwarded
 *   to a Live (WebSocket) TTS provider. Lowest latency, but a guardrail only
 *   sees one segment at a time and can only suppress text that has not been
 *   spoken yet.
 * - `'final'` — text is filtered once per utterance, after generation
 *   completes. Used for REST TTS, and for Live TTS when
 *   {@link GuardrailsConfig.mode} is `'buffered'`. A block here suppresses the
 *   whole utterance.
 *
 * @see {@link Guardrail.stages} to restrict a guardrail to one stage.
 */
export type GuardrailStage = 'chunk' | 'final';

/**
 * Context passed to {@link Guardrail.check} alongside the text to filter.
 */
export interface GuardrailContext {
  /** Which pipeline point this call is running at. */
  stage: GuardrailStage;

  /**
   * All raw LLM text produced for this utterance so far.
   *
   * @remarks
   * At the `'final'` stage this is the complete response. At the `'chunk'`
   * stage it includes the segment currently being filtered plus everything
   * that preceded it, which lets a guardrail reason about context it has
   * already let through.
   */
  accumulated: string;

  /**
   * Conversation history at the time of the call, oldest first.
   *
   * @remarks
   * Read-only. Mutating it has no effect on the pipeline.
   */
  messages: readonly LLMMessage[];

  /**
   * Signal for the in-flight generation.
   *
   * @remarks
   * Aborted on barge-in or eager-pipeline cancellation. Guardrails that call
   * a network moderation API should forward this to `fetch` so the request is
   * cancelled when the user interrupts.
   */
  signal?: AbortSignal;
}

/**
 * What a guardrail decided about the text it was given.
 *
 * @remarks
 * Returning `undefined` (or nothing) is equivalent to `{}` — the text passes
 * through unchanged.
 */
export interface GuardrailResult {
  /**
   * Replacement text to pass downstream.
   *
   * @remarks
   * Omit to keep the input unchanged. Set to `''` to drop this text silently
   * without blocking the rest of the utterance.
   */
  text?: string;

  /**
   * Suppress the text instead of speaking it.
   *
   * @remarks
   * At the `'final'` stage nothing is synthesized at all. At the `'chunk'`
   * stage the current segment and every later segment of the same utterance
   * are suppressed — text already handed to the TTS provider cannot be
   * recalled. Use `mode: 'buffered'` when a block must be absolute.
   */
  block?: boolean;

  /** Human-readable explanation, surfaced on `guardrail.applied` / `guardrail.blocked`. */
  reason?: string;

  /** Arbitrary detail (matched categories, scores) surfaced on the same events. */
  metadata?: Record<string, unknown>;
}

/**
 * A pluggable async filter applied to LLM text before it reaches TTS.
 *
 * @example Redact account numbers before they are spoken
 * ```typescript
 * const redactAccounts: Guardrail = {
 *   name: 'account-numbers',
 *   check(text) {
 *     return { text: text.replace(/\b\d{10}\b/g, 'your account') };
 *   },
 * };
 * ```
 *
 * @example Call an async moderation API on the finished utterance
 * ```typescript
 * const moderation: Guardrail = {
 *   name: 'moderation',
 *   stages: ['final'],
 *   async check(text, ctx) {
 *     const res = await fetch('/api/moderate', {
 *       method: 'POST',
 *       body: JSON.stringify({ text }),
 *       signal: ctx.signal,
 *     });
 *     const { flagged, categories } = await res.json();
 *     return flagged
 *       ? { block: true, reason: 'flagged by moderation', metadata: { categories } }
 *       : {};
 *   },
 * };
 * ```
 *
 * @see {@link GuardrailsConfig} for wiring guardrails into the pipeline.
 */
export interface Guardrail {
  /** Identifier used in logs and guardrail events. Should be unique. */
  readonly name: string;

  /**
   * Stages at which this guardrail runs.
   *
   * @remarks
   * Defaults to both stages. Restrict to `['final']` for expensive or
   * network-bound checks that need the whole utterance; restrict to
   * `['chunk']` for cheap rewrites that must not run twice.
   *
   * @defaultValue `['chunk', 'final']`
   */
  readonly stages?: readonly GuardrailStage[] | undefined;

  /**
   * Inspect and optionally rewrite or block the text.
   *
   * @param text - Text to filter — the output of the preceding guardrail, or
   *   the raw LLM text for the first guardrail in the chain.
   * @param context - Stage, accumulated text, history, and abort signal.
   * @returns The decision, or nothing to pass the text through unchanged.
   */
  check(
    text: string,
    context: GuardrailContext
  ): GuardrailResult | void | Promise<GuardrailResult | void>;
}

/**
 * What to do when a guardrail throws or exceeds its timeout.
 *
 * @remarks
 * - `'passthrough'` — fail open: log, skip the guardrail, keep the text.
 * - `'block'` — fail closed: suppress the text. Choose this when speaking
 *   unfiltered output is worse than speaking nothing.
 */
export type GuardrailErrorPolicy = 'passthrough' | 'block';

/**
 * When guardrails run relative to TTS streaming.
 *
 * @remarks
 * - `'streaming'` — filter each segment as the LLM produces it and forward it
 *   to Live TTS immediately. Preserves streaming latency; a block can only
 *   suppress text not yet spoken.
 * - `'buffered'` — hold the entire response, filter it once, then hand it to
 *   TTS. Blocking is absolute, at the cost of waiting for generation to
 *   finish before any audio starts. Filtering happens at the `'final'` stage,
 *   so a guardrail restricted to `['chunk']` never runs in this mode.
 *
 * Only affects Live (WebSocket) TTS. REST TTS always receives the complete
 * response, so it is filtered at the `'final'` stage either way.
 */
export type GuardrailMode = 'streaming' | 'buffered';

/**
 * How streaming text is cut into units before guardrails see it.
 *
 * @remarks
 * - `'sentence'` — accumulate until a sentence boundary (`.`, `!`, `?`, `;`,
 *   `:`, newline followed by whitespace) or {@link GuardrailsConfig.maxSegmentChars}.
 *   Patterns such as email addresses are not split across calls, so
 *   regex-based redaction works reliably.
 * - `'chunk'` — filter every raw LLM chunk as it arrives. Minimum latency, but
 *   a pattern straddling two chunks will be missed.
 */
export type GuardrailSegmentation = 'sentence' | 'chunk';

/**
 * Configuration for the guardrail filter chain.
 *
 * @example PII redaction plus pronunciation fixes
 * ```typescript
 * import {
 *   CompositeVoice,
 *   createPIIRedactionGuardrail,
 *   createPronunciationGuardrail,
 * } from 'composite-voice';
 *
 * const agent = new CompositeVoice({
 *   providers: [...],
 *   guardrails: {
 *     filters: [
 *       createPIIRedactionGuardrail({ types: ['email', 'phone', 'ssn'] }),
 *       createPronunciationGuardrail({
 *         replacements: { SQL: 'sequel', kubectl: 'kube control' },
 *       }),
 *     ],
 *   },
 * });
 * ```
 *
 * @example Fail-closed moderation on the finished utterance
 * ```typescript
 * const agent = new CompositeVoice({
 *   providers: [...],
 *   guardrails: {
 *     mode: 'buffered',
 *     onError: 'block',
 *     timeoutMs: 2000,
 *     filters: [createModerationGuardrail({ moderate })],
 *   },
 * });
 * ```
 *
 * @see {@link Guardrail} for the filter interface.
 */
export interface GuardrailsConfig {
  /**
   * Filters to run, in order.
   *
   * @remarks
   * Each guardrail receives the output of the previous one. The chain stops at
   * the first guardrail that blocks.
   */
  filters: readonly Guardrail[];

  /**
   * Whether the chain is active.
   *
   * @remarks
   * Set to `false` to disable guardrails without removing the configuration —
   * useful for A/B rollouts and debugging.
   *
   * @defaultValue true
   */
  enabled?: boolean;

  /**
   * Whether to filter while streaming or to buffer the whole response first.
   *
   * @defaultValue 'streaming'
   * @see {@link GuardrailMode}
   */
  mode?: GuardrailMode;

  /**
   * How streaming text is cut into units before filtering.
   *
   * @defaultValue 'sentence'
   * @see {@link GuardrailSegmentation}
   */
  segmentation?: GuardrailSegmentation;

  /**
   * Maximum characters buffered before a segment is flushed without a
   * sentence boundary.
   *
   * @remarks
   * Bounds worst-case latency when a model emits a long run of text with no
   * punctuation. The cut is made at the last whitespace when possible. Only
   * applies to `'sentence'` segmentation.
   *
   * @defaultValue 240
   */
  maxSegmentChars?: number;

  /**
   * Per-guardrail time limit, in milliseconds.
   *
   * @remarks
   * A guardrail that has not settled within this window is treated as failed
   * and handled according to {@link GuardrailsConfig.onError}. Set to `0` to
   * wait indefinitely — not recommended for network-bound checks, since a
   * hung request stalls the whole turn.
   *
   * @defaultValue 1000
   */
  timeoutMs?: number;

  /**
   * What to do when a guardrail throws or times out.
   *
   * @defaultValue 'passthrough'
   * @see {@link GuardrailErrorPolicy}
   */
  onError?: GuardrailErrorPolicy;
}

/**
 * Default values applied to any {@link GuardrailsConfig} field left unset.
 */
export const DEFAULT_GUARDRAILS_CONFIG: Required<Omit<GuardrailsConfig, 'filters'>> = {
  enabled: true,
  mode: 'streaming',
  segmentation: 'sentence',
  maxSegmentChars: 240,
  timeoutMs: 1000,
  onError: 'passthrough',
};
