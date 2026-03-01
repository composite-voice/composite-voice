/**
 * @jest-environment node
 */
import { forwardHttpRequest } from '../../../src/proxy/core/http';
import { EventEmitter } from 'events';
import type { IncomingMessage, ServerResponse } from 'http';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

/** Create a fake IncomingMessage that emits data/end events. */
function mockReq(
  body: string | null = null,
  overrides: Partial<IncomingMessage> = {}
): IncomingMessage {
  const emitter = new EventEmitter();
  const req = Object.assign(emitter, {
    url: '/proxy/anthropic/v1/messages',
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    ...overrides,
  }) as unknown as IncomingMessage;

  // Schedule the data/end events
  process.nextTick(() => {
    if (body) {
      emitter.emit('data', Buffer.from(body));
    }
    emitter.emit('end');
  });

  return req;
}

interface MockRes {
  _statusCode: number;
  _headers: Record<string, string>;
  _chunks: Buffer[];
  _ended: boolean;
  headersSent: boolean;
  statusCode: number;
  setHeader(name: string, value: string): void;
  write(chunk: Buffer | Uint8Array): boolean;
  end: jest.Mock;
  once: jest.Mock;
}

function mockRes(): MockRes {
  const res: MockRes = {
    _statusCode: 200,
    _headers: {},
    _chunks: [],
    _ended: false,
    headersSent: false,
    get statusCode() {
      return this._statusCode;
    },
    set statusCode(code: number) {
      this._statusCode = code;
    },
    setHeader(name: string, value: string) {
      this._headers[name.toLowerCase()] = value;
    },
    write(chunk: Buffer | Uint8Array) {
      this._chunks.push(Buffer.from(chunk));
      return true; // no backpressure
    },
    end: jest.fn(function (this: MockRes, data?: string) {
      if (data) this._chunks = [Buffer.from(data)];
      this._ended = true;
      this.headersSent = true;
    }),
    once: jest.fn(),
  };
  return res;
}

describe('forwardHttpRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('forwards request to target URL with auth headers', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('{"result":"ok"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    const req = mockReq('{"prompt":"hello"}');
    const res = mockRes();
    const authHeaders = { 'x-api-key': 'test-key', 'anthropic-version': '2023-06-01' };

    await forwardHttpRequest(req, res as unknown as ServerResponse, 'https://api.anthropic.com/v1/messages', authHeaders);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        }),
      })
    );
  });

  it('strips hop-by-hop headers from the request', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const req = mockReq('body', {
      headers: {
        'content-type': 'application/json',
        host: 'localhost:3000',
        connection: 'keep-alive',
        'transfer-encoding': 'chunked',
        authorization: 'Bearer user-token',
        'x-api-key': 'user-key',
        'x-custom': 'preserve-me',
      },
    });
    const res = mockRes();

    await forwardHttpRequest(req, res as unknown as ServerResponse, 'https://example.com', { Authorization: 'Bearer server' });

    const calledHeaders = mockFetch.mock.calls[0]![1].headers as Record<string, string>;
    expect(calledHeaders['host']).toBeUndefined();
    expect(calledHeaders['connection']).toBeUndefined();
    expect(calledHeaders['transfer-encoding']).toBeUndefined();
    expect(calledHeaders['x-custom']).toBe('preserve-me');
    expect(calledHeaders['Authorization']).toBe('Bearer server');
  });

  it('sets content-type to application/json when body present and no content-type', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const req = mockReq('{"data":1}', { headers: {} });
    const res = mockRes();

    await forwardHttpRequest(req, res as unknown as ServerResponse, 'https://example.com', {});

    const calledHeaders = mockFetch.mock.calls[0]![1].headers as Record<string, string>;
    expect(calledHeaders['content-type']).toBe('application/json');
  });

  it('relays upstream status code to the client', async () => {
    mockFetch.mockResolvedValueOnce(new Response('created', { status: 201 }));

    const req = mockReq('body');
    const res = mockRes();

    await forwardHttpRequest(req, res as unknown as ServerResponse, 'https://example.com', {});

    expect(res._statusCode).toBe(201);
  });

  it('streams the response body back to the client', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('chunk1'));
        controller.enqueue(new TextEncoder().encode('chunk2'));
        controller.close();
      },
    });
    mockFetch.mockResolvedValueOnce(new Response(body, { status: 200 }));

    const req = mockReq(null);
    const res = mockRes();

    await forwardHttpRequest(req, res as unknown as ServerResponse, 'https://example.com', {});

    const allData = Buffer.concat(res._chunks).toString();
    expect(allData).toBe('chunk1chunk2');
    expect(res.end).toHaveBeenCalled();
  });

  it('handles empty upstream body', async () => {
    mockFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const req = mockReq(null);
    const res = mockRes();

    await forwardHttpRequest(req, res as unknown as ServerResponse, 'https://example.com', {});

    expect(res._statusCode).toBe(204);
    expect(res.end).toHaveBeenCalled();
  });

  it('returns 502 on fetch failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const req = mockReq('body');
    const res = mockRes();

    await forwardHttpRequest(req, res as unknown as ServerResponse, 'https://example.com', {});

    expect(res._statusCode).toBe(502);
    expect(res._headers['content-type']).toBe('application/json');
    expect(res.end).toHaveBeenCalledWith(
      expect.stringContaining('proxy_upstream_error')
    );
  });

  it('does not write 502 if headers already sent', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const req = mockReq('body');
    const res = mockRes();
    res.headersSent = true;

    await forwardHttpRequest(req, res as unknown as ServerResponse, 'https://example.com', {});

    // Should not crash or override status
    expect(res.end).not.toHaveBeenCalled();
  });

  it('sends null body for GET requests with no content', async () => {
    mockFetch.mockResolvedValueOnce(new Response('ok', { status: 200 }));

    const req = mockReq(null, { method: 'GET' });
    const res = mockRes();

    await forwardHttpRequest(req, res as unknown as ServerResponse, 'https://example.com', {});

    expect(mockFetch.mock.calls[0]![1].body).toBeNull();
  });
});
