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
        'Install it with: npm install ws\n' +
        'The "ws" package is an optional peer dependency of @lukeocodes/composite-voice.'
    );
  }
}

/**
 * Proxy a WebSocket upgrade request to an upstream provider, forwarding all
 * messages bidirectionally.
 *
 * @remarks
 * Creates a `WebSocketServer` in no-server mode to complete the client-side
 * upgrade handshake, then opens a separate upstream WebSocket connection with
 * the provider's authentication headers. All messages, close events, and errors
 * are relayed between the two connections.
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
 * @returns A promise that resolves once the WebSocket relay is fully established.
 *
 * @throws Terminates the client connection with close code 1011 if the upstream
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
