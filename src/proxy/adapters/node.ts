/**
 * @packageDocumentation
 * Generic Node.js HTTP server adapter for the CompositeVoice proxy.
 *
 * @remarks
 * Works with any framework that exposes the raw Node.js `http.Server`,
 * including Express, Fastify (raw mode), Koa, Hapi, and plain `http.createServer`.
 * This is the most flexible adapter and can be used when the Express or Next.js
 * adapters are not suitable.
 *
 * Provides both an HTTP request handler for REST/SSE proxying and a WebSocket
 * upgrade attachment method for streaming providers (Deepgram, ElevenLabs,
 * AssemblyAI, Cartesia).
 *
 * This module is server-side only and must never be imported by browser bundles.
 *
 * @example
 * ```typescript
 * import http from 'http';
 * import { createNodeProxy } from 'composite-voice/proxy';
 *
 * const proxy = createNodeProxy({
 *   deepgramApiKey: process.env.DEEPGRAM_API_KEY,
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   pathPrefix: '/api/proxy',
 *   cors: { origins: ['http://localhost:5173'] },
 * });
 *
 * const server = http.createServer(proxy.handleRequest);
 * proxy.attachWebSocket(server);
 * server.listen(3000);
 * ```
 *
 * @see {@link createExpressProxy} for Express/Connect usage
 * @see {@link createNextJsProxy} for Next.js App Router usage
 */

import type { IncomingMessage, ServerResponse, Server } from 'http';
import type { Socket } from 'net';
import { forwardHttpRequest } from '../core/http';
import { proxyWebSocket } from '../core/ws';
import type { CompositeVoiceProxyConfig } from '../types';
import { buildRoutes, matchHttpRoute, matchWsRoute, setCorsHeaders } from '../utils/routing';
import { createRateLimiter, getClientIp } from '../utils/rateLimit';
import type { RateLimiter } from '../utils/rateLimit';

/**
 * Handlers returned by {@link createNodeProxy}.
 *
 * @remarks
 * Provides both an HTTP request handler and a WebSocket upgrade attachment method.
 * The request handler can be passed directly to `http.createServer()` or used
 * as a raw handler in any Node.js framework. The WebSocket attachment enables
 * bidirectional relay for streaming providers.
 */
export interface NodeProxyHandlers {
  /**
   * Node.js-compatible request handler.
   *
   * @remarks
   * Pass directly to `http.createServer` or use as a raw handler in
   * Express/Koa/Fastify. Returns silently for URLs that do not match
   * the configured path prefix (the caller is responsible for handling
   * non-proxy requests).
   *
   * @param req - The incoming HTTP request.
   * @param res - The server response to write to.
   * @returns A promise that resolves when the proxied response has been fully streamed.
   */
  handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void>;

  /**
   * Attach WebSocket upgrade handling to an existing HTTP server.
   *
   * @remarks
   * Listens for the `'upgrade'` event on the server and proxies WebSocket
   * connections to the appropriate upstream provider. Should be called after
   * `server.listen(...)`.
   *
   * @param server - The HTTP server to attach WebSocket upgrade handling to.
   */
  attachWebSocket(server: Server): void;
}

/**
 * Create a Node.js proxy handler pair for the given config.
 *
 * @remarks
 * Builds route configuration from the provided API keys, then returns a request
 * handler and a WebSocket upgrade handler. Only providers with configured API keys
 * will have routes registered.
 *
 * @param config - Proxy configuration containing API keys, path prefix, and CORS settings.
 * @returns A {@link NodeProxyHandlers} object with `handleRequest` and `attachWebSocket`.
 *
 * @example
 * ```typescript
 * import http from 'http';
 * import { createNodeProxy } from 'composite-voice/proxy';
 *
 * const proxy = createNodeProxy({
 *   deepgramApiKey: process.env.DEEPGRAM_API_KEY,
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 * });
 *
 * const server = http.createServer(proxy.handleRequest);
 * proxy.attachWebSocket(server);
 * server.listen(3000);
 * ```
 *
 * @see {@link CompositeVoiceProxyConfig} for configuration options
 */
export function createNodeProxy(config: CompositeVoiceProxyConfig): NodeProxyHandlers {
  const routes = buildRoutes(config);
  const prefix = config.pathPrefix ?? '/proxy';
  const security = config.security;

  // Initialise rate limiter if configured
  let rateLimiter: RateLimiter | undefined;
  if (security?.rateLimit) {
    rateLimiter = createRateLimiter(security.rateLimit);
  }

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

    // --- Security checks ---

    // Rate limiting
    if (rateLimiter) {
      const ip = getClientIp(req);
      if (!rateLimiter.check(ip)) {
        res.statusCode = 429;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'rate_limit_exceeded', message: 'Too many requests' }));
        return;
      }
    }

    // Authentication
    if (security?.authenticate) {
      const allowed = await security.authenticate({
        headers: req.headers as Record<string, string | string[] | undefined>,
        ...(req.url !== undefined && { url: req.url }),
      });
      if (!allowed) {
        res.statusCode = 401;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'unauthorized', message: 'Authentication failed' }));
        return;
      }
    }

    const targetPath = url.slice(prefix.length + 1 + route.provider.length); // strip /prefix/provider
    const targetUrl = `${route.targetBase}${targetPath}`;

    await forwardHttpRequest(req, res, targetUrl, route.authHeaders, {
      ...(security?.maxBodySize !== undefined && { maxBodySize: security.maxBodySize }),
      ...(route.awsSigV4 && { awsSigV4: route.awsSigV4 }),
    });
  }

  function attachWebSocket(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = req.url ?? '/';
      const route = matchWsRoute(routes, url, prefix);
      if (!route) return;

      // --- Security checks for WebSocket upgrades ---
      const runWsSecurityChecks = async (): Promise<boolean> => {
        // Rate limiting
        if (rateLimiter) {
          const ip = getClientIp(req);
          if (!rateLimiter.check(ip)) {
            socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
            socket.destroy();
            return false;
          }
        }

        // Authentication
        if (security?.authenticate) {
          const allowed = await security.authenticate({
            headers: req.headers as Record<string, string | string[] | undefined>,
            ...(req.url !== undefined && { url: req.url }),
          });
          if (!allowed) {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return false;
          }
        }

        return true;
      };

      runWsSecurityChecks()
        .then((allowed) => {
          if (!allowed) return;

          const targetPath = url.slice(prefix.length + 1 + route.provider.length);
          const targetUrl = `${route.targetBase}${targetPath}`;

          // Per-connection headers (e.g. Speko's Idempotency-Key) are
          // generated fresh for every upgrade and merged over authHeaders.
          const upgradeHeaders = route.connectionHeaders
            ? { ...route.authHeaders, ...route.connectionHeaders() }
            : route.authHeaders;

          return proxyWebSocket(req, socket, head, targetUrl, upgradeHeaders, {
            ...(security?.maxWsMessageSize !== undefined && {
              maxWsMessageSize: security.maxWsMessageSize,
            }),
            ...(route.authQuery !== undefined && { authQuery: route.authQuery }),
            ...(route.awsSigV4 && { awsSigV4: route.awsSigV4 }),
          });
        })
        .catch((err: Error) => {
          socket.destroy(err);
        });
    });
  }

  return { handleRequest, attachWebSocket };
}
