/**
 * Tests for ElevenLabsSTT provider
 */

import {
  ElevenLabsSTT,
  resolveLanguageCode,
  LANGUAGE_MAP,
} from '../../../../src/providers/stt/elevenlabs/ElevenLabsSTT';
import type { ElevenLabsSTTConfig } from '../../../../src/providers/stt/elevenlabs/ElevenLabsSTT';
import { Logger } from '../../../../src/utils/logger';
import { ProviderConnectionError } from '../../../../src/utils/errors';

// ── Mocks ─────────────────────────────────────────────

const mockWsManager = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  getState: jest.fn().mockReturnValue('connected'),
  setHandlers: jest.fn(),
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

// ── Helpers ───────────────────────────────────────────

/**
 * Configures the mock WebSocketManager to simulate a successful
 * session_started handshake. Returns a getter for the current
 * (post-handshake) message handler.
 */
function setupConnectionMock(sessionId = 'test-session-123') {
  let currentOnMessage: ((event: MessageEvent) => void) | null = null;

  mockWsManager.setHandlers.mockImplementation(
    (handlers: { onMessage?: (event: MessageEvent) => void; onClose?: () => void; onError?: (error: Error) => void }) => {
      if (handlers.onMessage) currentOnMessage = handlers.onMessage;
    }
  );

  mockWsManager.connect.mockImplementation(async () => {
    // Simulate server sending session_started after connection
    if (currentOnMessage) {
      currentOnMessage({
        data: JSON.stringify({
          message_type: 'session_started',
          session_id: sessionId,
        }),
      } as MessageEvent);
    }
  });

  return {
    getMessageHandler: () => currentOnMessage,
  };
}

// ── Tests ─────────────────────────────────────────────

describe('ElevenLabsSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset default implementations (clearAllMocks does not clear mockImplementation)
    mockWsManager.connect.mockResolvedValue(undefined);
    mockWsManager.disconnect.mockResolvedValue(undefined);
    mockWsManager.isConnected.mockReturnValue(true);
    mockWsManager.getState.mockReturnValue('connected');
    logger = new Logger('test', { enabled: false });
  });

  // ── Initialization ─────────────────────────────────

  describe('Initialization', () => {
    it('should initialize with apiKey configuration', async () => {
      const provider = new ElevenLabsSTT({ apiKey: 'test-api-key' }, logger);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.config.model).toBe('scribe_v2_realtime');
      expect(provider.config.commitStrategy).toBe('vad');
      expect(provider.config.audioFormat).toBe('pcm_16000');
    });

    it('should initialize with proxyUrl configuration', async () => {
      const provider = new ElevenLabsSTT(
        { proxyUrl: 'http://localhost:3000/api/proxy/elevenlabs' },
        logger
      );
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize with token configuration', async () => {
      const provider = new ElevenLabsSTT({ token: 'temp-token-123' }, logger);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize without authentication (logs debug warning, no error)', async () => {
      const provider = new ElevenLabsSTT({}, logger);
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should apply default configuration values', () => {
      const provider = new ElevenLabsSTT({ apiKey: 'test-key' }, logger);

      expect(provider.config.model).toBe('scribe_v2_realtime');
      expect(provider.config.commitStrategy).toBe('vad');
      expect(provider.config.audioFormat).toBe('pcm_16000');
    });

    it('should allow custom configuration to override defaults', () => {
      const provider = new ElevenLabsSTT(
        {
          apiKey: 'test-key',
          model: 'custom_model',
          commitStrategy: 'manual',
          audioFormat: 'pcm_44100',
        },
        logger
      );

      expect(provider.config.model).toBe('custom_model');
      expect(provider.config.commitStrategy).toBe('manual');
      expect(provider.config.audioFormat).toBe('pcm_44100');
    });

    it('should dispose properly', async () => {
      const provider = new ElevenLabsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });

    it('should disconnect on dispose if connected', async () => {
      setupConnectionMock();
      const provider = new ElevenLabsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();

      mockWsManager.isConnected.mockReturnValue(false);
      await provider.dispose();

      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isReady()).toBe(false);
    });
  });

  // ── WebSocket URL Construction ─────────────────────

  describe('WebSocket URL Construction', () => {
    async function getBuiltUrl(config: ElevenLabsSTTConfig): Promise<string> {
      setupConnectionMock();
      const provider = new ElevenLabsSTT(config, logger);
      await provider.initialize();
      await provider.connect();
      return MockWebSocketManager.mock.calls[0]![0].url as string;
    }

    it('should build direct URL with apiKey as xi-api-key param', async () => {
      const url = await getBuiltUrl({ apiKey: 'test-key' });

      expect(url).toContain('wss://api.elevenlabs.io/v1/speech-to-text/realtime');
      expect(url).toContain('xi-api-key=test-key');
    });

    it('should build direct URL with token param', async () => {
      const url = await getBuiltUrl({ token: 'temp-token-123' });

      expect(url).toContain('token=temp-token-123');
      expect(url).not.toContain('xi-api-key');
    });

    it('should prefer token over apiKey when both are provided', async () => {
      const url = await getBuiltUrl({ apiKey: 'test-key', token: 'temp-token' });

      expect(url).toContain('token=temp-token');
      expect(url).not.toContain('xi-api-key');
    });

    it('should build proxy URL converting http to ws', async () => {
      const url = await getBuiltUrl({
        proxyUrl: 'http://localhost:3000/api/proxy/elevenlabs',
      });

      expect(url).toMatch(/^ws:\/\/localhost:3000\/api\/proxy\/elevenlabs/);
      expect(url).toContain('/v1/speech-to-text/realtime');
    });

    it('should convert https proxy URL to wss', async () => {
      const url = await getBuiltUrl({
        proxyUrl: 'https://proxy.example.com/api/proxy/elevenlabs',
      });

      expect(url).toMatch(/^wss:\/\/proxy\.example\.com/);
    });

    it('should not include auth params in proxy mode', async () => {
      const url = await getBuiltUrl({
        proxyUrl: 'http://localhost:3000/api/proxy/elevenlabs',
        apiKey: 'test-key',
        token: 'temp-token',
      });

      expect(url).not.toContain('xi-api-key');
      expect(url).not.toContain('token=temp-token');
    });

    it('should include model_id parameter', async () => {
      const url = await getBuiltUrl({ apiKey: 'k', model: 'custom_model' });

      expect(url).toContain('model_id=custom_model');
    });

    it('should default model_id to scribe_v2_realtime', async () => {
      const url = await getBuiltUrl({ apiKey: 'k' });

      expect(url).toContain('model_id=scribe_v2_realtime');
    });

    it('should include audio_format parameter', async () => {
      const url = await getBuiltUrl({ apiKey: 'k', audioFormat: 'pcm_44100' });

      expect(url).toContain('audio_format=pcm_44100');
    });

    it('should include commit_strategy parameter', async () => {
      const url = await getBuiltUrl({ apiKey: 'k', commitStrategy: 'manual' });

      expect(url).toContain('commit_strategy=manual');
    });

    it('should include VAD parameters when configured', async () => {
      const url = await getBuiltUrl({
        apiKey: 'k',
        vadSilenceThresholdSecs: 1.5,
        vadThreshold: 0.7,
        minSpeechDurationMs: 200,
        minSilenceDurationMs: 300,
      });

      expect(url).toContain('vad_silence_threshold_secs=1.5');
      expect(url).toContain('vad_threshold=0.7');
      expect(url).toContain('min_speech_duration_ms=200');
      expect(url).toContain('min_silence_duration_ms=300');
    });

    it('should include feature flags when configured', async () => {
      const url = await getBuiltUrl({
        apiKey: 'k',
        includeTimestamps: true,
        includeLanguageDetection: true,
        enableLogging: false,
      });

      expect(url).toContain('include_timestamps=true');
      expect(url).toContain('include_language_detection=true');
      expect(url).toContain('enable_logging=false');
    });

    it('should resolve BCP 47 language code to ISO 639-3', async () => {
      const url = await getBuiltUrl({ apiKey: 'k', language: 'en-US' });

      expect(url).toContain('language_code=eng');
    });

    it('should resolve ISO 639-1 language code to ISO 639-3', async () => {
      const url = await getBuiltUrl({ apiKey: 'k', language: 'fr' });

      expect(url).toContain('language_code=fra');
    });

    it('should pass through ISO 639-3 language codes', async () => {
      const url = await getBuiltUrl({ apiKey: 'k', language: 'eng' });

      expect(url).toContain('language_code=eng');
    });

    it('should omit language_code when language is not specified (auto-detect)', async () => {
      const url = await getBuiltUrl({ apiKey: 'k' });

      expect(url).not.toContain('language_code');
    });

    it('should strip trailing slash from proxy URL', async () => {
      const url = await getBuiltUrl({
        proxyUrl: 'http://localhost:3000/api/proxy/elevenlabs/',
      });

      expect(url).toContain(
        'ws://localhost:3000/api/proxy/elevenlabs/v1/speech-to-text/realtime'
      );
    });
  });

  // ── Connection Lifecycle ───────────────────────────

  describe('Connection Lifecycle', () => {
    let provider: ElevenLabsSTT;

    beforeEach(async () => {
      setupConnectionMock();
      provider = new ElevenLabsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
    });

    afterEach(async () => {
      if (provider.isReady()) {
        mockWsManager.isConnected.mockReturnValue(false);
        await provider.dispose();
      }
    });

    it('should connect successfully with session_started handshake', async () => {
      await provider.connect();

      expect(provider.isWebSocketConnected()).toBe(true);
      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('wss://api.elevenlabs.io/v1/speech-to-text/realtime'),
        })
      );
      expect(mockWsManager.setHandlers).toHaveBeenCalled();
      expect(mockWsManager.connect).toHaveBeenCalled();
    });

    it('should switch handlers after session_started (two setHandlers calls)', async () => {
      await provider.connect();

      // First call: handshake handler, second call: normal message handler
      expect(mockWsManager.setHandlers).toHaveBeenCalledTimes(2);
    });

    it('should disable auto-reconnect for stateful sessions', async () => {
      await provider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          reconnection: expect.objectContaining({
            enabled: false,
          }),
        })
      );
    });

    it('should not connect when already connected', async () => {
      await provider.connect();
      MockWebSocketManager.mockClear();
      mockWsManager.connect.mockClear();

      await provider.connect(); // Second call — no-op

      expect(MockWebSocketManager).not.toHaveBeenCalled();
      expect(mockWsManager.connect).not.toHaveBeenCalled();
    });

    it('should throw when not initialized', async () => {
      const uninitProvider = new ElevenLabsSTT({ apiKey: 'test-key' }, logger);

      await expect(uninitProvider.connect()).rejects.toThrow();
    });

    it('should throw ProviderConnectionError on connection failure', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should throw ProviderConnectionError on input_error during handshake', async () => {
      // Override setHandlers to capture handshake handler
      let handshakeOnMessage: ((event: MessageEvent) => void) | null = null;
      mockWsManager.setHandlers.mockImplementation(
        (handlers: { onMessage?: (event: MessageEvent) => void }) => {
          if (handlers.onMessage) handshakeOnMessage = handlers.onMessage;
        }
      );
      mockWsManager.connect.mockImplementation(async () => {
        if (handshakeOnMessage) {
          handshakeOnMessage({
            data: JSON.stringify({
              message_type: 'input_error',
              message: 'Invalid API key',
            }),
          } as MessageEvent);
        }
      });

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
    });

    it('should throw ProviderConnectionError on WebSocket close during handshake', async () => {
      let handshakeOnClose: (() => void) | null = null;
      mockWsManager.setHandlers.mockImplementation(
        (handlers: { onClose?: () => void }) => {
          if (handlers.onClose) handshakeOnClose = handlers.onClose;
        }
      );
      mockWsManager.connect.mockImplementation(async () => {
        if (handshakeOnClose) {
          handshakeOnClose();
        }
      });

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
    });

    it('should use configured timeout for connection', async () => {
      const customProvider = new ElevenLabsSTT(
        { apiKey: 'test-key', timeout: 5000 },
        logger
      );
      await customProvider.initialize();
      await customProvider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionTimeout: 5000,
        })
      );
    });
  });

  // ── Audio Sending ──────────────────────────────────

  describe('Audio Sending', () => {
    let provider: ElevenLabsSTT;

    beforeEach(async () => {
      setupConnectionMock();
      provider = new ElevenLabsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();
    });

    afterEach(async () => {
      mockWsManager.isConnected.mockReturnValue(false);
      if (provider.isReady()) {
        await provider.dispose();
      }
    });

    it('should send base64-encoded audio as JSON input_audio_chunk', () => {
      const audioChunk = new ArrayBuffer(4);
      const view = new Uint8Array(audioChunk);
      view[0] = 65; // 'A'
      view[1] = 66; // 'B'
      view[2] = 67; // 'C'
      view[3] = 68; // 'D'

      provider.sendAudio(audioChunk);

      expect(mockWsManager.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(mockWsManager.send.mock.calls[0]![0] as string);
      expect(sent.message_type).toBe('input_audio_chunk');
      expect(sent.audio_base_64).toBe(btoa('ABCD'));
      expect(sent.commit).toBe(false);
      expect(sent.sample_rate).toBe(16000);
    });

    it('should include previousText only on the first audio chunk', async () => {
      // Create a fresh provider with previousText config
      setupConnectionMock();
      const ctxProvider = new ElevenLabsSTT(
        { apiKey: 'test-key', previousText: 'some context here' },
        logger
      );
      await ctxProvider.initialize();
      await ctxProvider.connect();
      mockWsManager.send.mockClear();

      const chunk = new ArrayBuffer(2);

      // First chunk: should include previous_text
      ctxProvider.sendAudio(chunk);
      const firstMsg = JSON.parse(mockWsManager.send.mock.calls[0]![0] as string);
      expect(firstMsg.previous_text).toBe('some context here');

      // Second chunk: should NOT include previous_text
      ctxProvider.sendAudio(chunk);
      const secondMsg = JSON.parse(mockWsManager.send.mock.calls[1]![0] as string);
      expect(secondMsg.previous_text).toBeUndefined();
    });

    it('should not include previous_text when not configured', () => {
      const chunk = new ArrayBuffer(2);
      provider.sendAudio(chunk);

      const sent = JSON.parse(mockWsManager.send.mock.calls[0]![0] as string);
      expect(sent.previous_text).toBeUndefined();
    });

    it('should derive sample_rate from audioFormat config', async () => {
      setupConnectionMock();
      const hiResProvider = new ElevenLabsSTT(
        { apiKey: 'test-key', audioFormat: 'pcm_44100' },
        logger
      );
      await hiResProvider.initialize();
      await hiResProvider.connect();
      mockWsManager.send.mockClear();

      hiResProvider.sendAudio(new ArrayBuffer(2));

      const sent = JSON.parse(mockWsManager.send.mock.calls[0]![0] as string);
      expect(sent.sample_rate).toBe(44100);
    });

    it('should send multiple audio chunks', () => {
      const chunks = [new ArrayBuffer(128), new ArrayBuffer(128), new ArrayBuffer(128)];
      chunks.forEach((chunk) => provider.sendAudio(chunk));

      expect(mockWsManager.send).toHaveBeenCalledTimes(3);
    });

    it('should not send audio when not connected', async () => {
      const disconnectedProvider = new ElevenLabsSTT({ apiKey: 'test-key' }, logger);
      await disconnectedProvider.initialize();

      disconnectedProvider.sendAudio(new ArrayBuffer(128));

      // send should not be called (aside from any prior calls)
      const callCount = mockWsManager.send.mock.calls.length;
      disconnectedProvider.sendAudio(new ArrayBuffer(128));
      expect(mockWsManager.send.mock.calls.length).toBe(callCount);
    });

    it('should handle send errors gracefully', () => {
      mockWsManager.send.mockImplementationOnce(() => {
        throw new Error('Send failed');
      });

      const audioChunk = new ArrayBuffer(128);
      expect(() => provider.sendAudio(audioChunk)).not.toThrow();
    });
  });

  // ── Transcript Processing ──────────────────────────

  describe('Transcript Processing', () => {
    let provider: ElevenLabsSTT;
    let transcriptionCallback: jest.Mock;
    let messageHandler: ((event: MessageEvent) => void) | null;

    beforeEach(async () => {
      const mock = setupConnectionMock();
      provider = new ElevenLabsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      transcriptionCallback = jest.fn();
      provider.onTranscription(transcriptionCallback);

      await provider.connect();
      messageHandler = mock.getMessageHandler();
    });

    afterEach(async () => {
      mockWsManager.isConnected.mockReturnValue(false);
      if (provider.isReady()) {
        await provider.dispose();
      }
    });

    describe('partial_transcript', () => {
      it('should emit TranscriptionResult with isFinal=false, speechFinal=false', () => {
        messageHandler!({
          data: JSON.stringify({
            message_type: 'partial_transcript',
            text: 'Hello wor',
          }),
        } as MessageEvent);

        expect(transcriptionCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            text: 'Hello wor',
            isFinal: false,
            speechFinal: false,
          })
        );
      });

      it('should skip empty partial transcripts', () => {
        messageHandler!({
          data: JSON.stringify({
            message_type: 'partial_transcript',
            text: '',
          }),
        } as MessageEvent);

        expect(transcriptionCallback).not.toHaveBeenCalled();
      });

      it('should skip partial transcripts with no text field', () => {
        messageHandler!({
          data: JSON.stringify({
            message_type: 'partial_transcript',
          }),
        } as MessageEvent);

        expect(transcriptionCallback).not.toHaveBeenCalled();
      });
    });

    describe('committed_transcript', () => {
      it('should emit with isFinal=true, speechFinal=true', () => {
        messageHandler!({
          data: JSON.stringify({
            message_type: 'committed_transcript',
            text: 'Hello world.',
          }),
        } as MessageEvent);

        expect(transcriptionCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            text: 'Hello world.',
            isFinal: true,
            speechFinal: true,
          })
        );
      });

      it('should emit with empty text when text is missing', () => {
        messageHandler!({
          data: JSON.stringify({
            message_type: 'committed_transcript',
          }),
        } as MessageEvent);

        expect(transcriptionCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            text: '',
            isFinal: true,
            speechFinal: true,
          })
        );
      });
    });

    describe('committed_transcript_with_timestamps', () => {
      it('should include word data in metadata', () => {
        const words = [
          { word: 'Hello', logprob: -0.1, start: 0, end: 500 },
          { word: 'world', logprob: -0.5, start: 600, end: 1200 },
        ];

        messageHandler!({
          data: JSON.stringify({
            message_type: 'committed_transcript_with_timestamps',
            words,
          }),
        } as MessageEvent);

        expect(transcriptionCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            text: 'Hello world',
            isFinal: true,
            speechFinal: true,
            metadata: { words },
          })
        );
      });

      it('should compute average confidence from word logprobs', () => {
        const words = [
          { word: 'Hello', logprob: -0.1 }, // Math.exp(-0.1) ≈ 0.9048
          { word: 'world', logprob: -0.5 }, // Math.exp(-0.5) ≈ 0.6065
        ];
        const expectedConfidence = (Math.exp(-0.1) + Math.exp(-0.5)) / 2;

        messageHandler!({
          data: JSON.stringify({
            message_type: 'committed_transcript_with_timestamps',
            words,
          }),
        } as MessageEvent);

        const result = transcriptionCallback.mock.calls[0]![0];
        expect(result.confidence).toBeCloseTo(expectedConfidence, 5);
      });

      it('should omit confidence when no words have logprob', () => {
        const words = [{ word: 'hello' }, { word: 'world' }];

        messageHandler!({
          data: JSON.stringify({
            message_type: 'committed_transcript_with_timestamps',
            words,
          }),
        } as MessageEvent);

        const result = transcriptionCallback.mock.calls[0]![0];
        expect(result.confidence).toBeUndefined();
      });

      it('should compute confidence only from words with logprob', () => {
        const words = [
          { word: 'hello', logprob: -0.1 }, // Math.exp(-0.1) ≈ 0.9048
          { word: 'world' }, // no logprob — excluded from average
        ];

        messageHandler!({
          data: JSON.stringify({
            message_type: 'committed_transcript_with_timestamps',
            words,
          }),
        } as MessageEvent);

        const result = transcriptionCallback.mock.calls[0]![0];
        expect(result.confidence).toBeCloseTo(Math.exp(-0.1), 5);
      });

      it('should handle empty words array', () => {
        messageHandler!({
          data: JSON.stringify({
            message_type: 'committed_transcript_with_timestamps',
            words: [],
          }),
        } as MessageEvent);

        expect(transcriptionCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            text: '',
            isFinal: true,
            speechFinal: true,
          })
        );
      });
    });

    describe('input_error', () => {
      it('should emit error result with confidence=0 and error metadata', () => {
        messageHandler!({
          data: JSON.stringify({
            message_type: 'input_error',
            code: 'invalid_audio',
            message: 'Audio format not supported',
          }),
        } as MessageEvent);

        expect(transcriptionCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            text: '',
            isFinal: true,
            confidence: 0,
            metadata: {
              errorType: 'invalid_audio',
              error: 'Audio format not supported',
            },
          })
        );
      });

      it('should handle input_error with missing fields', () => {
        messageHandler!({
          data: JSON.stringify({
            message_type: 'input_error',
          }),
        } as MessageEvent);

        expect(transcriptionCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            text: '',
            isFinal: true,
            confidence: 0,
            metadata: {
              errorType: undefined,
              error: undefined,
            },
          })
        );
      });
    });

    it('should not emit transcription for session_ended', () => {
      messageHandler!({
        data: JSON.stringify({ message_type: 'session_ended' }),
      } as MessageEvent);

      expect(transcriptionCallback).not.toHaveBeenCalled();
    });

    it('should not emit transcription for unknown message types', () => {
      messageHandler!({
        data: JSON.stringify({ message_type: 'some_new_type', data: 'whatever' }),
      } as MessageEvent);

      expect(transcriptionCallback).not.toHaveBeenCalled();
    });

    it('should handle malformed JSON gracefully', () => {
      expect(() => {
        messageHandler!({ data: 'not valid json{{{' } as MessageEvent);
      }).not.toThrow();

      expect(transcriptionCallback).not.toHaveBeenCalled();
    });
  });

  // ── Commit Strategies ──────────────────────────────

  describe('Commit Strategies', () => {
    describe('VAD mode', () => {
      it('should make sendCommit() a no-op', async () => {
        setupConnectionMock();
        const vadProvider = new ElevenLabsSTT(
          { apiKey: 'test-key', commitStrategy: 'vad' },
          logger
        );
        await vadProvider.initialize();
        await vadProvider.connect();
        mockWsManager.send.mockClear();

        vadProvider.sendCommit();

        expect(mockWsManager.send).not.toHaveBeenCalled();
      });
    });

    describe('Manual mode', () => {
      let provider: ElevenLabsSTT;

      beforeEach(async () => {
        setupConnectionMock();
        provider = new ElevenLabsSTT(
          { apiKey: 'test-key', commitStrategy: 'manual' },
          logger
        );
        await provider.initialize();
        await provider.connect();
        mockWsManager.send.mockClear();
      });

      afterEach(async () => {
        mockWsManager.isConnected.mockReturnValue(false);
        if (provider.isReady()) {
          await provider.dispose();
        }
      });

      it('should send empty audio chunk with commit=true', () => {
        provider.sendCommit();

        expect(mockWsManager.send).toHaveBeenCalledTimes(1);
        const sent = JSON.parse(mockWsManager.send.mock.calls[0]![0] as string);
        expect(sent.message_type).toBe('input_audio_chunk');
        expect(sent.audio_base_64).toBe('');
        expect(sent.commit).toBe(true);
        expect(sent.sample_rate).toBe(16000);
      });

      it('should not send commit when not connected', async () => {
        const disconnectedProvider = new ElevenLabsSTT(
          { apiKey: 'test-key', commitStrategy: 'manual' },
          logger
        );
        await disconnectedProvider.initialize();

        disconnectedProvider.sendCommit();

        expect(mockWsManager.send).not.toHaveBeenCalled();
      });

      it('should handle send error gracefully during commit', () => {
        mockWsManager.send.mockImplementationOnce(() => {
          throw new Error('Send failed');
        });

        expect(() => provider.sendCommit()).not.toThrow();
      });
    });
  });

  // ── Disconnection ──────────────────────────────────

  describe('Disconnection', () => {
    let provider: ElevenLabsSTT;

    beforeEach(async () => {
      setupConnectionMock();
      provider = new ElevenLabsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();
    });

    it('should disconnect successfully', async () => {
      expect(provider.isWebSocketConnected()).toBe(true);

      // Make isConnected return false so the 1-second wait is skipped
      mockWsManager.isConnected.mockReturnValue(false);
      await provider.disconnect();

      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should send final commit flush before disconnecting', async () => {
      mockWsManager.isConnected.mockReturnValue(false);
      await provider.disconnect();

      // First send call should be the final commit
      expect(mockWsManager.send).toHaveBeenCalledWith(
        JSON.stringify({
          message_type: 'input_audio_chunk',
          audio_base_64: '',
          commit: true,
          sample_rate: 16000,
        })
      );
    });

    it('should reset state after disconnect', async () => {
      mockWsManager.isConnected.mockReturnValue(false);
      await provider.disconnect();

      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should be a no-op when not connected', async () => {
      mockWsManager.isConnected.mockReturnValue(false);
      await provider.disconnect();
      mockWsManager.send.mockClear();
      mockWsManager.disconnect.mockClear();

      // Second disconnect — should be a no-op
      await provider.disconnect();

      expect(mockWsManager.disconnect).not.toHaveBeenCalled();
    });

    it('should handle send error during final flush gracefully', async () => {
      mockWsManager.send.mockImplementationOnce(() => {
        throw new Error('Send failed');
      });
      mockWsManager.isConnected.mockReturnValue(false);

      await expect(provider.disconnect()).resolves.not.toThrow();
      expect(mockWsManager.disconnect).toHaveBeenCalled();
    });
  });
});

// ── resolveLanguageCode ──────────────────────────────

describe('resolveLanguageCode', () => {
  it('should return undefined for undefined input (auto-detect)', () => {
    expect(resolveLanguageCode(undefined)).toBeUndefined();
  });

  it('should return undefined for empty string input', () => {
    expect(resolveLanguageCode('')).toBeUndefined();
  });

  it('should pass through 3-letter ISO 639-3 codes', () => {
    expect(resolveLanguageCode('eng')).toBe('eng');
    expect(resolveLanguageCode('fra')).toBe('fra');
    expect(resolveLanguageCode('deu')).toBe('deu');
  });

  it('should lowercase 3-letter codes', () => {
    expect(resolveLanguageCode('ENG')).toBe('eng');
    expect(resolveLanguageCode('Fra')).toBe('fra');
  });

  it('should map 2-letter ISO 639-1 codes to ISO 639-3', () => {
    expect(resolveLanguageCode('en')).toBe('eng');
    expect(resolveLanguageCode('fr')).toBe('fra');
    expect(resolveLanguageCode('de')).toBe('deu');
    expect(resolveLanguageCode('ja')).toBe('jpn');
    expect(resolveLanguageCode('zh')).toBe('zho');
  });

  it('should extract base language from BCP 47 tags and map', () => {
    expect(resolveLanguageCode('en-US')).toBe('eng');
    expect(resolveLanguageCode('fr-FR')).toBe('fra');
    expect(resolveLanguageCode('pt-BR')).toBe('por');
    expect(resolveLanguageCode('zh-TW')).toBe('zho');
  });

  it('should handle underscore-separated BCP 47 variants', () => {
    expect(resolveLanguageCode('en_US')).toBe('eng');
    expect(resolveLanguageCode('ja_JP')).toBe('jpn');
  });

  it('should pass through unrecognized 2-letter codes', () => {
    expect(resolveLanguageCode('xx')).toBe('xx');
    expect(resolveLanguageCode('zz')).toBe('zz');
  });
});

// ── LANGUAGE_MAP ─────────────────────────────────────

describe('LANGUAGE_MAP', () => {
  it('should map all major languages from ISO 639-1 to ISO 639-3', () => {
    expect(LANGUAGE_MAP['en']).toBe('eng');
    expect(LANGUAGE_MAP['fr']).toBe('fra');
    expect(LANGUAGE_MAP['de']).toBe('deu');
    expect(LANGUAGE_MAP['es']).toBe('spa');
    expect(LANGUAGE_MAP['ja']).toBe('jpn');
    expect(LANGUAGE_MAP['ko']).toBe('kor');
    expect(LANGUAGE_MAP['zh']).toBe('zho');
    expect(LANGUAGE_MAP['ar']).toBe('ara');
    expect(LANGUAGE_MAP['hi']).toBe('hin');
    expect(LANGUAGE_MAP['ru']).toBe('rus');
  });

  it('should contain at least 30 language mappings', () => {
    expect(Object.keys(LANGUAGE_MAP).length).toBeGreaterThanOrEqual(30);
  });
});
