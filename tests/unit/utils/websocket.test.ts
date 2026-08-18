/**
 * WebSocketManager tests
 *
 * These tests focus on the core functionality that can be reliably tested
 * without complex async WebSocket mocking. Integration tests with a real
 * WebSocket server would be more appropriate for full connection lifecycle testing.
 */

import { WebSocketManager, WebSocketState } from '../../../src/utils/websocket';
import { WebSocketError } from '../../../src/utils/errors';

/** Sockets created through the mocked `ws` package, newest last. */
const mockNodeWsSockets: any[] = [];

// The manager dynamically imports `ws` when upgrade headers are configured
// (browsers cannot set them). Mock it with a constructor that captures the
// url/protocols/options it was created with.
jest.mock('ws', () => ({
  WebSocket: class {
    url: string;
    protocols: unknown;
    options: { headers?: Record<string, string> };
    binaryType = 'nodebuffer';
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: unknown = null;
    onerror: unknown = null;
    onclose: unknown = null;
    close = jest.fn();
    send = jest.fn();

    constructor(url: string, protocols: unknown, options: { headers?: Record<string, string> }) {
      this.url = url;
      this.protocols = protocols;
      this.options = options;
      mockNodeWsSockets.push(this);
    }
  },
}));

describe('WebSocketManager', () => {
  let manager: WebSocketManager;

  beforeEach(() => {
    // Create a basic mock WebSocket that doesn't auto-trigger events
    (global as any).WebSocket = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should create manager with required options', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
      });
      expect(manager).toBeInstanceOf(WebSocketManager);
      expect(manager.getState()).toBe(WebSocketState.DISCONNECTED);
    });

    it('should create manager with all options', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
        protocols: ['protocol1', 'protocol2'],
        connectionTimeout: 5000,
        reconnection: {
          enabled: true,
          maxAttempts: 3,
          initialDelay: 500,
          maxDelay: 10000,
          backoffMultiplier: 1.5,
        },
      });
      expect(manager).toBeInstanceOf(WebSocketManager);
      expect(manager.getState()).toBe(WebSocketState.DISCONNECTED);
    });

    it('should not be connected initially', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
      });
      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('state management', () => {
    beforeEach(() => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
      });
    });

    it('should return current state via getState()', () => {
      expect(manager.getState()).toBe(WebSocketState.DISCONNECTED);
    });

    it('should report not connected when state is DISCONNECTED', () => {
      expect(manager.isConnected()).toBe(false);
    });
  });

  describe('handler registration', () => {
    beforeEach(() => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
      });
    });

    it('should allow setting handlers', () => {
      const onOpen = jest.fn();
      const onMessage = jest.fn();
      const onClose = jest.fn();
      const onError = jest.fn();

      expect(() => {
        manager.setHandlers({
          onOpen,
          onMessage,
          onClose,
          onError,
        });
      }).not.toThrow();
    });

    it('should allow setting partial handlers', () => {
      const onMessage = jest.fn();

      expect(() => {
        manager.setHandlers({
          onMessage,
        });
      }).not.toThrow();
    });

    it('should allow updating handlers', () => {
      const onOpen1 = jest.fn();
      const onOpen2 = jest.fn();

      expect(() => {
        manager.setHandlers({ onOpen: onOpen1 });
        manager.setHandlers({ onOpen: onOpen2 });
      }).not.toThrow();
    });
  });

  describe('send() method', () => {
    beforeEach(() => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
      });
    });

    it('should throw error when not connected', () => {
      expect(() => {
        manager.send('test message');
      }).toThrow(WebSocketError);

      expect(() => {
        manager.send('test message');
      }).toThrow('Cannot send data: not connected');
    });

    it('should throw error for ArrayBuffer when not connected', () => {
      const buffer = new ArrayBuffer(8);
      expect(() => {
        manager.send(buffer);
      }).toThrow(WebSocketError);
    });

    it('should throw error for Blob when not connected', () => {
      const blob = new Blob(['test']);
      expect(() => {
        manager.send(blob);
      }).toThrow(WebSocketError);
    });
  });

  describe('reconnection configuration', () => {
    it('should use default reconnection config when not provided', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
      });
      // Manager is created successfully with defaults
      expect(manager).toBeInstanceOf(WebSocketManager);
    });

    it('should accept custom reconnection config', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
        reconnection: {
          enabled: false,
          maxAttempts: 0,
          initialDelay: 100,
          maxDelay: 5000,
          backoffMultiplier: 1.2,
        },
      });
      expect(manager).toBeInstanceOf(WebSocketManager);
    });

    it('should accept partial reconnection config', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
        reconnection: {
          enabled: false,
        } as any,
      });
      expect(manager).toBeInstanceOf(WebSocketManager);
    });
  });

  describe('timeout configuration', () => {
    it('should use default timeout when not provided', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
      });
      expect(manager).toBeInstanceOf(WebSocketManager);
    });

    it('should accept custom timeout', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
        connectionTimeout: 2000,
      });
      expect(manager).toBeInstanceOf(WebSocketManager);
    });
  });

  describe('protocol configuration', () => {
    it('should accept single protocol', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
        protocols: 'protocol1',
      });
      expect(manager).toBeInstanceOf(WebSocketManager);
    });

    it('should accept multiple protocols', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
        protocols: ['protocol1', 'protocol2', 'protocol3'],
      });
      expect(manager).toBeInstanceOf(WebSocketManager);
    });

    it('should work without protocols', () => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
      });
      expect(manager).toBeInstanceOf(WebSocketManager);
    });
  });

  describe('WebSocketState enum', () => {
    it('should export all expected states', () => {
      expect(WebSocketState.DISCONNECTED).toBe('disconnected');
      expect(WebSocketState.CONNECTING).toBe('connecting');
      expect(WebSocketState.CONNECTED).toBe('connected');
      expect(WebSocketState.RECONNECTING).toBe('reconnecting');
      expect(WebSocketState.CLOSING).toBe('closing');
      expect(WebSocketState.CLOSED).toBe('closed');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
      });
    });

    it('should throw WebSocketError with descriptive message when sending while disconnected', () => {
      expect(() => {
        manager.send('test');
      }).toThrow('Cannot send data: not connected');
    });

    it('should create WebSocketError instances', () => {
      try {
        manager.send('test');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(WebSocketError);
      }
    });
  });

  // ─── Connection-loss signaling ────────────────────────────────────────

  describe('onConnectionLost', () => {
    /** Sockets created during a test, newest last. */
    let sockets: MockSocket[];

    class MockSocket {
      static readonly OPEN = 1;
      static readonly CLOSED = 3;
      readyState = 0;
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      close = jest.fn(() => {
        this.readyState = MockSocket.CLOSED;
      });
      send = jest.fn();

      constructor() {
        sockets.push(this);
      }

      open(): void {
        this.readyState = MockSocket.OPEN;
        this.onopen?.();
      }

      serverClose(code = 1011, reason = 'server gone'): void {
        this.readyState = MockSocket.CLOSED;
        this.onclose?.({ code, reason } as CloseEvent);
      }
    }

    beforeEach(() => {
      jest.useFakeTimers();
      sockets = [];
      (global as any).WebSocket = MockSocket;
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    /** Connect a manager and return its (opened) socket. */
    async function connected(mgr: WebSocketManager): Promise<MockSocket> {
      const connecting = mgr.connect();
      sockets[sockets.length - 1]!.open();
      await connecting;
      return sockets[sockets.length - 1]!;
    }

    it('fires once when the server closes and reconnection is disabled', async () => {
      const onConnectionLost = jest.fn();
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
        reconnection: { enabled: false },
      });
      manager.setHandlers({ onConnectionLost });
      const socket = await connected(manager);

      socket.serverClose(1011, 'quota exhausted');

      expect(onConnectionLost).toHaveBeenCalledTimes(1);
      expect(onConnectionLost.mock.calls[0][0].message).toContain('1011');
    });

    it('does not fire for a close the caller requested via disconnect()', async () => {
      const onConnectionLost = jest.fn();
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
        reconnection: { enabled: false },
      });
      manager.setHandlers({ onConnectionLost });
      const socket = await connected(manager);

      const disconnecting = manager.disconnect();
      socket.serverClose(1000, 'Normal closure');
      await disconnecting;

      expect(onConnectionLost).not.toHaveBeenCalled();
    });

    it('does not fire after expectClose(), covering the graceful-shutdown window', async () => {
      const onConnectionLost = jest.fn();
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
        reconnection: { enabled: false },
      });
      manager.setHandlers({ onConnectionLost });
      const socket = await connected(manager);

      // Provider sends its end-of-stream message; the server closes first.
      manager.expectClose();
      socket.serverClose(1000, 'session ended');

      expect(onConnectionLost).not.toHaveBeenCalled();
    });

    it('keeps retrying after an attempt times out and still reports the terminal loss', async () => {
      const onConnectionLost = jest.fn();
      manager = new WebSocketManager({
        url: 'wss://test.example.com',
        connectionTimeout: 1000,
        reconnection: {
          enabled: true,
          maxAttempts: 2,
          initialDelay: 100,
          maxDelay: 100,
          backoffMultiplier: 1,
        },
      });
      manager.setHandlers({ onConnectionLost });
      const socket = await connected(manager);

      // Server drops the connection; reconnect attempts begin.
      socket.serverClose(1006, 'abnormal');
      expect(onConnectionLost).not.toHaveBeenCalled();

      // Each retry hangs and times out rather than emitting a close event —
      // the path that used to silently end the retry loop.
      for (let attempt = 0; attempt < 2; attempt++) {
        await jest.advanceTimersByTimeAsync(100); // backoff delay
        await jest.advanceTimersByTimeAsync(1000); // connection timeout
      }

      expect(sockets.length).toBeGreaterThan(2);
      expect(onConnectionLost).toHaveBeenCalledTimes(1);
      expect(onConnectionLost.mock.calls[0][0].message).toContain('Max reconnection attempts');
    });
  });

  // ─── Upgrade headers (server-side `ws` package) ───────────────────────

  describe('upgrade headers', () => {
    beforeEach(() => {
      mockNodeWsSockets.length = 0;
      (global as any).WebSocket = jest.fn();
    });

    /** Connect a manager with headers, opening the mocked ws socket. */
    async function connectWithHeaders(
      headers: Record<string, string> | (() => Record<string, string>)
    ): Promise<{ mgr: WebSocketManager; socket: any }> {
      const mgr = new WebSocketManager({
        url: 'wss://relay.example.com/stream',
        headers,
        reconnection: { enabled: false },
      });
      const pending = mgr.connect();
      // Let the dynamic import('ws') settle so the socket gets created
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket = mockNodeWsSockets[mockNodeWsSockets.length - 1];
      socket.readyState = 1;
      socket.onopen?.();
      await pending;
      return { mgr, socket };
    }

    it('connects through the ws package with the configured headers', async () => {
      const { mgr, socket } = await connectWithHeaders({ Authorization: 'Bearer key' });

      expect(socket.url).toBe('wss://relay.example.com/stream');
      expect(socket.options).toEqual({ headers: { Authorization: 'Bearer key' } });
      // Browser-compatible binary frames, and the global WebSocket untouched
      expect(socket.binaryType).toBe('arraybuffer');
      expect((global as any).WebSocket).not.toHaveBeenCalled();
      expect(mgr.isConnected()).toBe(true);
    });

    it('re-evaluates function-form headers per socket creation', async () => {
      let counter = 0;
      const headers = (): Record<string, string> => ({ 'Idempotency-Key': `key-${++counter}` });

      const first = await connectWithHeaders(headers);
      const second = await connectWithHeaders(headers);

      expect(first.socket.options.headers['Idempotency-Key']).toBe('key-1');
      expect(second.socket.options.headers['Idempotency-Key']).toBe('key-2');
    });
  });
});
