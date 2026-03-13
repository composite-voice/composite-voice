/**
 * Advanced text similarity tests — covers the eager LLM reconciliation scenarios
 * with emphasis on edge cases, prefix matching, and boundary conditions.
 */

import { textSimilarity } from '../../../src/utils/textSimilarity';

describe('textSimilarity — advanced eager LLM reconciliation', () => {
  describe('prefix matching', () => {
    it('should return 1.0 for exact prefix: "hello world" vs "hello world how are you"', () => {
      expect(textSimilarity('hello world', 'hello world how are you')).toBe(1);
    });

    it('should return 1.0 for single-word prefix', () => {
      expect(textSimilarity('hello', 'hello world foo bar')).toBe(1);
    });

    it('should return 1.0 for longer text as exact prefix of even longer text', () => {
      expect(
        textSimilarity(
          'the quick brown fox jumps',
          'the quick brown fox jumps over the lazy dog'
        )
      ).toBe(1);
    });

    it('should return 1.0 when both strings are identical', () => {
      expect(textSimilarity('exactly the same text', 'exactly the same text')).toBe(1);
    });
  });

  describe('partial overlap', () => {
    it('"the weather today" vs "weather today is nice" — ordered overlap', () => {
      // shorter is "the weather today" (3 words), longer is "weather today is nice" (4 words)
      // Scanning "the" in longer: "weather","today","is","nice" — no match for "the"
      // So after missing "the", pointer is exhausted → matchCount=0
      // Actually, let's trace more carefully:
      // shorter = ["the","weather","today"], longer = ["weather","today","is","nice"]
      // word "the": scan longer from idx 0: "weather" != "the", "today" != "the", "is" != "the", "nice" != "the" → no match, longerIdx=4 → break outer loop
      // matchCount = 0, score = 0/3 = 0
      const score = textSimilarity('the weather today', 'weather today is nice');
      expect(score).toBe(0);
    });

    it('"weather today" vs "weather today is nice" — exact prefix', () => {
      const score = textSimilarity('weather today', 'weather today is nice');
      expect(score).toBe(1);
    });

    it('"I like coding" vs "I really like coding" — insertion in middle', () => {
      // shorter = ["i","like","coding"], longer = ["i","really","like","coding"]
      // "i" matches at idx 0 → matchCount=1, longerIdx=1
      // "like" scan from 1: "really" no, "like" yes → matchCount=2, longerIdx=3
      // "coding" scan from 3: "coding" yes → matchCount=3, longerIdx=4
      // score = 3/3 = 1.0
      const score = textSimilarity('I like coding', 'I really like coding');
      expect(score).toBe(1);
    });

    it('should handle reordered words poorly (order-aware)', () => {
      // "world hello" vs "hello world"
      // shorter = ["hello","world"], longer = ["hello","world"] (same length, first chosen)
      // Actually both are length 2, so shorter = wordsA = ["world","hello"]
      // "world" scan from 0: "hello" no, "world" yes → matchCount=1, longerIdx=2
      // "hello" scan from 2: (exhausted) → break
      // score = 1/2 = 0.5
      const score = textSimilarity('world hello', 'hello world');
      expect(score).toBe(0.5);
    });
  });

  describe('completely different text', () => {
    it('should return 0.0 for no common words', () => {
      expect(textSimilarity('alpha beta gamma', 'delta epsilon zeta')).toBe(0);
    });

    it('should return 0.0 for semantically similar but lexically different', () => {
      expect(textSimilarity('big dog', 'large canine')).toBe(0);
    });
  });

  describe('empty strings', () => {
    it('should return 1.0 for two empty strings', () => {
      expect(textSimilarity('', '')).toBe(1);
    });

    it('should return 0.0 for empty vs non-empty', () => {
      expect(textSimilarity('', 'hello')).toBe(0);
    });

    it('should return 0.0 for non-empty vs empty', () => {
      expect(textSimilarity('hello', '')).toBe(0);
    });

    it('should return 1.0 for whitespace-only vs whitespace-only', () => {
      // Both normalize to empty → treated as two empty strings → 1.0
      expect(textSimilarity('   ', '   ')).toBe(1);
    });

    it('should return 0.0 for whitespace-only vs non-empty', () => {
      expect(textSimilarity('   ', 'hello')).toBe(0);
    });
  });

  describe('single word matches', () => {
    it('should return 1.0 for identical single words', () => {
      expect(textSimilarity('hello', 'hello')).toBe(1);
    });

    it('should return 0.0 for different single words', () => {
      expect(textSimilarity('hello', 'goodbye')).toBe(0);
    });

    it('should return 1.0 for single word that is prefix of a phrase', () => {
      expect(textSimilarity('hello', 'hello world')).toBe(1);
    });

    it('should return 0.0 for single word not found in a phrase', () => {
      expect(textSimilarity('banana', 'hello world')).toBe(0);
    });
  });

  describe('case insensitivity', () => {
    it('should treat UPPERCASE and lowercase as identical', () => {
      expect(textSimilarity('HELLO WORLD', 'hello world')).toBe(1);
    });

    it('should handle MiXeD CaSe', () => {
      expect(textSimilarity('HeLLo WoRLd', 'hello world')).toBe(1);
    });

    it('should be case-insensitive for partial matches', () => {
      const score = textSimilarity('The Quick', 'the quick brown fox');
      expect(score).toBe(1);
    });
  });

  describe('punctuation handling', () => {
    it('should ignore trailing punctuation', () => {
      expect(textSimilarity('hello world!', 'hello world')).toBe(1);
    });

    it('should ignore commas', () => {
      expect(textSimilarity('yes, I agree', 'yes I agree')).toBe(1);
    });

    it('should ignore apostrophes and contractions', () => {
      // "don't" → "dont" after stripping punctuation via /[^\w\s]/g
      // "dont" vs "dont" → match
      expect(textSimilarity("don't stop", 'dont stop')).toBe(1);
    });

    it('should ignore question marks', () => {
      expect(textSimilarity('what is this?', 'what is this')).toBe(1);
    });

    it('should ignore periods', () => {
      expect(textSimilarity('Hello there.', 'hello there')).toBe(1);
    });

    it('should handle text with heavy punctuation', () => {
      expect(textSimilarity('wow!!! really???', 'wow really')).toBe(1);
    });
  });

  describe('eager LLM threshold boundary cases', () => {
    it('should be >= 0.8 for typical eager-to-final prefix evolution', () => {
      // User says "hello" eagerly, finishes with "hello there"
      const score = textSimilarity('hello', 'hello there');
      expect(score).toBeGreaterThanOrEqual(0.8);
    });

    it('should be exactly 0.5 for one matching word out of two', () => {
      // "good morning" vs "good evening"
      // shorter=["good","morning"], longer=["good","evening"]
      // "good" matches → matchCount=1, "morning" doesn't → 1/2 = 0.5
      const score = textSimilarity('good morning', 'good evening');
      expect(score).toBe(0.5);
    });

    it('should be < 0.8 when user pivots mid-sentence', () => {
      const score = textSimilarity(
        'what is the weather',
        'actually set a timer for five minutes'
      );
      expect(score).toBeLessThan(0.8);
    });

    it('should be 1.0 for common eager pipeline case (user adds at end)', () => {
      expect(textSimilarity('tell me about', 'tell me about TypeScript')).toBe(1);
    });
  });
});
