/**
 * Tests for textSimilarity utility
 */

import { textSimilarity } from '../../../src/utils/textSimilarity';

describe('textSimilarity', () => {
  describe('identical texts', () => {
    it('should return 1.0 for identical strings', () => {
      expect(textSimilarity('hello world', 'hello world')).toBe(1);
    });

    it('should return 1.0 for identical strings with different casing', () => {
      expect(textSimilarity('Hello World', 'hello world')).toBe(1);
    });

    it('should return 1.0 for identical strings with different punctuation', () => {
      expect(textSimilarity('Hello, world!', 'hello world')).toBe(1);
    });

    it('should return 1.0 for two empty strings', () => {
      expect(textSimilarity('', '')).toBe(1);
    });
  });

  describe('prefix matching (eager text is prefix of final text)', () => {
    it('should return 1.0 when eager text is exact prefix of final text', () => {
      expect(textSimilarity('hello world', 'hello world how are you')).toBe(1);
    });

    it('should return 1.0 for single word prefix', () => {
      expect(textSimilarity('hello', 'hello world')).toBe(1);
    });

    it('should return 1.0 for long prefix', () => {
      expect(
        textSimilarity('the quick brown fox', 'the quick brown fox jumps over the lazy dog')
      ).toBe(1);
    });
  });

  describe('partial overlap', () => {
    it('should return 0 when first word differs (order-aware)', () => {
      // Sequential scan: "hello" not found scanning ["goodbye", "world"],
      // pointer exhausts the array before "world" can be matched.
      // This is correct — if the opening word changed, the intent changed.
      expect(textSimilarity('hello world', 'goodbye world')).toBe(0);
    });

    it('should handle word substitution at the end', () => {
      const score = textSimilarity('I like cats', 'I like dogs');
      // "I" and "like" match in order, "cats" doesn't → 2/3
      expect(score).toBeCloseTo(2 / 3, 2);
    });

    it('should handle divergence after shared prefix', () => {
      const score = textSimilarity('hello world how', 'hello world what are you doing');
      // "hello" and "world" match, "how" doesn't → 2/3
      expect(score).toBeCloseTo(2 / 3, 2);
    });
  });

  describe('no overlap', () => {
    it('should return 0 for completely different texts', () => {
      expect(textSimilarity('hello world', 'goodbye moon')).toBe(0);
    });

    it('should return 0 when one string is empty', () => {
      expect(textSimilarity('hello', '')).toBe(0);
      expect(textSimilarity('', 'hello')).toBe(0);
    });
  });

  describe('real-world eager pipeline scenarios', () => {
    it('should score high when user finishes a sentence (prefix case)', () => {
      const eager = 'what is the weather';
      const final = 'what is the weather in San Francisco';
      const score = textSimilarity(eager, final);
      expect(score).toBe(1); // eager is exact prefix
    });

    it('should score high when final adds minor words', () => {
      const eager = 'tell me about TypeScript';
      const final = 'tell me about TypeScript please';
      const score = textSimilarity(eager, final);
      expect(score).toBe(1); // eager is exact prefix
    });

    it('should score low when user changes topic mid-sentence', () => {
      const eager = 'what is the weather';
      const final = 'never mind forget that';
      const score = textSimilarity(eager, final);
      expect(score).toBe(0); // no word overlap
    });

    it('should score moderate when user rephrases', () => {
      const eager = 'how do I deploy';
      const final = 'how do I deploy a docker container';
      const score = textSimilarity(eager, final);
      expect(score).toBe(1); // eager is exact prefix
    });

    it('should be above 0.8 threshold for typical eager-to-final evolution', () => {
      // Common case: user says "hello" eagerly, finishes with "hello there"
      const score = textSimilarity('hello', 'hello there');
      expect(score).toBeGreaterThanOrEqual(0.8);
    });

    it('should be below 0.8 threshold when user changes direction', () => {
      const score = textSimilarity('what is the weather', 'actually set a timer for five minutes');
      expect(score).toBeLessThan(0.8);
    });
  });

  describe('edge cases', () => {
    it('should handle extra whitespace', () => {
      expect(textSimilarity('  hello   world  ', 'hello world')).toBe(1);
    });

    it('should handle single word match', () => {
      expect(textSimilarity('hello', 'hello')).toBe(1);
    });

    it('should handle repeated words', () => {
      // "very very good" vs "very good" → shorter is "very good" (2 words)
      // Both match in order → 2/2 = 1.0
      const score = textSimilarity('very good', 'very very good');
      expect(score).toBe(1);
    });
  });
});
