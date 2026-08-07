/**
 * Pattern- and PII-redaction guardrails.
 *
 * @remarks
 * These guardrails rewrite text rather than block it: the agent still answers,
 * it just does not read sensitive strings out loud. Redaction runs entirely
 * locally — no text leaves the process — so it is cheap enough for the
 * `'chunk'` stage and adds no latency to the turn.
 *
 * @packageDocumentation
 */

import type { Guardrail, GuardrailStage } from '../core/types/guardrails';

/**
 * Categories of personally identifiable information recognized by
 * {@link createPIIRedactionGuardrail}.
 *
 * @remarks
 * The patterns are deliberately conservative — they favour missing an unusual
 * format over redacting ordinary prose. Credit card candidates are additionally
 * validated with the Luhn checksum, so figures like `1234 5678 9012 3456` that
 * happen to look card-shaped are left alone unless they check out.
 */
export type PIIType = 'email' | 'phone' | 'ssn' | 'creditCard' | 'ipAddress';

/** A named pattern and the text spoken in its place. */
export interface RedactionPattern {
  /** Label used in the `guardrail.applied` event metadata. */
  name: string;
  /** Pattern to match. Must carry the global flag to redact every occurrence. */
  pattern: RegExp;
  /**
   * Replacement for each match.
   *
   * @remarks
   * Overrides the guardrail-level replacement. May be a function for
   * context-sensitive substitutions (e.g. speaking only the last four digits).
   */
  replacement?: string | ((match: string) => string);
}

/** Options for {@link createPatternRedactionGuardrail}. */
export interface PatternRedactionOptions {
  /** Patterns to redact, applied in order. */
  patterns: readonly RedactionPattern[];
  /**
   * Default replacement for patterns without their own.
   *
   * @defaultValue `'[redacted]'`
   */
  replacement?: string;
  /**
   * Guardrail name reported in events.
   *
   * @defaultValue `'pattern-redaction'`
   */
  name?: string;
  /**
   * Stages at which to run.
   *
   * @defaultValue both stages
   */
  stages?: readonly GuardrailStage[] | undefined;
}

/** Options for {@link createPIIRedactionGuardrail}. */
export interface PIIRedactionOptions {
  /**
   * PII categories to redact.
   *
   * @defaultValue every {@link PIIType}
   */
  types?: readonly PIIType[];
  /**
   * Text spoken in place of a match.
   *
   * @defaultValue `'[redacted]'`
   */
  replacement?: string;
  /**
   * Per-category replacement overrides.
   *
   * @example
   * ```typescript
   * createPIIRedactionGuardrail({
   *   replacements: { email: 'an email address', phone: 'a phone number' },
   * });
   * ```
   */
  replacements?: Partial<Record<PIIType, string>>;
  /**
   * Extra patterns to redact alongside the built-in categories.
   *
   * @remarks
   * Use for domain-specific identifiers — policy numbers, case IDs, internal
   * account formats.
   */
  additionalPatterns?: readonly RedactionPattern[];
  /**
   * Guardrail name reported in events.
   *
   * @defaultValue `'pii-redaction'`
   */
  name?: string;
  /**
   * Stages at which to run.
   *
   * @defaultValue both stages
   */
  stages?: readonly GuardrailStage[] | undefined;
}

const DEFAULT_REPLACEMENT = '[redacted]';

/**
 * Built-in PII patterns, ordered most-specific first.
 *
 * @remarks
 * Order matters: an IP address is checked before a phone number so that
 * dotted-quad addresses are labelled correctly, and structured identifiers
 * (SSN, card) are checked before the looser phone pattern.
 */
const PII_PATTERNS: Record<PIIType, RegExp> = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b(?:\d{4}[ -]?){3}\d{3,4}\b/g,
  ipAddress: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g,
  phone: /(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]?\d{3}[ .-]?\d{4}\b/g,
};

/** Evaluation order for the built-in patterns. */
const PII_ORDER: readonly PIIType[] = ['email', 'ssn', 'creditCard', 'ipAddress', 'phone'];

/**
 * Luhn checksum, used to reject card-shaped numbers that are not card numbers.
 */
function passesLuhn(candidate: string): boolean {
  const digits = candidate.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Apply one pattern to the text, returning the result and the match count.
 *
 * @remarks
 * `lastIndex` is reset first because global regexes carry state between calls
 * and these patterns are module-level constants shared across invocations.
 */
function applyPattern(
  text: string,
  { pattern, replacement }: RedactionPattern,
  fallback: string
): { text: string; matches: number } {
  pattern.lastIndex = 0;
  let matches = 0;

  const next = text.replace(pattern, (match) => {
    const substitute =
      typeof replacement === 'function' ? replacement(match) : (replacement ?? fallback);
    // A replacement may decline the match (the credit-card checksum does this),
    // in which case nothing was redacted and it should not be reported as such.
    if (substitute !== match) matches++;
    return substitute;
  });

  pattern.lastIndex = 0;
  return { text: next, matches };
}

/**
 * Create a guardrail that rewrites every match of the supplied patterns.
 *
 * @remarks
 * The general-purpose building block behind {@link createPIIRedactionGuardrail}.
 * Reach for it when you need to silence identifiers the built-in PII categories
 * do not cover.
 *
 * @example Speak only the last four digits of an account number
 * ```typescript
 * createPatternRedactionGuardrail({
 *   patterns: [
 *     {
 *       name: 'account',
 *       pattern: /\b\d{8,12}\b/g,
 *       replacement: (match) => `account ending ${match.slice(-4)}`,
 *     },
 *   ],
 * });
 * ```
 */
export function createPatternRedactionGuardrail(options: PatternRedactionOptions): Guardrail {
  const fallback = options.replacement ?? DEFAULT_REPLACEMENT;
  const patterns = options.patterns;

  return {
    name: options.name ?? 'pattern-redaction',
    stages: options.stages,
    check(text) {
      let current = text;
      const redacted: Record<string, number> = {};

      for (const entry of patterns) {
        const result = applyPattern(current, entry, fallback);
        if (result.matches > 0) {
          redacted[entry.name] = (redacted[entry.name] ?? 0) + result.matches;
          current = result.text;
        }
      }

      if (current === text) return;

      return {
        text: current,
        reason: `redacted ${Object.keys(redacted).join(', ')}`,
        metadata: { redacted },
      };
    },
  };
}

/**
 * Create a guardrail that redacts common PII before it is spoken.
 *
 * @remarks
 * Covers email addresses, phone numbers, US social security numbers, credit
 * card numbers (Luhn-validated), and IPv4 addresses. Runs at both stages by
 * default; the patterns are local and allocation-light, so leaving it on the
 * `'chunk'` stage costs nothing measurable.
 *
 * With the default `'sentence'` segmentation, patterns are not split across
 * streaming boundaries — an email address arriving in three chunks is still
 * matched as one string.
 *
 * @example
 * ```typescript
 * const agent = new CompositeVoice({
 *   providers: [...],
 *   guardrails: {
 *     filters: [
 *       createPIIRedactionGuardrail({
 *         types: ['email', 'phone', 'creditCard'],
 *         replacements: { creditCard: 'the card on file' },
 *       }),
 *     ],
 *   },
 * });
 * ```
 */
export function createPIIRedactionGuardrail(options: PIIRedactionOptions = {}): Guardrail {
  const types = options.types ?? PII_ORDER;
  const selected = PII_ORDER.filter((type) => types.includes(type));
  const fallback = options.replacement ?? DEFAULT_REPLACEMENT;

  const patterns: RedactionPattern[] = selected.map((type) => ({
    name: type,
    pattern: PII_PATTERNS[type],
    replacement:
      type === 'creditCard'
        ? // Card-shaped digits that fail the checksum are almost always
          // ordinary numbers (order IDs, dates) — leave them spoken.
          (match: string) =>
            passesLuhn(match) ? (options.replacements?.creditCard ?? fallback) : match
        : (options.replacements?.[type] ?? fallback),
  }));

  patterns.push(...(options.additionalPatterns ?? []));

  return createPatternRedactionGuardrail({
    patterns,
    replacement: fallback,
    name: options.name ?? 'pii-redaction',
    stages: options.stages,
  });
}
