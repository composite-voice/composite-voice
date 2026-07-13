/**
 * Tests for the Next.js App Router proxy adapter.
 *
 * Focuses on upstream URL construction: the catch-all route handler rebuilds
 * the path from `params.path` segments (which never include the query string),
 * so the adapter must carry `?query` from the request URL to the upstream URL
 * (e.g. MiniMax's `GroupId` parameter) while leaving query-less requests
 * byte-for-byte unchanged.
 */

import { createNextJsProxy } from '../../../src/proxy/adapters/nextjs';

// jsdom does not provide the fetch API classes; the handler constructs
// `Response` objects, so provide a minimal stand-in.
class MockResponse {
  body: unknown;
  status: number;
  headers: Headers;

  constructor(body?: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.headers = new Headers(init.headers ?? {});
  }
}
(global as Record<string, unknown>).Response = MockResponse;

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Build a minimal NextRequest-like object accepted by the handler. */
function mockNextRequest(
  url: string,
  method = 'POST'
): Parameters<ReturnType<typeof createNextJsProxy>['POST']>[0] {
  return {
    method,
    url,
    headers: new Headers({ 'content-type': 'application/json' }),
    body: null,
  } as unknown as Parameters<ReturnType<typeof createNextJsProxy>['POST']>[0];
}

/** Minimal upstream response returned by the mocked fetch. */
function mockUpstream(): unknown {
  return { status: 200, headers: new Headers({ 'content-type': 'application/json' }), body: null };
}

describe('createNextJsProxy — upstream URL construction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockResolvedValue(mockUpstream());
  });

  it('forwards the query string to the upstream URL (MiniMax GroupId)', async () => {
    const { POST } = createNextJsProxy({
      minimaxApiKey: 'minimax-key',
      pathPrefix: '/api/proxy',
    });

    await POST(
      mockNextRequest('http://localhost:3000/api/proxy/minimax/v1/t2a_v2?GroupId=1234%205678'),
      { params: { path: ['minimax', 'v1', 't2a_v2'] } }
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [targetUrl, init] = mockFetch.mock.calls[0] as [
      string,
      { headers: Record<string, string> },
    ];
    expect(targetUrl).toBe('https://api.minimax.io/v1/t2a_v2?GroupId=1234%205678');
    expect(init.headers['Authorization']).toBe('Bearer minimax-key');
  });

  it('leaves query-less requests unchanged (no trailing "?")', async () => {
    const { POST } = createNextJsProxy({
      anthropicApiKey: 'ant-key',
      pathPrefix: '/api/proxy',
    });

    await POST(mockNextRequest('http://localhost:3000/api/proxy/anthropic/v1/messages'), {
      params: { path: ['anthropic', 'v1', 'messages'] },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [targetUrl] = mockFetch.mock.calls[0] as [string];
    expect(targetUrl).toBe('https://api.anthropic.com/v1/messages');
  });

  it('forwards query strings for async params (Next.js 15+)', async () => {
    const { POST } = createNextJsProxy({
      minimaxApiKey: 'minimax-key',
      pathPrefix: '/api/proxy',
    });

    await POST(mockNextRequest('http://localhost:3000/api/proxy/minimax/v1/t2a_v2?GroupId=42'), {
      params: Promise.resolve({ path: ['minimax', 'v1', 't2a_v2'] }),
    });

    const [targetUrl] = mockFetch.mock.calls[0] as [string];
    expect(targetUrl).toBe('https://api.minimax.io/v1/t2a_v2?GroupId=42');
  });

  it('returns 404 for unknown providers without calling upstream', async () => {
    const { POST } = createNextJsProxy({
      anthropicApiKey: 'ant-key',
      pathPrefix: '/api/proxy',
    });

    const res = await POST(
      mockNextRequest('http://localhost:3000/api/proxy/minimax/v1/t2a_v2?GroupId=42'),
      { params: { path: ['minimax', 'v1', 't2a_v2'] } }
    );

    expect(res.status).toBe(404);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
