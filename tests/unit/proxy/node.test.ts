import { createNodeProxy } from '../../../src/proxy/adapters/node';
import type { CompositeVoiceProxyConfig } from '../../../src/proxy/types';
import type { IncomingMessage, ServerResponse, Server } from 'http';
import type { Socket } from 'net';

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

describe('createNodeProxy', () => {
  const config: CompositeVoiceProxyConfig = {
    anthropicApiKey: 'ant-key',
    openaiApiKey: 'oai-key',
    deepgramApiKey: 'dg-key',
    pathPrefix: '/api/proxy',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleRequest', () => {
    it('forwards matching HTTP requests to the upstream provider', async () => {
      const { handleRequest } = createNodeProxy(config);
      const req = mockReq({ url: '/api/proxy/anthropic/v1/messages', method: 'POST' });
      const res = mockRes();

      await handleRequest(req, res);

      expect(mockedForwardHttp).toHaveBeenCalledWith(
        req,
        res,
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          'x-api-key': 'ant-key',
          'anthropic-version': '2023-06-01',
        })
      );
    });

    it('forwards OpenAI requests with Bearer auth', async () => {
      const { handleRequest } = createNodeProxy(config);
      const req = mockReq({ url: '/api/proxy/openai/v1/chat/completions', method: 'POST' });
      const res = mockRes();

      await handleRequest(req, res);

      expect(mockedForwardHttp).toHaveBeenCalledWith(
        req,
        res,
        'https://api.openai.com/v1/chat/completions',
        expect.objectContaining({ Authorization: 'Bearer oai-key' })
      );
    });

    it('returns silently for non-matching routes', async () => {
      const { handleRequest } = createNodeProxy(config);
      const req = mockReq({ url: '/other/endpoint', method: 'GET' });
      const res = mockRes();

      await handleRequest(req, res);

      expect(mockedForwardHttp).not.toHaveBeenCalled();
      expect(res.end).not.toHaveBeenCalled();
    });

    it('responds to OPTIONS with 204 when CORS is configured', async () => {
      const corsConfig: CompositeVoiceProxyConfig = {
        ...config,
        cors: { origins: ['*'] },
      };
      const { handleRequest } = createNodeProxy(corsConfig);
      const req = mockReq({ url: '/api/proxy/anthropic/v1/messages', method: 'OPTIONS' });
      const res = mockRes();

      await handleRequest(req, res);

      expect(res._statusCode).toBe(204);
      expect(res.end).toHaveBeenCalled();
      expect(mockedForwardHttp).not.toHaveBeenCalled();
    });

    it('sets CORS headers with wildcard origin', async () => {
      const corsConfig: CompositeVoiceProxyConfig = {
        ...config,
        cors: { origins: ['*'] },
      };
      const { handleRequest } = createNodeProxy(corsConfig);
      const req = mockReq({ url: '/api/proxy/anthropic/v1/messages', method: 'POST' });
      const res = mockRes();

      await handleRequest(req, res);

      expect(res._headers['access-control-allow-origin']).toBe('*');
    });

    it('does not match WebSocket providers for HTTP requests', async () => {
      const { handleRequest } = createNodeProxy(config);
      const req = mockReq({ url: '/api/proxy/deepgram/v1/listen', method: 'GET' });
      const res = mockRes();

      await handleRequest(req, res);

      expect(mockedForwardHttp).not.toHaveBeenCalled();
    });

    it('uses default /proxy prefix when not specified', async () => {
      const noPrefix: CompositeVoiceProxyConfig = { anthropicApiKey: 'key' };
      const { handleRequest } = createNodeProxy(noPrefix);
      const req = mockReq({ url: '/proxy/anthropic/v1/messages', method: 'POST' });
      const res = mockRes();

      await handleRequest(req, res);

      expect(mockedForwardHttp).toHaveBeenCalledWith(
        req,
        res,
        'https://api.anthropic.com/v1/messages',
        expect.any(Object)
      );
    });

    it('strips prefix and provider from target path correctly', async () => {
      const { handleRequest } = createNodeProxy(config);
      const req = mockReq({ url: '/api/proxy/openai/v1/audio/speech', method: 'POST' });
      const res = mockRes();

      await handleRequest(req, res);

      expect(mockedForwardHttp).toHaveBeenCalledWith(
        req,
        res,
        'https://api.openai.com/v1/audio/speech',
        expect.any(Object)
      );
    });
  });

  describe('attachWebSocket', () => {
    it('proxies upgrade requests for WebSocket providers', async () => {
      const { attachWebSocket } = createNodeProxy(config);
      const server = { on: jest.fn() } as unknown as Server;

      attachWebSocket(server);

      expect(server.on).toHaveBeenCalledWith('upgrade', expect.any(Function));

      const upgradeHandler = (server.on as jest.Mock).mock.calls[0]![1] as (
        req: IncomingMessage,
        socket: Socket,
        head: Buffer
      ) => void;

      const req = mockReq({ url: '/api/proxy/deepgram/v1/listen' });
      const socket = {} as Socket;
      const head = Buffer.alloc(0);

      upgradeHandler(req, socket, head);
      await Promise.resolve();

      expect(mockedProxyWs).toHaveBeenCalledWith(
        req,
        socket,
        head,
        'wss://api.deepgram.com/v1/listen',
        expect.objectContaining({ Authorization: 'Token dg-key' })
      );
    });

    it('ignores upgrade requests for non-matching routes', () => {
      const { attachWebSocket } = createNodeProxy(config);
      const server = { on: jest.fn() } as unknown as Server;

      attachWebSocket(server);

      const upgradeHandler = (server.on as jest.Mock).mock.calls[0]![1] as (
        req: IncomingMessage,
        socket: Socket,
        head: Buffer
      ) => void;

      upgradeHandler(mockReq({ url: '/other' }), {} as Socket, Buffer.alloc(0));

      expect(mockedProxyWs).not.toHaveBeenCalled();
    });

    it('destroys socket on proxyWebSocket error', async () => {
      const error = new Error('ws failed');
      mockedProxyWs.mockRejectedValueOnce(error);

      const { attachWebSocket } = createNodeProxy(config);
      const server = { on: jest.fn() } as unknown as Server;

      attachWebSocket(server);

      const upgradeHandler = (server.on as jest.Mock).mock.calls[0]![1] as (
        req: IncomingMessage,
        socket: Socket,
        head: Buffer
      ) => void;

      const socket = { destroy: jest.fn() } as unknown as Socket;
      upgradeHandler(mockReq({ url: '/api/proxy/deepgram/v1/listen' }), socket, Buffer.alloc(0));

      await new Promise((r) => setTimeout(r, 10));

      expect(socket.destroy).toHaveBeenCalledWith(error);
    });
  });
});
