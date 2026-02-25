/**
 * @packageDocumentation
 * HTTP forwarding core for the CompositeVoice proxy.
 *
 * @remarks
 * Uses Node.js built-in `fetch` (Node 18+) to proxy HTTP/SSE requests to
 * upstream AI providers while streaming the response back to the caller.
 * Handles hop-by-hop header filtering, authentication header injection,
 * backpressure management, and error responses (502 on upstream failure).
 *
 * This module is the shared HTTP transport layer used by all proxy adapters
 * (Express, Next.js, Node.js). It is server-side only and must never be
 * imported by browser bundles.
 *
 * @see {@link forwardHttpRequest} for the main entry point
 */

import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Headers that must not be forwarded upstream (hop-by-hop / connection-specific).
 *
 * @remarks
 * These headers are either hop-by-hop headers defined by HTTP/1.1 or headers
 * that the proxy replaces with its own values (e.g., `authorization`, `x-api-key`).
 */
const SKIP_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'origin',
  'referer',
  // We inject our own auth headers
  'authorization',
  'x-api-key',
]);

/**
 * Headers that must not be forwarded from the upstream response.
 *
 * @remarks
 * These hop-by-hop and transport-level headers should not be relayed to the client.
 */
const SKIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
]);

/**
 * Collect safe-to-forward headers from the incoming request.
 *
 * @remarks
 * Filters out hop-by-hop headers and headers that the proxy replaces
 * (e.g., `authorization`). Array-valued headers are joined with commas.
 *
 * @param req - The incoming HTTP request.
 * @returns A record of header name to header value suitable for upstream forwarding.
 */
function collectRequestHeaders(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (SKIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

/**
 * Read the full request body from an incoming message into a Buffer.
 *
 * @param req - The incoming HTTP request to consume the body from.
 * @returns A promise that resolves to a Buffer containing the complete request body.
 *
 * @throws Rejects if the request stream emits an error.
 */
async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Forward an HTTP request to an upstream provider URL, injecting authentication
 * headers, and stream the response (including SSE / chunked) back to the client.
 *
 * @remarks
 * This is the core HTTP proxy function used by all adapters. It reads the full
 * request body, merges the caller's headers with the provider's auth headers,
 * forwards the request via `fetch`, and streams the response back chunk by chunk
 * with backpressure handling. If the upstream request fails, a 502 error response
 * is sent to the client.
 *
 * @param req - The incoming HTTP request from the client.
 * @param res - The server response to stream the upstream response to.
 * @param targetUrl - The full upstream URL to forward the request to
 *   (e.g., `https://api.anthropic.com/v1/messages`).
 * @param authHeaders - Authentication headers to inject into the upstream request
 *   (e.g., `{ 'x-api-key': '...' }`).
 * @returns A promise that resolves when the response has been fully streamed.
 *
 * @throws Writes a 502 JSON error response to `res` if the upstream `fetch` fails.
 *
 * @example
 * ```typescript
 * import { forwardHttpRequest } from '@lukeocodes/composite-voice/proxy';
 *
 * await forwardHttpRequest(req, res, 'https://api.anthropic.com/v1/messages', {
 *   'x-api-key': process.env.ANTHROPIC_API_KEY!,
 *   'anthropic-version': '2023-06-01',
 * });
 * ```
 */
export async function forwardHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  targetUrl: string,
  authHeaders: Record<string, string>
): Promise<void> {
  const body = await readBody(req);

  const headers: Record<string, string> = {
    ...collectRequestHeaders(req),
    ...authHeaders,
  };

  // Ensure content-type is present for bodies
  if (body.length > 0 && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  let upstream: Response;
  try {
    upstream = await (
      fetch as (url: string, init: RequestInit & { duplex?: string }) => Promise<Response>
    )(targetUrl, {
      method: req.method ?? 'GET',
      headers,
      body: body.length > 0 ? (body as BodyInit) : null,
      // Required for streaming request bodies in Node.js 18+
      duplex: 'half',
    });
  } catch (err) {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'proxy_upstream_error', message: String(err) }));
    }
    return;
  }

  res.statusCode = upstream.status;
  upstream.headers.forEach((value, key) => {
    if (!SKIP_RESPONSE_HEADERS.has(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const canContinue = res.write(value);
      if (!canContinue) {
        // Backpressure — wait for drain before reading more
        await new Promise<void>((resolve) => res.once('drain', resolve));
      }
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}
