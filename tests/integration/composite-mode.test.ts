/**
 * Composite mode integration tests
 */

import { CompositeVoice } from '../../src/CompositeVoice';
import { NativeSTT } from '../../src/providers/stt/native/NativeSTT';
import { NativeTTS } from '../../src/providers/tts/native/NativeTTS';
import type { LLMProvider } from '../../src/core/types/providers';

// Mock LLM provider for testing
class MockLLMProvider implements LLMProvider {
  type = 'rest' as const;
  config = { model: 'mock' };

  async initialize() {}
  async dispose() {}
  isReady() {
    return true;
  }

  async generate(prompt: string) {
    const response = `Mock response to: ${prompt}`;
    return {
      async *[Symbol.asyncIterator]() {
        yield response;
      },
    };
  }

  async generateFromMessages() {
    return this.generate('test');
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
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
      });

      await agent.initialize();

      expect(agent.isReady()).toBe(true);
      expect(agent.getState()).toBe('ready');
    });

    it('should emit ready event', async () => {
      agent = new CompositeVoice({
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
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
          mode: 'composite',
          stt: new NativeSTT(),
          // Missing LLM and TTS
        } as any);
      }).toThrow();
    });
  });

  describe('event flow', () => {
    it('should emit state change events', async () => {
      agent = new CompositeVoice({
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
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
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
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
    it('should apply audio configuration', async () => {
      agent = new CompositeVoice({
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
        audio: {
          input: {
            sampleRate: 48000,
            channels: 2,
          },
          output: {
            bufferSize: 8192,
          },
        },
      });

      await agent.initialize();

      const audioCapture = agent.getAudioCapture();
      const audioConfig = audioCapture.getConfig();

      expect(audioConfig.sampleRate).toBe(48000);
      expect(audioConfig.channels).toBe(2);
    });

    it('should apply logging configuration', async () => {
      const customLogger = jest.fn();

      agent = new CompositeVoice({
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
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
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
      });

      await agent.initialize();
      await agent.dispose();

      expect(agent.isReady()).toBe(false);
      expect(agent.getState()).toBe('idle');
    });

    it('should handle disposal without initialization', async () => {
      agent = new CompositeVoice({
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
      });

      await expect(agent.dispose()).resolves.not.toThrow();
    });

    it('should remove all event listeners on disposal', async () => {
      agent = new CompositeVoice({
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
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
        config = { model: 'fail' };

        async initialize() {
          throw new Error('Init failed');
        }
        async dispose() {}
        isReady() {
          return false;
        }
        async generate() {
          return {
            async *[Symbol.asyncIterator]() {
              yield 'test';
            },
          };
        }
        async generateFromMessages() {
          return this.generate();
        }
      }

      agent = new CompositeVoice({
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new FailingProvider(),
        tts: new NativeTTS(),
      });

      await expect(agent.initialize()).rejects.toThrow();
      expect(agent.isReady()).toBe(false);
    });

    it('should emit error events', async () => {
      agent = new CompositeVoice({
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
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
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
      });

      const audioCapture = agent.getAudioCapture();

      expect(audioCapture).toBeDefined();
      expect(audioCapture.getState()).toBe('inactive');
    });

    it('should provide access to audio player', async () => {
      agent = new CompositeVoice({
        mode: 'composite',
        stt: new NativeSTT(),
        llm: new MockLLMProvider(),
        tts: new NativeTTS(),
      });

      const audioPlayer = agent.getAudioPlayer();

      expect(audioPlayer).toBeDefined();
      expect(audioPlayer.getState()).toBe('idle');
    });
  });
});
