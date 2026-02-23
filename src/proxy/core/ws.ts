/**
 * WebSocket proxying core.
 * Uses the `ws` package (optional peer dependency) to bidirectionally relay
 * WebSocket connections between a browser client and an upstream provider.
 *
 * Server-side only — never imported by browser bundles.
 */

import type { IncomingMessage } from 'http';
import type { Socket } from 'net';

// Types for the ws package — only used for type-checking, not at runtime.
// The actual module is loaded dynamically so it stays optional.
type WsModule = typeof import('ws');
type WsWebSocket = import('ws').WebSocket;
type WsWebSocketServer = import('ws').WebSocketServer;

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
        'Install it with: npm install ws\n' +
        'The "ws" package is an optional peer dependency of @lukeocodes/composite-voice.'
    );
  }
}

/**
 * Proxy a WebSocket upgrade request to `targetUrl`, forwarding all messages
 * bidirectionally.  Query parameters from the original request are preserved
 * so provider options (e.g. Deepgram model, encoding) are passed through.
 *
 * @param req        Incoming HTTP upgrade request
 * @param socket     Raw TCP socket from the upgrade event
 * @param head       Buffered data from the upgrade event
 * @param targetUrl  Upstream WebSocket URL (e.g. `wss://api.deepgram.com/v1/listen`)
 * @param authHeaders  Headers to inject into the upstream connection (API key etc.)
 */
export async function proxyWebSocket(
  req: IncomingMessage,
  socket: Socket,
  head: Buffer,
  targetUrl: string,
  authHeaders: Record<string, string>
): Promise<void> {
  const { WebSocket, WebSocketServer } = await loadWs();

  // Carry query parameters from the browser request to the upstream URL so
  // provider configuration (model, encoding, language, …) is preserved.
  const parsed = new URL(req.url ?? '/', 'http://localhost');
  const upstream = new URL(targetUrl);
  parsed.searchParams.forEach((value, key) => upstream.searchParams.set(key, value));

  const upstreamWs: WsWebSocket = new WebSocket(upstream.toString(), {
    headers: authHeaders,
  });

  const wss: WsWebSocketServer = new WebSocketServer({ noServer: true });

  wss.handleUpgrade(req, socket, head, (clientWs: WsWebSocket) => {
    upstreamWs.on('open', () => {
      clientWs.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
        if (upstreamWs.readyState === WebSocket.OPEN) {
          upstreamWs.send(data, { binary: isBinary });
        }
      });

      upstreamWs.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(data, { binary: isBinary });
        }
      });

      clientWs.on('close', (code: number, reason: Buffer) => {
        if (upstreamWs.readyState === WebSocket.OPEN) {
          upstreamWs.close(code, reason);
        }
      });
      upstreamWs.on('close', (code: number, reason: Buffer) => {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.close(code, reason);
        }
      });

      clientWs.on('error', () => upstreamWs.terminate());
      upstreamWs.on('error', () => clientWs.terminate());
    });

    upstreamWs.on('error', (err: Error) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.close(1011, err.message.slice(0, 123));
      }
    });
  });
}
