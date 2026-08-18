/**
 * Tests for SpekoSTT provider
 */

import { SpekoSTT } from '../../../../src/providers/stt/speko/SpekoSTT';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';
import type { TranscriptionResult } from '../../../../src/core/types/providers';

// Mock WebSocketManager
const mockWsManager = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  getState: jest.fn().mockReturnValue('connected'),
  setHandlers: jest.fn(),
  expectClose: jest.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockWebSocketManager = jest.fn((_options?: any) => mockWsManager);

jest.mock('../../../../src/utils/websocket', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    WebSocketManager: function (this: unknown, options: any) {
      return MockWebSocketManager(options);
    },
    WebSocketState: {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      RECONNECTING: 'reconnecting',
      CLOSING: 'closing',
      CLOSED: 'closed',
    },
  };
});

/** Get the message handler registered via setHandlers. */
function getMessageHandler(): (event: MessageEvent) => void {
  const handlers = mockWsManager.setHandlers.mock.calls[0][0];
  return handlers.onMessage;
}

/** Get the connection-lost handler registered via setHandlers. */
function getConnectionLostHandler(): (error: Error) => void {
  const handlers = mockWsManager.setHandlers.mock.calls[0][0];
  return handlers.onConnectionLost;
}

/** Simulate an incoming Speko JSON frame. */
function receive(message: unknown): void {
  getMessageHandler()({ data: JSON.stringify(message) } as MessageEvent);
}

const PROXY_CONFIG = { proxyUrl: 'http://localhost:3001/api/proxy/speko' };

describe('SpekoSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with a proxyUrl', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.audioFormat).toBe('pcm_s16le');
      expect(provider.config.sampleRate).toBe(16000);
      expect(provider.config.numChannels).toBe(1);
      expect(provider.config.language).toBe('en');
      expect(provider.config.interimResults).toBe(true);
    });

    it('should initialize with a custom endpoint', async () => {
      const provider = new SpekoSTT({ endpoint: 'wss://speko-gateway.internal' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize with an apiKey (direct server-side mode)', async () => {
      const provider = new SpekoSTT({ apiKey: 'sk_speko_test' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when apiKey, proxyUrl, and endpoint are all missing', async () => {
      const provider = new SpekoSTT({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should not be ready after dispose', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Connection', () => {
    it('should connect and send the session.configure message', async () => {
      const provider = new SpekoSTT(
        { ...PROXY_CONFIG, routing: { mode: 'auto', objective: 'latency' } },
        logger
      );
      await provider.initialize();

      await provider.connect();

      expect(provider.isWebSocketConnected()).toBe(true);
      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'ws://localhost:3001/api/proxy/speko/v1/stt/stream',
          reconnection: { enabled: false },
        })
      );
      expect(mockWsManager.send).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockWsManager.send.mock.calls[0][0])).toEqual({
        type: 'session.configure',
        routing: { mode: 'auto', objective: 'latency' },
        audio: { encoding: 'pcm_s16le', sample_rate_hz: 16000, channels: 1 },
        language: 'en',
      });
    });

    it('should not pass upgrade headers in proxy mode', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();

      await provider.connect();

      expect(MockWebSocketManager.mock.calls[0]![0].headers).toBeUndefined();
    });

    it('should connect directly to the relay with auth headers in apiKey mode', async () => {
      const provider = new SpekoSTT({ apiKey: 'sk_speko_test' }, logger);
      await provider.initialize();

      await provider.connect();

      const options = MockWebSocketManager.mock.calls[0]![0];
      expect(options.url).toBe('wss://relay.speko.dev/v1/stt/stream');
      expect(typeof options.headers).toBe('function');

      const headers = options.headers();
      expect(headers.Authorization).toBe('Bearer sk_speko_test');
      expect(typeof headers['Idempotency-Key']).toBe('string');
      expect(headers['Idempotency-Key'].length).toBeGreaterThan(0);
    });

    it('should generate a fresh Idempotency-Key per header evaluation in direct mode', async () => {
      const provider = new SpekoSTT({ apiKey: 'sk_speko_test' }, logger);
      await provider.initialize();

      await provider.connect();

      const headersFn = MockWebSocketManager.mock.calls[0]![0].headers;
      expect(headersFn()['Idempotency-Key']).not.toBe(headersFn()['Idempotency-Key']);
    });

    it('should omit routing from session.configure when not set', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();

      await provider.connect();

      const configure = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(configure.routing).toBeUndefined();
    });

    it('should warn and no-op when already connected', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();

      await provider.connect();
      await provider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledTimes(1);
    });

    it('should throw ProviderConnectionError when the connection fails', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('boom'));

      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should throw when not initialized', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);

      await expect(provider.connect()).rejects.toThrow();
    });
  });

  describe('Message handling', () => {
    let provider: SpekoSTT;
    let results: TranscriptionResult[];

    beforeEach(async () => {
      provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();
      results = [];
      provider.onTranscription((result) => results.push(result));
      await provider.connect();
    });

    it('should accumulate transcript.delta frames into interim results', () => {
      receive({ type: 'transcript.delta', text: 'Hello' });
      receive({ type: 'transcript.delta', text: ' world' });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ text: 'Hello', isFinal: false });
      expect(results[1]).toMatchObject({ text: 'Hello world', isFinal: false });
    });

    it('should emit transcript.final as an utterance-complete result', () => {
      receive({ type: 'transcript.delta', text: 'Hello world' });
      receive({ type: 'transcript.final', text: 'Hello world.', segments: [{ start: 0 }] });

      const final = results[results.length - 1]!;
      expect(final.text).toBe('Hello world.');
      expect(final.isFinal).toBe(true);
      expect(final.utteranceComplete).toBe(true);
      expect(final.metadata?.segments).toEqual([{ start: 0 }]);
    });

    it('should reset the interim buffer after a final result', () => {
      receive({ type: 'transcript.delta', text: 'First' });
      receive({ type: 'transcript.final', text: 'First.' });
      receive({ type: 'transcript.delta', text: 'Second' });

      const interim = results[results.length - 1]!;
      expect(interim.text).toBe('Second');
      expect(interim.isFinal).toBe(false);
    });

    it('should suppress interim results when interimResults is false', async () => {
      jest.clearAllMocks();
      const quiet = new SpekoSTT({ ...PROXY_CONFIG, interimResults: false }, logger);
      await quiet.initialize();
      const quietResults: TranscriptionResult[] = [];
      quiet.onTranscription((result) => quietResults.push(result));
      await quiet.connect();

      receive({ type: 'transcript.delta', text: 'Hello' });
      receive({ type: 'transcript.final', text: 'Hello.' });

      expect(quietResults).toHaveLength(1);
      expect(quietResults[0]!.isFinal).toBe(true);
    });

    it('should emit an error-shaped result on a terminal error frame', () => {
      receive({
        type: 'error',
        error: { code: 'budget_exhausted', message: 'Out of credit', retryable: false },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: '',
        isFinal: true,
        confidence: 0,
      });
      expect(results[0]!.metadata).toMatchObject({
        error: 'Out of credit',
        errorCode: 'budget_exhausted',
      });
    });

    it('should emit a connection-lost result when the socket dies unexpectedly', () => {
      getConnectionLostHandler()(new Error('socket closed'));

      expect(provider.isWebSocketConnected()).toBe(false);
      expect(results).toHaveLength(1);
      expect(results[0]!.isFinal).toBe(true);
      expect(results[0]!.metadata?.error).toBe('ws_closed');
    });

    it('should ignore non-string and unknown frames without emitting', () => {
      getMessageHandler()({ data: new ArrayBuffer(4) } as MessageEvent);
      receive({ type: 'session.ready', request_id: 'req_1' });
      receive({ type: 'usage.updated', usage: { characters: 10 } });

      expect(results).toHaveLength(0);
    });
  });

  describe('Audio streaming', () => {
    it('should send audio chunks as binary frames', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();
      await provider.connect();

      const chunk = new ArrayBuffer(320);
      provider.sendAudio(chunk);

      expect(mockWsManager.send).toHaveBeenLastCalledWith(chunk);
    });

    it('should drop audio chunks when not connected', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();

      provider.sendAudio(new ArrayBuffer(320));

      expect(mockWsManager.send).not.toHaveBeenCalled();
    });
  });

  describe('Finalize and disconnect', () => {
    it('should send input.commit on finalize', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();
      await provider.connect();

      provider.finalize();

      expect(JSON.parse(mockWsManager.send.mock.calls[1][0])).toEqual({ type: 'input.commit' });
    });

    it('should send session.close, expect the close, and disconnect', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();
      await provider.connect();

      // Deliver the terminal session.closed frame on the next tick, once the
      // provider is waiting for it
      mockWsManager.send.mockImplementation((data: unknown) => {
        if (typeof data === 'string' && JSON.parse(data).type === 'session.close') {
          setTimeout(() => receive({ type: 'session.closed' }), 0);
        }
      });

      await provider.disconnect();

      expect(mockWsManager.expectClose).toHaveBeenCalled();
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should tear down the manager when the session is already dead', async () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      await provider.initialize();
      await provider.connect();

      // Simulate an unexpected close
      getConnectionLostHandler()(new Error('gone'));

      await provider.disconnect();

      expect(mockWsManager.disconnect).toHaveBeenCalled();
    });
  });

  describe('Roles', () => {
    it('should declare the stt role', () => {
      const provider = new SpekoSTT(PROXY_CONFIG, logger);
      expect(provider.roles).toEqual(['stt']);
    });
  });
});
