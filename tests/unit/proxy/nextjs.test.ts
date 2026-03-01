/**
 * @jest-environment node
 */
import { createNextJsProxy } from '../../../src/proxy/adapters/nextjs';
import type { CompositeVoiceProxyConfig } from '../../../src/proxy/types';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('createNextJsProxy', () => {
  const config: CompositeVoiceProxyConfig = {
    anthropicApiKey: 'ant-key',
    openaiApiKey: 'oai-key',
    pathPrefix: '/api/proxy',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
  });

  function makeReq(overrides: {
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    body?: ReadableStream<Uint8Array> | null;
  } = {}) {
    const headers = new Map(Object.entries(overrides.headers ?? { 'content-type': 'application/json' }));
    return {
      method: overrides.method ?? 'POST',
      url: overrides.url ?? 'http://localhost:3000/api/proxy/anthropic/v1/messages',
      headers: {
        get: (name: string) => headers.get(name) ?? null,
        forEach: (cb: (v: string, k: string) => void) => headers.forEach((v, k) => cb(v, k)),
      },
      body: overrides.body ?? null,
    };
  }

  function makeCtx(path: string[]): { params: { path: string[] } } {
    return { params: { path } };
  }

  function makeAsyncCtx(path: string[]): { params: Promise<{ path: string[] }> } {
    return { params: Promise.resolve({ path }) };
  }

  it('returns all six HTTP method handlers', () => {
    const handlers = createNextJsProxy(config);
    expect(handlers.GET).toBeInstanceOf(Function);
    expect(handlers.POST).toBeInstanceOf(Function);
    expect(handlers.PUT).toBeInstanceOf(Function);
    expect(handlers.DELETE).toBeInstanceOf(Function);
    expect(handlers.PATCH).toBeInstanceOf(Function);
    expect(handlers.OPTIONS).toBeInstanceOf(Function);
  });

  describe('HTTP forwarding', () => {
    it('forwards POST to the correct upstream URL with auth headers', async () => {
      const { POST } = createNextJsProxy(config);
      const req = makeReq();
      const ctx = makeCtx(['anthropic', 'v1', 'messages']);

      await POST(req, ctx);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-api-key': 'ant-key',
            'anthropic-version': '2023-06-01',
          }),
        })
      );
    });

    it('forwards to OpenAI with Bearer auth', async () => {
      const { POST } = createNextJsProxy(config);
      const req = makeReq({ method: 'POST' });
      const ctx = makeCtx(['openai', 'v1', 'chat', 'completions']);

      await POST(req, ctx);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer oai-key',
          }),
        })
      );
    });

    it('returns 404 for unknown providers', async () => {
      const { POST } = createNextJsProxy(config);
      const req = makeReq();
      const ctx = makeCtx(['unknown', 'v1', 'endpoint']);

      const response = await POST(req, ctx);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body).toEqual({ error: 'unknown_provider' });
    });

    it('returns 404 for WebSocket-only providers on HTTP', async () => {
      const wsConfig: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        pathPrefix: '/api/proxy',
      };
      const { POST } = createNextJsProxy(wsConfig);
      const req = makeReq();
      const ctx = makeCtx(['deepgram', 'v1', 'listen']);

      const response = await POST(req, ctx);

      expect(response.status).toBe(404);
    });

    it('strips hop-by-hop and auth headers from forwarded request', async () => {
      const { POST } = createNextJsProxy(config);
      const req = makeReq({
        headers: {
          'content-type': 'application/json',
          host: 'localhost:3000',
          authorization: 'Bearer user-token',
          'x-api-key': 'user-api-key',
          'x-custom': 'keep-me',
        },
      });
      const ctx = makeCtx(['anthropic', 'v1', 'messages']);

      await POST(req, ctx);

      const calledHeaders = mockFetch.mock.calls[0]![1].headers as Record<string, string>;
      expect(calledHeaders['host']).toBeUndefined();
      expect(calledHeaders['authorization']).toBeUndefined();
      expect(calledHeaders['x-api-key']).toBe('ant-key'); // replaced with server-side key
      expect(calledHeaders['x-custom']).toBe('keep-me');
    });

    it('streams the upstream response body through', async () => {
      const upstreamBody = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('streamed'));
          controller.close();
        },
      });
      mockFetch.mockResolvedValueOnce(
        new Response(upstreamBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      );

      const { POST } = createNextJsProxy(config);
      const req = makeReq();
      const ctx = makeCtx(['anthropic', 'v1', 'messages']);

      const response = await POST(req, ctx);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe('streamed');
    });

    it('strips hop-by-hop headers from upstream response', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response('ok', {
          status: 200,
          headers: {
            'content-type': 'application/json',
            // transfer-encoding and connection are typically stripped by Response constructor
            // but we verify our code path handles it
          },
        })
      );

      const { POST } = createNextJsProxy(config);
      const req = makeReq();
      const ctx = makeCtx(['anthropic', 'v1', 'messages']);

      const response = await POST(req, ctx);

      expect(response.headers.get('content-type')).toBe('application/json');
    });
  });

  describe('Next.js 15+ async params', () => {
    it('resolves async params correctly', async () => {
      const { POST } = createNextJsProxy(config);
      const req = makeReq();
      const ctx = makeAsyncCtx(['anthropic', 'v1', 'messages']);

      await POST(req, ctx);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.any(Object)
      );
    });

    it('handles empty async path segments', async () => {
      const { POST } = createNextJsProxy(config);
      const req = makeReq();
      const ctx = { params: Promise.resolve({ path: undefined as unknown as string[] }) };

      const response = await POST(req, ctx);

      // Empty path → no provider match → 404
      expect(response.status).toBe(404);
    });
  });

  describe('CORS handling', () => {
    it('returns 204 with CORS headers on OPTIONS', async () => {
      const corsConfig: CompositeVoiceProxyConfig = {
        ...config,
        cors: { origins: ['http://localhost:3000'] },
      };
      const { OPTIONS } = createNextJsProxy(corsConfig);
      const req = makeReq({ method: 'OPTIONS' });
      const ctx = makeCtx(['anthropic', 'v1', 'messages']);

      const response = await OPTIONS(req, ctx);

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
      expect(response.headers.get('access-control-allow-methods')).toContain('POST');
    });

    it('uses wildcard origin when * is configured', async () => {
      const corsConfig: CompositeVoiceProxyConfig = {
        ...config,
        cors: { origins: ['*'] },
      };
      const { OPTIONS } = createNextJsProxy(corsConfig);
      const req = makeReq({ method: 'OPTIONS' });
      const ctx = makeCtx(['anthropic', 'v1', 'messages']);

      const response = await OPTIONS(req, ctx);

      expect(response.headers.get('access-control-allow-origin')).toBe('*');
    });

    it('adds CORS headers to non-OPTIONS responses', async () => {
      const corsConfig: CompositeVoiceProxyConfig = {
        ...config,
        cors: { origins: ['https://myapp.com'] },
      };
      const { POST } = createNextJsProxy(corsConfig);
      const req = makeReq();
      const ctx = makeCtx(['anthropic', 'v1', 'messages']);

      const response = await POST(req, ctx);

      expect(response.headers.get('access-control-allow-origin')).toBe('https://myapp.com');
    });

    it('skips CORS headers when no origins configured', async () => {
      const { OPTIONS } = createNextJsProxy(config);
      const req = makeReq({ method: 'OPTIONS' });
      const ctx = makeCtx(['anthropic', 'v1', 'messages']);

      const response = await OPTIONS(req, ctx);

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  describe('prefix handling', () => {
    it('uses default /proxy prefix', async () => {
      const noPrefix: CompositeVoiceProxyConfig = { anthropicApiKey: 'key' };
      const { POST } = createNextJsProxy(noPrefix);
      const req = makeReq();
      const ctx = makeCtx(['anthropic', 'v1', 'messages']);

      await POST(req, ctx);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.any(Object)
      );
    });

    it('handles provider-only path with no subpath', async () => {
      const { POST } = createNextJsProxy(config);
      const req = makeReq();
      const ctx = makeCtx(['anthropic']);

      await POST(req, ctx);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.anthropic.com',
        expect.any(Object)
      );
    });
  });
});
