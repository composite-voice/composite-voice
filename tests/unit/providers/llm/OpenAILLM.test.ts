/**
 * OpenAI LLM Provider tests
 *
 * Tests the OpenAILLM provider which uses native `fetch` via HttpClient
 * and SSEParser (no openai SDK dependency).
 */

// Polyfill Web APIs that jsdom does not provide but Node.js does.
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

import { OpenAILLM } from '../../../../src/providers/llm/openai/OpenAILLM';
import type { OpenAILLMConfig } from '../../../../src/providers/llm/openai/OpenAILLM';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

/** Create a mock Response-like object with an SSE body stream. */
function createSSEResponse(chunks: Array<{ content?: string }>): Partial<Response> {
  const encoder = new TextEncoder();
  const lines =
    chunks
      .map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c.content } }] })}\n\n`)
      .join('') + 'data: [DONE]\n\n';
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

/** Create a mock Response-like object with a JSON body. */
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

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OpenAILLM', () => {
  let provider: OpenAILLM;
  let config: OpenAILLMConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default streaming mock so initialization and basic tests work
    mockFetch.mockResolvedValue(createSSEResponse([{ content: 'Hello' }]));

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

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // processText
  // -------------------------------------------------------------------------

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
      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hello!' }]));

      const result = await provider.processText('Hello', { temperature: 0.5 });
      const chunks: string[] = [];
      for await (const chunk of result) {
        chunks.push(chunk);
      }

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages).toEqual([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
      ]);
    });

    it('should merge options with config defaults', async () => {
      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Response' }]));

      const result = await provider.processText('Test', { temperature: 0.9 });
      const iterator = result[Symbol.asyncIterator]();
      await iterator.next();

      expect(mockFetch).toHaveBeenCalled();
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.temperature).toBe(0.9);
      expect(body.max_tokens).toBe(1000); // from config
    });
  });

  // -------------------------------------------------------------------------
  // processMessages
  // -------------------------------------------------------------------------

  describe('processMessages', () => {
    beforeEach(async () => {
      provider = new OpenAILLM(config);
      await provider.initialize();
    });

    it('should handle streaming responses', async () => {
      mockFetch.mockResolvedValueOnce(
        createSSEResponse([{ content: 'Hello' }, { content: ' world' }, { content: '!' }])
      );

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

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.stream).toBe(true);
      expect(body.messages).toEqual(expect.any(Array));
    });

    it('should handle non-streaming responses', async () => {
      const nonStreamConfig = { ...config, stream: false };
      provider = new OpenAILLM(nonStreamConfig);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(
        createJSONResponse({
          choices: [{ message: { content: 'Complete response' } }],
          usage: { total_tokens: 5 },
        })
      );

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.processMessages(messages);
      const chunks: string[] = [];

      for await (const chunk of result) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Complete response']);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.stream).toBe(false);
    });

    it('should pass correct parameters in the request body', async () => {
      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Test' }]));

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

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('gpt-4');
      expect(body.messages).toEqual(expect.any(Array));
      expect(body.temperature).toBe(0.8);
      expect(body.max_tokens).toBe(500);
      expect(body.stop).toEqual(['STOP']);
      expect(body.frequency_penalty).toBe(0.5);
    });
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  describe('configuration', () => {
    it('should support custom organization ID and send it as a header', async () => {
      const configWithOrg: OpenAILLMConfig = {
        ...config,
        organizationId: 'org-123',
      };
      provider = new OpenAILLM(configWithOrg);
      await provider.initialize();

      expect((provider.getConfig() as OpenAILLMConfig).organizationId).toBe('org-123');

      // Verify the header is sent in the request
      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['openai-organization']).toBe('org-123');
    });

    it('should support custom endpoint', async () => {
      const configWithEndpoint: OpenAILLMConfig = {
        ...config,
        endpoint: 'https://custom.openai.com',
      };
      provider = new OpenAILLM(configWithEndpoint);
      await provider.initialize();

      expect((provider.getConfig() as OpenAILLMConfig).endpoint).toBe('https://custom.openai.com');

      // Verify the URL is used in the request
      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.openai.com/chat/completions');
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
