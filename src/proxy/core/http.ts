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
import { signAwsRequestHeaders } from '../../utils/aws/sigv4';
import type { AwsSigV4RouteConfig } from '../utils/routing';

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
  // Node.js fetch (undici) auto-decompresses gzip/br/deflate responses but
  // the original Content-Encoding header remains in response.headers. If we
  // forward it, the browser will attempt to decompress already-decompressed
  // data, causing ERR_CONTENT_DECODING_FAILED.
  'content-encoding',
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
 * @param maxBodySize - Optional maximum body size in bytes. If the body exceeds
 *   this limit the promise rejects with a `BodyTooLargeError`.
 * @returns A promise that resolves to a Buffer containing the complete request body.
 *
 * @throws {BodyTooLargeError} If `maxBodySize` is set and the body exceeds it.
 * @throws Rejects if the request stream emits an error.
 */
async function readBody(req: IncomingMessage, maxBodySize?: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (maxBodySize !== undefined && totalBytes > maxBodySize) {
        req.destroy();
        reject(new BodyTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * Sentinel error thrown when a request body exceeds the configured maximum size.
 * @internal
 */
export class BodyTooLargeError extends Error {
  constructor() {
    super('Request body exceeds maximum allowed size');
    this.name = 'BodyTooLargeError';
  }
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
 * @param options - Optional settings for body size limiting and AWS signing.
 * @param options.maxBodySize - Maximum request body size in bytes.
 *   Requests exceeding this are rejected with 413 Payload Too Large.
 * @param options.awsSigV4 - When set (AWS routes such as Amazon Polly), the
 *   outgoing upstream request is SigV4-signed with these credentials —
 *   the signature covers the upstream host, path, query, and body, so it
 *   must be computed here rather than injected as a static header.
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
  authHeaders: Record<string, string>,
  options?: { maxBodySize?: number; awsSigV4?: AwsSigV4RouteConfig }
): Promise<void> {
  // Early rejection via Content-Length header before reading the body
  if (options?.maxBodySize !== undefined) {
    const contentLength = parseInt(req.headers['content-length'] ?? '', 10);
    if (!isNaN(contentLength) && contentLength > options.maxBodySize) {
      res.statusCode = 413;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          error: 'payload_too_large',
          message: 'Request body exceeds maximum allowed size',
        })
      );
      return;
    }
  }

  let body: Buffer;
  try {
    body = await readBody(req, options?.maxBodySize);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      if (!res.headersSent) {
        res.statusCode = 413;
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            error: 'payload_too_large',
            message: 'Request body exceeds maximum allowed size',
          })
        );
      }
      return;
    }
    throw err;
  }

  const headers: Record<string, string> = {
    ...collectRequestHeaders(req),
    ...authHeaders,
  };

  // Ensure content-type is present for bodies
  if (body.length > 0 && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  // AWS routes: SigV4-sign the outgoing upstream request. The signature
  // covers the upstream host, path, query, and exact body bytes.
  if (options?.awsSigV4) {
    const { service, region, credentials } = options.awsSigV4;
    try {
      const signed = await signAwsRequestHeaders({
        method: req.method ?? 'GET',
        url: targetUrl,
        service,
        region,
        credentials,
        body: new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
      });
      Object.assign(headers, signed);
    } catch (err) {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ error: 'proxy_signing_error', message: String(err) }));
      }
      return;
    }
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
