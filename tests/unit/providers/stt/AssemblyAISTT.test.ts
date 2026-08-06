/**
 * Tests for AssemblyAISTT provider
 */

import { AssemblyAISTT } from '../../../../src/providers/stt/assemblyai/AssemblyAISTT';
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

describe('AssemblyAISTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with apiKey configuration', async () => {
      const provider = new AssemblyAISTT(
        {
          apiKey: 'test-key',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.sampleRate).toBe(16000);
      expect(provider.config.language).toBe('en');
    });

    it('should initialize with proxyUrl configuration', async () => {
      const provider = new AssemblyAISTT(
        {
          proxyUrl: 'http://localhost:3000/api/proxy/assemblyai',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize with custom configuration', async () => {
      const provider = new AssemblyAISTT(
        {
          apiKey: 'test-key',
          sampleRate: 44100,
          language: 'es',
          wordBoost: ['hello', 'world'],
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.config.sampleRate).toBe(44100);
      expect(provider.config.language).toBe('es');
      expect(provider.config.wordBoost).toEqual(['hello', 'world']);
    });

    it('should throw error if neither apiKey nor proxyUrl is provided', async () => {
      const provider = new AssemblyAISTT({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should dispose properly', async () => {
      const provider = new AssemblyAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('WebSocket Connection', () => {
    let provider: AssemblyAISTT;
    let transcriptionCallback: jest.Mock;

    beforeEach(async () => {
      provider = new AssemblyAISTT(
        {
          apiKey: 'test-key',
          sampleRate: 16000,
          language: 'en',
        },
        logger
      );
      await provider.initialize();

      transcriptionCallback = jest.fn();
      provider.onTranscription(transcriptionCallback);
    });

    afterEach(async () => {
      await provider.dispose();
    });

    it('should connect successfully', async () => {
      await provider.connect();

      expect(provider.isWebSocketConnected()).toBe(true);
      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('wss://api.assemblyai.com/v2/realtime/ws'),
        })
      );
      expect(mockWsManager.setHandlers).toHaveBeenCalled();
      expect(mockWsManager.connect).toHaveBeenCalled();
    });

    it('should build correct WebSocket URL with sample rate and token', async () => {
      await provider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('sample_rate=16000'),
        })
      );
      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('token=test-key'),
        })
      );
    });

    it('should include word_boost in URL when configured', async () => {
      const boostProvider = new AssemblyAISTT(
        {
          apiKey: 'test-key',
          wordBoost: ['hello', 'world'],
        },
        logger
      );
      await boostProvider.initialize();
      await boostProvider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('word_boost='),
        })
      );

      await boostProvider.dispose();
    });

    it('should use proxy URL when configured', async () => {
      const proxyProvider = new AssemblyAISTT(
        {
          proxyUrl: 'http://localhost:3000/api/proxy/assemblyai',
        },
        logger
      );
      await proxyProvider.initialize();
      await proxyProvider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'ws://localhost:3000/api/proxy/assemblyai',
        })
      );

      await proxyProvider.dispose();
    });

    it('should disable auto-reconnection so a lost socket surfaces immediately', async () => {
      // Background retries silently dropped audio for the length of the
      // backoff; the session must fail fast instead so the SDK (or a
      // FallbackSTT chain, which buffers audio) can recover without loss.
      await provider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          reconnection: expect.objectContaining({ enabled: false }),
        })
      );
    });

    it('should emit a ws_closed error result when the connection is lost', async () => {
      const results: TranscriptionResult[] = [];
      provider.onTranscription((result) => results.push(result));
      await provider.connect();

      const handlers = mockWsManager.setHandlers.mock.calls.at(-1)![0];
      handlers.onConnectionLost(new Error('Connection closed unexpectedly (code 1011)'));

      expect(provider.isWebSocketConnected()).toBe(false);
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: '',
        isFinal: true,
        metadata: expect.objectContaining({ error: 'ws_closed' }),
      });
    });

    it('should mark an intentional close as expected before ending the stream', async () => {
      await provider.connect();
      mockWsManager.expectClose.mockClear();

      const disconnecting = provider.disconnect();
      jest.advanceTimersByTime(1000);
      await disconnecting;

      // Guards the window between terminate_session and wsManager.disconnect(),
      // where the server usually closes first — that close is not a failure.
      expect(mockWsManager.expectClose).toHaveBeenCalled();
    });

    it('should not connect when already connected', async () => {
      await provider.connect();
      MockWebSocketManager.mockClear();
      mockWsManager.connect.mockClear();

      await provider.connect(); // Second call

      expect(MockWebSocketManager).not.toHaveBeenCalled();
      expect(mockWsManager.connect).not.toHaveBeenCalled();
    });

    it('should throw error when not initialized', async () => {
      const uninitProvider = new AssemblyAISTT({ apiKey: 'test-key' }, logger);

      await expect(uninitProvider.connect()).rejects.toThrow();
    });

    it('should handle connection failure', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
    });
  });

  describe('Audio Sending', () => {
    let provider: AssemblyAISTT;

    beforeEach(async () => {
      provider = new AssemblyAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
    });

    afterEach(async () => {
      await provider.dispose();
    });

    it('should send audio as base64-encoded JSON', () => {
      const audioChunk = new ArrayBuffer(4);
      const view = new Uint8Array(audioChunk);
      view[0] = 65; // 'A'
      view[1] = 66; // 'B'
      view[2] = 67; // 'C'
      view[3] = 68; // 'D'

      provider.processAudio(audioChunk);

      expect(mockWsManager.send).toHaveBeenCalledWith(JSON.stringify({ audio_data: btoa('ABCD') }));
    });

    it('should send multiple audio chunks', () => {
      const chunks = [new ArrayBuffer(512), new ArrayBuffer(512), new ArrayBuffer(512)];

      chunks.forEach((chunk) => provider.processAudio(chunk));

      expect(mockWsManager.send).toHaveBeenCalledTimes(3);
    });

    it('should not send audio when not connected', async () => {
      const disconnectedProvider = new AssemblyAISTT({ apiKey: 'test-key' }, logger);
      await disconnectedProvider.initialize();

      const audioChunk = new ArrayBuffer(1024);
      disconnectedProvider.processAudio(audioChunk);

      // send should not have been called for the disconnected provider
      // (mockWsManager.send may have been called during connect setup)
      const sendCallsBefore = mockWsManager.send.mock.calls.length;
      disconnectedProvider.processAudio(audioChunk);
      expect(mockWsManager.send.mock.calls.length).toBe(sendCallsBefore);

      await disconnectedProvider.dispose();
    });

    it('should handle send errors gracefully', () => {
      mockWsManager.send.mockImplementationOnce(() => {
        throw new Error('Send failed');
      });

      const audioChunk = new ArrayBuffer(1024);
      // Should not throw
      expect(() => provider.processAudio(audioChunk)).not.toThrow();
    });
  });

  describe('Transcript Processing', () => {
    let provider: AssemblyAISTT;
    let transcriptionCallback: jest.Mock;
    let messageHandler: (event: MessageEvent) => void;

    beforeEach(async () => {
      provider = new AssemblyAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      transcriptionCallback = jest.fn();
      provider.onTranscription(transcriptionCallback);

      // Capture the message handler from setHandlers
      mockWsManager.setHandlers.mockImplementation(
        (handlers: { onMessage?: (event: MessageEvent) => void }) => {
          if (handlers.onMessage) {
            messageHandler = handlers.onMessage;
          }
        }
      );

      await provider.connect();
    });

    afterEach(async () => {
      await provider.dispose();
    });

    it('should handle SessionBegins message', () => {
      const sessionMessage = {
        message_type: 'SessionBegins',
        session_id: 'test-session-123',
        expires_at: '2025-01-01T00:00:00Z',
      };

      messageHandler({ data: JSON.stringify(sessionMessage) } as MessageEvent);

      // SessionBegins should not trigger a transcription callback
      expect(transcriptionCallback).not.toHaveBeenCalled();
    });

    it('should handle PartialTranscript message', () => {
      const partialMessage = {
        message_type: 'PartialTranscript',
        text: 'Hello wor',
        audio_start: 0,
        audio_end: 1500,
        confidence: 0.85,
        words: [
          { text: 'Hello', start: 0, end: 500, confidence: 0.9 },
          { text: 'wor', start: 600, end: 1500, confidence: 0.8 },
        ],
      };

      messageHandler({ data: JSON.stringify(partialMessage) } as MessageEvent);

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello wor',
          isFinal: false,
          confidence: 0.85,
          metadata: expect.objectContaining({
            audioStart: 0,
            audioEnd: 1500,
            words: partialMessage.words,
          }),
        })
      );
    });

    it('should handle FinalTranscript message', () => {
      const finalMessage = {
        message_type: 'FinalTranscript',
        text: 'Hello world.',
        audio_start: 0,
        audio_end: 2000,
        confidence: 0.95,
        words: [
          { text: 'Hello', start: 0, end: 500, confidence: 0.95 },
          { text: 'world.', start: 600, end: 2000, confidence: 0.95 },
        ],
        punctuated: true,
        text_formatted: true,
      };

      messageHandler({ data: JSON.stringify(finalMessage) } as MessageEvent);

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello world.',
          isFinal: true,
          speechFinal: true,
          confidence: 0.95,
          metadata: expect.objectContaining({
            audioStart: 0,
            audioEnd: 2000,
            punctuated: true,
            textFormatted: true,
          }),
        })
      );
    });

    it('should handle SessionTerminated message', () => {
      const terminatedMessage = {
        message_type: 'SessionTerminated',
      };

      messageHandler({ data: JSON.stringify(terminatedMessage) } as MessageEvent);

      // SessionTerminated should not trigger a transcription callback
      expect(transcriptionCallback).not.toHaveBeenCalled();
    });

    it('should handle error messages', () => {
      const errorMessage = {
        error: 'Audio too short',
      };

      messageHandler({ data: JSON.stringify(errorMessage) } as MessageEvent);

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          isFinal: true,
          confidence: 0,
          metadata: {
            error: 'Audio too short',
          },
        })
      );
    });

    it('should ignore empty partial transcripts', () => {
      const emptyPartial = {
        message_type: 'PartialTranscript',
        text: '',
        audio_start: 0,
        audio_end: 500,
        confidence: 0,
        words: [],
      };

      messageHandler({ data: JSON.stringify(emptyPartial) } as MessageEvent);

      expect(transcriptionCallback).not.toHaveBeenCalled();
    });

    it('should ignore empty final transcripts', () => {
      const emptyFinal = {
        message_type: 'FinalTranscript',
        text: '',
        audio_start: 0,
        audio_end: 500,
        confidence: 0,
        words: [],
        punctuated: false,
        text_formatted: false,
      };

      messageHandler({ data: JSON.stringify(emptyFinal) } as MessageEvent);

      expect(transcriptionCallback).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON gracefully', () => {
      messageHandler({ data: 'not valid json{{{' } as MessageEvent);

      expect(transcriptionCallback).not.toHaveBeenCalled();
    });

    it('should ignore non-string messages', () => {
      messageHandler({ data: new ArrayBuffer(10) } as MessageEvent);

      expect(transcriptionCallback).not.toHaveBeenCalled();
    });

    it('should handle unknown message types', () => {
      const unknownMessage = {
        message_type: 'SomeNewType',
        data: 'whatever',
      };

      messageHandler({ data: JSON.stringify(unknownMessage) } as MessageEvent);

      expect(transcriptionCallback).not.toHaveBeenCalled();
    });
  });

  describe('Disconnection', () => {
    let provider: AssemblyAISTT;

    beforeEach(async () => {
      provider = new AssemblyAISTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
    });

    afterEach(async () => {
      if (provider.isReady()) {
        await provider.dispose();
      }
    });

    it('should disconnect successfully', async () => {
      expect(provider.isWebSocketConnected()).toBe(true);

      await provider.disconnect();

      // Should send terminate_session message
      expect(mockWsManager.send).toHaveBeenCalledWith(JSON.stringify({ terminate_session: true }));
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should not disconnect when not connected', async () => {
      await provider.disconnect();
      mockWsManager.send.mockClear();
      mockWsManager.disconnect.mockClear();

      // Second disconnect should be a no-op
      await provider.disconnect();

      expect(mockWsManager.disconnect).not.toHaveBeenCalled();
    });

    it('should handle send error during disconnect gracefully', async () => {
      mockWsManager.send.mockImplementationOnce(() => {
        throw new Error('Send failed');
      });

      // Should not throw even if send fails
      await expect(provider.disconnect()).resolves.not.toThrow();
      expect(mockWsManager.disconnect).toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should apply default configuration values', () => {
      const provider = new AssemblyAISTT({ apiKey: 'test-key' }, logger);

      expect(provider.config.sampleRate).toBe(16000);
      expect(provider.config.language).toBe('en');
      expect(provider.config.interimResults).toBe(true);
    });

    it('should allow custom configuration to override defaults', () => {
      const provider = new AssemblyAISTT(
        {
          apiKey: 'test-key',
          sampleRate: 44100,
          language: 'fr',
          interimResults: false,
        },
        logger
      );

      expect(provider.config.sampleRate).toBe(44100);
      expect(provider.config.language).toBe('fr');
      expect(provider.config.interimResults).toBe(false);
    });

    it('should get current configuration', async () => {
      const config = {
        apiKey: 'test-key',
        sampleRate: 16000,
        language: 'en',
        wordBoost: ['test'],
      };

      const provider = new AssemblyAISTT(config, logger);
      await provider.initialize();

      const retrievedConfig = provider.getConfig();
      expect(retrievedConfig.apiKey).toBe(config.apiKey);
      expect((retrievedConfig as typeof config).wordBoost).toEqual(['test']);

      await provider.dispose();
    });
  });
});
