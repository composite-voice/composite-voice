/**
 * Tests for conversation history trimming utilities.
 */

import {
  estimateTokens,
  estimateMessagesTokens,
  trimConversationHistory,
} from '../../../src/utils/conversationHistory';
import type { LLMMessage } from '../../../src/core/types/providers';
import type { ConversationHistoryConfig } from '../../../src/core/types/config';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function msg(role: LLMMessage['role'], content: string): LLMMessage {
  return { role, content };
}

function baseConfig(overrides: Partial<ConversationHistoryConfig> = {}): ConversationHistoryConfig {
  return {
    enabled: true,
    ...overrides,
  };
}

// ─── estimateTokens ──────────────────────────────────────────────────────────

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('returns 1 for strings of 1-4 characters', () => {
    expect(estimateTokens('Hi')).toBe(1);
    expect(estimateTokens('Hey!')).toBe(1);
  });

  it('uses ceil(length / 4) heuristic', () => {
    expect(estimateTokens('Hello')).toBe(2); // 5 / 4 = 1.25 -> 2
    expect(estimateTokens('12345678')).toBe(2); // 8 / 4 = 2
    expect(estimateTokens('123456789')).toBe(3); // 9 / 4 = 2.25 -> 3
  });
});

// ─── estimateMessagesTokens ──────────────────────────────────────────────────

describe('estimateMessagesTokens', () => {
  it('returns 0 for empty array', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it('sums token estimates for all messages', () => {
    const messages: LLMMessage[] = [
      msg('user', '12345678'),    // 2 tokens
      msg('assistant', '1234'),   // 1 token
    ];
    expect(estimateMessagesTokens(messages)).toBe(3);
  });
});

// ─── trimConversationHistory ─────────────────────────────────────────────────

describe('trimConversationHistory', () => {
  // ─── Edge cases ──────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty array for empty history', () => {
      const result = trimConversationHistory([], baseConfig({ maxTurns: 5 }));
      expect(result).toEqual([]);
    });

    it('returns empty array for empty history with maxTokens', () => {
      const result = trimConversationHistory([], baseConfig({ maxTokens: 100 }));
      expect(result).toEqual([]);
    });

    it('returns history unchanged when no limits are set', () => {
      const history: LLMMessage[] = [
        msg('user', 'Hello'),
        msg('assistant', 'Hi there'),
      ];
      const result = trimConversationHistory(history, baseConfig());
      expect(result).toEqual(history);
    });

    it('returns history unchanged when maxTurns is 0 (unlimited)', () => {
      const history: LLMMessage[] = [
        msg('user', 'Hello'),
        msg('assistant', 'Hi'),
        msg('user', 'How are you?'),
        msg('assistant', 'Good!'),
      ];
      const result = trimConversationHistory(history, baseConfig({ maxTurns: 0 }));
      expect(result).toEqual(history);
    });

    it('handles single message history', () => {
      const history: LLMMessage[] = [msg('user', 'Hello')];
      const result = trimConversationHistory(history, baseConfig({ maxTurns: 5 }));
      expect(result).toEqual([msg('user', 'Hello')]);
    });
  });

  // ─── maxTurns trimming ───────────────────────────────────────────────

  describe('maxTurns trimming', () => {
    it('does not trim when history is within maxTurns limit', () => {
      const history: LLMMessage[] = [
        msg('user', 'Turn 1'),
        msg('assistant', 'Response 1'),
        msg('user', 'Turn 2'),
        msg('assistant', 'Response 2'),
      ];
      const result = trimConversationHistory(history, baseConfig({ maxTurns: 2 }));
      expect(result).toEqual(history);
    });

    it('trims oldest turns when exceeding maxTurns', () => {
      const history: LLMMessage[] = [
        msg('user', 'Turn 1'),
        msg('assistant', 'Response 1'),
        msg('user', 'Turn 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Turn 3'),
        msg('assistant', 'Response 3'),
      ];
      const result = trimConversationHistory(history, baseConfig({ maxTurns: 2 }));
      expect(result).toEqual([
        msg('user', 'Turn 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Turn 3'),
        msg('assistant', 'Response 3'),
      ]);
    });

    it('handles maxTurns: 1 (keep only last turn)', () => {
      const history: LLMMessage[] = [
        msg('user', 'Turn 1'),
        msg('assistant', 'Response 1'),
        msg('user', 'Turn 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Turn 3'),
      ];
      const result = trimConversationHistory(history, baseConfig({ maxTurns: 1 }));
      // maxTurns: 1 means 2 messages max; last 2 non-system messages are kept
      expect(result).toEqual([
        msg('assistant', 'Response 2'),
        msg('user', 'Turn 3'),
      ]);
    });
  });

  // ─── System message preservation ────────────────────────────────────

  describe('system message preservation', () => {
    it('preserves system messages during maxTurns trimming (default behavior)', () => {
      const history: LLMMessage[] = [
        msg('system', 'You are a helpful assistant.'),
        msg('user', 'Turn 1'),
        msg('assistant', 'Response 1'),
        msg('user', 'Turn 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Turn 3'),
        msg('assistant', 'Response 3'),
      ];
      const result = trimConversationHistory(history, baseConfig({ maxTurns: 2 }));
      expect(result).toEqual([
        msg('system', 'You are a helpful assistant.'),
        msg('user', 'Turn 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Turn 3'),
        msg('assistant', 'Response 3'),
      ]);
    });

    it('preserves multiple system messages', () => {
      const history: LLMMessage[] = [
        msg('system', 'System instruction 1'),
        msg('system', 'System instruction 2'),
        msg('user', 'Turn 1'),
        msg('assistant', 'Response 1'),
        msg('user', 'Turn 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Turn 3'),
        msg('assistant', 'Response 3'),
      ];
      const result = trimConversationHistory(history, baseConfig({ maxTurns: 1 }));
      expect(result).toEqual([
        msg('system', 'System instruction 1'),
        msg('system', 'System instruction 2'),
        msg('user', 'Turn 3'),
        msg('assistant', 'Response 3'),
      ]);
    });

    it('preserveSystemMessages: true is the default', () => {
      const history: LLMMessage[] = [
        msg('system', 'Be helpful'),
        msg('user', 'Turn 1'),
        msg('assistant', 'Response 1'),
        msg('user', 'Turn 2'),
      ];
      // Not setting preserveSystemMessages at all — should default to true
      const result = trimConversationHistory(history, baseConfig({ maxTurns: 1 }));
      expect(result[0]).toEqual(msg('system', 'Be helpful'));
    });

    it('preserveSystemMessages: false allows system messages to be trimmed', () => {
      const history: LLMMessage[] = [
        msg('system', 'You are a helpful assistant.'),
        msg('user', 'Turn 1'),
        msg('assistant', 'Response 1'),
        msg('user', 'Turn 2'),
        msg('assistant', 'Response 2'),
      ];
      const result = trimConversationHistory(
        history,
        baseConfig({ maxTurns: 1, preserveSystemMessages: false })
      );
      // With preserveSystemMessages: false, all 5 messages are treated equally.
      // maxTurns: 1 => keep last 2 messages
      expect(result).toEqual([
        msg('user', 'Turn 2'),
        msg('assistant', 'Response 2'),
      ]);
      // System message was removed
      expect(result.find(m => m.role === 'system')).toBeUndefined();
    });
  });

  // ─── Token-based trimming ───────────────────────────────────────────

  describe('token-based trimming (maxTokens)', () => {
    it('does not trim when within token budget', () => {
      const history: LLMMessage[] = [
        msg('user', 'Hi'),       // ~1 token
        msg('assistant', 'Hey'), // ~1 token
      ];
      const result = trimConversationHistory(history, baseConfig({ maxTokens: 10 }));
      expect(result).toEqual(history);
    });

    it('trims oldest messages to fit token budget', () => {
      // Each message has 40 chars = 10 tokens
      const history: LLMMessage[] = [
        msg('user', 'a'.repeat(40)),       // 10 tokens
        msg('assistant', 'b'.repeat(40)),  // 10 tokens
        msg('user', 'c'.repeat(40)),       // 10 tokens
        msg('assistant', 'd'.repeat(40)),  // 10 tokens
      ];
      // Budget = 20 tokens -> should keep last 2 messages
      const result = trimConversationHistory(history, baseConfig({ maxTokens: 20 }));
      expect(result).toEqual([
        msg('user', 'c'.repeat(40)),
        msg('assistant', 'd'.repeat(40)),
      ]);
    });

    it('handles asymmetric turn sizes', () => {
      const history: LLMMessage[] = [
        msg('user', 'Hi'),                      // ~1 token
        msg('assistant', 'x'.repeat(400)),       // ~100 tokens (long response)
        msg('user', 'Short follow-up'),          // ~4 tokens
        msg('assistant', 'Brief'),               // ~2 tokens
      ];
      // Budget = 10 tokens -> only the last 2 messages fit (~6 tokens)
      const result = trimConversationHistory(history, baseConfig({ maxTokens: 10 }));
      expect(result).toEqual([
        msg('user', 'Short follow-up'),
        msg('assistant', 'Brief'),
      ]);
    });

    it('preserves system messages when trimming by tokens', () => {
      const history: LLMMessage[] = [
        msg('system', 'Be helpful'),             // ~3 tokens
        msg('user', 'a'.repeat(40)),             // 10 tokens
        msg('assistant', 'b'.repeat(40)),        // 10 tokens
        msg('user', 'c'.repeat(40)),             // 10 tokens
        msg('assistant', 'd'.repeat(40)),        // 10 tokens
      ];
      // Budget = 15 tokens; system uses ~3, leaves ~12 for non-system
      // Only last message (10 tokens) fits within remaining 12
      const result = trimConversationHistory(history, baseConfig({ maxTokens: 15 }));
      expect(result).toEqual([
        msg('system', 'Be helpful'),
        msg('assistant', 'd'.repeat(40)),
      ]);
    });

    it('keeps only system messages when they exceed the budget', () => {
      const history: LLMMessage[] = [
        msg('system', 'x'.repeat(100)),          // ~25 tokens
        msg('user', 'Hello'),
        msg('assistant', 'Hi'),
      ];
      // Budget = 10 tokens, system message alone is ~25 tokens
      const result = trimConversationHistory(history, baseConfig({ maxTokens: 10 }));
      expect(result).toEqual([
        msg('system', 'x'.repeat(100)),
      ]);
    });

    it('removes all messages when budget is exceeded and preserveSystemMessages is false', () => {
      const history: LLMMessage[] = [
        msg('system', 'x'.repeat(100)),          // ~25 tokens
        msg('user', 'y'.repeat(100)),            // ~25 tokens
      ];
      // Budget = 10, preserveSystemMessages: false -> all messages are candidates
      // Both are too big individually; trim removes from front until fits
      const result = trimConversationHistory(
        history,
        baseConfig({ maxTokens: 10, preserveSystemMessages: false })
      );
      // The user message (25 tokens) doesn't fit either, so both get removed
      expect(result).toEqual([]);
    });
  });

  // ─── Combined maxTurns and maxTokens ────────────────────────────────

  describe('combined maxTurns and maxTokens (more restrictive wins)', () => {
    it('maxTokens is more restrictive than maxTurns', () => {
      // Each message: 40 chars = 10 tokens
      const history: LLMMessage[] = [
        msg('user', 'a'.repeat(40)),       // 10 tokens
        msg('assistant', 'b'.repeat(40)),  // 10 tokens
        msg('user', 'c'.repeat(40)),       // 10 tokens
        msg('assistant', 'd'.repeat(40)),  // 10 tokens
      ];
      // maxTurns: 2 would keep all 4 (2 turns = 4 messages)
      // maxTokens: 15 would keep only 1 message (10 tokens)
      // maxTokens is more restrictive
      const result = trimConversationHistory(
        history,
        baseConfig({ maxTurns: 2, maxTokens: 15 })
      );
      expect(result).toEqual([
        msg('assistant', 'd'.repeat(40)),
      ]);
    });

    it('maxTurns is more restrictive than maxTokens', () => {
      const history: LLMMessage[] = [
        msg('user', 'Hi'),              // ~1 token
        msg('assistant', 'Hey'),        // ~1 token
        msg('user', 'How are you?'),    // ~3 tokens
        msg('assistant', 'Good!'),      // ~2 tokens
      ];
      // maxTurns: 1 would keep last 2 messages (~5 tokens)
      // maxTokens: 100 would keep all (plenty of budget)
      // maxTurns is more restrictive
      const result = trimConversationHistory(
        history,
        baseConfig({ maxTurns: 1, maxTokens: 100 })
      );
      expect(result).toEqual([
        msg('user', 'How are you?'),
        msg('assistant', 'Good!'),
      ]);
    });

    it('both constraints produce the same result', () => {
      const history: LLMMessage[] = [
        msg('user', 'a'.repeat(40)),       // 10 tokens
        msg('assistant', 'b'.repeat(40)),  // 10 tokens
        msg('user', 'c'.repeat(40)),       // 10 tokens
        msg('assistant', 'd'.repeat(40)),  // 10 tokens
      ];
      // maxTurns: 1 keeps last 2 messages (20 tokens)
      // maxTokens: 20 also keeps 2 messages (20 tokens exactly)
      const result = trimConversationHistory(
        history,
        baseConfig({ maxTurns: 1, maxTokens: 20 })
      );
      expect(result).toEqual([
        msg('user', 'c'.repeat(40)),
        msg('assistant', 'd'.repeat(40)),
      ]);
    });

    it('combined with system message preservation', () => {
      const history: LLMMessage[] = [
        msg('system', 'Be brief'),                // ~3 tokens
        msg('user', 'a'.repeat(40)),               // 10 tokens
        msg('assistant', 'b'.repeat(40)),          // 10 tokens
        msg('user', 'c'.repeat(40)),               // 10 tokens
        msg('assistant', 'd'.repeat(40)),          // 10 tokens
      ];
      // maxTurns: 1 -> keeps system + last 2 non-system (system + c + d = 23 tokens)
      // maxTokens: 15 -> system ~3 tokens, budget for non-system ~12, keeps last 1 (10 tokens)
      // maxTokens is more restrictive
      const result = trimConversationHistory(
        history,
        baseConfig({ maxTurns: 1, maxTokens: 15 })
      );
      expect(result).toEqual([
        msg('system', 'Be brief'),
        msg('assistant', 'd'.repeat(40)),
      ]);
    });
  });

  // ─── Does not mutate input ──────────────────────────────────────────

  describe('immutability', () => {
    it('does not mutate the input array', () => {
      const history: LLMMessage[] = [
        msg('user', 'Turn 1'),
        msg('assistant', 'Response 1'),
        msg('user', 'Turn 2'),
        msg('assistant', 'Response 2'),
        msg('user', 'Turn 3'),
        msg('assistant', 'Response 3'),
      ];
      const originalLength = history.length;
      const originalFirst = history[0];

      trimConversationHistory(history, baseConfig({ maxTurns: 1 }));

      expect(history.length).toBe(originalLength);
      expect(history[0]).toBe(originalFirst);
    });
  });
});
