/**
 * Express / Connect middleware adapter.
 *
 * Returns middleware compatible with Express 4/5 and any Connect-style
 * framework.  WebSocket proxying requires attaching an upgrade handler to
 * the underlying `http.Server`.
 *
 * Server-side only — never imported by browser bundles.
 *
 * @example
 * ```ts
 * import express from 'express';
 * import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';
 *
 * const app = express();
 * const proxy = createExpressProxy({
 *   deepgramApiKey: process.env.DEEPGRAM_API_KEY,
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   pathPrefix: '/api/proxy',
 * });
 *
 * app.use(proxy.middleware);
 * // ...other routes...
 *
 * const server = app.listen(3000, () => proxy.attachWebSocket(server));
 * ```
 */

import type { IncomingMessage, ServerResponse, Server } from 'http';
import type { Socket } from 'net';
import { forwardHttpRequest } from '../core/http';
import { proxyWebSocket } from '../core/ws';
import type { CompositeVoiceProxyConfig } from '../types';
import { buildRoutes, matchHttpRoute, matchWsRoute, setCorsHeaders } from '../utils/routing';

// Duck-typed to be compatible with Express without importing its types.
type NextFn = (err?: unknown) => void;
type MiddlewareFn = (req: IncomingMessage, res: ServerResponse, next: NextFn) => void;

export interface ExpressProxyHandlers {
  /** Express / Connect middleware — pass to `app.use(proxy.middleware)`. */
  middleware: MiddlewareFn;

  /**
   * Attach WebSocket upgrade handling to the HTTP server.
   * Pass the server returned by `app.listen(...)`.
   */
  attachWebSocket(server: Server): void;
}

/**
 * Create an Express-compatible proxy middleware and WebSocket attachment helper.
 */
export function createExpressProxy(config: CompositeVoiceProxyConfig): ExpressProxyHandlers {
  const routes = buildRoutes(config);
  const prefix = config.pathPrefix ?? '/proxy';

  const middleware: MiddlewareFn = (req, res, next) => {
    const url = req.url ?? '/';

    if (config.cors?.origins?.length) {
      setCorsHeaders(res, config.cors.origins, req.headers['origin'] as string | undefined);
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const route = matchHttpRoute(routes, url, prefix);
    if (!route) {
      next();
      return;
    }

    const targetPath = url.slice(prefix.length + 1 + route.provider.length);
    const targetUrl = `${route.targetBase}${targetPath}`;

    forwardHttpRequest(req, res, targetUrl, route.authHeaders).catch((err: unknown) => next(err));
  };

  function attachWebSocket(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = req.url ?? '/';
      const route = matchWsRoute(routes, url, prefix);
      if (!route) return;

      const targetPath = url.slice(prefix.length + 1 + route.provider.length);
      const targetUrl = `${route.targetBase}${targetPath}`;

      proxyWebSocket(req, socket, head, targetUrl, route.authHeaders).catch((err: Error) => {
        socket.destroy(err);
      });
    });
  }

  return { middleware, attachWebSocket };
}
