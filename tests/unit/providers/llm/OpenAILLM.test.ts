/**
 * OpenAI LLM Provider tests
 */

import { OpenAILLM } from '../../../../src/providers/llm/openai/OpenAILLM';
import type { OpenAILLMConfig } from '../../../../src/providers/llm/openai/OpenAILLM';

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

describe('OpenAILLM', () => {
  let provider: OpenAILLM;
  let config: OpenAILLMConfig;

  beforeEach(() => {
    config = {
      apiKey: 'test-api-key',
      model: 'gpt-4',
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
    it('should initialize successfully with valid config', async () => {
      provider = new OpenAILLM(config);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should store configuration', async () => {
      provider = new OpenAILLM(config);
      await provider.initialize();

      const retrievedConfig = provider.getConfig();
      expect(retrievedConfig.model).toBe('gpt-4');
      expect(retrievedConfig.apiKey).toBe('test-api-key');
    });

    it('should throw ProviderInitializationError when neither apiKey nor proxyUrl is set', async () => {
      const badConfig: OpenAILLMConfig = { model: 'gpt-4' };
      const testProvider = new OpenAILLM(badConfig);
      await expect(testProvider.initialize()).rejects.toMatchObject({
        name: 'ProviderInitializationError',
        message: expect.stringContaining('OpenAILLM'),
      });
    });

    it('should initialize successfully using proxyUrl instead of apiKey', async () => {
      const proxyConfig: OpenAILLMConfig = {
        model: 'gpt-4',
        proxyUrl: 'http://localhost:3000/proxy/openai',
      };
      const testProvider = new OpenAILLM(proxyConfig);
      await expect(testProvider.initialize()).resolves.not.toThrow();
      await testProvider.dispose();
    });

    it('should set provider type to rest', () => {
      provider = new OpenAILLM(config);
      expect(provider.type).toBe('rest');
    });
  });

  describe('disposal', () => {
    it('should dispose successfully', async () => {
      provider = new OpenAILLM(config);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });

    it('should handle disposal without initialization', async () => {
      provider = new OpenAILLM(config);
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });

  describe('processText', () => {
    beforeEach(async () => {
      provider = new OpenAILLM(config);
      await provider.initialize();
    });

    it('should throw if not initialized', async () => {
      const uninitProvider = new OpenAILLM(config);

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

      // Access private client property for testing
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
      provider = new OpenAILLM(config);
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
      // Create a new provider with streaming disabled
      const nonStreamConfig = { ...config, stream: false };
      provider = new OpenAILLM(nonStreamConfig);
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

    it('should pass correct parameters to OpenAI SDK', async () => {
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
  });

  describe('configuration', () => {
    it('should support custom organization ID', async () => {
      const configWithOrg: OpenAILLMConfig = {
        ...config,
        organizationId: 'org-123',
      };
      provider = new OpenAILLM(configWithOrg);
      await provider.initialize();

      expect((provider.getConfig() as OpenAILLMConfig).organizationId).toBe('org-123');
    });

    it('should support custom endpoint', async () => {
      const configWithEndpoint: OpenAILLMConfig = {
        ...config,
        endpoint: 'https://custom.openai.com',
      };
      provider = new OpenAILLM(configWithEndpoint);
      await provider.initialize();

      expect((provider.getConfig() as OpenAILLMConfig).endpoint).toBe('https://custom.openai.com');
    });

    it('should support custom max retries', async () => {
      const configWithRetries: OpenAILLMConfig = {
        ...config,
        maxRetries: 5,
      };
      provider = new OpenAILLM(configWithRetries);
      await provider.initialize();

      expect((provider.getConfig() as OpenAILLMConfig).maxRetries).toBe(5);
    });
  });
});
