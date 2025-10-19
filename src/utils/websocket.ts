/**
 * WebSocket utilities and connection manager
 */

import { WebSocketError, TimeoutError } from './errors';
import type { ReconnectionConfig } from '../core/types/config';
import { Logger } from './logger';

/**
 * WebSocket connection state
 */
export enum WebSocketState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  CLOSING = 'closing',
  CLOSED = 'closed',
}

/**
 * WebSocket manager options
 */
export interface WebSocketManagerOptions {
  /** URL to connect to */
  url: string;
  /** Protocols */
  protocols?: string | string[] | undefined;
  /** Reconnection configuration */
  reconnection?: ReconnectionConfig;
  /** Connection timeout in ms */
  connectionTimeout?: number;
  /** Logger instance */
  logger?: Logger | undefined;
}

/**
 * WebSocket event handlers
 */
export interface WebSocketHandlers {
  onOpen?: () => void;
  onMessage?: (event: MessageEvent) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Error) => void;
}

/**
 * Managed WebSocket connection with auto-reconnect
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

  constructor(options: WebSocketManagerOptions) {
    this.options = {
      url: options.url,
      protocols: options.protocols,
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
   * Get current connection state
   */
  getState(): WebSocketState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === WebSocketState.CONNECTED && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Register event handlers
   */
  setHandlers(handlers: WebSocketHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  /**
   * Connect to WebSocket
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

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.cleanup();
        reject(new TimeoutError('WebSocket connection', this.options.connectionTimeout));
      }, this.options.connectionTimeout);

      try {
        this.ws = new WebSocket(this.options.url, this.options.protocols);

        this.ws.onopen = () => {
          clearTimeout(timeout);
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
        };
      } catch (error) {
        clearTimeout(timeout);
        this.cleanup();
        reject(new WebSocketError(`Failed to create WebSocket: ${(error as Error).message}`));
      }
    });
  }

  /**
   * Handle connection close
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

    // Attempt reconnection if enabled
    if (this.shouldReconnect && this.options.reconnection.enabled) {
      this.attemptReconnect();
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    const { maxAttempts, initialDelay, maxDelay, backoffMultiplier } = this.options.reconnection;

    if (maxAttempts && this.reconnectAttempts >= maxAttempts) {
      this.logger?.error(`Max reconnection attempts (${maxAttempts}) reached`);
      this.shouldReconnect = false;
      this.handlers.onError?.(new WebSocketError('Max reconnection attempts reached'));
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
      });
    }, delay);
  }

  /**
   * Send data through the WebSocket
   */
  send(data: string | ArrayBuffer | Blob): void {
    if (!this.isConnected()) {
      throw new WebSocketError('Cannot send data: not connected');
    }
    this.ws!.send(data);
  }

  /**
   * Close the WebSocket connection
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
      if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
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

      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(code, reason);
      } else {
        clearTimeout(timeout);
        this.cleanup();
        resolve();
      }
    });
  }

  /**
   * Clean up resources
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
