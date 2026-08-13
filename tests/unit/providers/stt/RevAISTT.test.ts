/**
 * Tests for RevAISTT provider
 */

import { RevAISTT } from '../../../../src/providers/stt/revai/RevAISTT';
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

/** Get the close handler registered via setHandlers. */
function getCloseHandler(): (event: CloseEvent) => void {
  const handlers = mockWsManager.setHandlers.mock.calls[0][0];
  return handlers.onClose;
}

/** Simulate an incoming Rev AI JSON message. */
function receive(message: unknown): void {
  getMessageHandler()({ data: JSON.stringify(message) } as MessageEvent);
}

/** Simulate the WebSocket closing with the given code. */
function close(code: number, reason = ''): void {
  getCloseHandler()({ code, reason } as CloseEvent);
}

/** Flush pending microtasks (and zero-delay timers) so connect() reaches its handshake wait. */
async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

/**
 * Drive a full connect handshake: start connect(), let the provider
 * register its handlers, then deliver Rev AI's "connected" message.
 */
async function connectProvider(provider: RevAISTT, jobId = 'job_123'): Promise<void> {
  const promise = provider.connect();
  await flush();
  receive({ type: 'connected', id: jobId });
  await promise;
}

/** Parse the URL passed to the WebSocketManager constructor. */
function getConnectionUrl(): URL {
  const wsOptions = MockWebSocketManager.mock.calls[0]![0];
  return new URL(wsOptions.url);
}

describe('RevAISTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWsManager.connect.mockResolvedValue(undefined);
    mockWsManager.disconnect.mockResolvedValue(undefined);
    mockWsManager.isConnected.mockReturnValue(true);
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.layout).toBe('interleaved');
      expect(provider.config.sampleRate).toBe(16000);
      expect(provider.config.audioFormat).toBe('S16LE');
      expect(provider.config.numChannels).toBe(1);
      expect(provider.config.interimResults).toBe(true);
    });

    it('should initialize with proxyUrl', async () => {
      const provider = new RevAISTT({ proxyUrl: 'http://localhost:3001/api/proxy/revai' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize with custom configuration', async () => {
      const provider = new RevAISTT(
        {
          apiKey: 'test-key',
          sampleRate: 8000,
          language: 'es',
          maxSegmentDurationSeconds: 10,
        },
        logger
      );

      await provider.initialize();

      expect(provider.config.sampleRate).toBe(8000);
      expect(provider.config.language).toBe('es');
      expect(provider.config.maxSegmentDurationSeconds).toBe(10);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new RevAISTT({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should not be ready after dispose', async () => {
      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Connection', () => {
    it('should connect with access_token and content_type on the URL in direct mode', async () => {
      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      expect(provider.isWebSocketConnected()).toBe(true);

      const url = getConnectionUrl();
      expect(url.toString().startsWith('wss://api.rev.ai/speechtotext/v1/stream?')).toBe(true);
      expect(url.searchParams.get('access_token')).toBe('test-key');
      expect(url.searchParams.get('content_type')).toBe(
        'audio/x-raw;layout=interleaved;rate=16000;format=S16LE;channels=1'
      );
    });

    it('should not resolve connect() before the "connected" message arrives', async () => {
      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      let resolved = false;
      const promise = provider.connect().then(() => {
        resolved = true;
      });
      await flush();

      expect(resolved).toBe(false);
      expect(provider.isWebSocketConnected()).toBe(false);

      receive({ type: 'connected', id: 'job_1' });
      await promise;

      expect(resolved).toBe(true);
      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should resolve apiKey factory functions', async () => {
      const provider = new RevAISTT({ apiKey: async () => 'temp-token-123' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      expect(getConnectionUrl().searchParams.get('access_token')).toBe('temp-token-123');
    });

    it('should omit access_token and use the proxy URL in proxy mode', async () => {
      const provider = new RevAISTT({ proxyUrl: 'http://localhost:3001/api/proxy/revai' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      const url = getConnectionUrl();
      expect(
        url
          .toString()
          .startsWith('ws://localhost:3001/api/proxy/revai/speechtotext/v1/stream?')
      ).toBe(true);
      expect(url.searchParams.get('access_token')).toBeNull();
      expect(url.searchParams.get('content_type')).toBe(
        'audio/x-raw;layout=interleaved;rate=16000;format=S16LE;channels=1'
      );
    });

    it('should append optional session options as snake_case query parameters', async () => {
      const provider = new RevAISTT(
        {
          apiKey: 'test-key',
          language: 'es',
          metadata: 'my-session',
          filterProfanity: true,
          removeDisfluencies: true,
          detailedPartials: true,
          maxSegmentDurationSeconds: 10,
          transcriber: 'machine_v2',
          enableSpeakerSwitch: true,
          skipPostprocessing: true,
          priority: 'accuracy',
          maxConnectionWaitSeconds: 120,
        },
        logger
      );
      await provider.initialize();
      await connectProvider(provider);

      const params = getConnectionUrl().searchParams;
      expect(params.get('language')).toBe('es');
      expect(params.get('metadata')).toBe('my-session');
      expect(params.get('filter_profanity')).toBe('true');
      expect(params.get('remove_disfluencies')).toBe('true');
      expect(params.get('detailed_partials')).toBe('true');
      expect(params.get('max_segment_duration_seconds')).toBe('10');
      expect(params.get('transcriber')).toBe('machine_v2');
      expect(params.get('enable_speaker_switch')).toBe('true');
      expect(params.get('skip_postprocessing')).toBe('true');
      expect(params.get('priority')).toBe('accuracy');
      expect(params.get('max_connection_wait_seconds')).toBe('120');
    });

    it('should omit unset optional query parameters', async () => {
      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      const params = getConnectionUrl().searchParams;
      expect(Array.from(params.keys()).sort()).toEqual(['access_token', 'content_type']);
    });

    it('should use a custom contentType verbatim', async () => {
      const provider = new RevAISTT({ apiKey: 'test-key', contentType: 'audio/x-flac' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      expect(getConnectionUrl().searchParams.get('content_type')).toBe('audio/x-flac');
    });

    it('should throw ProviderConnectionError when the connection fails', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('boom'));

      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should reject connect() when the socket closes during the handshake', async () => {
      const provider = new RevAISTT({ apiKey: 'bad-key' }, logger);
      await provider.initialize();

      const promise = provider.connect();
      await flush();
      close(4001, 'Unauthorized');

      await expect(promise).rejects.toThrow(ProviderConnectionError);
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should reject connect() when the "connected" message never arrives', async () => {
      jest.useFakeTimers();
      try {
        const provider = new RevAISTT({ apiKey: 'test-key', timeout: 5000 }, logger);
        await provider.initialize();

        const promise = provider.connect();
        // Attach the rejection expectation before advancing timers so the
        // rejection is never unhandled.
        const expectation = expect(promise).rejects.toThrow(ProviderConnectionError);
        await flush();
        jest.advanceTimersByTime(5000);

        await expectation;
        expect(provider.isWebSocketConnected()).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should throw when connecting before initialization', async () => {
      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);

      await expect(provider.connect()).rejects.toThrow();
    });
  });

  describe('Message handling', () => {
    let provider: RevAISTT;
    let results: TranscriptionResult[];

    beforeEach(async () => {
      provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      results = [];
      provider.onTranscription((result) => results.push(result));
      await connectProvider(provider);
    });

    it('should emit interim results for partial hypotheses, joining words with spaces', () => {
      receive({
        type: 'partial',
        ts: 0.0,
        end_ts: 1.5,
        elements: [
          { type: 'text', value: 'hello' },
          { type: 'text', value: 'world' },
        ],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: 'hello world',
        isFinal: false,
        metadata: { ts: 0.0, endTs: 1.5 },
      });
    });

    it('should emit a complete utterance for final hypotheses, concatenating punct elements', () => {
      receive({
        type: 'final',
        ts: 0.25,
        end_ts: 2.05,
        elements: [
          { type: 'text', value: 'Hello', ts: 0.25, end_ts: 0.75, confidence: 1.0 },
          { type: 'punct', value: ' ' },
          { type: 'text', value: 'world', ts: 1.25, end_ts: 2.05, confidence: 0.8 },
          { type: 'punct', value: '.' },
        ],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: 'Hello world.',
        isFinal: true,
        speechFinal: true,
        utteranceComplete: true,
      });
      expect(results[0]?.confidence).toBeCloseTo(0.9);
      expect(results[0]?.metadata).toMatchObject({
        ts: 0.25,
        endTs: 2.05,
        jobId: 'job_123',
      });
      expect(results[0]?.metadata?.elements).toHaveLength(4);
    });

    it('should emit each final hypothesis as its own utterance', () => {
      receive({
        type: 'final',
        elements: [
          { type: 'text', value: 'First', confidence: 1.0 },
          { type: 'punct', value: '.' },
        ],
      });
      receive({
        type: 'partial',
        elements: [{ type: 'text', value: 'second' }],
      });
      receive({
        type: 'final',
        elements: [
          { type: 'text', value: 'Second', confidence: 1.0 },
          { type: 'punct', value: '.' },
        ],
      });

      const finals = results.filter((r) => r.isFinal);
      expect(finals.map((r) => r.text)).toEqual(['First.', 'Second.']);
      expect(finals.every((r) => r.utteranceComplete)).toBe(true);
    });

    it('should omit confidence when no element carries one', () => {
      receive({
        type: 'final',
        elements: [
          { type: 'text', value: 'Hi' },
          { type: 'punct', value: '.' },
        ],
      });

      expect(results[0]?.confidence).toBeUndefined();
    });

    it('should not emit empty hypotheses', () => {
      receive({ type: 'partial', elements: [] });
      receive({ type: 'final', elements: [] });

      expect(results).toHaveLength(0);
    });

    it('should not emit interim results when interimResults is false', () => {
      receive({ type: 'partial', elements: [{ type: 'text', value: 'quiet' }] });
      expect(results).toHaveLength(1); // interimResults defaults to true

      results.length = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider.config as any).interimResults = false;
      receive({ type: 'partial', elements: [{ type: 'text', value: 'still quiet' }] });
      expect(results).toHaveLength(0);
    });

    it('should emit an error result when Rev AI closes with an error code', () => {
      close(4013, 'Timeout');

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: 'Connection timed out waiting for an available worker',
          closeCode: 4013,
          closeReason: 'Timeout',
        },
      });
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should not emit an error result on a normal close', () => {
      close(1000, 'Normal closure');

      expect(results).toHaveLength(0);
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should ignore non-string messages', () => {
      getMessageHandler()({ data: new ArrayBuffer(4) } as MessageEvent);
      expect(results).toHaveLength(0);
    });

    it('should survive malformed JSON messages', () => {
      expect(() => getMessageHandler()({ data: 'not-json{' } as MessageEvent)).not.toThrow();
      expect(results).toHaveLength(0);
    });
  });

  describe('Audio streaming', () => {
    it('should forward audio chunks as binary frames', async () => {
      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await connectProvider(provider);
      mockWsManager.send.mockClear();

      const chunk = new ArrayBuffer(8);
      provider.sendAudio(chunk);

      expect(mockWsManager.send).toHaveBeenCalledWith(chunk);
    });

    it('should drop audio when not connected', async () => {
      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      provider.sendAudio(new ArrayBuffer(8));

      expect(mockWsManager.send).not.toHaveBeenCalled();
    });
  });

  describe('Disconnect', () => {
    it('should send the EOS text frame and disconnect', async () => {
      mockWsManager.isConnected.mockReturnValue(false);

      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await connectProvider(provider);
      mockWsManager.send.mockClear();

      await provider.disconnect();

      expect(mockWsManager.send).toHaveBeenCalledWith('EOS');
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should complete disconnect as soon as the server closes the socket', async () => {
      jest.useFakeTimers();
      try {
        const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
        await provider.initialize();

        const connectPromise = provider.connect();
        await flush();
        receive({ type: 'connected', id: 'job_1' });
        await connectPromise;

        const disconnectPromise = provider.disconnect();
        close(1000, 'EOS received');

        // Resolves via the close signal — no timer advance needed. If the
        // resolver were broken, this await would hang on the 3s fallback.
        await disconnectPromise;

        expect(mockWsManager.disconnect).toHaveBeenCalled();
        expect(provider.isWebSocketConnected()).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should warn and return when not connected', async () => {
      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.disconnect()).resolves.toBeUndefined();
      expect(mockWsManager.disconnect).not.toHaveBeenCalled();
    });

    it('should dispose cleanly even when disconnect fails', async () => {
      mockWsManager.isConnected.mockReturnValue(false);
      mockWsManager.disconnect.mockRejectedValueOnce(new Error('close failed'));

      const provider = new RevAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(provider.isReady()).toBe(false);
    });
  });
});
