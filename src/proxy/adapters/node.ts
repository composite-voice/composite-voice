/**
 * Generic Node.js HTTP server adapter.
 *
 * Works with any framework that exposes the raw Node.js `http.Server`,
 * including Express, Fastify (raw mode), Koa, and plain `http.createServer`.
 *
 * Server-side only — never imported by browser bundles.
 *
 * @example
 * ```ts
 * import http from 'http';
 * import { createNodeProxy } from '@lukeocodes/composite-voice/proxy';
 *
 * const proxy = createNodeProxy({ deepgramApiKey: '...', anthropicApiKey: '...' });
 * const server = http.createServer(proxy.handleRequest);
 * proxy.attachWebSocket(server);
 * server.listen(3000);
 * ```
 */

import type { IncomingMessage, ServerResponse, Server } from 'http';
import type { Socket } from 'net';
import { forwardHttpRequest } from '../core/http';
import { proxyWebSocket } from '../core/ws';
import type { CompositeVoiceProxyConfig } from '../types';
import { buildRoutes, matchHttpRoute, matchWsRoute, setCorsHeaders } from '../utils/routing';

export interface NodeProxyHandlers {
  /**
   * Node.js-compatible request handler.  Pass directly to `http.createServer`
   * or use as Express/Koa/Fastify middleware.
   */
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;

  /**
   * Attach WebSocket upgrade handling to an existing HTTP server.
   * Call this after `server.listen(...)`.
   */
  attachWebSocket(server: Server): void;
}

/**
 * Create a Node.js proxy handler pair for the given config.
 */
export function createNodeProxy(config: CompositeVoiceProxyConfig): NodeProxyHandlers {
  const routes = buildRoutes(config);
  const prefix = config.pathPrefix ?? '/proxy';

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = req.url ?? '/';

    // CORS pre-flight
    if (config.cors?.origins?.length) {
      setCorsHeaders(res, config.cors.origins, req.headers['origin'] as string | undefined);
    }
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const route = matchHttpRoute(routes, url, prefix);
    if (!route) return; // not a proxy path — caller handles it

    const targetPath = url.slice(prefix.length + 1 + route.provider.length); // strip /prefix/provider
    const targetUrl = `${route.targetBase}${targetPath}`;

    await forwardHttpRequest(req, res, targetUrl, route.authHeaders);
  }

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

  return { handleRequest, attachWebSocket };
}
