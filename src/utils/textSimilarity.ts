/**
 * Lightweight text similarity utilities for the eager LLM pipeline.
 *
 * @remarks
 * Used to compare preflight (eager end-of-turn) transcription text against
 * the final confirmed transcription. Because the transcript evolves between
 * `EagerEndOfTurn` and `EndOfTurn`, an exact string match almost never works.
 * Instead we measure how similar the two texts are and let the caller decide
 * whether the speculative LLM response is still usable.
 *
 * @packageDocumentation
 */

/**
 * Compute a similarity score (0–1) between two transcript strings.
 *
 * @remarks
 * Uses an order-aware word overlap approach: normalizes both strings to
 * lowercase, splits into words, then checks how many words from the shorter
 * string appear — in order — in the longer string. This handles the most
 * common eager-pipeline scenario where `EndOfTurn` text is a superset of
 * `EagerEndOfTurn` text (e.g., "hello world" → "hello world how are you").
 *
 * - Returns `1.0` when the texts are identical (after normalization).
 * - Returns `1.0` when the eager text is a perfect prefix of the final text.
 * - Returns a value between 0 and 1 based on the proportion of matching
 *   words when the texts diverge.
 * - Returns `0` when the texts share no words.
 *
 * @param a - First text (typically the preflight/eager transcript).
 * @param b - Second text (typically the confirmed/final transcript).
 * @returns A similarity score from 0 (completely different) to 1 (identical).
 *
 * @example
 * ```typescript
 * textSimilarity('hello world', 'hello world');           // 1.0
 * textSimilarity('hello world', 'hello world how are you'); // 1.0 (prefix match)
 * textSimilarity('hello world', 'goodbye world');         // 0.5
 * textSimilarity('hello', 'goodbye');                     // 0.0
 * ```
 */
export function textSimilarity(a: string, b: string): number {
  const wordsA = normalizeToWords(a);
  const wordsB = normalizeToWords(b);

  if (wordsA.length === 0 && wordsB.length === 0) return 1;
  if (wordsA.length === 0 || wordsB.length === 0) return 0;

  // Determine which is shorter (the "eager" text) and which is longer (the "final" text)
  const shorter = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const longer = wordsA.length <= wordsB.length ? wordsB : wordsA;

  // Count how many words from the shorter text appear in the longer text, in order
  let matchCount = 0;
  let longerIdx = 0;

  for (const word of shorter) {
    // Scan forward in the longer text to find this word
    while (longerIdx < longer.length) {
      if (longer[longerIdx] === word) {
        matchCount++;
        longerIdx++;
        break;
      }
      longerIdx++;
    }
    if (longerIdx >= longer.length) break;
  }

  // Score: ratio of matched words from the shorter text
  // This means "hello world" vs "hello world how are you" → 2/2 = 1.0
  // And "hello world" vs "goodbye world" → 1/2 = 0.5
  return matchCount / shorter.length;
}

/**
 * Normalize a string to an array of lowercase words.
 *
 * @param text - The input text.
 * @returns An array of lowercase word tokens, with punctuation stripped.
 */
function normalizeToWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // strip punctuation
    .split(/\s+/)
    .filter((w) => w.length > 0);
}
