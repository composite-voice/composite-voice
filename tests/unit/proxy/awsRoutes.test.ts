/**
 * Tests for the proxy's AWS support: SigV4 route building and
 * upstream request signing in the HTTP core.
 *
 * Also proves that routes without the `awsSigV4` descriptor behave exactly
 * as before — the descriptor is a purely additive extension.
 */

// jsdom does not provide crypto.subtle or TextEncoder — install Node's implementations.
import { webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;

import type { IncomingMessage, ServerResponse } from 'http';
import { buildRoutes, matchHttpRoute, matchWsRoute } from '../../../src/proxy/utils/routing';
import { forwardHttpRequest } from '../../../src/proxy/core/http';

const AWS_CONFIG = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
  region: 'us-east-1',
};

describe('buildRoutes with AWS credentials', () => {
  it('should register polly (http) and transcribe (websocket) routes', () => {
    const routes = buildRoutes({ aws: AWS_CONFIG });

    const polly = routes.find((r) => r.provider === 'polly');
    expect(polly).toEqual({
      provider: 'polly',
      type: 'http',
      targetBase: 'https://polly.us-east-1.amazonaws.com',
      authHeaders: {},
      awsSigV4: {
        service: 'polly',
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'AKIDEXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        },
      },
    });

    const transcribe = routes.find((r) => r.provider === 'transcribe');
    expect(transcribe).toEqual({
      provider: 'transcribe',
      type: 'websocket',
      targetBase: 'wss://transcribestreaming.us-east-1.amazonaws.com:8443',
      authHeaders: {},
      awsSigV4: {
        service: 'transcribe',
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'AKIDEXAMPLE',
          secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
        },
      },
    });
  });

  it('should build region-specific target hosts', () => {
    const routes = buildRoutes({ aws: { ...AWS_CONFIG, region: 'eu-west-2' } });

    expect(routes.find((r) => r.provider === 'polly')?.targetBase).toBe(
      'https://polly.eu-west-2.amazonaws.com'
    );
    expect(routes.find((r) => r.provider === 'transcribe')?.targetBase).toBe(
      'wss://transcribestreaming.eu-west-2.amazonaws.com:8443'
    );
  });

  it('should carry the session token into the route credentials', () => {
    const routes = buildRoutes({ aws: { ...AWS_CONFIG, sessionToken: 'TOKEN' } });

    expect(routes.find((r) => r.provider === 'polly')?.awsSigV4?.credentials.sessionToken).toBe(
      'TOKEN'
    );
  });

  it('should register no AWS routes when the aws config is absent', () => {
    const routes = buildRoutes({ deepgramApiKey: 'dg-key' });

    expect(routes.find((r) => r.provider === 'polly')).toBeUndefined();
    expect(routes.find((r) => r.provider === 'transcribe')).toBeUndefined();
  });

  it('should leave existing routes byte-identical whether aws is configured or not', () => {
    const baseConfig = {
      deepgramApiKey: 'dg-key',
      anthropicApiKey: 'sk-ant',
      openaiApiKey: 'sk-oai',
      sonioxApiKey: 'soniox-key',
      speechifyApiKey: 'sp-key',
    };

    const without = buildRoutes(baseConfig);
    const withAws = buildRoutes({ ...baseConfig, aws: AWS_CONFIG });

    // Every pre-existing route is unchanged (deep-equal, including the
    // absence of any awsSigV4 field), and no descriptor leaked onto them.
    const nonAwsRoutes = withAws.filter((r) => r.provider !== 'polly' && r.provider !== 'transcribe');
    expect(nonAwsRoutes).toEqual(without);
    for (const route of nonAwsRoutes) {
      expect(route.awsSigV4).toBeUndefined();
      expect('awsSigV4' in route).toBe(false);
    }
  });

  it('should match AWS routes by URL like any other provider', () => {
    const routes = buildRoutes({ aws: AWS_CONFIG });

    expect(matchHttpRoute(routes, '/proxy/polly/v1/speech', '/proxy')?.provider).toBe('polly');
    expect(
      matchWsRoute(
        routes,
        '/proxy/transcribe/stream-transcription-websocket?language-code=en-US',
        '/proxy'
      )?.provider
    ).toBe('transcribe');
    // Type mismatches do not match
    expect(matchWsRoute(routes, '/proxy/polly/v1/speech', '/proxy')).toBeNull();
    expect(matchHttpRoute(routes, '/proxy/transcribe/foo', '/proxy')).toBeNull();
  });
});

describe('forwardHttpRequest AWS signing', () => {
  const originalFetch = global.fetch;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn().mockResolvedValue({
      status: 200,
      headers: new Map(),
      body: null,
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function createStreamReq(bodyStr: string): IncomingMessage {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Readable } = require('stream');
    const readable = new Readable({
      read() {
        if (bodyStr) this.push(Buffer.from(bodyStr));
        this.push(null);
      },
    });
    Object.assign(readable, {
      headers: { 'content-type': 'application/json' },
      url: '/proxy/polly/v1/speech',
      method: 'POST',
      socket: { remoteAddress: '127.0.0.1' },
    });
    return readable as unknown as IncomingMessage;
  }

  function createMockRes(): ServerResponse {
    return {
      statusCode: 200,
      headersSent: false,
      setHeader: jest.fn(),
      end: jest.fn(),
      write: jest.fn().mockReturnValue(true),
      once: jest.fn(),
    } as unknown as ServerResponse;
  }

  it('should SigV4-sign the upstream request when awsSigV4 is set', async () => {
    const req = createStreamReq('{"Text":"hello","VoiceId":"Joanna"}');
    const res = createMockRes();

    await forwardHttpRequest(
      req,
      res,
      'https://polly.us-east-1.amazonaws.com/v1/speech',
      {},
      {
        awsSigV4: {
          service: 'polly',
          region: 'us-east-1',
          credentials: {
            accessKeyId: 'AKIDEXAMPLE',
            secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
          },
        },
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://polly.us-east-1.amazonaws.com/v1/speech');
    expect(init.headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
    expect(init.headers['authorization']).toMatch(
      /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/polly\/aws4_request, SignedHeaders=host;x-amz-date, Signature=[0-9a-f]{64}$/
    );
    // The body still flows through untouched
    expect(Buffer.from(init.body).toString()).toBe('{"Text":"hello","VoiceId":"Joanna"}');
  });

  it('should sign the session token when the route credentials carry one', async () => {
    const req = createStreamReq('{}');
    const res = createMockRes();

    await forwardHttpRequest(req, res, 'https://polly.us-east-1.amazonaws.com/v1/speech', {}, {
      awsSigV4: {
        service: 'polly',
        region: 'us-east-1',
        credentials: {
          accessKeyId: 'ASIATEMP',
          secretAccessKey: 'TEMPSECRET',
          sessionToken: 'TEMP-TOKEN',
        },
      },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['x-amz-security-token']).toBe('TEMP-TOKEN');
    expect(init.headers['authorization']).toContain(
      'SignedHeaders=host;x-amz-date;x-amz-security-token'
    );
  });

  it('should not alter requests when awsSigV4 is absent (existing behavior)', async () => {
    const req = createStreamReq('{"model":"claude-haiku-4-5"}');
    const res = createMockRes();

    await forwardHttpRequest(req, res, 'https://api.anthropic.com/v1/messages', {
      'x-api-key': 'sk-ant-key',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      'x-api-key': 'sk-ant-key',
    });
    expect(init.headers['authorization']).toBeUndefined();
    expect(init.headers['x-amz-date']).toBeUndefined();
  });
});
