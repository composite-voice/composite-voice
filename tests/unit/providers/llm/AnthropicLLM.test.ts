/**
 * Anthropic LLM Provider tests
 *
 * Tests the AnthropicLLM provider which uses native `fetch` via HttpClient
 * and SSEParser (no @anthropic-ai/sdk dependency).
 */

// Polyfill Web APIs that jsdom does not provide but Node.js does.
// These are needed for HttpClient and SSE parsing.
import { TextEncoder, TextDecoder } from 'util';
import { ReadableStream } from 'stream/web';

global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;
global.ReadableStream = ReadableStream as unknown as typeof global.ReadableStream;

// Polyfill AbortSignal.timeout and AbortSignal.any (not available in jsdom)
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return controller.signal;
  };
}
if (typeof AbortSignal.any !== 'function') {
  AbortSignal.any = (signals: AbortSignal[]): AbortSignal => {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
  };
}

import { AnthropicLLM } from '../../../../src/providers/llm/anthropic/AnthropicLLM';
import type { AnthropicLLMConfig } from '../../../../src/providers/llm/anthropic/AnthropicLLM';

// --- Helpers for mock fetch responses ---

/**
 * Create a mock Response-like object with an SSE body stream.
 * Each event object is serialized as `data: <json>\n\n`.
 */
function createSSEResponse(
  events: Array<{ type: string; [key: string]: unknown }>
): Partial<Response> {
  const encoder = new TextEncoder();
  const lines = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(lines));
      controller.close();
    },
  });
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
    body: stream as any,
    text: async () => lines,
    json: async () => ({}),
  };
}

/**
 * Create a mock Response-like object with a JSON body.
 */
function createJSONResponse(data: unknown): Partial<Response> {
  const text = JSON.stringify(data);
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: null,
    text: async () => text,
    json: async () => data,
  };
}

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Standard SSE events for streaming tests
const STREAMING_EVENTS = [
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'Hello' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: ' world' },
  },
  { type: 'message_stop' },
];

// Standard JSON response for non-streaming tests
const NON_STREAMING_RESPONSE = {
  content: [{ type: 'text', text: 'Complete response' }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

describe('AnthropicLLM', () => {
  let provider: AnthropicLLM;
  let config: AnthropicLLMConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(createSSEResponse(STREAMING_EVENTS));
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

  describe('processText', () => {
    beforeEach(async () => {
      provider = new AnthropicLLM(config);
      await provider.initialize();
    });

    it('should throw if not initialized', async () => {
      const uninitProvider = new AnthropicLLM(config);
      await expect(uninitProvider.processText('Hello')).rejects.toThrow();
    });

    it('should include system prompt from config in request body', async () => {
      const result = await provider.processText('Hello');
      for await (const _ of result) {
        // consume
      }

      expect(mockFetch).toHaveBeenCalled();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.anthropic.com/v1/messages');
      const body = JSON.parse(options.body);
      expect(body.system).toBe('You are a helpful assistant.');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should stream tokens from response', async () => {
      const result = await provider.processText('Hello');
      const chunks: string[] = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }
      expect(chunks).toEqual(['Hello', ' world']);
    });

    it('should pass temperature and max_tokens in fetch body', async () => {
      const result = await provider.processText('Test', { temperature: 0.9, maxTokens: 200 });
      for await (const _ of result) {
        /* consume */
      }

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.9);
      expect(body.max_tokens).toBe(200);
    });

    it('should use config max_tokens as default', async () => {
      const result = await provider.processText('Test');
      for await (const _ of result) {
        /* consume */
      }

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.max_tokens).toBe(500); // from config
    });
  });

  describe('processMessages', () => {
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

      const result = await provider.processMessages(messages);
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

      const result = await provider.processMessages(messages);
      for await (const _ of result) {
        /* consume */
      }

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      // Config systemPrompt + inline system message are combined (deduped)
      expect(body.system).toBe('You are a helpful assistant.\n\nCustom system prompt');
      expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should filter out system messages from messages array', async () => {
      const messages = [
        { role: 'system' as const, content: 'System' },
        { role: 'user' as const, content: 'User message' },
        { role: 'assistant' as const, content: 'Assistant response' },
      ];

      const result = await provider.processMessages(messages);
      for await (const _ of result) {
        /* consume */
      }

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const messageRoles = body.messages.map((m: { role: string }) => m.role);
      expect(messageRoles).not.toContain('system');
      expect(messageRoles).toContain('user');
      expect(messageRoles).toContain('assistant');
    });

    it('should handle non-streaming mode', async () => {
      const nonStreamConfig = { ...config, stream: false };
      provider = new AnthropicLLM(nonStreamConfig);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(createJSONResponse(NON_STREAMING_RESPONSE));

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.processMessages(messages);
      const chunks: string[] = [];

      for await (const chunk of result) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Complete response']);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.stream).toBeUndefined();
    });

    it('should pass stop sequences in fetch body', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.processMessages(messages, {
        stopSequences: ['STOP', 'END'],
      });
      for await (const _ of result) {
        /* consume */
      }

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.stop_sequences).toEqual(['STOP', 'END']);
    });

    it('should pass model in fetch body', async () => {
      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.processMessages(messages);
      for await (const _ of result) {
        /* consume */
      }

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('claude-haiku-4-5');
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

    it('should support custom endpoint', async () => {
      const configWithEndpoint: AnthropicLLMConfig = {
        ...config,
        endpoint: 'https://custom.anthropic.com',
      };
      provider = new AnthropicLLM(configWithEndpoint);
      await provider.initialize();
      expect(provider.config.endpoint).toBe('https://custom.anthropic.com');
    });

    it('should use custom endpoint in fetch URL', async () => {
      const configWithEndpoint: AnthropicLLMConfig = {
        ...config,
        endpoint: 'https://custom.anthropic.com',
      };
      provider = new AnthropicLLM(configWithEndpoint);
      await provider.initialize();

      const result = await provider.processText('Hello');
      for await (const _ of result) {
        /* consume */
      }

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.anthropic.com/v1/messages');
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

    it('should send x-api-key header (not Bearer) for auth', async () => {
      provider = new AnthropicLLM(config);
      await provider.initialize();

      const result = await provider.processText('Hello');
      for await (const _ of result) {
        /* consume */
      }

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['x-api-key']).toBe('test-api-key');
      expect(headers['Authorization']).toBeUndefined();
    });

    it('should send anthropic-version header', async () => {
      provider = new AnthropicLLM(config);
      await provider.initialize();

      const result = await provider.processText('Hello');
      for await (const _ of result) {
        /* consume */
      }

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers['anthropic-version']).toBe('2023-06-01');
    });
  });
});
