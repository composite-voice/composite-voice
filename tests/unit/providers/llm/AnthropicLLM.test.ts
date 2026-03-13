/**
 * Anthropic LLM Provider tests
 */

import { AnthropicLLM } from '../../../../src/providers/llm/anthropic/AnthropicLLM';
import type { AnthropicLLMConfig } from '../../../../src/providers/llm/anthropic/AnthropicLLM';

// Mock the Anthropic SDK before imports
const mockStream = {
  async *[Symbol.asyncIterator]() {
    yield {
      type: 'content_block_delta' as const,
      index: 0,
      delta: { type: 'text_delta' as const, text: 'Hello' },
    };
    yield {
      type: 'content_block_delta' as const,
      index: 0,
      delta: { type: 'text_delta' as const, text: ' world' },
    };
    yield {
      type: 'message_stop' as const,
      // non-text event should be ignored
    };
  },
};

const mockMessagesCreate = jest.fn();
const mockMessagesStream = jest.fn();

const MockAnthropic = jest.fn().mockImplementation(() => ({
  messages: {
    create: mockMessagesCreate,
    stream: mockMessagesStream,
  },
}));

jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: MockAnthropic,
}));

describe('AnthropicLLM', () => {
  let provider: AnthropicLLM;
  let config: AnthropicLLMConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMessagesStream.mockReturnValue(mockStream);
    config = {
      apiKey: 'test-api-key',
      model: 'claude-haiku-4-5',
      temperature: 0.7,
      maxTokens: 500,
      systemPrompt: 'You are a helpful assistant.',
    };
  });

  afterEach(async () => {
    if (provider?.isReady()) {
      await provider.dispose();
    }
  });

  describe('initialization', () => {
    it('should initialize successfully with valid config', async () => {
      provider = new AnthropicLLM(config);
      await provider.initialize();
      expect(provider.isReady()).toBe(true);
    });

    it('should default to claude-haiku-4-5 when no model specified', () => {
      const minimalConfig = { apiKey: 'key' } as AnthropicLLMConfig;
      provider = new AnthropicLLM(minimalConfig);
      expect(provider.config.model).toBe('claude-haiku-4-5');
    });

    it('should default max_tokens to 1024 when not specified', () => {
      const minimalConfig = { apiKey: 'key', model: 'claude-haiku-4-5' } as AnthropicLLMConfig;
      provider = new AnthropicLLM(minimalConfig);
      expect(provider.config.maxTokens).toBe(1024);
    });

    it('should default stream to true', () => {
      const minimalConfig = { apiKey: 'key', model: 'claude-haiku-4-5' } as AnthropicLLMConfig;
      provider = new AnthropicLLM(minimalConfig);
      expect(provider.config.stream).toBe(true);
    });

    it('should preserve explicit config values over defaults', () => {
      provider = new AnthropicLLM(config);
      expect(provider.config.model).toBe('claude-haiku-4-5');
      expect(provider.config.maxTokens).toBe(500);
      expect(provider.config.temperature).toBe(0.7);
    });

    it('should set provider type to rest', () => {
      provider = new AnthropicLLM(config);
      expect(provider.type).toBe('rest');
    });

    it('should declare llm role', () => {
      provider = new AnthropicLLM(config);
      expect(provider.roles).toEqual(['llm']);
    });

    it('should store api key in config', async () => {
      provider = new AnthropicLLM(config);
      await provider.initialize();
      expect(provider.config.apiKey).toBe('test-api-key');
    });
  });

  describe('disposal', () => {
    it('should dispose successfully', async () => {
      provider = new AnthropicLLM(config);
      await provider.initialize();
      await provider.dispose();
      expect(provider.isReady()).toBe(false);
    });

    it('should handle disposal without initialization', async () => {
      provider = new AnthropicLLM(config);
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });

  describe('generate', () => {
    beforeEach(async () => {
      provider = new AnthropicLLM(config);
      await provider.initialize();
    });

    it('should throw if not initialized', async () => {
      const uninitProvider = new AnthropicLLM(config);
      await expect(uninitProvider.generate('Hello')).rejects.toThrow();
    });

    it('should include system prompt from config in messages', async () => {
      const result = await provider.generate('Hello');
      // Must iterate to execute the async generator
      for await (const _ of result) {
        // consume
      }

      expect(mockMessagesStream).toHaveBeenCalled();
      const callArgs = mockMessagesStream.mock.calls[0][0];
      expect(callArgs.system).toBe('You are a helpful assistant.');
      expect(callArgs.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should stream tokens from response', async () => {
      const result = await provider.generate('Hello');
      const chunks: string[] = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('should pass temperature and max_tokens to SDK', async () => {
      const result = await provider.generate('Test', { temperature: 0.9, maxTokens: 200 });
      for await (const _ of result) {
        /* consume */
      }

      expect(mockMessagesStream).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.9,
          max_tokens: 200,
        })
      );
    });

    it('should use config max_tokens as default', async () => {
      const result = await provider.generate('Test');
      for await (const _ of result) {
        /* consume */
      }

      expect(mockMessagesStream).toHaveBeenCalledWith(
        expect.objectContaining({
          max_tokens: 500, // from config
        })
      );
    });
  });

  describe('generateFromMessages', () => {
    beforeEach(async () => {
      provider = new AnthropicLLM(config);
      await provider.initialize();
    });

    it('should handle streaming responses', async () => {
      const messages = [
        { role: 'user' as const, content: 'Hello' },
        { role: 'assistant' as const, content: 'Hi there!' },
        { role: 'user' as const, content: 'How are you?' },
      ];

      const result = await provider.generateFromMessages(messages);
      const chunks: string[] = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('should extract system messages and pass as top-level system param', async () => {
      const messages = [
        { role: 'system' as const, content: 'Custom system prompt' },
        { role: 'user' as const, content: 'Hello' },
      ];

      const result = await provider.generateFromMessages(messages);
      for await (const _ of result) {
        /* consume */
      }

      expect(mockMessagesStream).toHaveBeenCalledWith(
        expect.objectContaining({
          // Config systemPrompt + inline system message are combined (deduped)
          system: 'You are a helpful assistant.\n\nCustom system prompt',
          messages: [{ role: 'user', content: 'Hello' }],
        })
      );
    });

    it('should filter out system messages from messages array', async () => {
      const messages = [
        { role: 'system' as const, content: 'System' },
        { role: 'user' as const, content: 'User message' },
        { role: 'assistant' as const, content: 'Assistant response' },
      ];

      const result = await provider.generateFromMessages(messages);
      for await (const _ of result) {
        /* consume */
      }

      const callArgs = mockMessagesStream.mock.calls[0][0];
      const messageRoles = callArgs.messages.map((m: { role: string }) => m.role);
      expect(messageRoles).not.toContain('system');
      expect(messageRoles).toContain('user');
      expect(messageRoles).toContain('assistant');
    });

    it('should handle non-streaming mode', async () => {
      const nonStreamConfig = { ...config, stream: false };
      provider = new AnthropicLLM(nonStreamConfig);
      await provider.initialize();

      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Complete response' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.generateFromMessages(messages);
      const chunks: string[] = [];

      for await (const chunk of result) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Complete response']);
      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: false,
        })
      );
    });

    it('should pass stop sequences to SDK', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.generateFromMessages(messages, {
        stopSequences: ['STOP', 'END'],
      });
      for await (const _ of result) {
        /* consume */
      }

      expect(mockMessagesStream).toHaveBeenCalledWith(
        expect.objectContaining({
          stop_sequences: ['STOP', 'END'],
        })
      );
    });

    it('should pass model to SDK', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.generateFromMessages(messages);
      for await (const _ of result) {
        /* consume */
      }

      expect(mockMessagesStream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'claude-haiku-4-5',
        })
      );
    });
  });

  describe('configuration', () => {
    it('should support claude-sonnet-4-6 model', async () => {
      const sonnetConfig: AnthropicLLMConfig = {
        ...config,
        model: 'claude-sonnet-4-6',
      };
      provider = new AnthropicLLM(sonnetConfig);
      await provider.initialize();
      expect(provider.config.model).toBe('claude-sonnet-4-6');
    });

    it('should support claude-opus-4-6 model', async () => {
      const opusConfig: AnthropicLLMConfig = {
        ...config,
        model: 'claude-opus-4-6',
      };
      provider = new AnthropicLLM(opusConfig);
      await provider.initialize();
      expect(provider.config.model).toBe('claude-opus-4-6');
    });

    it('should support custom base URL', async () => {
      const configWithBaseURL: AnthropicLLMConfig = {
        ...config,
        baseURL: 'https://custom.anthropic.com',
      };
      provider = new AnthropicLLM(configWithBaseURL);
      await provider.initialize();
      expect(provider.config.baseURL).toBe('https://custom.anthropic.com');
    });

    it('should support custom max retries', async () => {
      const configWithRetries: AnthropicLLMConfig = {
        ...config,
        maxRetries: 5,
      };
      provider = new AnthropicLLM(configWithRetries);
      await provider.initialize();
      expect(provider.config.maxRetries).toBe(5);
    });
  });
});
