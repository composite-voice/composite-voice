/**
 * Word Error Rate computation — Appendix B of METHODOLOGY.md
 *
 * WER = (S + D + I) / N
 *
 * Where:
 *   S = Substitutions (wrong words)
 *   D = Deletions (missing words)
 *   I = Insertions (extra words)
 *   N = Total words in reference
 *
 * Computed via dynamic programming (Levenshtein distance at word level).
 */

/**
 * Normalize text for WER comparison.
 *
 * 1. Convert to lowercase
 * 2. Remove all punctuation
 * 3. Collapse multiple spaces to single space
 * 4. Trim leading/trailing whitespace
 */
export function normalizeForWER(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 0);
}

/**
 * Compute Word Error Rate between a reference and hypothesis.
 *
 * Returns a value between 0 and Infinity (WER can exceed 1.0 if
 * there are more insertions than reference words).
 *
 * Returns 0 if both reference and hypothesis are empty.
 * Returns 1 if reference is non-empty and hypothesis is empty (all deletions).
 */
export function computeWER(reference: string, hypothesis: string): number {
  const ref = normalizeForWER(reference);
  const hyp = normalizeForWER(hypothesis);

  if (ref.length === 0 && hyp.length === 0) return 0;
  if (ref.length === 0) return hyp.length; // All insertions, no reference

  const n = ref.length;
  const m = hyp.length;

  // DP table: dp[i][j] = edit distance between ref[0..i-1] and hyp[0..j-1]
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  // Base cases
  for (let i = 0; i <= n; i++) dp[i][0] = i; // All deletions
  for (let j = 0; j <= m; j++) dp[0][j] = j; // All insertions

  // Fill table
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (ref[i - 1] === hyp[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1]; // Match — no cost
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j - 1] + 1, // Substitution
          dp[i - 1][j] + 1, // Deletion
          dp[i][j - 1] + 1, // Insertion
        );
      }
    }
  }

  // WER = total edits / reference length
  return dp[n][m] / n;
}
