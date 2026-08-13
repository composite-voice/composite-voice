/**
 * Blocklist guardrail — local term and pattern matching, no network call.
 *
 * @remarks
 * The cheap first line of defence in front of a moderation API: competitor
 * names, unreleased product codenames, profanity, and phrases the business has
 * decided the agent must never say. Because it runs locally it is safe on the
 * `'chunk'` stage, catching most violations before the first audio frame is
 * synthesized.
 *
 * @packageDocumentation
 */

import type { Guardrail, GuardrailStage } from '../core/types/guardrails';

/** What a blocklist match does to the utterance. */
export type BlocklistAction = 'block' | 'redact';

/** Options for {@link createBlocklistGuardrail}. */
export interface BlocklistOptions {
  /**
   * Literal terms to match.
   *
   * @remarks
   * Matched case-insensitively on whole words by default; see
   * {@link BlocklistOptions.caseSensitive} and {@link BlocklistOptions.wholeWord}.
   */
  terms?: readonly string[];

  /**
   * Patterns to match, for anything literals cannot express.
   *
   * @remarks
   * Applied as-is. Include the global flag when using
   * `action: 'redact'` so every occurrence is replaced.
   */
  patterns?: readonly RegExp[];

  /**
   * What to do on a match.
   *
   * @remarks
   * - `'block'` (default) — suppress the text. At the `'final'` stage nothing
   *   is spoken; at the `'chunk'` stage the rest of the utterance is dropped.
   * - `'redact'` — replace each match with
   *   {@link BlocklistOptions.replacement} and speak the rest.
   *
   * @defaultValue 'block'
   */
  action?: BlocklistAction;

  /**
   * Text substituted for each match when `action` is `'redact'`.
   *
   * @defaultValue `'[removed]'`
   */
  replacement?: string;

  /**
   * Match terms case-sensitively.
   *
   * @defaultValue false
   */
  caseSensitive?: boolean;

  /**
   * Require terms to match whole words rather than substrings.
   *
   * @remarks
   * On by default, so blocking `ass` does not also block `assessment`.
   *
   * @defaultValue true
   */
  wholeWord?: boolean;

  /**
   * Guardrail name reported in events.
   *
   * @defaultValue `'blocklist'`
   */
  name?: string;

  /**
   * Stages at which to run.
   *
   * @defaultValue both stages
   */
  stages?: readonly GuardrailStage[] | undefined;
}

function escapeRegExp(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a guardrail that blocks or redacts forbidden terms and patterns.
 *
 * @example Block codenames outright, redact profanity
 * ```typescript
 * guardrails: {
 *   filters: [
 *     createBlocklistGuardrail({
 *       name: 'codenames',
 *       terms: ['Project Halcyon', 'Titan-2'],
 *     }),
 *     createBlocklistGuardrail({
 *       name: 'profanity',
 *       terms: [...profanityList],
 *       action: 'redact',
 *       replacement: '—',
 *     }),
 *   ],
 * }
 * ```
 *
 * @remarks
 * A `'block'` result at the `'chunk'` stage cannot recall audio the TTS
 * provider has already received. Set `mode: 'buffered'` on the guardrails
 * config when a blocked term must never be partially spoken.
 */
export function createBlocklistGuardrail(options: BlocklistOptions): Guardrail {
  const action = options.action ?? 'block';
  const replacement = options.replacement ?? '[removed]';
  const caseSensitive = options.caseSensitive ?? false;
  const wholeWord = options.wholeWord ?? true;

  const flags = caseSensitive ? 'g' : 'gi';
  const termMatchers = (options.terms ?? []).map((term) => {
    const escaped = escapeRegExp(term);
    const leading = wholeWord && /^\w/.test(term) ? '\\b' : '';
    const trailing = wholeWord && /\w$/.test(term) ? '\\b' : '';
    return { source: term, matcher: new RegExp(`${leading}${escaped}${trailing}`, flags) };
  });

  const patternMatchers = (options.patterns ?? []).map((pattern) => ({
    source: pattern.source,
    matcher: pattern,
  }));

  const matchers = [...termMatchers, ...patternMatchers];

  return {
    name: options.name ?? 'blocklist',
    stages: options.stages,
    check(text) {
      let current = text;
      const matched: string[] = [];

      for (const { source, matcher } of matchers) {
        matcher.lastIndex = 0;
        const hit = matcher.test(current);
        matcher.lastIndex = 0;
        if (!hit) continue;

        matched.push(source);
        if (action === 'redact') {
          // Function form so a replacement containing `$&`, `$1`, or `$'` is
          // inserted literally rather than read as a substitution token.
          current = current.replace(matcher, () => replacement);
          matcher.lastIndex = 0;
        }
      }

      if (matched.length === 0) return;

      if (action === 'block') {
        return {
          block: true,
          reason: `blocklist match: ${matched.join(', ')}`,
          metadata: { matched },
        };
      }

      return {
        text: current,
        reason: `blocklist redaction: ${matched.join(', ')}`,
        metadata: { matched },
      };
    },
  };
}
