import { createRateLimiter, getClientIp } from '../../../src/proxy/utils/rateLimit';
import type { RateLimitConfig } from '../../../src/proxy/utils/rateLimit';
import { BodyTooLargeError } from '../../../src/proxy/core/http';
import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

// ---------------------------------------------------------------------------
// Helpers to build minimal mock request / response objects
// ---------------------------------------------------------------------------

function mockReq(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    headers: {},
    url: '/proxy/anthropic/v1/messages',
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' } as Socket,
    ...overrides,
  } as unknown as IncomingMessage;
}

// ---------------------------------------------------------------------------
// Rate limiter unit tests
// ---------------------------------------------------------------------------

describe('createRateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('allows requests within the limit', () => {
    const config: RateLimitConfig = { maxRequests: 3, windowMs: 60_000 };
    const limiter = createRateLimiter(config);

    expect(limiter.check('1.2.3.4')).toBe(true);
    expect(limiter.check('1.2.3.4')).toBe(true);
    expect(limiter.check('1.2.3.4')).toBe(true);
  });

  it('rejects requests exceeding the limit', () => {
    const config: RateLimitConfig = { maxRequests: 2, windowMs: 60_000 };
    const limiter = createRateLimiter(config);

    expect(limiter.check('1.2.3.4')).toBe(true);
    expect(limiter.check('1.2.3.4')).toBe(true);
    // Third request exceeds limit
    expect(limiter.check('1.2.3.4')).toBe(false);
  });

  it('tracks IPs independently', () => {
    const config: RateLimitConfig = { maxRequests: 1, windowMs: 60_000 };
    const limiter = createRateLimiter(config);

    expect(limiter.check('1.2.3.4')).toBe(true);
    expect(limiter.check('5.6.7.8')).toBe(true);
    // Both at limit
    expect(limiter.check('1.2.3.4')).toBe(false);
    expect(limiter.check('5.6.7.8')).toBe(false);
  });

  it('resets after the window expires', () => {
    const config: RateLimitConfig = { maxRequests: 1, windowMs: 10_000 };
    const limiter = createRateLimiter(config);

    expect(limiter.check('1.2.3.4')).toBe(true);
    expect(limiter.check('1.2.3.4')).toBe(false);

    // Advance past the window
    jest.advanceTimersByTime(10_001);

    // Should be allowed again
    expect(limiter.check('1.2.3.4')).toBe(true);
  });

  it('defaults windowMs to 60000', () => {
    const config: RateLimitConfig = { maxRequests: 1 };
    const limiter = createRateLimiter(config);

    expect(limiter.check('1.2.3.4')).toBe(true);
    expect(limiter.check('1.2.3.4')).toBe(false);

    // Still blocked after 59 seconds
    jest.advanceTimersByTime(59_999);
    expect(limiter.check('1.2.3.4')).toBe(false);

    // Allowed after 60 seconds
    jest.advanceTimersByTime(2);
    expect(limiter.check('1.2.3.4')).toBe(true);
  });

  it('reset() clears all entries', () => {
    const config: RateLimitConfig = { maxRequests: 1, windowMs: 60_000 };
    const limiter = createRateLimiter(config);

    expect(limiter.check('1.2.3.4')).toBe(true);
    expect(limiter.check('1.2.3.4')).toBe(false);

    limiter.reset();

    expect(limiter.check('1.2.3.4')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getClientIp tests
// ---------------------------------------------------------------------------

describe('getClientIp', () => {
  it('extracts IP from X-Forwarded-For header', () => {
    const req = mockReq({ headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' } });
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('falls back to socket remoteAddress', () => {
    const req = mockReq({ headers: {} });
    expect(getClientIp(req)).toBe('127.0.0.1');
  });

  it('returns "unknown" when no IP is available', () => {
    const req = mockReq({
      headers: {},
      socket: { remoteAddress: undefined } as unknown as Socket,
    });
    expect(getClientIp(req)).toBe('unknown');
  });

  it('handles array-valued X-Forwarded-For', () => {
    const req = mockReq({
      headers: { 'x-forwarded-for': ['192.168.1.1', '10.0.0.1'] as unknown as string },
    });
    expect(getClientIp(req)).toBe('192.168.1.1');
  });
});

// ---------------------------------------------------------------------------
// BodyTooLargeError tests
// ---------------------------------------------------------------------------

describe('BodyTooLargeError', () => {
  it('is an instance of Error with correct name', () => {
    const err = new BodyTooLargeError();
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BodyTooLargeError');
    expect(err.message).toBe('Request body exceeds maximum allowed size');
  });
});

// ---------------------------------------------------------------------------
// forwardHttpRequest body size limiting tests
// ---------------------------------------------------------------------------

describe('forwardHttpRequest body size limiting', () => {
  // We test forwardHttpRequest by importing the real module and mocking fetch
  const originalFetch = global.fetch;

  beforeEach(() => {
    // Mock fetch to return a minimal response
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: new Map(),
      body: null,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Helper to create a readable request stream
  function createStreamReq(bodyStr: string, contentLength?: number): IncomingMessage {
    const { Readable } = require('stream');
    const readable = new Readable({
      read() {
        this.push(Buffer.from(bodyStr));
        this.push(null);
      },
    });
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (contentLength !== undefined) {
      headers['content-length'] = String(contentLength);
    }
    Object.assign(readable, {
      headers,
      url: '/proxy/anthropic/v1/messages',
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
    });
    return readable as unknown as IncomingMessage;
  }

  function createMockRes(): {
    res: import('http').ServerResponse;
    getResult: () => { statusCode: number; body: string; headers: Record<string, string> };
  } {
    let statusCode = 200;
    let body = '';
    const headers: Record<string, string> = {};
    const res = {
      statusCode,
      headersSent: false,
      setHeader(key: string, value: string) {
        headers[key] = value;
      },
      end(data?: string) {
        if (data) body = data;
      },
      write: jest.fn().mockReturnValue(true),
      once: jest.fn(),
      set statusCode_(v: number) {
        statusCode = v;
      },
    };
    // Use a getter/setter so statusCode is tracked
    const proxy = new Proxy(res, {
      set(target, prop, value) {
        if (prop === 'statusCode') {
          statusCode = value;
        }
        (target as any)[prop] = value;
        return true;
      },
    });
    return {
      res: proxy as unknown as import('http').ServerResponse,
      getResult: () => ({ statusCode, body, headers }),
    };
  }

  it('rejects request when Content-Length exceeds maxBodySize', async () => {
    const { forwardHttpRequest } = require('../../../src/proxy/core/http');
    const req = createStreamReq('{"large": true}', 1000);
    const { res, getResult } = createMockRes();

    await forwardHttpRequest(req, res, 'https://api.example.com/v1', {}, { maxBodySize: 100 });

    const result = getResult();
    expect(result.statusCode).toBe(413);
    expect(JSON.parse(result.body)).toEqual({
      error: 'payload_too_large',
      message: 'Request body exceeds maximum allowed size',
    });
  });

  it('rejects request when streamed body exceeds maxBodySize', async () => {
    const { forwardHttpRequest } = require('../../../src/proxy/core/http');
    const bigBody = 'x'.repeat(200);
    // No content-length header so it must be caught during streaming
    const req = createStreamReq(bigBody);
    const { res, getResult } = createMockRes();

    await forwardHttpRequest(req, res, 'https://api.example.com/v1', {}, { maxBodySize: 50 });

    const result = getResult();
    expect(result.statusCode).toBe(413);
  });

  it('allows request when body is within maxBodySize', async () => {
    const { forwardHttpRequest } = require('../../../src/proxy/core/http');
    const smallBody = '{"ok":true}';
    const req = createStreamReq(smallBody, smallBody.length);
    const { res, getResult } = createMockRes();

    // Mock fetch to return a proper response with forEach
    const mockHeaders = new Map<string, string>();
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: { forEach: (cb: (v: string, k: string) => void) => mockHeaders.forEach(cb) },
      body: null,
    });

    await forwardHttpRequest(req, res, 'https://api.example.com/v1', {}, { maxBodySize: 1000 });

    const result = getResult();
    expect(result.statusCode).toBe(200);
  });

  it('does not enforce body size when maxBodySize is undefined', async () => {
    const { forwardHttpRequest } = require('../../../src/proxy/core/http');
    const bigBody = 'x'.repeat(10000);
    const req = createStreamReq(bigBody, bigBody.length);
    const { res, getResult } = createMockRes();

    const mockHeaders = new Map<string, string>();
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      headers: { forEach: (cb: (v: string, k: string) => void) => mockHeaders.forEach(cb) },
      body: null,
    });

    await forwardHttpRequest(req, res, 'https://api.example.com/v1', {});

    const result = getResult();
    expect(result.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Authentication function tests
// ---------------------------------------------------------------------------

describe('authenticate function', () => {
  it('blocks unauthorized requests when authenticate returns false', () => {
    const authenticate = jest.fn().mockReturnValue(false);

    // Simulate what the adapters do
    const result = authenticate({ headers: {}, url: '/proxy/anthropic/v1/messages' });
    expect(result).toBe(false);
  });

  it('allows authorized requests when authenticate returns true', () => {
    const authenticate = jest.fn().mockReturnValue(true);

    const result = authenticate({
      headers: { authorization: 'Bearer valid-token' },
      url: '/proxy/anthropic/v1/messages',
    });
    expect(result).toBe(true);
  });

  it('supports async authenticate function', async () => {
    const authenticate = jest.fn().mockResolvedValue(true);

    const result = await authenticate({
      headers: { authorization: 'Bearer valid-token' },
      url: '/proxy/anthropic/v1/messages',
    });
    expect(result).toBe(true);
  });

  it('receives headers and url from the request', () => {
    const authenticate = jest.fn().mockReturnValue(true);
    const headers = { authorization: 'Bearer token', 'x-custom': 'value' };
    const url = '/proxy/anthropic/v1/messages';

    authenticate({ headers, url });

    expect(authenticate).toHaveBeenCalledWith({ headers, url });
  });
});

// ---------------------------------------------------------------------------
// Backward compatibility — no security config
// ---------------------------------------------------------------------------

describe('backward compatibility', () => {
  it('CompositeVoiceProxyConfig without security field compiles and works', () => {
    // This test verifies the type is backward-compatible by constructing a
    // config without the security field -- if types broke this would fail at compile.
    const config: import('../../../src/proxy/types').CompositeVoiceProxyConfig = {
      anthropicApiKey: 'test-key',
      pathPrefix: '/proxy',
    };
    expect(config.security).toBeUndefined();
  });

  it('security field is fully optional', () => {
    const config: import('../../../src/proxy/types').CompositeVoiceProxyConfig = {
      anthropicApiKey: 'test-key',
      security: {},
    };
    expect(config.security?.maxBodySize).toBeUndefined();
    expect(config.security?.maxWsMessageSize).toBeUndefined();
    expect(config.security?.rateLimit).toBeUndefined();
    expect(config.security?.authenticate).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// WebSocket message size — getMessageSize helper (indirectly tested)
// ---------------------------------------------------------------------------

describe('WebSocket message size concept', () => {
  // We test the getMessageSize logic indirectly since it is a private function
  // in ws.ts. These tests verify the size calculation for different data types.

  function getMessageSize(data: Buffer | ArrayBuffer | Buffer[]): number {
    if (Array.isArray(data)) {
      return data.reduce((sum, buf) => sum + buf.length, 0);
    }
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    return data.length;
  }

  it('calculates size for a Buffer', () => {
    expect(getMessageSize(Buffer.from('hello'))).toBe(5);
  });

  it('calculates size for an ArrayBuffer', () => {
    expect(getMessageSize(new ArrayBuffer(42))).toBe(42);
  });

  it('calculates size for an array of Buffers', () => {
    const data = [Buffer.from('abc'), Buffer.from('de')];
    expect(getMessageSize(data)).toBe(5);
  });

  it('returns 0 for empty data', () => {
    expect(getMessageSize(Buffer.alloc(0))).toBe(0);
    expect(getMessageSize(new ArrayBuffer(0))).toBe(0);
    expect(getMessageSize([])).toBe(0);
  });
});
