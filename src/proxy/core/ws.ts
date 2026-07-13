/**
 * @packageDocumentation
 * WebSocket proxying core for the CompositeVoice proxy.
 *
 * @remarks
 * Uses the `ws` package (optional peer dependency) to bidirectionally relay
 * WebSocket connections between a browser client and an upstream AI provider.
 * This enables real-time streaming for providers like Deepgram (STT/TTS),
 * ElevenLabs (TTS/STT), AssemblyAI (STT), and Cartesia (TTS).
 *
 * The `ws` module is dynamically imported at runtime so it remains an optional
 * dependency -- applications using only HTTP-based providers (Anthropic, OpenAI,
 * Groq, Mistral, Gemini) do not need to install it.
 *
 * This module is server-side only and must never be imported by browser bundles.
 *
 * @see {@link proxyWebSocket} for the main entry point
 */

import type { IncomingMessage } from 'http';
import type { Socket } from 'net';
import { presignAwsUrl } from '../../utils/aws/sigv4';
import type { AwsSigV4RouteConfig } from '../utils/routing';

/**
 * Type alias for the `ws` module -- used for type-checking only.
 *
 * @remarks
 * The actual module is loaded dynamically via {@link loadWs} so it stays optional.
 */
type WsModule = typeof import('ws');

/** Type alias for a `ws` WebSocket instance. */
type WsWebSocket = import('ws').WebSocket;

/** Type alias for a `ws` WebSocketServer instance. */
type WsWebSocketServer = import('ws').WebSocketServer;

/**
 * Calculate the byte size of a WebSocket message payload.
 *
 * @param data - The message data, which may be a Buffer, ArrayBuffer, or array of Buffers.
 * @returns The total size in bytes.
 * @internal
 */
function getMessageSize(data: Buffer | ArrayBuffer | Buffer[]): number {
  if (Array.isArray(data)) {
    return data.reduce((sum, buf) => sum + buf.length, 0);
  }
  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }
  return data.length;
}

/**
 * Dynamically load the `ws` package.
 *
 * @remarks
 * Uses a dynamic `import('ws')` to avoid a hard dependency. If the package
 * is not installed, throws a descriptive error directing the user to install it.
 *
 * @returns A promise that resolves to the WebSocket and WebSocketServer constructors.
 *
 * @throws {@link Error} if the `ws` package is not installed.
 */
async function loadWs(): Promise<{
  WebSocket: WsModule['WebSocket'];
  WebSocketServer: WsModule['WebSocketServer'];
}> {
  try {
    const ws = await import('ws');
    return { WebSocket: ws.WebSocket, WebSocketServer: ws.WebSocketServer };
  } catch {
    throw new Error(
      'WebSocket proxying requires the "ws" package.\n' +
        'Install it with: pnpm add ws\n' +
        'The "ws" package is an optional peer dependency of @lukeocodes/composite-voice.'
    );
  }
}

/**
 * Proxy a WebSocket upgrade request to an upstream provider, forwarding all
 * messages bidirectionally.
 *
 * @remarks
 * Connects to the upstream provider **first**, then completes the client-side
 * upgrade handshake only after the upstream WebSocket is open. This guarantees
 * the bidirectional relay is fully established before the browser's `onopen`
 * fires, preventing a race condition where early audio frames would be
 * silently dropped because the relay handlers were not yet registered.
 *
 * Query parameters from the original client request are preserved and appended
 * to the upstream URL, so provider options (e.g., Deepgram `model`, `encoding`,
 * `language`) are passed through transparently.
 *
 * @param req - The incoming HTTP upgrade request from the client.
 * @param socket - The raw TCP socket from the server's `'upgrade'` event.
 * @param head - Buffered data received after the upgrade request headers.
 * @param targetUrl - The upstream WebSocket URL to connect to
 *   (e.g., `wss://api.deepgram.com/v1/listen`).
 * @param authHeaders - Authentication headers to inject into the upstream connection
 *   (e.g., `{ Authorization: 'Token ...' }`).
 * @param options - Optional settings for message size limiting, query-based auth, and AWS presigning.
 * @param options.maxWsMessageSize - Maximum WebSocket message size in bytes.
 *   Messages exceeding this close the client connection with code 1009 (Message Too Big).
 * @param options.authQuery - Authentication query parameters to set on the upstream URL
 *   (e.g., `{ access_token: '...' }` for Rev AI). Applied after the client's query
 *   parameters are carried over, so they always override client-supplied values.
 * @param options.awsSigV4 - When set (AWS routes such as Amazon Transcribe
 *   streaming), the upstream URL is SigV4-presigned at connect time with
 *   these credentials — AWS WebSocket endpoints authenticate via `X-Amz-*`
 *   query parameters, not headers, so static header injection cannot work.
 * @returns A promise that resolves once the WebSocket relay is fully established.
 *
 * @throws Destroys the client socket with a 502 response if the upstream
 * connection fails to open.
 *
 * @example
 * ```typescript
 * import { proxyWebSocket } from '@lukeocodes/composite-voice/proxy';
 *
 * server.on('upgrade', (req, socket, head) => {
 *   proxyWebSocket(req, socket, head, 'wss://api.deepgram.com/v1/listen', {
 *     Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
 *   });
 * });
 * ```
 */
export async function proxyWebSocket(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  targetUrl: string,
  authHeaders: Record<string, string>,
  options?: {
    maxWsMessageSize?: number;
    authQuery?: Record<string, string>;
    awsSigV4?: AwsSigV4RouteConfig;
  }
): Promise<void> {
  const { WebSocket, WebSocketServer } = await loadWs();

  // Carry query parameters from the browser request to the upstream URL so
  // provider configuration (model, encoding, language, …) is preserved.
  const parsed = new URL(req.url ?? '/', 'http://localhost');
  const upstream = new URL(targetUrl);
  parsed.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  // Inject query-based auth AFTER carrying over client parameters so the
  // server-side credential always overrides any client-supplied value.
  if (options?.authQuery) {
    for (const [key, value] of Object.entries(options.authQuery)) {
      upstream.searchParams.set(key, value);
    }
  }

  // AWS routes: compute a SigV4-presigned upstream URL at connect time.
  // The signature covers the merged query parameters above.
  let upstreamUrl = upstream.toString();
  if (options?.awsSigV4) {
    const { service, region, credentials } = options.awsSigV4;
    try {
      upstreamUrl = await presignAwsUrl({ url: upstreamUrl, service, region, credentials });
    } catch (err) {
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.destroy();
      throw err;
    }
  }

  const upstreamWs: WsWebSocket = new WebSocket(upstreamUrl, {
    headers: authHeaders,
  });

  // Wait for the upstream connection to open BEFORE completing the browser's
  // WebSocket upgrade. This fixes a race condition where the browser receives
  // the 101 response, starts sending audio frames, but the relay handlers
  // are not yet registered — causing those frames to be silently dropped.
  await new Promise<void>((resolve, reject) => {
    // Handle upstream connection failure before the relay is established.
    const onPreOpenError = (err: Error) => {
      socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
      socket.destroy();
      reject(err);
    };
    upstreamWs.on('error', onPreOpenError);

    upstreamWs.on('open', () => {
      // Upstream is ready — remove the pre-open error handler.
      upstreamWs.removeListener('error', onPreOpenError);

      // Now complete the browser's upgrade handshake.
      const wss: WsWebSocketServer = new WebSocketServer({ noServer: true });
      wss.handleUpgrade(req, socket, head, (clientWs: WsWebSocket) => {
        // Both connections are open — set up bidirectional relay.

        // Browser → Upstream
        clientWs.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
          // Enforce message size limit on client → upstream messages
          if (options?.maxWsMessageSize !== undefined) {
            const size = getMessageSize(data);
            if (size > options.maxWsMessageSize) {
              clientWs.close(1009, 'Message Too Big');
              upstreamWs.close(1000, 'Client message too big');
              return;
            }
          }
          if (upstreamWs.readyState === WebSocket.OPEN) {
            upstreamWs.send(data, { binary: isBinary });
          }
        });

        // Upstream → Browser
        upstreamWs.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(data, { binary: isBinary });
          }
        });

        // Close coordination — only forward valid WebSocket close codes
        // (1000 or 3000–4999). The `ws` library throws on invalid codes.
        clientWs.on('close', (code: number, reason: Buffer) => {
          if (upstreamWs.readyState === WebSocket.OPEN) {
            if (code === 1000 || (code >= 3000 && code <= 4999)) {
              upstreamWs.close(code, reason);
            } else {
              upstreamWs.close();
            }
          }
        });
        upstreamWs.on('close', (code: number, reason: Buffer) => {
          if (clientWs.readyState === WebSocket.OPEN) {
            if (code === 1000 || (code >= 3000 && code <= 4999)) {
              clientWs.close(code, reason);
            } else {
              clientWs.close();
            }
          }
        });

        // Error cleanup
        clientWs.on('error', () => upstreamWs.terminate());
        upstreamWs.on('error', () => clientWs.terminate());

        resolve();
      });
    });
  });
}
