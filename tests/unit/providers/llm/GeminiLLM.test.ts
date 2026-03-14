/**
 * Gemini LLM Provider tests
 */

import { GeminiLLM } from '../../../../src/providers/llm/gemini/GeminiLLM';
import type { GeminiLLMConfig } from '../../../../src/providers/llm/gemini/GeminiLLM';

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

describe('GeminiLLM', () => {
  let provider: GeminiLLM;
  let config: GeminiLLMConfig;

  beforeEach(() => {
    config = {
      geminiApiKey: 'test-gemini-key',
      model: 'gemini-2.0-flash',
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
    it('should initialize successfully with geminiApiKey', async () => {
      provider = new GeminiLLM(config);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize successfully with apiKey', async () => {
      const apiKeyConfig: GeminiLLMConfig = {
        apiKey: 'test-api-key',
        model: 'gemini-2.0-flash',
      };
      provider = new GeminiLLM(apiKeyConfig);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should prefer geminiApiKey over apiKey when both are set', async () => {
      const bothConfig: GeminiLLMConfig = {
        geminiApiKey: 'gemini-key-wins',
        apiKey: 'generic-key',
        model: 'gemini-2.0-flash',
      };
      provider = new GeminiLLM(bothConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'gemini-key-wins',
        })
      );
    });

    it('should store configuration', async () => {
      provider = new GeminiLLM(config);
      await provider.initialize();

      const retrievedConfig = provider.getConfig();
      expect(retrievedConfig.model).toBe('gemini-2.0-flash');
    });

    it('should throw ProviderInitializationError when neither apiKey nor proxyUrl is set', async () => {
      const badConfig: GeminiLLMConfig = { model: 'gemini-2.0-flash' };
      const testProvider = new GeminiLLM(badConfig);
      await expect(testProvider.initialize()).rejects.toMatchObject({
        name: 'ProviderInitializationError',
        message: expect.stringContaining('GeminiLLM'),
      });
    });

    it('should initialize successfully using proxyUrl instead of apiKey', async () => {
      const proxyConfig: GeminiLLMConfig = {
        model: 'gemini-2.0-flash',
        proxyUrl: 'http://localhost:3000/proxy/gemini',
      };
      const testProvider = new GeminiLLM(proxyConfig);
      await expect(testProvider.initialize()).resolves.not.toThrow();
      await testProvider.dispose();
    });

    it('should set provider type to rest', () => {
      provider = new GeminiLLM(config);
      expect(provider.type).toBe('rest');
    });
  });

  describe('Gemini-specific defaults', () => {
    it('should default baseURL to Gemini API endpoint', async () => {
      provider = new GeminiLLM(config);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
        })
      );
    });

    it('should allow overriding baseURL', async () => {
      const customConfig: GeminiLLMConfig = {
        ...config,
        baseURL: 'https://custom.gemini.endpoint/v1',
      };
      provider = new GeminiLLM(customConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://custom.gemini.endpoint/v1',
        })
      );
    });

    it('should default model to gemini-2.0-flash', async () => {
      const minimalConfig: GeminiLLMConfig = {
        geminiApiKey: 'test-key',
      } as GeminiLLMConfig;
      provider = new GeminiLLM(minimalConfig);

      expect(provider.getConfig().model).toBe('gemini-2.0-flash');
    });

    it('should allow overriding model', async () => {
      const customModelConfig: GeminiLLMConfig = {
        geminiApiKey: 'test-key',
        model: 'gemini-2.0-flash-lite',
      };
      provider = new GeminiLLM(customModelConfig);

      expect(provider.getConfig().model).toBe('gemini-2.0-flash-lite');
    });

    it('should use proxyUrl as baseURL when in proxy mode', async () => {
      const proxyConfig: GeminiLLMConfig = {
        proxyUrl: 'http://localhost:3000/proxy/gemini',
        model: 'gemini-2.0-flash',
      };
      provider = new GeminiLLM(proxyConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:3000/proxy/gemini',
          apiKey: 'proxy',
        })
      );
    });
  });

  describe('disposal', () => {
    it('should dispose successfully', async () => {
      provider = new GeminiLLM(config);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });

    it('should handle disposal without initialization', async () => {
      provider = new GeminiLLM(config);
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });

  describe('processText', () => {
    beforeEach(async () => {
      provider = new GeminiLLM(config);
      await provider.initialize();
    });

    it('should throw if not initialized', async () => {
      const uninitProvider = new GeminiLLM(config);

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
      provider = new GeminiLLM(config);
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
          model: 'gemini-2.0-flash',
        })
      );
    });

    it('should handle non-streaming responses', async () => {
      const nonStreamConfig: GeminiLLMConfig = { ...config, stream: false };
      provider = new GeminiLLM(nonStreamConfig);
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
      const configWithRetries: GeminiLLMConfig = {
        ...config,
        maxRetries: 5,
      };
      provider = new GeminiLLM(configWithRetries);
      await provider.initialize();

      expect((provider.getConfig() as GeminiLLMConfig).maxRetries).toBe(5);
    });
  });
});
