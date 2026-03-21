/**
 * Gemini LLM Provider tests
 *
 * Tests the GeminiLLM provider which uses native `fetch` via HttpClient
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

import { GeminiLLM } from '../../../../src/providers/llm/gemini/GeminiLLM';
import type { GeminiLLMConfig } from '../../../../src/providers/llm/gemini/GeminiLLM';

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

describe('GeminiLLM', () => {
  let provider: GeminiLLM;
  let config: GeminiLLMConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default streaming mock so initialization and basic tests work
    mockFetch.mockResolvedValue(createSSEResponse([{ content: 'Hello' }]));

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

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

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

      // Verify the authorization header uses geminiApiKey
      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['authorization']).toBe('Bearer gemini-key-wins');
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

  // -------------------------------------------------------------------------
  // Gemini-specific defaults
  // -------------------------------------------------------------------------

  describe('Gemini-specific defaults', () => {
    it('should default fetch URL to Gemini API endpoint', async () => {
      provider = new GeminiLLM(config);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    });

    it('should allow overriding endpoint', async () => {
      const customConfig: GeminiLLMConfig = {
        ...config,
        endpoint: 'https://custom.gemini.endpoint/v1',
      };
      provider = new GeminiLLM(customConfig);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.gemini.endpoint/v1/chat/completions');
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

    it('should use proxyUrl as baseUrl and omit auth header when in proxy mode', async () => {
      const proxyConfig: GeminiLLMConfig = {
        proxyUrl: 'http://localhost:3000/proxy/gemini',
        model: 'gemini-2.0-flash',
      };
      provider = new GeminiLLM(proxyConfig);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3000/proxy/gemini/chat/completions');
      expect(options.headers['authorization']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // processText
  // -------------------------------------------------------------------------

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
  });

  // -------------------------------------------------------------------------
  // processMessages
  // -------------------------------------------------------------------------

  describe('processMessages', () => {
    beforeEach(async () => {
      provider = new GeminiLLM(config);
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
      expect(body.model).toBe('gemini-2.0-flash');
    });

    it('should handle non-streaming responses', async () => {
      const nonStreamConfig: GeminiLLMConfig = { ...config, stream: false };
      provider = new GeminiLLM(nonStreamConfig);
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
  });

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

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
