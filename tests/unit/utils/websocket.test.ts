/**
 * WebSocketManager tests
 *
 * These tests focus on the core functionality that can be reliably tested
 * without complex async WebSocket mocking. Integration tests with a real
 * WebSocket server would be more appropriate for full connection lifecycle testing.
 */

import { WebSocketManager, WebSocketState } from '../../../src/utils/websocket';
import { WebSocketError } from '../../../src/utils/errors';

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
});
