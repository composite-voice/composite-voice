/**
 * Groq LLM Provider tests
 *
 * Tests the GroqLLM provider which uses native `fetch` via HttpClient
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

import { GroqLLM } from '../../../../src/providers/llm/groq/GroqLLM';
import type { GroqLLMConfig } from '../../../../src/providers/llm/groq/GroqLLM';

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

describe('GroqLLM', () => {
  let provider: GroqLLM;
  let config: GroqLLMConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default streaming mock so initialization and basic tests work
    mockFetch.mockResolvedValue(createSSEResponse([{ content: 'Hello' }]));

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

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

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

      // Verify the authorization header uses groqApiKey
      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['authorization']).toBe('Bearer groq-key-wins');
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

  // -------------------------------------------------------------------------
  // Groq-specific defaults
  // -------------------------------------------------------------------------

  describe('Groq-specific defaults', () => {
    it('should default fetch URL to Groq API endpoint', async () => {
      provider = new GroqLLM(config);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    });

    it('should allow overriding endpoint', async () => {
      const customConfig: GroqLLMConfig = {
        ...config,
        endpoint: 'https://custom.groq.endpoint/v1',
      };
      provider = new GroqLLM(customConfig);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.groq.endpoint/v1/chat/completions');
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

    it('should use proxyUrl as baseUrl and omit auth header when in proxy mode', async () => {
      const proxyConfig: GroqLLMConfig = {
        proxyUrl: 'http://localhost:3000/proxy/groq',
        model: 'llama-3.3-70b-versatile',
      };
      provider = new GroqLLM(proxyConfig);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3000/proxy/groq/chat/completions');
      expect(options.headers['authorization']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // processText
  // -------------------------------------------------------------------------

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
      provider = new GroqLLM(config);
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
      expect(body.model).toBe('llama-3.3-70b-versatile');
    });

    it('should handle non-streaming responses', async () => {
      const nonStreamConfig: GroqLLMConfig = { ...config, stream: false };
      provider = new GroqLLM(nonStreamConfig);
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
