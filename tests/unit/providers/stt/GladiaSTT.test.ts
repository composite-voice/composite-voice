/**
 * Tests for GladiaSTT provider
 *
 * Tests the GladiaSTT provider which uses native `fetch` (via HttpClient)
 * for session initiation and a raw WebSocket for audio streaming.
 */

// Polyfill AbortSignal.timeout and AbortSignal.any (not available in jsdom)
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return controller.signal;
  };
}
if (typeof AbortSignal.any !== 'function') {
  AbortSignal.any = (signals: AbortSignal[]): AbortSignal => {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
  };
}

import { GladiaSTT } from '../../../../src/providers/stt/gladia/GladiaSTT';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';
import type { TranscriptionResult } from '../../../../src/core/types/providers';

// --- Global fetch mock (session-init POST) ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

const SESSION_ID = '636c70f6-92c1-4026-a8b6-0dfe3ecf826f';
const SESSION_URL = `wss://api.gladia.io/v2/live?token=${SESSION_ID}`;

/** Create a mock Response-like object matching Gladia's init response. */
function createInitResponse(overrides: Record<string, unknown> = {}): Partial<Response> {
  const data = {
    id: SESSION_ID,
    created_at: '2026-07-13T10:00:00Z',
    url: SESSION_URL,
    ...overrides,
  };
  const text = JSON.stringify(data);
  return {
    ok: true,
    status: 201,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => text,
    json: async () => data,
  };
}

// --- WebSocketManager mock ---

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

/** Simulate an incoming Gladia JSON message. */
function receive(message: unknown): void {
  getMessageHandler()({ data: JSON.stringify(message) } as MessageEvent);
}

/** Extract the body of the last session-init fetch call. */
function lastInitBody(): Record<string, unknown> {
  const [, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return JSON.parse(init.body as string);
}

describe('GladiaSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWsManager.isConnected.mockReturnValue(true);
    mockFetch.mockResolvedValue(createInitResponse());
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.model).toBe('solaria-1');
      expect(provider.config.encoding).toBe('wav/pcm');
      expect(provider.config.sampleRate).toBe(16000);
      expect(provider.config.bitDepth).toBe(16);
      expect(provider.config.channels).toBe(1);
    });

    it('should initialize with proxyUrl', async () => {
      const provider = new GladiaSTT({ proxyUrl: 'http://localhost:3001/api/proxy/gladia' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize with custom configuration', async () => {
      const provider = new GladiaSTT(
        {
          apiKey: 'test-key',
          sampleRate: 44100,
          languages: ['en', 'es'],
          codeSwitching: true,
          endpointing: 0.3,
        },
        logger
      );

      await provider.initialize();

      expect(provider.config.sampleRate).toBe(44100);
      expect(provider.config.languages).toEqual(['en', 'es']);
      expect(provider.config.codeSwitching).toBe(true);
      expect(provider.config.endpointing).toBe(0.3);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new GladiaSTT({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should not be ready after dispose', async () => {
      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Connection', () => {
    it('should POST the session config with x-gladia-key in direct mode', async () => {
      const provider = new GladiaSTT({ apiKey: 'test-key', languages: ['en'] }, logger);
      await provider.initialize();
      await provider.connect();

      expect(provider.isWebSocketConnected()).toBe(true);
      expect(provider.getSessionId()).toBe(SESSION_ID);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.gladia.io/v2/live');
      expect(init.method).toBe('POST');
      expect(init.headers['x-gladia-key']).toBe('test-key');

      expect(lastInitBody()).toEqual({
        encoding: 'wav/pcm',
        sample_rate: 16000,
        bit_depth: 16,
        channels: 1,
        model: 'solaria-1',
        language_config: { languages: ['en'] },
        messages_config: {
          receive_partial_transcripts: true,
          receive_final_transcripts: true,
        },
      });
    });

    it('should connect the WebSocket to the URL returned by the init call', async () => {
      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe(SESSION_URL);
      expect(mockWsManager.connect).toHaveBeenCalled();
      // Session config went in the init POST — no start message over the socket
      expect(mockWsManager.send).not.toHaveBeenCalled();
    });

    it('should resolve apiKey factory functions', async () => {
      const provider = new GladiaSTT({ apiKey: async () => 'temp-key-123' }, logger);
      await provider.initialize();
      await provider.connect();

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['x-gladia-key']).toBe('temp-key-123');
    });

    it('should omit the key and POST via the proxy in proxy mode', async () => {
      const provider = new GladiaSTT({ proxyUrl: 'http://localhost:3001/api/proxy/gladia' }, logger);
      await provider.initialize();
      await provider.connect();

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/gladia/v2/live');
      expect(init.headers['x-gladia-key']).toBeUndefined();

      // The WebSocket still connects straight to the Gladia-returned URL
      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe(SESSION_URL);
    });

    it('should pass endpointing, region, and language options to the init call', async () => {
      const provider = new GladiaSTT(
        {
          apiKey: 'test-key',
          region: 'eu-west',
          endpointing: 0.5,
          maximumDurationWithoutEndpointing: 10,
          languages: ['en', 'fr'],
          codeSwitching: true,
          customMetadata: { user: 'test' },
        },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.gladia.io/v2/live?region=eu-west');

      const body = lastInitBody();
      expect(body.endpointing).toBe(0.5);
      expect(body.maximum_duration_without_endpointing).toBe(10);
      expect(body.language_config).toEqual({ languages: ['en', 'fr'], code_switching: true });
      expect(body.custom_metadata).toEqual({ user: 'test' });
    });

    it('should fall back to language for the language config', async () => {
      const provider = new GladiaSTT({ apiKey: 'test-key', language: 'de' }, logger);
      await provider.initialize();
      await provider.connect();

      expect(lastInitBody().language_config).toEqual({ languages: ['de'] });
    });

    it('should disable partial transcripts when interimResults is false', async () => {
      const provider = new GladiaSTT({ apiKey: 'test-key', interimResults: false }, logger);
      await provider.initialize();
      await provider.connect();

      expect(lastInitBody().messages_config).toEqual({
        receive_partial_transcripts: false,
        receive_final_transcripts: true,
      });
    });

    it('should throw ProviderConnectionError when the init call fails', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        text: async () => JSON.stringify({ message: 'Invalid API key' }),
      });

      const provider = new GladiaSTT({ apiKey: 'bad-key' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
      expect(provider.getSessionId()).toBeNull();
    });

    it('should throw when the init response has no WebSocket URL', async () => {
      mockFetch.mockResolvedValueOnce(createInitResponse({ url: undefined }));

      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
    });

    it('should close the socket when the WebSocket connection fails', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('boom'));

      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should throw when connecting before initialization', async () => {
      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);

      await expect(provider.connect()).rejects.toThrow();
    });
  });

  describe('Message handling', () => {
    let provider: GladiaSTT;
    let results: TranscriptionResult[];

    beforeEach(async () => {
      provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      results = [];
      provider.onTranscription((result) => results.push(result));
      await provider.connect();
    });

    it('should emit interim results for partial transcripts', () => {
      receive({
        session_id: SESSION_ID,
        created_at: '2026-07-13T10:00:01Z',
        type: 'transcript',
        data: {
          id: '00_00000001',
          is_final: false,
          utterance: {
            text: 'hello wor',
            start: 0.188,
            end: 1.2,
            language: 'en',
            channel: 0,
          },
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: 'hello wor',
        isFinal: false,
        metadata: { utteranceId: '00_00000001', language: 'en' },
      });
    });

    it('should emit a complete utterance for final transcripts', () => {
      receive({
        session_id: SESSION_ID,
        created_at: '2026-07-13T10:00:03Z',
        type: 'transcript',
        data: {
          id: '00_00000001',
          is_final: true,
          utterance: {
            text: 'Hello world.',
            start: 0.188,
            end: 2.852,
            confidence: 0.91,
            language: 'en',
            channel: 0,
            words: [
              { word: 'Hello', start: 0.188, end: 0.35, confidence: 0.91 },
              { word: 'world.', start: 0.4, end: 2.852, confidence: 0.91 },
            ],
          },
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: 'Hello world.',
        isFinal: true,
        speechFinal: true,
        utteranceComplete: true,
        confidence: 0.91,
        metadata: {
          utteranceId: '00_00000001',
          language: 'en',
          channel: 0,
          start: 0.188,
          end: 2.852,
        },
      });
      expect(results[0]?.metadata?.words).toHaveLength(2);
    });

    it('should emit one complete utterance per final transcript', () => {
      receive({
        type: 'transcript',
        data: { id: '00_00000001', is_final: true, utterance: { text: 'First' } },
      });
      receive({
        type: 'transcript',
        data: { id: '00_00000002', is_final: true, utterance: { text: 'Second' } },
      });

      const finals = results.filter((r) => r.isFinal);
      expect(finals.map((r) => r.text)).toEqual(['First', 'Second']);
      expect(finals.every((r) => r.utteranceComplete)).toBe(true);
    });

    it('should ignore transcripts with empty text', () => {
      receive({
        type: 'transcript',
        data: { id: '00_00000001', is_final: true, utterance: { text: '   ' } },
      });

      expect(results).toHaveLength(0);
    });

    it('should not emit interim results when interimResults is false', () => {
      receive({
        type: 'transcript',
        data: { id: '00_00000001', is_final: false, utterance: { text: 'quiet' } },
      });
      expect(results).toHaveLength(1); // interimResults defaults to true

      results.length = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider.config as any).interimResults = false;
      receive({
        type: 'transcript',
        data: { id: '00_00000002', is_final: false, utterance: { text: 'still quiet' } },
      });
      expect(results).toHaveLength(0);
    });

    it('should emit an error result when a message carries an error', () => {
      receive({
        session_id: SESSION_ID,
        type: 'transcript',
        error: {
          status_code: 400,
          exception: 'InvalidArgument',
          message: 'Unsupported sample rate',
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: 'Unsupported sample rate',
          errorCode: 400,
          errorType: 'InvalidArgument',
        },
      });
    });

    it('should ignore speech and lifecycle events', () => {
      receive({ type: 'speech_start', data: { time: 1.24, channel: 0 } });
      receive({ type: 'speech_end', data: { time: 3.1, channel: 0 } });
      receive({ type: 'start_session', data: {} });

      expect(results).toHaveLength(0);
    });

    it('should ignore non-string messages', () => {
      getMessageHandler()({ data: new ArrayBuffer(4) } as MessageEvent);
      expect(results).toHaveLength(0);
    });
  });

  describe('Audio streaming', () => {
    it('should forward audio chunks as binary frames', async () => {
      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      const chunk = new ArrayBuffer(8);
      provider.sendAudio(chunk);

      expect(mockWsManager.send).toHaveBeenCalledWith(chunk);
    });

    it('should drop audio when not connected', async () => {
      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      provider.sendAudio(new ArrayBuffer(8));

      expect(mockWsManager.send).not.toHaveBeenCalled();
    });
  });

  describe('Stop recording and disconnect', () => {
    it('should send a stop_recording control message', async () => {
      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      provider.stopRecording();

      expect(mockWsManager.send).toHaveBeenCalledWith(JSON.stringify({ type: 'stop_recording' }));
    });

    it('should send stop_recording and disconnect', async () => {
      mockWsManager.isConnected.mockReturnValue(false);

      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      await provider.disconnect();

      const [stopMessage] = mockWsManager.send.mock.calls[0];
      expect(stopMessage).toBe(JSON.stringify({ type: 'stop_recording' }));
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
      expect(provider.getSessionId()).toBeNull();
    });

    it('should complete disconnect as soon as post_final_transcript arrives', async () => {
      jest.useFakeTimers();
      try {
        const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
        await provider.initialize();
        await provider.connect();

        const disconnectPromise = provider.disconnect();
        receive({
          type: 'post_final_transcript',
          data: { transcription: { full_transcript: 'hello world' } },
        });

        // Resolves via the post_final_transcript signal — no timer advance
        // needed. If the resolver were broken, this await would hang on the
        // 1s fallback.
        await disconnectPromise;

        expect(mockWsManager.disconnect).toHaveBeenCalled();
        expect(provider.isWebSocketConnected()).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should dispose cleanly even when disconnect fails', async () => {
      mockWsManager.isConnected.mockReturnValue(false);
      mockWsManager.disconnect.mockRejectedValueOnce(new Error('close failed'));

      const provider = new GladiaSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(provider.isReady()).toBe(false);
    });
  });
});
