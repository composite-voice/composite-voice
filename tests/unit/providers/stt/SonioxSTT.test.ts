/**
 * Tests for SonioxSTT provider
 */

import { SonioxSTT } from '../../../../src/providers/stt/soniox/SonioxSTT';
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

/** Simulate an incoming Soniox JSON message. */
function receive(message: unknown): void {
  getMessageHandler()({ data: JSON.stringify(message) } as MessageEvent);
}

describe('SonioxSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.model).toBe('stt-rt-v5');
      expect(provider.config.audioFormat).toBe('pcm_s16le');
      expect(provider.config.sampleRate).toBe(16000);
      expect(provider.config.numChannels).toBe(1);
      expect(provider.config.enableEndpointDetection).toBe(true);
    });

    it('should initialize with proxyUrl', async () => {
      const provider = new SonioxSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/soniox' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize with custom configuration', async () => {
      const provider = new SonioxSTT(
        {
          apiKey: 'test-key',
          model: 'stt-rt-v5',
          sampleRate: 44100,
          languageHints: ['en', 'es'],
          enableSpeakerDiarization: true,
        },
        logger
      );

      await provider.initialize();

      expect(provider.config.sampleRate).toBe(44100);
      expect(provider.config.languageHints).toEqual(['en', 'es']);
      expect(provider.config.enableSpeakerDiarization).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new SonioxSTT({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should not be ready after dispose', async () => {
      const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Connection', () => {
    it('should connect and send the start message with api_key in direct mode', async () => {
      const provider = new SonioxSTT({ apiKey: 'test-key', languageHints: ['en'] }, logger);
      await provider.initialize();
      await provider.connect();

      expect(provider.isWebSocketConnected()).toBe(true);

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe('wss://stt-rt.soniox.com/transcribe-websocket');

      expect(mockWsManager.send).toHaveBeenCalledTimes(1);
      const startMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(startMessage).toEqual({
        api_key: 'test-key',
        model: 'stt-rt-v5',
        audio_format: 'pcm_s16le',
        sample_rate: 16000,
        num_channels: 1,
        language_hints: ['en'],
        enable_endpoint_detection: true,
      });
    });

    it('should resolve apiKey factory functions for temporary keys', async () => {
      const provider = new SonioxSTT({ apiKey: async () => 'temp-key-123' }, logger);
      await provider.initialize();
      await provider.connect();

      const startMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(startMessage.api_key).toBe('temp-key-123');
    });

    it('should omit api_key and use the proxy URL in proxy mode', async () => {
      const provider = new SonioxSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/soniox' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe('ws://localhost:3001/api/proxy/soniox/transcribe-websocket');

      const startMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(startMessage.api_key).toBeUndefined();
    });

    it('should omit sample_rate and num_channels for auto format', async () => {
      const provider = new SonioxSTT({ apiKey: 'test-key', audioFormat: 'auto' }, logger);
      await provider.initialize();
      await provider.connect();

      const startMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(startMessage.audio_format).toBe('auto');
      expect(startMessage.sample_rate).toBeUndefined();
      expect(startMessage.num_channels).toBeUndefined();
    });

    it('should fall back to language as a language hint', async () => {
      const provider = new SonioxSTT({ apiKey: 'test-key', language: 'de' }, logger);
      await provider.initialize();
      await provider.connect();

      const startMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(startMessage.language_hints).toEqual(['de']);
    });

    it('should throw ProviderConnectionError when the connection fails', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('boom'));

      const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should close the socket when sending the start message fails', async () => {
      mockWsManager.send.mockImplementationOnce(() => {
        throw new Error('send failed');
      });

      const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should throw when connecting before initialization', async () => {
      const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);

      await expect(provider.connect()).rejects.toThrow();
    });
  });

  describe('Message handling', () => {
    let provider: SonioxSTT;
    let results: TranscriptionResult[];

    beforeEach(async () => {
      provider = new SonioxSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      results = [];
      provider.onTranscription((result) => results.push(result));
      await provider.connect();
    });

    it('should emit interim results for non-final tokens', () => {
      receive({
        tokens: [
          { text: 'Hello', is_final: false, confidence: 0.9 },
          { text: ' world', is_final: false, confidence: 0.8 },
        ],
        total_audio_proc_ms: 100,
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: 'Hello world',
        isFinal: false,
      });
    });

    it('should accumulate final tokens across messages into interim results', () => {
      receive({ tokens: [{ text: 'Hello', is_final: true, confidence: 1 }] });
      receive({ tokens: [{ text: ' world', is_final: false, confidence: 0.5 }] });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ text: 'Hello', isFinal: false });
      expect(results[1]).toMatchObject({ text: 'Hello world', isFinal: false });
    });

    it('should emit a final utterance when the <end> token arrives', () => {
      receive({ tokens: [{ text: 'Hello', is_final: true, confidence: 0.9 }] });
      receive({
        tokens: [
          { text: ' world', is_final: true, confidence: 0.7 },
          { text: '<end>', is_final: true },
        ],
        final_audio_proc_ms: 500,
      });

      const final = results[results.length - 1];
      expect(final).toMatchObject({
        text: 'Hello world',
        isFinal: true,
        speechFinal: true,
        utteranceComplete: true,
      });
      expect(final?.confidence).toBeCloseTo(0.8);
    });

    it('should reset accumulation after an endpoint', () => {
      receive({
        tokens: [
          { text: 'First', is_final: true },
          { text: '<end>', is_final: true },
        ],
      });
      receive({
        tokens: [
          { text: 'Second', is_final: true },
          { text: '<end>', is_final: true },
        ],
      });

      const finals = results.filter((r) => r.isFinal);
      expect(finals.map((r) => r.text)).toEqual(['First', 'Second']);
    });

    it('should emit remaining text as final when the stream finishes', () => {
      receive({ tokens: [{ text: 'Goodbye', is_final: true }] });
      receive({ tokens: [], finished: true });

      const final = results[results.length - 1];
      expect(final).toMatchObject({
        text: 'Goodbye',
        isFinal: true,
        utteranceComplete: true,
      });
    });

    it('should not emit interim results when interimResults is false', () => {
      receive({ tokens: [{ text: 'quiet', is_final: false }] });
      expect(results).toHaveLength(1); // interimResults defaults to true

      results.length = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider.config as any).interimResults = false;
      receive({ tokens: [{ text: ' still quiet', is_final: false }] });
      expect(results).toHaveLength(0);
    });

    it('should emit an error result on error messages', () => {
      receive({
        tokens: [],
        error_code: 401,
        error_type: 'unauthorized',
        error_message: 'Invalid API key',
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: 'Invalid API key',
          errorCode: 401,
          errorType: 'unauthorized',
        },
      });
    });

    it('should ignore non-string messages', () => {
      getMessageHandler()({ data: new ArrayBuffer(4) } as MessageEvent);
      expect(results).toHaveLength(0);
    });

    it('should expose confirmed tokens with speaker and language in final metadata', () => {
      receive({
        tokens: [
          { text: 'Hola', is_final: true, start_ms: 0, end_ms: 400, speaker: '1', language: 'es' },
          { text: '<end>', is_final: true },
        ],
      });

      const final = results[results.length - 1];
      expect(final?.metadata?.tokens).toEqual([
        { text: 'Hola', is_final: true, start_ms: 0, end_ms: 400, speaker: '1', language: 'es' },
      ]);

      // Tokens must not leak into the next utterance
      receive({
        tokens: [
          { text: 'Bye', is_final: true },
          { text: '<end>', is_final: true },
        ],
      });
      const next = results[results.length - 1];
      expect(next?.metadata?.tokens).toEqual([{ text: 'Bye', is_final: true }]);
    });
  });

  describe('Audio streaming', () => {
    it('should forward audio chunks as binary frames', async () => {
      const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      const chunk = new ArrayBuffer(8);
      provider.sendAudio(chunk);

      expect(mockWsManager.send).toHaveBeenCalledWith(chunk);
    });

    it('should drop audio when not connected', async () => {
      const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      provider.sendAudio(new ArrayBuffer(8));

      expect(mockWsManager.send).not.toHaveBeenCalled();
    });
  });

  describe('Finalize and disconnect', () => {
    it('should send a finalize control message', async () => {
      const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      provider.finalize();

      expect(mockWsManager.send).toHaveBeenCalledWith(JSON.stringify({ type: 'finalize' }));
    });

    it('should send an empty end-of-stream frame and disconnect', async () => {
      mockWsManager.isConnected.mockReturnValue(false);

      const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      await provider.disconnect();

      const [endFrame] = mockWsManager.send.mock.calls[0];
      expect(endFrame).toBeInstanceOf(ArrayBuffer);
      expect((endFrame as ArrayBuffer).byteLength).toBe(0);
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should complete disconnect as soon as the finished message arrives', async () => {
      jest.useFakeTimers();
      try {
        const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);
        await provider.initialize();
        await provider.connect();

        const disconnectPromise = provider.disconnect();
        receive({ tokens: [], finished: true });

        // Resolves via the finished signal — no timer advance needed. If the
        // resolver were broken, this await would hang on the 1s fallback.
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

      const provider = new SonioxSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(provider.isReady()).toBe(false);
    });
  });
});
