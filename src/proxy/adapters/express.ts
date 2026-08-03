/**
 * @packageDocumentation
 * Express / Connect middleware adapter for the CompositeVoice proxy.
 *
 * @remarks
 * Returns middleware compatible with Express 4/5 and any Connect-style
 * framework (e.g., Polka, Restify). The middleware intercepts HTTP requests
 * matching the configured path prefix and forwards them to upstream AI providers.
 * WebSocket proxying (required for Deepgram STT/TTS, ElevenLabs, AssemblyAI, Cartesia)
 * requires attaching an upgrade handler to the underlying `http.Server` via
 * {@link ExpressProxyHandlers.attachWebSocket}.
 *
 * This module is server-side only and must never be imported by browser bundles.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createExpressProxy } from 'composite-voice/proxy';
 *
 * const app = express();
 * const proxy = createExpressProxy({
 *   deepgramApiKey: process.env.DEEPGRAM_API_KEY,
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   pathPrefix: '/api/proxy',
 *   cors: { origins: ['http://localhost:5173'] },
 * });
 *
 * app.use(proxy.middleware);
 * // ...other routes...
 *
 * const server = app.listen(3000, () => proxy.attachWebSocket(server));
 * ```
 *
 * @see {@link createNextJsProxy} for Next.js App Router usage
 * @see {@link createNodeProxy} for plain Node.js HTTP server usage
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
 * Duck-typed Express/Connect "next" callback.
 *
 * @remarks
 * Avoids a hard dependency on `@types/express` by duck-typing the callback
 * signature that Express, Connect, and similar frameworks use.
 */
type NextFn = (err?: unknown) => void;

/**
 * Duck-typed Express/Connect middleware function signature.
 *
 * @remarks
 * Compatible with any Connect-style framework without importing Express types directly.
 */
type MiddlewareFn = (req: IncomingMessage, res: ServerResponse, next: NextFn) => void;

/**
 * Handlers returned by {@link createExpressProxy}.
 *
 * @remarks
 * Provides both an HTTP middleware and a WebSocket upgrade attachment method.
 * The middleware handles REST/SSE proxying, while `attachWebSocket` enables
 * bidirectional WebSocket relay for streaming providers like Deepgram, ElevenLabs,
 * AssemblyAI, and Cartesia.
 */
export interface ExpressProxyHandlers {
  /**
   * Express / Connect middleware -- pass to `app.use(proxy.middleware)`.
   *
   * @remarks
   * Intercepts requests matching the configured `pathPrefix` and forwards them
   * to the appropriate upstream provider. Non-matching requests are passed to `next()`.
   */
  middleware: MiddlewareFn;

  /**
   * Attach WebSocket upgrade handling to the HTTP server.
   *
   * @remarks
   * Must be called after the server starts listening. Listens for the `'upgrade'`
   * event on the server and proxies WebSocket connections to the appropriate
   * upstream provider based on the URL path.
   *
   * @param server - The HTTP server returned by `app.listen(...)`.
   */
  attachWebSocket(server: Server): void;
}

/**
 * Create an Express-compatible proxy middleware and WebSocket attachment helper.
 *
 * @remarks
 * Builds route configuration from the provided API keys, then returns a middleware
 * function and a WebSocket upgrade handler. Only providers with configured API keys
 * will have routes registered.
 *
 * @param config - Proxy configuration containing API keys, path prefix, and CORS settings.
 * @returns An {@link ExpressProxyHandlers} object with `middleware` and `attachWebSocket`.
 *
 * @example
 * ```typescript
 * import express from 'express';
 * import { createExpressProxy } from 'composite-voice/proxy';
 *
 * const app = express();
 * const proxy = createExpressProxy({
 *   deepgramApiKey: process.env.DEEPGRAM_API_KEY,
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   pathPrefix: '/api/proxy',
 * });
 *
 * app.use(proxy.middleware);
 * const server = app.listen(3000, () => proxy.attachWebSocket(server));
 * ```
 *
 * @see {@link CompositeVoiceProxyConfig} for configuration options
 */
export function createExpressProxy(config: CompositeVoiceProxyConfig): ExpressProxyHandlers {
  const routes = buildRoutes(config);
  const prefix = config.pathPrefix ?? '/proxy';
  const security = config.security;

  // Initialise rate limiter if configured
  let rateLimiter: RateLimiter | undefined;
  if (security?.rateLimit) {
    rateLimiter = createRateLimiter(security.rateLimit);
  }

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

    // --- Security checks ---
    const runSecurityChecks = async (): Promise<boolean> => {
      // Rate limiting
      if (rateLimiter) {
        const ip = getClientIp(req);
        if (!rateLimiter.check(ip)) {
          res.statusCode = 429;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'rate_limit_exceeded', message: 'Too many requests' }));
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
          res.statusCode = 401;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: 'unauthorized', message: 'Authentication failed' }));
          return false;
        }
      }

      return true;
    };

    runSecurityChecks()
      .then((allowed) => {
        if (!allowed) return;

        const targetPath = url.slice(prefix.length + 1 + route.provider.length);
        const targetUrl = `${route.targetBase}${targetPath}`;

        return forwardHttpRequest(req, res, targetUrl, route.authHeaders, {
          ...(security?.maxBodySize !== undefined && { maxBodySize: security.maxBodySize }),
          ...(route.awsSigV4 && { awsSigV4: route.awsSigV4 }),
        });
      })
      .catch((err: unknown) => next(err));
  };

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

          return proxyWebSocket(req, socket, head, targetUrl, route.authHeaders, {
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

  return { middleware, attachWebSocket };
}
