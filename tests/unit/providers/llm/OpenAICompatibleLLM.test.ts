/**
 * OpenAICompatibleLLM base class tests
 *
 * Tests the OpenAICompatibleLLM provider which uses native `fetch` via HttpClient
 * and SSEParser (no openai SDK dependency).
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

import { OpenAICompatibleLLM } from '../../../../src/providers/llm/openai-compatible/OpenAICompatibleLLM';
import type { OpenAICompatibleLLMConfig } from '../../../../src/providers/llm/openai-compatible/OpenAICompatibleLLM';

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

describe('OpenAICompatibleLLM', () => {
  let provider: OpenAICompatibleLLM;
  let config: OpenAICompatibleLLMConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default streaming mock so initialization and basic tests work
    mockFetch.mockResolvedValue(createSSEResponse([{ content: 'Hello' }]));

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

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

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

    it('should send fetch to {baseUrl}/chat/completions with authorization header when using apiKey', async () => {
      provider = new OpenAICompatibleLLM(config);
      await provider.initialize();

      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const result = await provider.processMessages(messages);
      for await (const _chunk of result) {
        // consume
      }

      expect(mockFetch).toHaveBeenCalled();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.example.com/v1/chat/completions');
      expect(options.headers['authorization']).toBe('Bearer test-api-key');
    });

    it('should use proxyUrl as baseUrl and omit authorization header when proxyUrl is configured', async () => {
      const proxyConfig: OpenAICompatibleLLMConfig = {
        model: 'gpt-4',
        proxyUrl: 'http://localhost:3000/proxy/custom',
      };
      provider = new OpenAICompatibleLLM(proxyConfig);
      await provider.initialize();

      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const result = await provider.processMessages(messages);
      for await (const _chunk of result) {
        // consume
      }

      expect(mockFetch).toHaveBeenCalled();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3000/proxy/custom/chat/completions');
      expect(options.headers['authorization']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // buildHeaders hook
  // -------------------------------------------------------------------------

  describe('buildHeaders hook', () => {
    it('should merge custom headers from buildHeaders into request', async () => {
      class CustomLLM extends OpenAICompatibleLLM {
        protected override readonly providerName = 'CustomLLM';

        protected override buildHeaders(): Record<string, string> {
          return { 'x-custom-header': 'custom-value' };
        }
      }

      const customProvider = new CustomLLM(config);
      await customProvider.initialize();

      const messages = [{ role: 'user' as const, content: 'Hello' }];
      const result = await customProvider.processMessages(messages);
      for await (const _chunk of result) {
        // consume
      }

      expect(mockFetch).toHaveBeenCalled();
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['x-custom-header']).toBe('custom-value');

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

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // processText
  // -------------------------------------------------------------------------

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
      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hello!' }]));

      const result = await provider.processText('Hello');
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
      provider = new OpenAICompatibleLLM(config);
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
      provider = new OpenAICompatibleLLM(nonStreamConfig);
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

    it('should throw AbortError when signal is already aborted', async () => {
      const abortController = new AbortController();
      abortController.abort();

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
      const encoder = new TextEncoder();
      const lines = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: {} }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: '' } }] })}\n\n`,
        `data: ${JSON.stringify({ choices: [{ delta: { content: ' world' } }] })}\n\n`,
        'data: [DONE]\n\n',
      ].join('');

      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(lines));
          controller.close();
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/event-stream' }),
        body: stream as any,
        text: async () => lines,
        json: async () => ({}),
      });

      const messages = [{ role: 'user' as const, content: 'Test' }];
      const result = await provider.processMessages(messages);
      const chunks: string[] = [];

      for await (const chunk of result) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual(['Hello', ' world']);
    });
  });

  // -------------------------------------------------------------------------
  // Subclass usage
  // -------------------------------------------------------------------------

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

      // Verify the fetch URL and headers when making a request
      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await groqProvider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
      expect(options.headers['authorization']).toBe('Bearer groq-key');

      await groqProvider.dispose();
    });
  });
});
