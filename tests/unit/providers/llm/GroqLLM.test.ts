/**
 * Groq LLM Provider tests
 */

import { GroqLLM } from '../../../../src/providers/llm/groq/GroqLLM';
import type { GroqLLMConfig } from '../../../../src/providers/llm/groq/GroqLLM';

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

describe('GroqLLM', () => {
  let provider: GroqLLM;
  let config: GroqLLMConfig;

  beforeEach(() => {
    config = {
      groqApiKey: 'test-groq-key',
      model: 'llama-3.3-70b-versatile',
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
    it('should initialize successfully with groqApiKey', async () => {
      provider = new GroqLLM(config);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize successfully with apiKey', async () => {
      const apiKeyConfig: GroqLLMConfig = {
        apiKey: 'test-api-key',
        model: 'llama-3.3-70b-versatile',
      };
      provider = new GroqLLM(apiKeyConfig);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should prefer groqApiKey over apiKey when both are set', async () => {
      const bothConfig: GroqLLMConfig = {
        groqApiKey: 'groq-key-wins',
        apiKey: 'generic-key',
        model: 'llama-3.3-70b-versatile',
      };
      provider = new GroqLLM(bothConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'groq-key-wins',
        })
      );
    });

    it('should store configuration', async () => {
      provider = new GroqLLM(config);
      await provider.initialize();

      const retrievedConfig = provider.getConfig();
      expect(retrievedConfig.model).toBe('llama-3.3-70b-versatile');
    });

    it('should throw ProviderInitializationError when neither apiKey nor proxyUrl is set', async () => {
      const badConfig: GroqLLMConfig = { model: 'llama-3.3-70b-versatile' };
      const testProvider = new GroqLLM(badConfig);
      await expect(testProvider.initialize()).rejects.toMatchObject({
        name: 'ProviderInitializationError',
        message: expect.stringContaining('GroqLLM'),
      });
    });

    it('should initialize successfully using proxyUrl instead of apiKey', async () => {
      const proxyConfig: GroqLLMConfig = {
        model: 'llama-3.3-70b-versatile',
        proxyUrl: 'http://localhost:3000/proxy/groq',
      };
      const testProvider = new GroqLLM(proxyConfig);
      await expect(testProvider.initialize()).resolves.not.toThrow();
      await testProvider.dispose();
    });

    it('should set provider type to rest', () => {
      provider = new GroqLLM(config);
      expect(provider.type).toBe('rest');
    });
  });

  describe('Groq-specific defaults', () => {
    it('should default baseURL to Groq API endpoint', async () => {
      provider = new GroqLLM(config);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.groq.com/openai/v1',
        })
      );
    });

    it('should allow overriding endpoint', async () => {
      const customConfig: GroqLLMConfig = {
        ...config,
        endpoint: 'https://custom.groq.endpoint/v1',
      };
      provider = new GroqLLM(customConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://custom.groq.endpoint/v1',
        })
      );
    });

    it('should default model to llama-3.3-70b-versatile', async () => {
      const minimalConfig: GroqLLMConfig = {
        groqApiKey: 'test-key',
      } as GroqLLMConfig;
      provider = new GroqLLM(minimalConfig);

      expect(provider.getConfig().model).toBe('llama-3.3-70b-versatile');
    });

    it('should allow overriding model', async () => {
      const customModelConfig: GroqLLMConfig = {
        groqApiKey: 'test-key',
        model: 'mixtral-8x7b-32768',
      };
      provider = new GroqLLM(customModelConfig);

      expect(provider.getConfig().model).toBe('mixtral-8x7b-32768');
    });

    it('should use proxyUrl as baseURL when in proxy mode', async () => {
      const proxyConfig: GroqLLMConfig = {
        proxyUrl: 'http://localhost:3000/proxy/groq',
        model: 'llama-3.3-70b-versatile',
      };
      provider = new GroqLLM(proxyConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:3000/proxy/groq',
          apiKey: 'proxy',
        })
      );
    });
  });

  describe('disposal', () => {
    it('should dispose successfully', async () => {
      provider = new GroqLLM(config);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });

    it('should handle disposal without initialization', async () => {
      provider = new GroqLLM(config);
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });

  describe('processText', () => {
    beforeEach(async () => {
      provider = new GroqLLM(config);
      await provider.initialize();
    });

    it('should throw if not initialized', async () => {
      const uninitProvider = new GroqLLM(config);

      await expect(async () => {
        await uninitProvider.processText('Hello');
      }).rejects.toThrow();
    });

    it('should convert prompt to messages', async () => {
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

      const result = provider.processText('Hello', { temperature: 0.5 });
      const iterator = await result;
      const chunks: string[] = [];
      for await (const chunk of iterator) {
        chunks.push(chunk);
      }

      expect(mockCreate).toHaveBeenCalled();
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages).toEqual([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ]);
    });
  });

  describe('processMessages', () => {
    beforeEach(async () => {
      provider = new GroqLLM(config);
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
          model: 'llama-3.3-70b-versatile',
        })
      );
    });

    it('should handle non-streaming responses', async () => {
      const nonStreamConfig: GroqLLMConfig = { ...config, stream: false };
      provider = new GroqLLM(nonStreamConfig);
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
  });

  describe('configuration', () => {
    it('should support custom max retries', async () => {
      const configWithRetries: GroqLLMConfig = {
        ...config,
        maxRetries: 5,
      };
      provider = new GroqLLM(configWithRetries);
      await provider.initialize();

      expect((provider.getConfig() as GroqLLMConfig).maxRetries).toBe(5);
    });
  });
});
