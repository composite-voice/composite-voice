/**
 * WebSocket connection manager with automatic reconnection.
 *
 * @remarks
 * This module provides a managed WebSocket connection layer used by the SDK's
 * WebSocket-based providers (e.g., {@link DeepgramTTS}, {@link ElevenLabsTTS},
 * {@link CartesiaTTS}). It handles connection lifecycle, automatic reconnection
 * with exponential backoff, timeout management, and event dispatching.
 *
 * The {@link WebSocketManager} wraps the browser's native `WebSocket` API and
 * adds reliability features that are essential for real-time voice applications.
 *
 * @example
 * ```typescript
 * import { WebSocketManager, WebSocketState } from 'composite-voice';
 *
 * const ws = new WebSocketManager({
 *   url: 'wss://api.example.com/stream',
 *   connectionTimeout: 5000,
 *   reconnection: {
 *     enabled: true,
 *     maxAttempts: 5,
 *     initialDelay: 1000,
 *     maxDelay: 30000,
 *     backoffMultiplier: 2,
 *   },
 * });
 *
 * ws.setHandlers({
 *   onMessage: (event) => console.log('Received:', event.data),
 *   onClose: () => console.log('Connection closed'),
 *   onError: (error) => console.error('Error:', error),
 * });
 *
 * await ws.connect();
 * ws.send('Hello, server!');
 * await ws.disconnect();
 * ```
 *
 * @packageDocumentation
 */

import { WebSocketError, TimeoutError } from './errors';
import type { ReconnectionConfig } from '../core/types/config';
import { Logger } from './logger';

// WHATWG WebSocket readyState values, inlined so the manager does not depend
// on a global `WebSocket` class existing (Node < 22 has none, and sockets may
// come from the `ws` package when upgrade headers are configured).
/** @internal */
const READY_STATE_OPEN = 1;
/** @internal */
const READY_STATE_CLOSED = 3;

/**
 * Enumeration of WebSocket connection states.
 *
 * @remarks
 * These states track the full lifecycle of a managed WebSocket connection,
 * including reconnection phases. The state machine transitions are:
 *
 * ```
 * DISCONNECTED -> CONNECTING -> CONNECTED -> CLOSING -> CLOSED
 *                                    |
 *                                    v
 *                              RECONNECTING -> CONNECTING -> ...
 * ```
 */
export enum WebSocketState {
  /** No active connection. Initial state and state after unexpected disconnection. */
  DISCONNECTED = 'disconnected',
  /** Connection attempt is in progress. */
  CONNECTING = 'connecting',
  /** WebSocket is open and ready to send/receive data. */
  CONNECTED = 'connected',
  /** Automatic reconnection is in progress after an unexpected disconnection. */
  RECONNECTING = 'reconnecting',
  /** A graceful close has been initiated and is in progress. */
  CLOSING = 'closing',
  /** The connection has been gracefully closed. Terminal state. */
  CLOSED = 'closed',
}

/**
 * Configuration options for the {@link WebSocketManager}.
 *
 * @example
 * ```typescript
 * const options: WebSocketManagerOptions = {
 *   url: 'wss://api.example.com/stream',
 *   protocols: 'graphql-ws',
 *   connectionTimeout: 10000,
 *   reconnection: {
 *     enabled: true,
 *     maxAttempts: 3,
 *     initialDelay: 500,
 *     maxDelay: 10000,
 *     backoffMultiplier: 2,
 *   },
 * };
 * ```
 */
export interface WebSocketManagerOptions {
  /**
   * The WebSocket URL to connect to (must use `ws://` or `wss://` protocol).
   */
  url: string;

  /**
   * WebSocket sub-protocol(s) to request during the handshake.
   *
   * @defaultValue `undefined`
   */
  protocols?: string | string[] | undefined;

  /**
   * HTTP headers to send on the WebSocket upgrade request — **server-side
   * (Node.js) only**.
   *
   * @remarks
   * Browsers cannot set headers on a WebSocket handshake, so when this option
   * is set the manager connects through the optional `ws` peer dependency
   * (the same package the CompositeVoice proxy uses) instead of the global
   * `WebSocket`. Providers whose upstream authenticates upgrades with
   * headers (e.g. {@link SpekoSTT} in direct `apiKey` mode) use this to
   * connect straight from a Node server without a proxy hop.
   *
   * Pass a function to have the headers re-evaluated on every socket
   * creation — required when a header must be unique per connection (e.g.
   * Speko's `Idempotency-Key`).
   *
   * In browsers, use a proxy that injects the headers instead; connecting
   * with this option set throws a {@link WebSocketError}.
   *
   * @defaultValue `undefined` (global `WebSocket`, no custom headers)
   */
  headers?: Record<string, string> | (() => Record<string, string>) | undefined;

  /**
   * Configuration for automatic reconnection behavior.
   *
   * @see {@link ReconnectionConfig}
   */
  reconnection?: ReconnectionConfig;

  /**
   * Maximum time in milliseconds to wait for the initial connection to open.
   *
   * @defaultValue `10000`
   */
  connectionTimeout?: number;

  /**
   * Logger instance for diagnostic output.
   *
   * @defaultValue `undefined` (no logging)
   */
  logger?: Logger | undefined;
}

/**
 * Event handler callbacks for WebSocket lifecycle events.
 *
 * @remarks
 * All handlers are optional. They are invoked by the {@link WebSocketManager}
 * when the corresponding WebSocket events occur.
 */
export interface WebSocketHandlers {
  /**
   * Called when the WebSocket connection is successfully opened.
   */
  onOpen?: () => void;

  /**
   * Called when a message is received from the WebSocket server.
   *
   * @param event - The `MessageEvent` containing the received data.
   */
  onMessage?: (event: MessageEvent) => void;

  /**
   * Called when the WebSocket connection is closed.
   *
   * @param event - The `CloseEvent` with close code and reason.
   */
  onClose?: (event: CloseEvent) => void;

  /**
   * Called when a WebSocket error occurs.
   *
   * @param error - The error that occurred.
   */
  onError?: (error: Error) => void;

  /**
   * Called exactly once when the connection has been lost unexpectedly and
   * the manager will NOT restore it: immediately on an unexpected close when
   * reconnection is disabled, or when automatic reconnection gives up.
   *
   * @remarks
   * User-initiated closes (via {@link WebSocketManager.disconnect}) never
   * trigger this handler. This is the liveness signal consumers should use
   * to fail over or surface a terminal stream error — unlike `onClose`,
   * which also fires for transient closes that reconnection will heal.
   *
   * @param error - Describes why the connection is considered lost.
   */
  onConnectionLost?: (error: Error) => void;
}

/**
 * Managed WebSocket connection with automatic reconnection and exponential backoff.
 *
 * @remarks
 * This class wraps the browser's native `WebSocket` API and adds:
 *
 * - **Connection timeout**: Rejects the connection promise if the socket doesn't
 *   open within the configured timeout period.
 * - **Automatic reconnection**: When enabled, automatically attempts to reconnect
 *   after unexpected disconnections using exponential backoff.
 * - **State management**: Tracks the connection state through a well-defined
 *   state machine ({@link WebSocketState}).
 * - **Event dispatching**: Routes WebSocket events to registered handlers.
 * - **Clean shutdown**: Provides a graceful `disconnect()` method that waits
 *   for the close handshake to complete.
 *
 * Reconnection uses exponential backoff with the formula:
 * `delay = min(initialDelay * backoffMultiplier^(attempt-1), maxDelay)`
 *
 * @example
 * ```typescript
 * const ws = new WebSocketManager({
 *   url: 'wss://api.deepgram.com/v1/speak',
 *   connectionTimeout: 10000,
 *   reconnection: { enabled: false },
 * });
 *
 * ws.setHandlers({
 *   onMessage: (event) => processAudio(event.data),
 *   onError: (error) => console.error(error),
 * });
 *
 * await ws.connect();
 * ws.send(JSON.stringify({ text: 'Hello' }));
 * await ws.disconnect();
 * ```
 *
 * @see {@link WebSocketState} - Connection state enumeration.
 * @see {@link WebSocketManagerOptions} - Configuration options.
 * @see {@link WebSocketHandlers} - Event handler interface.
 */
export class WebSocketManager {
  private ws: WebSocket | null = null;
  private state: WebSocketState = WebSocketState.DISCONNECTED;
  private options: WebSocketManagerOptions & {
    reconnection: ReconnectionConfig;
    connectionTimeout: number;
  };
  private handlers: WebSocketHandlers = {};
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = false;
  private logger?: Logger | undefined;

  /**
   * Creates a new WebSocketManager instance.
   *
   * @param options - Configuration options for the WebSocket connection.
   *   Default reconnection settings are applied if not provided.
   *
   * @example
   * ```typescript
   * const ws = new WebSocketManager({
   *   url: 'wss://api.example.com/stream',
   *   connectionTimeout: 5000,
   *   reconnection: { enabled: true, maxAttempts: 3 },
   * });
   * ```
   */
  constructor(options: WebSocketManagerOptions) {
    this.options = {
      url: options.url,
      protocols: options.protocols,
      headers: options.headers,
      reconnection: options.reconnection ?? {
        enabled: true,
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
      },
      connectionTimeout: options.connectionTimeout ?? 10000,
      logger: options.logger,
    };
    this.logger = options.logger;
  }

  /**
   * Returns the current connection state.
   *
   * @returns The current {@link WebSocketState}.
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * Checks whether the WebSocket is currently connected and ready.
   *
   * @remarks
   * Returns `true` only when both the internal state is `CONNECTED` and
   * the underlying `WebSocket.readyState` is `OPEN`.
   *
   * @returns `true` if connected and ready, `false` otherwise.
   */
  isConnected(): boolean {
    return this.state === WebSocketState.CONNECTED && this.ws?.readyState === READY_STATE_OPEN;
  }

  /**
   * Registers event handlers for WebSocket lifecycle events.
   *
   * @remarks
   * Merges the provided handlers with any previously registered handlers.
   * Calling this method multiple times will overwrite handlers for the
   * same event type.
   *
   * @param handlers - The event handler callbacks to register.
   *
   * @example
   * ```typescript
   * ws.setHandlers({
   *   onMessage: (event) => handleMessage(event),
   *   onError: (error) => handleError(error),
   * });
   * ```
   */
  setHandlers(handlers: WebSocketHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * Opens a WebSocket connection to the configured URL.
   *
   * @remarks
   * Returns a promise that resolves when the connection is successfully
   * opened, or rejects if the connection times out or fails. If already
   * connected or a connection attempt is in progress, the call is a no-op.
   *
   * After a successful connection, the reconnect attempt counter is reset
   * and the `onOpen` handler is called.
   *
   * @returns A promise that resolves when the WebSocket is open.
   *
   * @throws {@link TimeoutError} if the connection does not open within the configured timeout.
   * @throws {@link WebSocketError} if the WebSocket constructor or connection fails.
   */
  async connect(): Promise<void> {
    if (this.isConnected()) {
      this.logger?.debug('Already connected');
      return;
    }

    if (this.state === WebSocketState.CONNECTING) {
      this.logger?.debug('Connection already in progress');
      return;
    }

    this.state = WebSocketState.CONNECTING;
    this.shouldReconnect = true;
    this.logger?.info(`Connecting to ${this.options.url}`);

    // Custom upgrade headers need the Node `ws` package (browsers cannot set
    // them), which is loaded asynchronously — resolve the socket class first.
    let createSocket: () => WebSocket;
    if (this.options.headers) {
      createSocket = await this.createNodeSocketFactory(this.options.headers);
    } else {
      createSocket = () => new WebSocket(this.options.url, this.options.protocols);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new TimeoutError('WebSocket connection', this.options.connectionTimeout));
      }, this.options.connectionTimeout);

      let opened = false;

      try {
        this.ws = createSocket();

        this.ws.onopen = () => {
          clearTimeout(timeout);
          opened = true;
          this.state = WebSocketState.CONNECTED;
          this.reconnectAttempts = 0;
          this.logger?.info('Connected');
          this.handlers.onOpen?.();
          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          this.handlers.onMessage?.(event);
        };

        this.ws.onerror = (event: Event) => {
          this.logger?.error('WebSocket error', event);
          const error = new WebSocketError('Connection error');
          this.handlers.onError?.(error);
        };

        this.ws.onclose = (event: CloseEvent) => {
          clearTimeout(timeout);
          this.logger?.info(`Closed with code ${event.code}: ${event.reason}`);
          this.handleClose(event);
          // A close before the socket ever opened (e.g. the server rejected
          // the upgrade) must fail this connect() call — previously the
          // cleared timeout left the promise pending forever. Rejecting a
          // settled promise is a no-op, so post-open closes are unaffected.
          if (!opened) {
            reject(
              new WebSocketError(
                `Connection closed before opening (code ${event.code}${
                  event.reason ? `: ${event.reason}` : ''
                })`
              )
            );
          }
        };
      } catch (error) {
        clearTimeout(timeout);
        this.cleanup();
        reject(new WebSocketError(`Failed to create WebSocket: ${(error as Error).message}`));
      }
    });
  }

  /**
   * Build a socket factory that connects via the Node `ws` package with
   * custom upgrade headers.
   *
   * @remarks
   * Loaded dynamically so `ws` stays an optional peer dependency (matching
   * the proxy's pattern). The returned sockets use `binaryType:
   * 'arraybuffer'` so binary frames match the browser `WebSocket` shape;
   * `ws`'s event-target wrapper already delivers text frames as strings.
   * Function-form headers are re-evaluated per socket creation so
   * per-connection values (e.g. a fresh `Idempotency-Key`) stay unique
   * across reconnects.
   *
   * @param headers - Static headers or a per-connection header factory.
   * @returns A factory producing browser-`WebSocket`-compatible sockets.
   *
   * @throws {@link WebSocketError} when the `ws` package is unavailable
   * (browsers, or Node without the optional dependency installed).
   */
  private async createNodeSocketFactory(
    headers: Record<string, string> | (() => Record<string, string>)
  ): Promise<() => WebSocket> {
    let NodeWebSocket: typeof import('ws').WebSocket;
    try {
      NodeWebSocket = (await import('ws')).WebSocket;
    } catch {
      this.state = WebSocketState.DISCONNECTED;
      throw new WebSocketError(
        'Custom WebSocket upgrade headers require the "ws" package (Node.js only). ' +
          'Install it with: pnpm add ws — or, in browsers, connect through a proxy ' +
          'that injects the headers server-side.'
      );
    }

    return () => {
      const resolved = typeof headers === 'function' ? headers() : headers;
      const socket = new NodeWebSocket(this.options.url, this.options.protocols, {
        headers: resolved,
      });
      socket.binaryType = 'arraybuffer';
      return socket as unknown as WebSocket;
    };
  }

  /**
   * Handles the WebSocket `close` event and triggers reconnection if appropriate.
   *
   * @remarks
   * If the close was initiated by the user (state is `CLOSING`), transitions
   * to `CLOSED` without attempting reconnection. Otherwise, transitions to
   * `DISCONNECTED` and attempts reconnection if enabled.
   *
   * @param event - The `CloseEvent` from the WebSocket.
   */
  private handleClose(event: CloseEvent): void {
    this.ws = null;

    if (this.state === WebSocketState.CLOSING) {
      this.state = WebSocketState.CLOSED;
      this.shouldReconnect = false;
      this.handlers.onClose?.(event);
      return;
    }

    this.state = WebSocketState.DISCONNECTED;
    this.handlers.onClose?.(event);

    // Attempt reconnection if enabled; otherwise the connection is gone
    // for good and consumers need the terminal liveness signal.
    if (this.shouldReconnect && this.options.reconnection.enabled) {
      this.attemptReconnect();
    } else if (this.shouldReconnect) {
      this.shouldReconnect = false;
      this.handlers.onConnectionLost?.(
        new WebSocketError(
          `Connection closed unexpectedly (code ${event.code}${
            event.reason ? `: ${event.reason}` : ''
          })`
        )
      );
    }
  }

  /**
   * Attempts to reconnect to the WebSocket after an unexpected disconnection.
   *
   * @remarks
   * Uses exponential backoff with the formula:
   * `delay = min(initialDelay * backoffMultiplier^(attempt-1), maxDelay)`
   *
   * If the maximum number of reconnection attempts has been reached, emits
   * an error via the `onError` handler and stops attempting.
   */
  private attemptReconnect(): void {
    const { maxAttempts, initialDelay, maxDelay, backoffMultiplier } = this.options.reconnection;

    if (maxAttempts && this.reconnectAttempts >= maxAttempts) {
      this.logger?.error(`Max reconnection attempts (${maxAttempts}) reached`);
      this.shouldReconnect = false;
      const terminal = new WebSocketError('Max reconnection attempts reached');
      this.handlers.onError?.(terminal);
      this.handlers.onConnectionLost?.(terminal);
      return;
    }

    this.reconnectAttempts++;
    this.state = WebSocketState.RECONNECTING;

    const delay = Math.min(
      (initialDelay ?? 1000) * Math.pow(backoffMultiplier ?? 2, this.reconnectAttempts - 1),
      maxDelay ?? 30000
    );

    this.logger?.info(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.logger?.error('Reconnection failed', error);
        // A rejected attempt (e.g. connection timeout) emits no close event
        // — cleanup() already detached the handlers — so the retry loop must
        // be continued from here or a single timed-out attempt would silently
        // end reconnection without ever reaching the terminal signal above.
        if (this.shouldReconnect && this.options.reconnection.enabled) {
          this.attemptReconnect();
        }
      });
    }, delay);
  }

  /**
   * Declares that an imminent close is intentional.
   *
   * @remarks
   * Call this before sending a protocol-level end-of-stream message (and the
   * server-side close it triggers), so that close is not misreported through
   * {@link WebSocketHandlers.onConnectionLost} as a lost connection. It also
   * cancels any pending reconnection.
   *
   * {@link disconnect} does this implicitly; this method covers the window
   * between "we asked the server to end the session" and "we tore down the
   * socket", during which the server usually closes first.
   */
  expectClose(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Sends data through the open WebSocket connection.
   *
   * @param data - The data to send. Accepts strings (for JSON messages),
   *   `ArrayBuffer` (for binary audio data), or `Blob`.
   *
   * @throws {@link WebSocketError} if the WebSocket is not connected.
   *
   * @example
   * ```typescript
   * // Send JSON message
   * ws.send(JSON.stringify({ text: 'Hello, world!' }));
   *
   * // Send binary audio data
   * ws.send(audioArrayBuffer);
   * ```
   */
  send(data: string | ArrayBuffer | Blob): void {
    if (!this.isConnected() || !this.ws) {
      throw new WebSocketError('Cannot send data: not connected');
    }
    this.ws.send(data);
  }

  /**
   * Gracefully closes the WebSocket connection.
   *
   * @remarks
   * Disables automatic reconnection, cancels any pending reconnection timer,
   * and initiates a clean WebSocket close handshake. Waits up to 5 seconds
   * for the close handshake to complete before force-cleaning resources.
   *
   * If the WebSocket is already closed or disconnected, this is a no-op.
   *
   * @param code - The WebSocket close code.
   * @param reason - A human-readable reason for closing.
   *
   * @defaultValue code: `1000`
   * @defaultValue reason: `'Normal closure'`
   *
   * @returns A promise that resolves when the connection has been closed.
   */
  async disconnect(code = 1000, reason = 'Normal closure'): Promise<void> {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (!this.ws || this.state === WebSocketState.CLOSED) {
      this.logger?.debug('Already disconnected');
      return;
    }

    this.state = WebSocketState.CLOSING;
    this.logger?.info('Disconnecting');

    return new Promise((resolve) => {
      if (!this.ws || this.ws.readyState === READY_STATE_CLOSED) {
        this.cleanup();
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        this.cleanup();
        resolve();
      }, 5000);

      const originalOnClose = this.ws.onclose;
      const wsRef = this.ws;
      this.ws.onclose = (event) => {
        clearTimeout(timeout);
        originalOnClose?.call(wsRef, event);
        this.cleanup();
        resolve();
      };

      if (this.ws.readyState === READY_STATE_OPEN) {
        this.ws.close(code, reason);
      } else {
        clearTimeout(timeout);
        this.cleanup();
        resolve();
      }
    });
  }

  /**
   * Cleans up internal resources by removing event handlers and releasing
   * the WebSocket reference.
   *
   * @remarks
   * Sets the state to `CLOSED` and nullifies all WebSocket event handlers
   * to prevent memory leaks and stale callbacks.
   */
  private cleanup(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      this.ws = null;
    }
    this.state = WebSocketState.CLOSED;
  }
}
