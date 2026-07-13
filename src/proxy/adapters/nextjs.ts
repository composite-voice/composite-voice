/**
 * @packageDocumentation
 * Next.js App Router route handler adapter for the CompositeVoice proxy.
 *
 * @remarks
 * Returns a catch-all route handler for `app/api/proxy/[...path]/route.ts`.
 * HTTP-based providers (Anthropic, OpenAI, Groq, Mistral, Gemini) work out of the box
 * with the standard Vercel runtime and any Next.js deployment.
 *
 * WebSocket proxying (Deepgram STT/TTS, ElevenLabs, AssemblyAI, Cartesia) requires
 * a custom Next.js server because the standard Vercel runtime does not support
 * WebSocket upgrades. When running `next dev` or a self-hosted Node.js deployment
 * you can use {@link createNodeProxy} with `attachWebSocket` on the underlying
 * server instead.
 *
 * This module is server-side only and must never be imported by browser bundles.
 * Compatible with Next.js 13+ App Router (including Next.js 15+ with async params).
 *
 * @example
 * ```typescript
 * // app/api/proxy/[...path]/route.ts
 * import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';
 *
 * const { GET, POST, PUT, DELETE, PATCH, OPTIONS } = createNextJsProxy({
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 *   pathPrefix: '/api/proxy',
 *   cors: { origins: ['http://localhost:3000'] },
 * });
 *
 * export { GET, POST, PUT, DELETE, PATCH, OPTIONS };
 * ```
 *
 * @see {@link createExpressProxy} for Express/Connect usage
 * @see {@link createNodeProxy} for plain Node.js HTTP server usage
 */

import { buildRoutes, matchHttpRouteByProvider } from '../utils/routing';
import type { CompositeVoiceProxyConfig } from '../types';
import { signAwsRequestHeaders } from '../../utils/aws/sigv4';
import { createRateLimiter } from '../utils/rateLimit';
import type { RateLimiter } from '../utils/rateLimit';

/**
 * Minimal Next.js Request type -- avoids a hard dependency on `next`.
 *
 * @remarks
 * Duck-typed to match the subset of `NextRequest` used by the proxy handler.
 */
type NextRequest = {
  method: string;
  url: string;
  headers: { get(name: string): string | null; forEach(cb: (v: string, k: string) => void): void };
  body: ReadableStream<Uint8Array> | null;
};

/**
 * Route context provided by Next.js App Router catch-all routes.
 *
 * @remarks
 * Supports both Next.js 13/14 (plain object) and Next.js 15+ (async params).
 */
type RouteContext = { params: Promise<{ path?: string[] }> | { path?: string[] } };

/**
 * A Next.js App Router route handler function signature.
 */
type RouteHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response>;

/**
 * Buffer a request body stream into a single byte array.
 *
 * @remarks
 * Used for AWS SigV4 routes, where the signature must cover the exact body
 * bytes and the body therefore cannot be streamed through.
 *
 * @internal
 */
async function readStreamToBytes(
  stream: ReadableStream<Uint8Array> | null
): Promise<Uint8Array<ArrayBuffer>> {
  if (!stream) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/**
 * Create Next.js App Router route handlers that proxy requests to upstream
 * AI providers.
 *
 * @remarks
 * Returns an object with HTTP method handlers (`GET`, `POST`, `PUT`, `DELETE`,
 * `PATCH`, `OPTIONS`) that can be directly exported from a Next.js catch-all
 * route file. The handler extracts the provider name from the URL path,
 * matches it against configured routes, and forwards the request upstream
 * with the appropriate authentication headers.
 *
 * @param config - Proxy configuration containing API keys, path prefix, and CORS settings.
 * @returns An object with route handlers for each HTTP method.
 *
 * @throws Returns a 404 JSON response with `{ error: 'unknown_provider' }` when
 * the requested provider is not configured.
 *
 * @example
 * ```typescript
 * // app/api/proxy/[...path]/route.ts
 * import { createNextJsProxy } from '@lukeocodes/composite-voice/proxy';
 *
 * const { GET, POST, PUT, DELETE, PATCH, OPTIONS } = createNextJsProxy({
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 *   pathPrefix: '/api/proxy',
 * });
 *
 * export { GET, POST, PUT, DELETE, PATCH, OPTIONS };
 * ```
 *
 * @see {@link CompositeVoiceProxyConfig} for configuration options
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
  const security = config.security;

  // Initialise rate limiter if configured
  let rateLimiter: RateLimiter | undefined;
  if (security?.rateLimit) {
    rateLimiter = createRateLimiter(security.rateLimit);
  }

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

    // --- Security checks ---

    // Rate limiting (use X-Forwarded-For or fall back to header-derived IP)
    if (rateLimiter) {
      const forwarded = req.headers.get('x-forwarded-for');
      const ip = forwarded ? forwarded.split(',')[0]?.trim() || 'unknown' : 'unknown';
      if (!rateLimiter.check(ip)) {
        return new Response(
          JSON.stringify({ error: 'rate_limit_exceeded', message: 'Too many requests' }),
          { status: 429, headers: { 'content-type': 'application/json' } }
        );
      }
    }

    // Authentication
    if (security?.authenticate) {
      const headerRecord: Record<string, string | string[] | undefined> = {};
      req.headers.forEach((value, key) => {
        headerRecord[key] = value;
      });
      const allowed = await security.authenticate({ headers: headerRecord, url: req.url });
      if (!allowed) {
        return new Response(
          JSON.stringify({ error: 'unauthorized', message: 'Authentication failed' }),
          { status: 401, headers: { 'content-type': 'application/json' } }
        );
      }
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

    // Body size check via Content-Length header
    if (security?.maxBodySize !== undefined) {
      const contentLength = parseInt(req.headers.get('content-length') ?? '', 10);
      if (!isNaN(contentLength) && contentLength > security.maxBodySize) {
        return new Response(
          JSON.stringify({
            error: 'payload_too_large',
            message: 'Request body exceeds maximum allowed size',
          }),
          { status: 413, headers: { 'content-type': 'application/json' } }
        );
      }
    }

    // Carry the query string (e.g. MiniMax's `GroupId`) to the upstream URL —
    // catch-all path segments do not include it.
    const search = new URL(req.url).search;
    const targetUrl = `${route.targetBase}${apiPath}${search}`;

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

    // AWS routes (SigV4): the signature covers the exact body bytes, so the
    // body must be buffered before signing instead of streamed through.
    let body: BodyInit | null = req.body;
    if (route.awsSigV4) {
      const buffered = await readStreamToBytes(req.body);
      body = buffered.length > 0 ? buffered : null;
      const { service, region, credentials } = route.awsSigV4;
      const signed = await signAwsRequestHeaders({
        method: req.method,
        url: targetUrl,
        service,
        region,
        credentials,
        ...(buffered.length > 0 ? { body: buffered } : {}),
      });
      Object.assign(forwardHeaders, signed);
    }

    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
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
