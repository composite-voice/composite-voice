/**
 * OpenAICompatibleLLM base class tests
 */

import { OpenAICompatibleLLM } from '../../../../src/providers/llm/openai-compatible/OpenAICompatibleLLM';
import type { OpenAICompatibleLLMConfig } from '../../../../src/providers/llm/openai-compatible/OpenAICompatibleLLM';

// Mock the OpenAI SDK before imports
jest.mock('openai', () => {
  const mockCreate = jest.fn();
  const MockOpenAI = jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  }));

  return {
    __esModule: true,
    default: MockOpenAI,
  };
});

describe('OpenAICompatibleLLM', () => {
  let provider: OpenAICompatibleLLM;
  let config: OpenAICompatibleLLMConfig;

  beforeEach(() => {
    config = {
      apiKey: 'test-api-key',
      model: 'gpt-4',
      endpoint: 'https://api.example.com/v1',
      temperature: 0.7,
      maxTokens: 1000,
      systemPrompt: 'You are a helpful assistant.',
    };
  });

  afterEach(async () => {
    if (provider) {
      await provider.dispose();
    }
  });

  describe('initialization', () => {
    it('should initialize successfully with apiKey', async () => {
      provider = new OpenAICompatibleLLM(config);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize successfully with proxyUrl', async () => {
      const proxyConfig: OpenAICompatibleLLMConfig = {
        model: 'gpt-4',
        proxyUrl: 'http://localhost:3000/proxy/openai',
      };
      provider = new OpenAICompatibleLLM(proxyConfig);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      await provider.dispose();
    });

    it('should throw ProviderInitializationError when neither apiKey nor proxyUrl is set', async () => {
      const badConfig: OpenAICompatibleLLMConfig = { model: 'gpt-4' };
      const testProvider = new OpenAICompatibleLLM(badConfig);
      await expect(testProvider.initialize()).rejects.toMatchObject({
        name: 'ProviderInitializationError',
        message: expect.stringContaining('OpenAICompatibleLLM'),
      });
    });

    it('should store configuration', async () => {
      provider = new OpenAICompatibleLLM(config);
      await provider.initialize();

      const retrievedConfig = provider.getConfig();
      expect(retrievedConfig.model).toBe('gpt-4');
    });

    it('should set provider type to rest', () => {
      provider = new OpenAICompatibleLLM(config);
      expect(provider.type).toBe('rest');
    });

    it('should pass baseURL to OpenAI SDK when using apiKey', async () => {
      provider = new OpenAICompatibleLLM(config);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'test-api-key',
          baseURL: 'https://api.example.com/v1',
        })
      );
    });

    it('should use proxyUrl as baseURL and set apiKey to "proxy" when proxyUrl is configured', async () => {
      const proxyConfig: OpenAICompatibleLLMConfig = {
        model: 'gpt-4',
        proxyUrl: 'http://localhost:3000/proxy/custom',
      };
      provider = new OpenAICompatibleLLM(proxyConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'proxy',
          baseURL: 'http://localhost:3000/proxy/custom',
        })
      );
    });

    it('should pass maxRetries and timeout to OpenAI SDK', async () => {
      const customConfig: OpenAICompatibleLLMConfig = {
        ...config,
        maxRetries: 5,
        timeout: 30000,
      };
      provider = new OpenAICompatibleLLM(customConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          maxRetries: 5,
          timeout: 30000,
        })
      );
    });

    it('should enable dangerouslyAllowBrowser for client-side usage', async () => {
      provider = new OpenAICompatibleLLM(config);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          dangerouslyAllowBrowser: true,
        })
      );
    });
  });

  describe('buildClientOptions hook', () => {
    it('should merge custom options from buildClientOptions into SDK config', async () => {
      // Create a subclass that overrides buildClientOptions
      class CustomLLM extends OpenAICompatibleLLM {
        protected override readonly providerName = 'CustomLLM';

        protected override buildClientOptions(): Record<string, unknown> {
          return { organization: 'org-123' };
        }
      }

      const customProvider = new CustomLLM(config);
      await customProvider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: 'org-123',
        })
      );

      await customProvider.dispose();
    });

    it('should allow subclasses to override providerName for error messages', async () => {
      class CustomLLM extends OpenAICompatibleLLM {
        protected override readonly providerName = 'CustomLLM';
      }

      const badConfig: OpenAICompatibleLLMConfig = { model: 'custom-model' };
      const customProvider = new CustomLLM(badConfig);
      await expect(customProvider.initialize()).rejects.toMatchObject({
        name: 'ProviderInitializationError',
        message: expect.stringContaining('CustomLLM'),
      });
    });
  });

  describe('disposal', () => {
    it('should dispose successfully', async () => {
      provider = new OpenAICompatibleLLM(config);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });

    it('should handle disposal without initialization', async () => {
      provider = new OpenAICompatibleLLM(config);
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });

  describe('processText', () => {
    beforeEach(async () => {
      provider = new OpenAICompatibleLLM(config);
      await provider.initialize();
    });

    it('should throw if not initialized', async () => {
      const uninitProvider = new OpenAICompatibleLLM(config);

      await expect(async () => {
        await uninitProvider.processText('Hello');
      }).rejects.toThrow();
    });

    it('should convert prompt to messages with system prompt', async () => {
      const OpenAI = require('openai').default;
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Hello!' } }] };
        },
      };
      const mockCreate = jest.fn().mockResolvedValue(mockStream);

      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create = mockCreate;

      (provider as any).client = mockInstance;

      const result = await provider.processText('Hello');
      const chunks: string[] = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toEqual([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ]);
    });

    it('should merge options with config defaults', async () => {
      const OpenAI = require('openai').default;
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Response' } }] };
        },
      };
      const mockCreate = jest.fn().mockResolvedValue(mockStream);

      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create = mockCreate;

      (provider as any).client = mockInstance;

      const result = await provider.processText('Test', { temperature: 0.9 });
      const iterator = result[Symbol.asyncIterator]();
      await iterator.next();

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.temperature).toBe(0.9);
      expect(callArgs.max_tokens).toBe(1000); // from config
    });
  });

  describe('processMessages', () => {
    beforeEach(async () => {
      provider = new OpenAICompatibleLLM(config);
      await provider.initialize();
    });

    it('should handle streaming responses', async () => {
      const OpenAI = require('openai').default;
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Hello' } }] };
          yield { choices: [{ delta: { content: ' world' } }] };
          yield { choices: [{ delta: { content: '!' } }] };
        },
      };

      const mockCreate = jest.fn().mockResolvedValue(mockStream);
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create = mockCreate;

      (provider as any).client = mockInstance;

      const messages = [
        { role: 'system' as const, content: 'System prompt' },
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = await provider.processMessages(messages);
      const chunks: string[] = [];

      for await (const chunk of result) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world', '!']);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
          messages: expect.any(Array),
        })
      );
    });

    it('should handle non-streaming responses', async () => {
      const nonStreamConfig = { ...config, stream: false };
      provider = new OpenAICompatibleLLM(nonStreamConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: 'Complete response' } }],
        usage: { total_tokens: 5 },
      });

      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create = mockCreate;

      (provider as any).client = mockInstance;

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.processMessages(messages);
      const chunks: string[] = [];

      for await (const chunk of result) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Complete response']);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: false,
        })
      );
    });

    it('should pass correct parameters to SDK', async () => {
      const OpenAI = require('openai').default;
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Test' } }] };
        },
      };
      const mockCreate = jest.fn().mockResolvedValue(mockStream);

      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create = mockCreate;

      (provider as any).client = mockInstance;

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const options = {
        temperature: 0.8,
        maxTokens: 500,
        stopSequences: ['STOP'],
        extra: { frequency_penalty: 0.5 },
      };

      const result = await provider.processMessages(messages, options);
      const iterator = result[Symbol.asyncIterator]();
      await iterator.next();

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4',
          messages: expect.any(Array),
          temperature: 0.8,
          max_tokens: 500,
          stop: ['STOP'],
          frequency_penalty: 0.5,
        })
      );
    });

    it('should handle AbortSignal for streaming', async () => {
      const OpenAI = require('openai').default;
      const abortController = new AbortController();

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'First' } }] };
          // Signal abort before second chunk
          abortController.abort();
          yield { choices: [{ delta: { content: 'Second' } }] };
        },
      };
      const mockCreate = jest.fn().mockResolvedValue(mockStream);

      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create = mockCreate;

      (provider as any).client = mockInstance;

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.processMessages(messages, {
        signal: abortController.signal,
      });

      const chunks: string[] = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }

      // Should stop after first chunk since signal is aborted
      expect(chunks).toEqual(['First']);
    });

    it('should throw AbortError when signal is already aborted', async () => {
      const OpenAI = require('openai').default;
      const abortController = new AbortController();
      abortController.abort();

      const mockCreate = jest.fn();
      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create = mockCreate;

      (provider as any).client = mockInstance;

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.processMessages(messages, {
        signal: abortController.signal,
      });

      await expect(async () => {
        for await (const _chunk of result) {
          // should not reach here
        }
      }).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('should skip empty delta content', async () => {
      const OpenAI = require('openai').default;
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Hello' } }] };
          yield { choices: [{ delta: {} }] }; // no content
          yield { choices: [{ delta: { content: '' } }] }; // empty string
          yield { choices: [{ delta: { content: ' world' } }] };
        },
      };
      const mockCreate = jest.fn().mockResolvedValue(mockStream);

      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create = mockCreate;

      (provider as any).client = mockInstance;

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.processMessages(messages);
      const chunks: string[] = [];

      for await (const chunk of result) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('should pass signal to SDK when streaming', async () => {
      const OpenAI = require('openai').default;
      const abortController = new AbortController();

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: 'Test' } }] };
        },
      };
      const mockCreate = jest.fn().mockResolvedValue(mockStream);

      const mockInstance = new OpenAI();
      mockInstance.chat.completions.create = mockCreate;

      (provider as any).client = mockInstance;

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.processMessages(messages, {
        signal: abortController.signal,
      });
      for await (const _chunk of result) {
        // consume
      }

      expect(mockCreate).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ signal: abortController.signal })
      );
    });
  });

  describe('subclass usage', () => {
    it('should work as a base for custom providers', async () => {
      class GroqLLM extends OpenAICompatibleLLM {
        protected override readonly providerName = 'GroqLLM';
      }

      const groqConfig: OpenAICompatibleLLMConfig = {
        apiKey: 'groq-key',
        model: 'llama-3.3-70b-versatile',
        endpoint: 'https://api.groq.com/openai/v1',
      };

      const groqProvider = new GroqLLM(groqConfig);
      await groqProvider.initialize();

      expect(groqProvider.isReady()).toBe(true);

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'groq-key',
          baseURL: 'https://api.groq.com/openai/v1',
        })
      );

      await groqProvider.dispose();
    });
  });
});
