/**
 * Mistral LLM Provider tests
 *
 * Tests the MistralLLM provider which uses native `fetch` via HttpClient
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

import { MistralLLM } from '../../../../src/providers/llm/mistral/MistralLLM';
import type { MistralLLMConfig } from '../../../../src/providers/llm/mistral/MistralLLM';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

/** Create a mock Response-like object with an SSE body stream. */
function createSSEResponse(chunks: Array<{ content?: string }>): Partial<Response> {
  const encoder = new TextEncoder();
  const lines =
    chunks
      .map(
        (c) =>
          `data: ${JSON.stringify({ choices: [{ delta: { content: c.content } }] })}\n\n`
      )
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

describe('MistralLLM', () => {
  let provider: MistralLLM;
  let config: MistralLLMConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default streaming mock so initialization and basic tests work
    mockFetch.mockResolvedValue(createSSEResponse([{ content: 'Hello' }]));

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

  // -------------------------------------------------------------------------
  // Initialization
  // -------------------------------------------------------------------------

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

      // Verify the authorization header uses mistralApiKey
      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['authorization']).toBe('Bearer mistral-key-wins');
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

  // -------------------------------------------------------------------------
  // Mistral-specific defaults
  // -------------------------------------------------------------------------

  describe('Mistral-specific defaults', () => {
    it('should default fetch URL to Mistral API endpoint', async () => {
      provider = new MistralLLM(config);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.mistral.ai/v1/chat/completions');
    });

    it('should allow overriding endpoint', async () => {
      const customConfig: MistralLLMConfig = {
        ...config,
        endpoint: 'https://custom.mistral.endpoint/v1',
      };
      provider = new MistralLLM(customConfig);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://custom.mistral.endpoint/v1/chat/completions');
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

    it('should use proxyUrl as baseUrl and omit auth header when in proxy mode', async () => {
      const proxyConfig: MistralLLMConfig = {
        proxyUrl: 'http://localhost:3000/proxy/mistral',
        model: 'mistral-small-latest',
      };
      provider = new MistralLLM(proxyConfig);
      await provider.initialize();

      mockFetch.mockResolvedValueOnce(createSSEResponse([{ content: 'Hi' }]));
      const result = await provider.processMessages([{ role: 'user', content: 'Hello' }]);
      for await (const _chunk of result) {
        // consume
      }

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3000/proxy/mistral/chat/completions');
      expect(options.headers['authorization']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Disposal
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // processText
  // -------------------------------------------------------------------------

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
      provider = new MistralLLM(config);
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
      expect(body.model).toBe('mistral-small-latest');
    });

    it('should handle non-streaming responses', async () => {
      const nonStreamConfig: MistralLLMConfig = { ...config, stream: false };
      provider = new MistralLLM(nonStreamConfig);
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
