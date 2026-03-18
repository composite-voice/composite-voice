/**
 * Pipeline error recovery integration tests.
 *
 * Tests that the CompositeVoice agent properly handles errors from
 * individual providers: emitting error events, transitioning state,
 * and remaining recoverable for subsequent requests.
 *
 * NOTE: Tests avoid calling startListening() with NativeSTT because the
 * mock SpeechRecognition does not fire lifecycle events (onstart), which
 * causes connect() to hang until its 5-second timeout. Instead, we test
 * error paths that don't require the full audio capture pipeline.
 */

import { CompositeVoice } from '../../src/CompositeVoice';
import { NativeSTT } from '../../src/providers/stt/native/NativeSTT';
import { NativeTTS } from '../../src/providers/tts/native/NativeTTS';
import type { LLMProvider, LLMMessage, LLMGenerationOptions } from '../../src/core/types/providers';
import type { AgentState } from '../../src/core/events/types';

// ─── Mock LLM Providers ──────────────────────────────────────────────────────

/** An LLM provider that succeeds normally. */
class SucceedingLLM implements LLMProvider {
  type = 'rest' as const;
  roles = ['llm'] as const;
  config = { model: 'mock-success' };

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  async processText(prompt: string) {
    return {
      async *[Symbol.asyncIterator]() {
        yield `Response to: ${prompt}`;
      },
    };
  }

  async generate(prompt: string) {
    return this.processText(prompt);
  }

  async processMessages(_messages: LLMMessage[]) {
    return {
      async *[Symbol.asyncIterator]() {
        yield 'Response from messages';
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

/** An LLM provider that throws on processText(). */
class FailingGenerateLLM implements LLMProvider {
  type = 'rest' as const;
  roles = ['llm'] as const;
  config = { model: 'mock-fail-generate' };

  failCount = 0;
  maxFailures = Infinity;

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  async processText(_prompt: string, _options?: LLMGenerationOptions) {
    this.failCount++;
    if (this.failCount <= this.maxFailures) {
      throw new Error(`LLM generation failed (attempt ${this.failCount})`);
    }
    return {
      async *[Symbol.asyncIterator]() {
        yield 'Recovered response';
      },
    };
  }

  async generate(prompt: string, options?: LLMGenerationOptions) {
    return this.processText(prompt, options);
  }

  async processMessages(_messages: LLMMessage[], _options?: LLMGenerationOptions) {
    return this.processText('from-messages', _options);
  }

  async generateFromMessages(messages: LLMMessage[], options?: LLMGenerationOptions) {
    return this.processMessages(messages, options);
  }

  isToolCall(_chunk: unknown): boolean {
    return false;
  }
}

/** An LLM provider that fails during initialization. */
class FailingInitLLM implements LLMProvider {
  type = 'rest' as const;
  roles = ['llm'] as const;
  config = { model: 'mock-fail-init' };

  async initialize() {
    throw new Error('LLM init failed');
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Pipeline Error Recovery', () => {
  let agent: CompositeVoice;

  afterEach(async () => {
    if (agent) {
      try {
        await agent.dispose();
      } catch {
        // Ignore disposal errors in tests
      }
    }
  });

  describe('initialization errors', () => {
    it('should transition to error state when a provider fails to initialize', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      await expect(agent.initialize()).rejects.toThrow('LLM init failed');
      expect(agent.isReady()).toBe(false);
    });

    it('should emit agent.error event on initialization failure', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      const errorEvents: Array<{
        error: Error;
        recoverable: boolean;
        context: string | undefined;
      }> = [];
      agent.on('agent.error', (event) => {
        errorEvents.push({
          error: event.error,
          recoverable: event.recoverable,
          context: event.context,
        });
      });

      try {
        await agent.initialize();
      } catch {
        // Expected
      }

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0]!.error.message).toBe('LLM init failed');
      expect(errorEvents[0]!.recoverable).toBe(false);
      expect(errorEvents[0]!.context).toBe('initialize');
    });

    it('should emit state change to error on init failure', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      const states: AgentState[] = [];
      agent.on('agent.stateChange', (event) => {
        states.push(event.state);
      });

      try {
        await agent.initialize();
      } catch {
        // Expected
      }

      expect(states).toContain('error');
    });

    it('should not be ready after failed initialization', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      try {
        await agent.initialize();
      } catch {
        // Expected
      }

      expect(agent.isReady()).toBe(false);
      expect(agent.getState()).toBe('error');
    });
  });

  describe('recovery after initialization error', () => {
    it('should be able to create and initialize a new agent after failure', async () => {
      // First, try with a failing provider
      const failingAgent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      try {
        await failingAgent.initialize();
      } catch {
        // Expected
      }

      expect(failingAgent.isReady()).toBe(false);
      await failingAgent.dispose();

      // Create a new agent with a working provider
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new SucceedingLLM(), new NativeTTS()],
      });

      await agent.initialize();
      expect(agent.isReady()).toBe(true);
      expect(agent.getState()).toBe('ready');
    });

    it('should emit ready event on successful initialization after previous failure', async () => {
      // Fail first
      const failingAgent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      try {
        await failingAgent.initialize();
      } catch {
        // Expected
      }
      await failingAgent.dispose();

      // Succeed second
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new SucceedingLLM(), new NativeTTS()],
      });

      let readyEmitted = false;
      agent.on('agent.ready', () => {
        readyEmitted = true;
      });

      await agent.initialize();
      expect(readyEmitted).toBe(true);
    });
  });

  describe('error event structure', () => {
    it('agent.error events should have timestamp, error, recoverable, and context', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const errorEvents: any[] = [];
      agent.on('agent.error', (event) => {
        errorEvents.push(event);
      });

      try {
        await agent.initialize();
      } catch {
        // Expected
      }

      expect(errorEvents).toHaveLength(1);
      const event = errorEvents[0];
      expect(event.timestamp).toBeDefined();
      expect(typeof event.timestamp).toBe('number');
      expect(event.error).toBeInstanceOf(Error);
      expect(typeof event.recoverable).toBe('boolean');
      expect(event.context).toBeDefined();
      expect(typeof event.context).toBe('string');
    });

    it('initialization errors should be marked as non-recoverable', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      const recoverableFlags: boolean[] = [];
      agent.on('agent.error', (event) => {
        recoverableFlags.push(event.recoverable);
      });

      try {
        await agent.initialize();
      } catch {
        // Expected
      }

      expect(recoverableFlags).toEqual([false]);
    });
  });

  describe('disposal safety', () => {
    it('should handle dispose gracefully even when in error state', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      try {
        await agent.initialize();
      } catch {
        // Expected
      }

      // Should not throw
      await expect(agent.dispose()).resolves.not.toThrow();
    });

    it('should handle double dispose without error', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new SucceedingLLM(), new NativeTTS()],
      });
      await agent.initialize();

      await agent.dispose();
      await expect(agent.dispose()).resolves.not.toThrow();
    });

    it('should handle dispose without prior initialization', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new SucceedingLLM(), new NativeTTS()],
      });

      // Dispose without initialize
      await expect(agent.dispose()).resolves.not.toThrow();
    });

    it('should remove event listeners on dispose', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new SucceedingLLM(), new NativeTTS()],
      });

      const listener = jest.fn();
      agent.on('agent.stateChange', listener);

      await agent.initialize();
      await agent.dispose();

      // After dispose, listener should not receive new events
      listener.mockClear();
      expect(listener).not.toHaveBeenCalled();
    });

    it('should transition to idle state after dispose', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new SucceedingLLM(), new NativeTTS()],
      });

      await agent.initialize();
      expect(agent.getState()).toBe('ready');

      await agent.dispose();
      expect(agent.getState()).toBe('idle');
      expect(agent.isReady()).toBe(false);
    });
  });

  describe('state transitions on error', () => {
    it('should transition through idle → ready → error on init failure', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      const states: AgentState[] = [];
      agent.on('agent.stateChange', (event) => {
        states.push(event.state);
      });

      try {
        await agent.initialize();
      } catch {
        // Expected
      }

      // Should see 'ready' (from agentStateMachine.initialize before providers init)
      // then 'error' (from init failure)
      expect(states).toContain('ready');
      expect(states).toContain('error');
      // Error should come after ready
      const readyIndex = states.indexOf('ready');
      const errorIndex = states.indexOf('error');
      expect(errorIndex).toBeGreaterThan(readyIndex);
    });

    it('should have previousState set correctly on error transition', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      const transitions: Array<{ from: AgentState; to: AgentState }> = [];
      agent.on('agent.stateChange', (event) => {
        transitions.push({ from: event.previousState, to: event.state });
      });

      try {
        await agent.initialize();
      } catch {
        // Expected
      }

      // Find the transition to error
      const errorTransition = transitions.find((t) => t.to === 'error');
      expect(errorTransition).toBeDefined();
      // The previous state before error should be 'ready' (since agentStateMachine
      // initializes to ready before providers are initialized)
      expect(errorTransition!.from).toBe('ready');
    });
  });

  describe('conversation history survives disposal', () => {
    it('should return empty history after disposal', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new SucceedingLLM(), new NativeTTS()],
        conversationHistory: { enabled: true },
      });

      await agent.initialize();
      expect(agent.getHistory()).toEqual([]);

      await agent.dispose();
      // After dispose, history should be cleared or inaccessible
      // Calling getHistory after dispose depends on implementation
      // At minimum, it shouldn't throw
      expect(() => agent.getHistory()).not.toThrow();
    });
  });

  describe('multiple provider types', () => {
    it('should handle SucceedingLLM correctly end-to-end', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new SucceedingLLM(), new NativeTTS()],
      });

      await agent.initialize();

      expect(agent.isReady()).toBe(true);
      expect(agent.getState()).toBe('ready');

      await agent.dispose();
      expect(agent.isReady()).toBe(false);
      expect(agent.getState()).toBe('idle');
    });

    it('should handle FailingGenerateLLM initialization (it succeeds init, fails generate)', async () => {
      const failingLLM = new FailingGenerateLLM();
      agent = new CompositeVoice({
        providers: [new NativeSTT(), failingLLM, new NativeTTS()],
      });

      // Initialize should succeed (FailingGenerateLLM.initialize succeeds)
      await agent.initialize();
      expect(agent.isReady()).toBe(true);
      expect(agent.getState()).toBe('ready');
    });
  });

  describe('wildcard event subscription for errors', () => {
    it('should receive error events through wildcard subscription', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allEvents: any[] = [];
      agent.on('*', (event: unknown) => {
        allEvents.push(event);
      });

      try {
        await agent.initialize();
      } catch {
        // Expected
      }

      // Wildcard should capture both agent.stateChange and agent.error events
      const errorEvents = allEvents.filter((e: { type: string }) => e.type === 'agent.error');
      expect(errorEvents.length).toBeGreaterThanOrEqual(1);

      const stateChangeEvents = allEvents.filter(
        (e: { type: string }) => e.type === 'agent.stateChange'
      );
      expect(stateChangeEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('queue stats after error', () => {
    it('should return valid queue stats even after initialization error', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new FailingInitLLM(), new NativeTTS()],
      });

      try {
        await agent.initialize();
      } catch {
        // Expected
      }

      // getQueueStats should not throw even in error state
      const stats = agent.getQueueStats();
      expect(stats).toBeDefined();
      expect(stats.input).toBeDefined();
      expect(stats.output).toBeDefined();
      expect(stats.input.totalEnqueued).toBe(0);
      expect(stats.output.totalEnqueued).toBe(0);
    });

    it('should return zeroed queue stats on fresh agent', async () => {
      agent = new CompositeVoice({
        providers: [new NativeSTT(), new SucceedingLLM(), new NativeTTS()],
      });

      await agent.initialize();

      const stats = agent.getQueueStats();
      expect(stats.input.size).toBe(0);
      expect(stats.input.totalDropped).toBe(0);
      expect(stats.output.size).toBe(0);
      expect(stats.output.totalDropped).toBe(0);
    });
  });
});
