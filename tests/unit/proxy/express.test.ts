import { createExpressProxy } from '../../../src/proxy/adapters/express';
import type { CompositeVoiceProxyConfig } from '../../../src/proxy/types';
import type { IncomingMessage, ServerResponse, Server } from 'http';
import type { Socket } from 'net';

// Mock the core transport functions
jest.mock('../../../src/proxy/core/http', () => ({
  forwardHttpRequest: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../src/proxy/core/ws', () => ({
  proxyWebSocket: jest.fn().mockResolvedValue(undefined),
}));

import { forwardHttpRequest } from '../../../src/proxy/core/http';
import { proxyWebSocket } from '../../../src/proxy/core/ws';

const mockedForwardHttp = forwardHttpRequest as jest.MockedFunction<typeof forwardHttpRequest>;
const mockedProxyWs = proxyWebSocket as jest.MockedFunction<typeof proxyWebSocket>;

function mockReq(overrides: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    url: '/',
    method: 'GET',
    headers: {},
    ...overrides,
  } as unknown as IncomingMessage;
}

function mockRes(): ServerResponse & { _statusCode: number; _ended: boolean; _headers: Record<string, string> } {
  const res = {
    _statusCode: 200,
    _ended: false,
    _headers: {} as Record<string, string>,
    get statusCode() {
      return this._statusCode;
    },
    set statusCode(code: number) {
      this._statusCode = code;
    },
    setHeader(name: string, value: string) {
      this._headers[name.toLowerCase()] = value;
    },
    getHeader(name: string) {
      return this._headers[name.toLowerCase()];
    },
    end: jest.fn(function (this: { _ended: boolean }) {
      this._ended = true;
    }),
  };
  return res as unknown as ServerResponse & { _statusCode: number; _ended: boolean; _headers: Record<string, string> };
}

describe('createExpressProxy', () => {
  const config: CompositeVoiceProxyConfig = {
    anthropicApiKey: 'ant-key',
    deepgramApiKey: 'dg-key',
    pathPrefix: '/proxy',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('middleware', () => {
    it('forwards matching HTTP requests to the correct upstream URL', async () => {
      const { middleware } = createExpressProxy(config);
      const req = mockReq({ url: '/proxy/anthropic/v1/messages', method: 'POST' });
      const res = mockRes();
      const next = jest.fn();

      middleware(req, res, next);

      // forwardHttpRequest is async, wait for it
      await Promise.resolve();

      expect(mockedForwardHttp).toHaveBeenCalledWith(
        req,
        res,
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({ 'x-api-key': 'ant-key' })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('calls next() for non-matching routes', () => {
      const { middleware } = createExpressProxy(config);
      const req = mockReq({ url: '/api/other', method: 'GET' });
      const res = mockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(mockedForwardHttp).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('calls next() for WebSocket provider on HTTP path', () => {
      const { middleware } = createExpressProxy(config);
      const req = mockReq({ url: '/proxy/deepgram/v1/listen', method: 'GET' });
      const res = mockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(mockedForwardHttp).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalled();
    });

    it('responds to OPTIONS with 204 when CORS is configured', () => {
      const corsConfig: CompositeVoiceProxyConfig = {
        ...config,
        cors: { origins: ['http://localhost:3000'] },
      };
      const { middleware } = createExpressProxy(corsConfig);
      const req = mockReq({
        url: '/proxy/anthropic/v1/messages',
        method: 'OPTIONS',
        headers: { origin: 'http://localhost:3000' },
      });
      const res = mockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._statusCode).toBe(204);
      expect(res.end).toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });

    it('sets CORS headers when configured', () => {
      const corsConfig: CompositeVoiceProxyConfig = {
        ...config,
        cors: { origins: ['http://localhost:3000'] },
      };
      const { middleware } = createExpressProxy(corsConfig);
      const req = mockReq({
        url: '/proxy/anthropic/v1/messages',
        method: 'POST',
        headers: { origin: 'http://localhost:3000' },
      });
      const res = mockRes();
      const next = jest.fn();

      middleware(req, res, next);

      expect(res._headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('uses default /proxy prefix when not specified', async () => {
      const noPrefix: CompositeVoiceProxyConfig = { anthropicApiKey: 'key' };
      const { middleware } = createExpressProxy(noPrefix);
      const req = mockReq({ url: '/proxy/anthropic/v1/messages', method: 'POST' });
      const res = mockRes();
      const next = jest.fn();

      middleware(req, res, next);
      await Promise.resolve();

      expect(mockedForwardHttp).toHaveBeenCalled();
    });

    it('passes forwardHttpRequest errors to next()', async () => {
      const error = new Error('upstream failed');
      mockedForwardHttp.mockRejectedValueOnce(error);

      const { middleware } = createExpressProxy(config);
      const req = mockReq({ url: '/proxy/anthropic/v1/messages', method: 'POST' });
      const res = mockRes();
      const next = jest.fn();

      middleware(req, res, next);

      // Wait for the async catch to propagate
      await new Promise((r) => setTimeout(r, 10));

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  describe('attachWebSocket', () => {
    it('proxies upgrade requests for WebSocket providers', async () => {
      const { attachWebSocket } = createExpressProxy(config);
      const server = {
        on: jest.fn(),
      } as unknown as Server;

      attachWebSocket(server);

      expect(server.on).toHaveBeenCalledWith('upgrade', expect.any(Function));

      // Simulate an upgrade event
      const upgradeHandler = (server.on as jest.Mock).mock.calls[0]![1] as (
        req: IncomingMessage,
        socket: Socket,
        head: Buffer
      ) => void;

      const req = mockReq({ url: '/proxy/deepgram/v1/listen?model=nova-3' });
      const socket = {} as Socket;
      const head = Buffer.alloc(0);

      upgradeHandler(req, socket, head);
      await Promise.resolve();

      expect(mockedProxyWs).toHaveBeenCalledWith(
        req,
        socket,
        head,
        'wss://api.deepgram.com/v1/listen?model=nova-3',
        expect.objectContaining({ Authorization: 'Token dg-key' })
      );
    });

    it('ignores upgrade requests for non-matching routes', () => {
      const { attachWebSocket } = createExpressProxy(config);
      const server = { on: jest.fn() } as unknown as Server;

      attachWebSocket(server);

      const upgradeHandler = (server.on as jest.Mock).mock.calls[0]![1] as (
        req: IncomingMessage,
        socket: Socket,
        head: Buffer
      ) => void;

      const req = mockReq({ url: '/other/path' });
      const socket = {} as Socket;
      const head = Buffer.alloc(0);

      upgradeHandler(req, socket, head);

      expect(mockedProxyWs).not.toHaveBeenCalled();
    });

    it('ignores upgrade requests for HTTP-only providers', () => {
      const { attachWebSocket } = createExpressProxy(config);
      const server = { on: jest.fn() } as unknown as Server;

      attachWebSocket(server);

      const upgradeHandler = (server.on as jest.Mock).mock.calls[0]![1] as (
        req: IncomingMessage,
        socket: Socket,
        head: Buffer
      ) => void;

      const req = mockReq({ url: '/proxy/anthropic/v1/messages' });
      const socket = {} as Socket;
      const head = Buffer.alloc(0);

      upgradeHandler(req, socket, head);

      expect(mockedProxyWs).not.toHaveBeenCalled();
    });

    it('destroys socket on proxyWebSocket error', async () => {
      const error = new Error('ws failed');
      mockedProxyWs.mockRejectedValueOnce(error);

      const { attachWebSocket } = createExpressProxy(config);
      const server = { on: jest.fn() } as unknown as Server;

      attachWebSocket(server);

      const upgradeHandler = (server.on as jest.Mock).mock.calls[0]![1] as (
        req: IncomingMessage,
        socket: Socket,
        head: Buffer
      ) => void;

      const req = mockReq({ url: '/proxy/deepgram/v1/listen' });
      const socket = { destroy: jest.fn() } as unknown as Socket;
      const head = Buffer.alloc(0);

      upgradeHandler(req, socket, head);

      await new Promise((r) => setTimeout(r, 10));

      expect(socket.destroy).toHaveBeenCalledWith(error);
    });
  });
});
