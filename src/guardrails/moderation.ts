/**
 * Moderation guardrail — adapts an async classification API to the guardrail
 * interface.
 *
 * @remarks
 * The SDK does not ship a moderation model or bind to a specific vendor. This
 * factory takes whatever `moderate` function you already have — OpenAI's
 * moderations endpoint, AWS Comprehend, Azure Content Safety, an internal
 * classifier — and turns it into a {@link Guardrail} with the timeout, error
 * policy, and event reporting the pipeline expects.
 *
 * @packageDocumentation
 */

import type { Guardrail, GuardrailContext, GuardrailStage } from '../core/types/guardrails';

/** Verdict returned by a {@link ModerationFn}. */
export interface ModerationVerdict {
  /** Whether the text violates policy. */
  flagged: boolean;
  /** Violated categories, surfaced in the guardrail event metadata. */
  categories?: readonly string[];
  /** Confidence or severity, surfaced in the guardrail event metadata. */
  score?: number;
  /**
   * Sanitized text to speak instead of the original.
   *
   * @remarks
   * When present on a flagged verdict, this is spoken and the utterance is not
   * blocked — the escape hatch for classifiers that rewrite rather than reject.
   */
  text?: string;
}

/**
 * Classifies text as acceptable or not.
 *
 * @param text - Text about to be spoken.
 * @param context - Stage, accumulated text, history, and abort signal. Forward
 *   `context.signal` to `fetch` so an interrupted turn cancels the request.
 */
export type ModerationFn = (
  text: string,
  context: GuardrailContext
) => ModerationVerdict | Promise<ModerationVerdict>;

/** Options for {@link createModerationGuardrail}. */
export interface ModerationOptions {
  /** The classifier to call. */
  moderate: ModerationFn;

  /**
   * Text spoken in place of a flagged utterance.
   *
   * @remarks
   * When set, flagged text is replaced rather than blocked, so the agent says
   * something ("I can't help with that") instead of falling silent. Ignored
   * when the verdict carries its own `text`.
   */
  replacement?: string;

  /**
   * Stages at which to run.
   *
   * @remarks
   * Defaults to `['final']` — a network round trip per streamed segment would
   * add latency to every sentence, and the finished utterance is what a
   * classifier can judge most reliably. Add `'chunk'` deliberately, with a
   * short `timeoutMs`, if you need earlier interception.
   *
   * @defaultValue `['final']`
   */
  stages?: readonly GuardrailStage[] | undefined;

  /**
   * Guardrail name reported in events.
   *
   * @defaultValue `'moderation'`
   */
  name?: string;
}

/**
 * Create a guardrail backed by an async moderation classifier.
 *
 * @remarks
 * Pair with `mode: 'buffered'` and `onError: 'block'` when a flagged response
 * must never be partially spoken: buffering holds the audio until the verdict
 * is in, and the fail-closed policy means a classifier outage produces silence
 * rather than unfiltered output.
 *
 * @example
 * ```typescript
 * const agent = new CompositeVoice({
 *   providers: [...],
 *   guardrails: {
 *     mode: 'buffered',
 *     onError: 'block',
 *     timeoutMs: 2000,
 *     filters: [
 *       createModerationGuardrail({
 *         replacement: "I'm not able to help with that.",
 *         async moderate(text, ctx) {
 *           const res = await fetch('/api/moderate', {
 *             method: 'POST',
 *             headers: { 'content-type': 'application/json' },
 *             body: JSON.stringify({ text }),
 *             signal: ctx.signal,
 *           });
 *           const { flagged, categories } = await res.json();
 *           return { flagged, categories };
 *         },
 *       }),
 *     ],
 *   },
 * });
 *
 * agent.on('guardrail.blocked', ({ guardrail, reason }) => {
 *   console.warn(`${guardrail} suppressed a response: ${reason}`);
 * });
 * ```
 */
export function createModerationGuardrail(options: ModerationOptions): Guardrail {
  return {
    name: options.name ?? 'moderation',
    stages: options.stages ?? ['final'],
    async check(text, context) {
      if (!text.trim()) return;

      const verdict = await options.moderate(text, context);
      if (!verdict.flagged) return;

      const metadata: Record<string, unknown> = {};
      if (verdict.categories) metadata.categories = verdict.categories;
      if (verdict.score !== undefined) metadata.score = verdict.score;

      const reason = verdict.categories?.length
        ? `flagged: ${verdict.categories.join(', ')}`
        : 'flagged by moderation';

      const substitute = verdict.text ?? options.replacement;
      if (substitute !== undefined) {
        return { text: substitute, reason, metadata };
      }

      return { block: true, reason, metadata };
    },
  };
}
