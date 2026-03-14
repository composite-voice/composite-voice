/**
 * Mistral LLM Provider tests
 */

import { MistralLLM } from '../../../../src/providers/llm/mistral/MistralLLM';
import type { MistralLLMConfig } from '../../../../src/providers/llm/mistral/MistralLLM';

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

describe('MistralLLM', () => {
  let provider: MistralLLM;
  let config: MistralLLMConfig;

  beforeEach(() => {
    config = {
      mistralApiKey: 'test-mistral-key',
      model: 'mistral-small-latest',
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
    it('should initialize successfully with mistralApiKey', async () => {
      provider = new MistralLLM(config);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize successfully with apiKey', async () => {
      const apiKeyConfig: MistralLLMConfig = {
        apiKey: 'test-api-key',
        model: 'mistral-small-latest',
      };
      provider = new MistralLLM(apiKeyConfig);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should prefer mistralApiKey over apiKey when both are set', async () => {
      const bothConfig: MistralLLMConfig = {
        mistralApiKey: 'mistral-key-wins',
        apiKey: 'generic-key',
        model: 'mistral-small-latest',
      };
      provider = new MistralLLM(bothConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'mistral-key-wins',
        })
      );
    });

    it('should store configuration', async () => {
      provider = new MistralLLM(config);
      await provider.initialize();

      const retrievedConfig = provider.getConfig();
      expect(retrievedConfig.model).toBe('mistral-small-latest');
    });

    it('should throw ProviderInitializationError when neither apiKey nor proxyUrl is set', async () => {
      const badConfig: MistralLLMConfig = { model: 'mistral-small-latest' };
      const testProvider = new MistralLLM(badConfig);
      await expect(testProvider.initialize()).rejects.toMatchObject({
        name: 'ProviderInitializationError',
        message: expect.stringContaining('MistralLLM'),
      });
    });

    it('should initialize successfully using proxyUrl instead of apiKey', async () => {
      const proxyConfig: MistralLLMConfig = {
        model: 'mistral-small-latest',
        proxyUrl: 'http://localhost:3000/proxy/mistral',
      };
      const testProvider = new MistralLLM(proxyConfig);
      await expect(testProvider.initialize()).resolves.not.toThrow();
      await testProvider.dispose();
    });

    it('should set provider type to rest', () => {
      provider = new MistralLLM(config);
      expect(provider.type).toBe('rest');
    });
  });

  describe('Mistral-specific defaults', () => {
    it('should default baseURL to Mistral API endpoint', async () => {
      provider = new MistralLLM(config);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://api.mistral.ai/v1',
        })
      );
    });

    it('should allow overriding baseURL', async () => {
      const customConfig: MistralLLMConfig = {
        ...config,
        baseURL: 'https://custom.mistral.endpoint/v1',
      };
      provider = new MistralLLM(customConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://custom.mistral.endpoint/v1',
        })
      );
    });

    it('should default model to mistral-small-latest', async () => {
      const minimalConfig: MistralLLMConfig = {
        mistralApiKey: 'test-key',
      } as MistralLLMConfig;
      provider = new MistralLLM(minimalConfig);

      expect(provider.getConfig().model).toBe('mistral-small-latest');
    });

    it('should allow overriding model', async () => {
      const customModelConfig: MistralLLMConfig = {
        mistralApiKey: 'test-key',
        model: 'mistral-large-latest',
      };
      provider = new MistralLLM(customModelConfig);

      expect(provider.getConfig().model).toBe('mistral-large-latest');
    });

    it('should use proxyUrl as baseURL when in proxy mode', async () => {
      const proxyConfig: MistralLLMConfig = {
        proxyUrl: 'http://localhost:3000/proxy/mistral',
        model: 'mistral-small-latest',
      };
      provider = new MistralLLM(proxyConfig);
      await provider.initialize();

      const OpenAI = require('openai').default;
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:3000/proxy/mistral',
          apiKey: 'proxy',
        })
      );
    });
  });

  describe('disposal', () => {
    it('should dispose successfully', async () => {
      provider = new MistralLLM(config);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });

    it('should handle disposal without initialization', async () => {
      provider = new MistralLLM(config);
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });

  describe('processText', () => {
    beforeEach(async () => {
      provider = new MistralLLM(config);
      await provider.initialize();
    });

    it('should throw if not initialized', async () => {
      const uninitProvider = new MistralLLM(config);

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
      provider = new MistralLLM(config);
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
          model: 'mistral-small-latest',
        })
      );
    });

    it('should handle non-streaming responses', async () => {
      const nonStreamConfig: MistralLLMConfig = { ...config, stream: false };
      provider = new MistralLLM(nonStreamConfig);
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
      const configWithRetries: MistralLLMConfig = {
        ...config,
        maxRetries: 5,
      };
      provider = new MistralLLM(configWithRetries);
      await provider.initialize();

      expect((provider.getConfig() as MistralLLMConfig).maxRetries).toBe(5);
    });
  });
});
