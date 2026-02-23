/**
 * HTTP forwarding core.
 * Uses Node.js built-in `fetch` (Node 18+) to proxy HTTP/SSE requests to
 * upstream providers while streaming the response back to the caller.
 *
 * Server-side only — never imported by browser bundles.
 */

import type { IncomingMessage, ServerResponse } from 'http';

/** Headers that must not be forwarded upstream (hop-by-hop / connection-specific) */
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

/** Headers we do not forward from the upstream response */
const SKIP_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'upgrade',
]);

function collectRequestHeaders(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (SKIP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    if (value === undefined) continue;
    out[key] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Forward an HTTP request to `targetUrl`, injecting `authHeaders`, and stream
 * the response (including SSE / chunked) back to `res`.
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
