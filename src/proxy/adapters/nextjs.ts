/**
 * Next.js App Router route handler adapter.
 *
 * Returns a catch-all route handler for `app/api/proxy/[...path]/route.ts`.
 * HTTP-based providers (Anthropic, OpenAI) work out of the box.
 *
 * WebSocket proxying (Deepgram STT/TTS) requires a custom Next.js server
 * because the standard Vercel runtime does not support WebSocket upgrades.
 * When running `next dev` or a self-hosted Node.js deployment you can use
 * `createNodeProxy` with `attachWebSocket` on the underlying server instead.
 *
 * Server-side only — never imported by browser bundles.
 *
 * @example
 * ```ts
 * // app/api/proxy/[...path]/route.ts
 * import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';
 *
 * const { GET, POST, PUT, DELETE, OPTIONS } = createNextJsProxy({
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 *   pathPrefix: '/api/proxy',
 * });
 *
 * export { GET, POST, PUT, DELETE, OPTIONS };
 * ```
 */

import { buildRoutes, matchHttpRouteByProvider } from '../utils/routing';
import type { CompositeVoiceProxyConfig } from '../types';

// Minimal types for Next.js App Router — avoids a hard dependency on `next`.
type NextRequest = {
  method: string;
  url: string;
  headers: { get(name: string): string | null; forEach(cb: (v: string, k: string) => void): void };
  body: ReadableStream<Uint8Array> | null;
};
type RouteContext = { params: Promise<{ path?: string[] }> | { path?: string[] } };
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response>;

/**
 * Create Next.js App Router route handlers that proxy requests to upstream
 * providers.
 */
export function createNextJsProxy(config: CompositeVoiceProxyConfig): {
  GET: RouteHandler;
  POST: RouteHandler;
  PUT: RouteHandler;
  DELETE: RouteHandler;
  PATCH: RouteHandler;
  OPTIONS: RouteHandler;
} {
  const routes = buildRoutes(config);
  const prefix = config.pathPrefix ?? '/proxy';

  async function handle(req: NextRequest, ctx: RouteContext): Promise<Response> {
    // Resolve params whether they're a promise (Next.js 15+) or plain object
    const params = ctx.params instanceof Promise ? await ctx.params : ctx.params;
    const pathSegments = params.path ?? [];
    const url = `${prefix}/${pathSegments.join('/')}`;

    const corsOrigins = config.cors?.origins ?? [];

    if (req.method === 'OPTIONS') {
      const headers: Record<string, string> = {};
      if (corsOrigins.length) {
        const origin = corsOrigins.includes('*') ? '*' : corsOrigins.join(', ');
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, PATCH, OPTIONS';
        headers['Access-Control-Allow-Headers'] =
          'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta';
      }
      return new Response(null, { status: 204, headers });
    }

    // Match provider from first path segment after prefix
    const afterPrefix = url.slice(prefix.length + 1); // e.g. 'anthropic/v1/messages'
    const slashIdx = afterPrefix.indexOf('/');
    const provider = slashIdx === -1 ? afterPrefix : afterPrefix.slice(0, slashIdx);
    const apiPath = slashIdx === -1 ? '' : afterPrefix.slice(slashIdx); // e.g. '/v1/messages'

    const route = matchHttpRouteByProvider(routes, provider);
    if (!route) {
      return new Response(JSON.stringify({ error: 'unknown_provider' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    const targetUrl = `${route.targetBase}${apiPath}`;

    // Build headers
    const forwardHeaders: Record<string, string> = { ...route.authHeaders };
    req.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (
        lower === 'host' ||
        lower === 'origin' ||
        lower === 'authorization' ||
        lower === 'x-api-key' ||
        lower === 'connection' ||
        lower === 'transfer-encoding'
      )
        return;
      forwardHeaders[key] = value;
    });

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body: req.body,
      // @ts-expect-error — required for streaming bodies in Node.js 18+
      duplex: 'half',
    });

    const responseHeaders: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === 'connection' || lower === 'transfer-encoding' || lower === 'te') return;
      responseHeaders[key] = value;
    });

    if (corsOrigins.length) {
      const origin = corsOrigins.includes('*') ? '*' : corsOrigins.join(', ');
      responseHeaders['Access-Control-Allow-Origin'] = origin;
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  }

  return {
    GET: handle,
    POST: handle,
    PUT: handle,
    DELETE: handle,
    PATCH: handle,
    OPTIONS: handle,
  };
}
