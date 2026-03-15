/**
 * Tests for ConversationManager — multi-turn conversation history collaborator.
 */

import { ConversationManager } from '../../../../src/core/collaborators/ConversationManager';
import type { ConversationHistoryConfig } from '../../../../src/core/types/config';

describe('ConversationManager', () => {
  describe('constructor', () => {
    it('creates an instance without config', () => {
      const manager = new ConversationManager();
      expect(manager).toBeInstanceOf(ConversationManager);
      expect(manager.getMessages()).toEqual([]);
    });

    it('creates an instance with config', () => {
      const config: ConversationHistoryConfig = { enabled: true, maxTurns: 5 };
      const manager = new ConversationManager(config);
      expect(manager).toBeInstanceOf(ConversationManager);
    });
  });

  describe('enabled getter', () => {
    it('returns false when config is not provided', () => {
      const manager = new ConversationManager();
      expect(manager.enabled).toBe(false);
    });

    it('returns false when config.enabled is false', () => {
      const manager = new ConversationManager({ enabled: false });
      expect(manager.enabled).toBe(false);
    });

    it('returns true when config.enabled is true', () => {
      const manager = new ConversationManager({ enabled: true });
      expect(manager.enabled).toBe(true);
    });
  });

  describe('addUserMessage', () => {
    it('appends a user message without modality when none specified', () => {
      const manager = new ConversationManager({ enabled: true });
      manager.addUserMessage('Hello');

      const messages = manager.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: 'user',
        content: 'Hello',
      });
    });

    it('appends a user message with text modality', () => {
      const manager = new ConversationManager({ enabled: true });
      manager.addUserMessage('Hello', 'text');

      const messages = manager.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: 'user',
        content: 'Hello',
        modality: 'text',
      });
    });

    it('appends multiple user messages', () => {
      const manager = new ConversationManager({ enabled: true });
      manager.addUserMessage('First');
      manager.addUserMessage('Second');

      const messages = manager.getMessages();
      expect(messages).toHaveLength(2);
      expect(messages[0]!.content).toBe('First');
      expect(messages[1]!.content).toBe('Second');
    });
  });

  describe('addAssistantMessage', () => {
    it('appends an assistant message', () => {
      const manager = new ConversationManager({ enabled: true });
      manager.addAssistantMessage('I can help with that.');

      const messages = manager.getMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        role: 'assistant',
        content: 'I can help with that.',
      });
    });
  });

  describe('getMessages', () => {
    it('returns a copy, not a reference', () => {
      const manager = new ConversationManager({ enabled: true });
      manager.addUserMessage('Hello');

      const copy1 = manager.getMessages();
      const copy2 = manager.getMessages();

      // Different array references
      expect(copy1).not.toBe(copy2);

      // Mutating the copy does not affect internal state
      copy1.push({ role: 'user', content: 'injected' });
      expect(manager.getMessages()).toHaveLength(1);
    });

    it('returns an empty array when no messages have been added', () => {
      const manager = new ConversationManager();
      expect(manager.getMessages()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('empties the history', () => {
      const manager = new ConversationManager({ enabled: true });
      manager.addUserMessage('Hello');
      manager.addAssistantMessage('Hi');
      expect(manager.getMessages()).toHaveLength(2);

      manager.clear();
      expect(manager.getMessages()).toEqual([]);
    });
  });

  describe('buildIOContextMessage', () => {
    it('returns an LLMMessage with role system', () => {
      const manager = new ConversationManager();
      const msg = manager.buildIOContextMessage('voice', false, false);

      expect(msg.role).toBe('system');
      expect(msg.content).toContain('[I/O Context]');
    });

    it('describes voice input when not muted', () => {
      const manager = new ConversationManager();
      const msg = manager.buildIOContextMessage('voice', false, false);

      expect(msg.content).toContain('speaking to you through a microphone');
    });

    it('describes text input when muted', () => {
      const manager = new ConversationManager();
      const msg = manager.buildIOContextMessage('text', true, false);

      expect(msg.content).toContain('typing to you');
    });

    it('describes voice output when not muted', () => {
      const manager = new ConversationManager();
      const msg = manager.buildIOContextMessage('voice', false, false);

      expect(msg.content).toContain('spoken aloud via text-to-speech');
    });

    it('describes text output when output is muted', () => {
      const manager = new ConversationManager();
      const msg = manager.buildIOContextMessage('voice', false, true);

      expect(msg.content).toContain('displayed as text only');
    });

    it('adds a note when modality differs from input mode', () => {
      // Input is not muted (voice mode) but modality is text
      const manager = new ConversationManager();
      const msg = manager.buildIOContextMessage('text', false, false);

      expect(msg.content).toContain('this specific message was typed');
    });

    it('does not add a note when modality matches input mode', () => {
      const manager = new ConversationManager();
      const msg = manager.buildIOContextMessage('voice', false, false);

      expect(msg.content).not.toContain('this specific message was');
    });
  });

  describe('getMessagesForLLM', () => {
    it('returns I/O context + history', () => {
      const manager = new ConversationManager({ enabled: true });
      manager.addUserMessage('Hello');
      manager.addAssistantMessage('Hi there');

      const llmMessages = manager.getMessagesForLLM('voice', false, false);

      // First message is the I/O context system message
      expect(llmMessages[0]!.role).toBe('system');
      expect(llmMessages[0]!.content).toContain('[I/O Context]');

      // Followed by the conversation history
      expect(llmMessages).toHaveLength(3);
      expect(llmMessages[1]!.role).toBe('user');
      expect(llmMessages[1]!.content).toBe('Hello');
      expect(llmMessages[2]!.role).toBe('assistant');
      expect(llmMessages[2]!.content).toBe('Hi there');
    });

    it('works with empty history', () => {
      const manager = new ConversationManager();
      const llmMessages = manager.getMessagesForLLM('voice', false, false);

      expect(llmMessages).toHaveLength(1);
      expect(llmMessages[0]!.role).toBe('system');
    });
  });

  describe('history trimming with maxTurns', () => {
    it('trims history when it exceeds maxTurns * 2 messages', () => {
      const manager = new ConversationManager({
        enabled: true,
        maxTurns: 2,
      });

      // Add 3 full turns (6 messages)
      // Trimming only happens in addUserMessage, so after the 3rd addUserMessage
      // (5 messages at that point), it slices to last 4: [asst1, user2, asst2, user3]
      // Then addAssistantMessage adds one more without trimming: 5 total
      manager.addUserMessage('Turn 1');
      manager.addAssistantMessage('Response 1');
      manager.addUserMessage('Turn 2');
      manager.addAssistantMessage('Response 2');
      manager.addUserMessage('Turn 3');
      manager.addAssistantMessage('Response 3');

      const messages = manager.getMessages();
      expect(messages).toHaveLength(5);
      expect(messages[0]!.content).toBe('Response 1');
      expect(messages[1]!.content).toBe('Turn 2');
      expect(messages[2]!.content).toBe('Response 2');
      expect(messages[3]!.content).toBe('Turn 3');
      expect(messages[4]!.content).toBe('Response 3');
    });

    it('does not trim when maxTurns is 0 (unlimited)', () => {
      const manager = new ConversationManager({
        enabled: true,
        maxTurns: 0,
      });

      for (let i = 0; i < 50; i++) {
        manager.addUserMessage(`Turn ${i}`);
        manager.addAssistantMessage(`Response ${i}`);
      }

      expect(manager.getMessages()).toHaveLength(100);
    });

    it('does not trim when under the limit', () => {
      const manager = new ConversationManager({
        enabled: true,
        maxTurns: 5,
      });

      manager.addUserMessage('Hello');
      manager.addAssistantMessage('Hi');

      expect(manager.getMessages()).toHaveLength(2);
    });
  });

  describe('system message preservation during trimming', () => {
    it('trims to maxTurns * 2 on addUserMessage with preserveSystemMessages true', () => {
      const manager = new ConversationManager({
        enabled: true,
        maxTurns: 1,
        preserveSystemMessages: true,
      });

      // Add 2 full turns — maxTurns=1 means trim to last 2 on addUserMessage.
      // Trimming only runs in addUserMessage, so after 2nd addUserMessage
      // (3 messages), it slices to last 2: [asst1, user2].
      // Then addAssistantMessage adds without trimming: 3 total.
      manager.addUserMessage('Turn 1');
      manager.addAssistantMessage('Response 1');
      manager.addUserMessage('Turn 2');
      manager.addAssistantMessage('Response 2');

      const messages = manager.getMessages();
      expect(messages).toHaveLength(3);
      expect(messages[0]!.content).toBe('Response 1');
      expect(messages[1]!.content).toBe('Turn 2');
      expect(messages[2]!.content).toBe('Response 2');
    });

    it('trims to maxTurns * 2 on addUserMessage with preserveSystemMessages false', () => {
      const manager = new ConversationManager({
        enabled: true,
        maxTurns: 1,
        preserveSystemMessages: false,
      });

      manager.addUserMessage('Turn 1');
      manager.addAssistantMessage('Response 1');
      manager.addUserMessage('Turn 2');
      manager.addAssistantMessage('Response 2');

      const messages = manager.getMessages();
      // Same behavior: trim happens in addUserMessage, then addAssistantMessage adds one more
      expect(messages).toHaveLength(3);
      expect(messages[0]!.content).toBe('Response 1');
    });

    it('trims correctly when maxTurns is not set (defaults to 0 = unlimited)', () => {
      const manager = new ConversationManager({
        enabled: true,
        preserveSystemMessages: true,
      });

      for (let i = 0; i < 20; i++) {
        manager.addUserMessage(`Turn ${i}`);
        manager.addAssistantMessage(`Response ${i}`);
      }

      // No trimming should occur
      expect(manager.getMessages()).toHaveLength(40);
    });
  });
});
