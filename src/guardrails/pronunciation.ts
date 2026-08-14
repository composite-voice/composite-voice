/**
 * Pronunciation guardrail — rewrites terms a TTS voice mispronounces.
 *
 * @remarks
 * TTS engines routinely stumble over acronyms, product names, and CLI tools:
 * "SQL" comes out as ess-cue-ell, "kubectl" as an unpronounceable cluster,
 * "Ln" as the letter pair rather than a name. Substituting a phonetic spelling
 * on the way to the synthesizer fixes this without polluting the model's
 * output — the chat transcript still shows the real term, only the audio
 * changes.
 *
 * @packageDocumentation
 */

import type { Guardrail, GuardrailStage } from '../core/types/guardrails';

/** Options for {@link createPronunciationGuardrail}. */
export interface PronunciationOptions {
  /**
   * Terms to rewrite, mapped to what the synthesizer should receive.
   *
   * @example
   * ```typescript
   * { SQL: 'sequel', kubectl: 'kube control', 'Ln.': 'Lane' }
   * ```
   */
  replacements: Readonly<Record<string, string>>;

  /**
   * Require the term to be matched case-sensitively.
   *
   * @remarks
   * Off by default so `sql`, `Sql`, and `SQL` are all fixed. Turn it on when a
   * term collides with an ordinary word in another casing — e.g. rewriting
   * `IT` but not `it`.
   *
   * @defaultValue false
   */
  caseSensitive?: boolean;

  /**
   * Require the term to stand alone rather than matching inside a longer word.
   *
   * @remarks
   * On by default, so replacing `AI` leaves `SAID` and `chain` untouched.
   * Terms that begin or end with a non-word character (`.NET`, `C++`) get the
   * boundary applied only on the side where it is meaningful.
   *
   * @defaultValue true
   */
  wholeWord?: boolean;

  /**
   * Guardrail name reported in events.
   *
   * @defaultValue `'pronunciation'`
   */
  name?: string;

  /**
   * Stages at which to run.
   *
   * @defaultValue both stages
   */
  stages?: readonly GuardrailStage[] | undefined;
}

/** Escape regex metacharacters so terms are matched literally. */
function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the matcher for one term.
 *
 * @remarks
 * `\b` only means anything next to a word character, so it is applied per-side:
 * `.NET` gets a boundary on the right but not the left, where the leading `.`
 * would make `\b` match in the wrong places.
 */
function buildMatcher(term: string, caseSensitive: boolean, wholeWord: boolean): RegExp {
  const escaped = escapeRegExp(term);
  const leading = wholeWord && /^\w/.test(term) ? '\\b' : '';
  const trailing = wholeWord && /\w$/.test(term) ? '\\b' : '';
  return new RegExp(`${leading}${escaped}${trailing}`, caseSensitive ? 'g' : 'gi');
}

/**
 * Create a guardrail that swaps terms for their spoken form before synthesis.
 *
 * @remarks
 * Longer terms are matched first, so a dictionary containing both `AWS` and
 * `AWS Lambda` applies the more specific entry. Each term then runs in turn over
 * the result of the previous one, so a spoken form that happens to contain
 * another (shorter) dictionary key will itself be rewritten — mapping
 * `{ PostgreSQL: 'post gres SQL', SQL: 'sequel' }` speaks "post gres sequel".
 * Spell replacements out phonetically to avoid the cascade.
 *
 * @example
 * ```typescript
 * const agent = new CompositeVoice({
 *   providers: [...],
 *   guardrails: {
 *     filters: [
 *       createPronunciationGuardrail({
 *         replacements: {
 *           SQL: 'sequel',
 *           kubectl: 'kube control',
 *           PostgreSQL: 'post-gres-Q-L',
 *           'CI/CD': 'C I C D',
 *         },
 *       }),
 *     ],
 *   },
 * });
 * ```
 */
export function createPronunciationGuardrail(options: PronunciationOptions): Guardrail {
  const caseSensitive = options.caseSensitive ?? false;
  const wholeWord = options.wholeWord ?? true;

  // Longest first so specific entries win over the prefixes they contain.
  const entries = Object.entries(options.replacements)
    .sort((a, b) => b[0].length - a[0].length)
    .map(([term, spoken]) => ({
      term,
      spoken,
      matcher: buildMatcher(term, caseSensitive, wholeWord),
    }));

  return {
    name: options.name ?? 'pronunciation',
    stages: options.stages,
    check(text) {
      let current = text;
      const applied: string[] = [];

      for (const { term, spoken, matcher } of entries) {
        matcher.lastIndex = 0;
        // Function form so a spoken value containing `$&`, `$1`, or `$'` is
        // inserted literally rather than read as a substitution token.
        const next = current.replace(matcher, () => spoken);
        if (next !== current) {
          applied.push(term);
          current = next;
        }
        matcher.lastIndex = 0;
      }

      if (current === text) return;

      return {
        text: current,
        reason: `applied pronunciation for ${applied.join(', ')}`,
        metadata: { terms: applied },
      };
    },
  };
}
