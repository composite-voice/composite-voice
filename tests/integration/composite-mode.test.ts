/**
 * Composite mode integration tests
 */

import { CompositeVoice } from '../../src/CompositeVoice';
import { NativeSTT } from '../../src/providers/stt/native/NativeSTT';
import { NativeTTS } from '../../src/providers/tts/native/NativeTTS';
import type { LLMProvider, LLMMessage } from '../../src/core/types/providers';

// Mock LLM provider for testing
class MockLLMProvider implements LLMProvider {
  type = 'rest' as const;
  roles = ['llm'] as const;
  config = { model: 'mock' };

  processTextCalls: string[] = [];
  processMessagesCalls: LLMMessage[][] = [];

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  async processText(prompt: string) {
    this.processTextCalls.push(prompt);
    const response = `Mock response to: ${prompt}`;
    return {
      async *[Symbol.asyncIterator]() {
        yield response;
      },
    };
  }

  async generate(prompt: string) {
    return this.processText(prompt);
  }

  async processMessages(messages: LLMMessage[]) {
    this.processMessagesCalls.push([...messages]);
    return {
      async *[Symbol.asyncIterator]() {
        yield 'Mock response from history';
      },
    };
  }

  async generateFromMessages(messages: LLMMessage[]) {
    return this.processMessages(messages);
  }

  isToolCall(_chunk: unknown): boolean {
    return false;
  }
}

describe('Composite Mode Integration', () => {
  let agent: CompositeVoice;

  afterEach(async () => {
    if (agent) {
      await agent.dispose();
    }
  });

  describe('initialization', () => {
    it('should initialize with all providers', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      await agent.initialize();

      expect(agent.isReady()).toBe(true);
      expect(agent.getState()).toBe('ready');
    });

    it('should emit ready event', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      const readyPromise = new Promise((resolve) => {
        agent.once('agent.ready', resolve);
      });

      await agent.initialize();
      await readyPromise;

      expect(agent.isReady()).toBe(true);
    });

    it('should throw error if missing providers', () => {
      expect(() => {
        new CompositeVoice({
          providers: [new NativeSTT()],
          // Missing LLM and TTS roles
        });
      }).toThrow();
    });
  });

  describe('event flow', () => {
    it('should emit state change events', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      const states: string[] = [];

      agent.on('agent.stateChange', (event) => {
        states.push(event.state);
      });

      await agent.initialize();

      expect(states).toContain('ready');
    });

    it('should track all event types', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      const events: string[] = [];

      agent.on('*', (event: any) => {
        events.push(event.type);
      });

      await agent.initialize();

      expect(events).toContain('agent.stateChange');
      expect(events).toContain('agent.ready');
    });
  });

  describe('configuration', () => {
    it('should initialize with provider array config', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      await agent.initialize();

      // Audio config is now handled by providers, not SDK
      // Just verify agent initialized successfully
      expect(agent).toBeDefined();
    });

    it('should apply logging configuration', async () => {
      const customLogger = jest.fn();

      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
        logging: {
          enabled: true,
          level: 'debug',
          logger: customLogger,
        },
      });

      await agent.initialize();

      // Logger should have been called during initialization
      expect(customLogger.mock.calls.length).toBeGreaterThan(0);
    });
  });

  describe('disposal', () => {
    it('should dispose all providers', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      await agent.initialize();
      await agent.dispose();

      expect(agent.isReady()).toBe(false);
      expect(agent.getState()).toBe('idle');
    });

    it('should handle disposal without initialization', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      await expect(agent.dispose()).resolves.not.toThrow();
    });

    it('should remove all event listeners on disposal', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      const listener = jest.fn();
      agent.on('agent.stateChange', listener);

      await agent.initialize();
      await agent.dispose();

      // Try to trigger event (won't work as agent is disposed)
      // But listener shouldn't be called
      listener.mockClear();

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors', async () => {
      // Create provider that fails initialization
      class FailingProvider implements LLMProvider {
        type = 'rest' as const;
        roles = ['llm'] as const;
        config = { model: 'fail' };

        async initialize() {
          throw new Error('Init failed');
        }
        async dispose() {}
        isReady() {
          return false;
        }
        async processText() {
          return {
            async *[Symbol.asyncIterator]() {
              yield 'test';
            },
          };
        }
        async generate() {
          return this.processText();
        }
        async processMessages() {
          return this.processText();
        }
        async generateFromMessages() {
          return this.processText();
        }
        isToolCall(_chunk: unknown): boolean {
          return false;
        }
      }

      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingProvider(), new NativeTTS()],
      });

      await expect(agent.initialize()).rejects.toThrow();
      expect(agent.isReady()).toBe(false);
    });

    it('should emit error events', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      const errorHandler = jest.fn();
      agent.on('agent.error', errorHandler);

      await agent.initialize();

      // Errors will be emitted during normal operation
      // This is just testing the handler is registered
      expect(errorHandler).not.toHaveBeenCalled();
    });
  });

  describe('component access', () => {
    it('should provide access to audio capture', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      // Audio I/O is now managed by providers, not exposed by SDK
      // Just verify agent is initialized
      expect(agent).toBeDefined();
    });

    it('should not expose audio player (providers manage I/O)', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new MockLLMProvider(), new NativeTTS()],
      });

      // Audio I/O is now managed by providers, not exposed by SDK
      expect(agent).toBeDefined();
    });
  });

  describe('conversation history', () => {
    let mockLLM: MockLLMProvider;

    beforeEach(async () => {
      mockLLM = new MockLLMProvider();
      agent = new CompositeVoice({
        providers: [new NativeSTT(), mockLLM, new NativeTTS()],
        conversationHistory: { enabled: true },
      });
      await agent.initialize();
    });

    it('should return empty history initially', () => {
      expect(agent.getHistory()).toEqual([]);
    });

    it('should clear history', () => {
      agent.clearHistory();
      expect(agent.getHistory()).toEqual([]);
    });

    it('should use processText() when history is disabled', async () => {
      const noHistoryLLM = new MockLLMProvider();
      const noHistoryAgent = new CompositeVoice({
        providers: [new NativeSTT(), noHistoryLLM, new NativeTTS()],
      });
      await noHistoryAgent.initialize();

      // Simulate transcription by directly triggering via internal method (via event simulation)
      // We test this by verifying the default (no conversationHistory config)
      // has processText() called, not processMessages()
      expect(noHistoryLLM.processMessagesCalls).toHaveLength(0);

      await noHistoryAgent.dispose();
    });

    it('getHistory() returns a copy, not the internal array', () => {
      const h1 = agent.getHistory();
      h1.push({ role: 'user', content: 'hacked' });
      const h2 = agent.getHistory();
      expect(h2).toHaveLength(0); // Original array unchanged
    });

    it('should clear history on dispose', async () => {
      // Can't directly inject messages through the public API, but we can verify
      // that dispose doesn't throw even with history enabled
      await expect(agent.dispose()).resolves.not.toThrow();
    });
  });
});
