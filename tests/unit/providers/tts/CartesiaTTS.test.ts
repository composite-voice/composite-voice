/**
 * Tests for CartesiaTTS provider
 */

import { CartesiaTTS } from '../../../../src/providers/tts/cartesia/CartesiaTTS';
import { Logger } from '../../../../src/utils/logger';
import {
  ProviderInitializationError,
  ProviderConnectionError,
} from '../../../../src/utils/errors';

// Mock WebSocketManager
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

describe('CartesiaTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.voiceId).toBe('test-voice-id');
      expect(provider.config.modelId).toBe('sonic-2');
      expect(provider.config.language).toBe('en');
      expect(provider.config.outputEncoding).toBe('pcm_s16le');
      expect(provider.config.outputSampleRate).toBe(16000);
      expect(provider.config.cartesiaVersion).toBe('2024-06-10');
    });

    it('should initialize with custom configuration', async () => {
      const provider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'custom-voice-id',
          modelId: 'sonic-multilingual',
          language: 'fr',
          outputEncoding: 'pcm_mulaw',
          outputSampleRate: 24000,
          speed: 1.5,
          emotion: ['positivity:high'],
          cartesiaVersion: '2024-08-01',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.config.voiceId).toBe('custom-voice-id');
      expect(provider.config.modelId).toBe('sonic-multilingual');
      expect(provider.config.language).toBe('fr');
      expect(provider.config.outputEncoding).toBe('pcm_mulaw');
      expect(provider.config.outputSampleRate).toBe(24000);
      expect(provider.config.speed).toBe(1.5);
      expect(provider.config.emotion).toEqual(['positivity:high']);
      expect(provider.config.cartesiaVersion).toBe('2024-08-01');
      expect(provider.config.sampleRate).toBe(24000);
    });

    it('should throw error when neither apiKey nor proxyUrl is provided', async () => {
      const provider = new CartesiaTTS(
        {
          voiceId: 'test-voice-id',
        },
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw error when voiceId is not provided', async () => {
      const provider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: '',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        logger
      );

      // Override voiceId to be falsy after construction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider.config as any).voiceId = '';

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should initialize with proxyUrl instead of apiKey', async () => {
      const provider = new CartesiaTTS(
        {
          proxyUrl: 'http://localhost:3000/api/proxy/cartesia',
          voiceId: 'test-voice-id',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.config.proxyUrl).toBe('http://localhost:3000/api/proxy/cartesia');
    });

    it('should dispose properly', async () => {
      const provider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
        },
        logger
      );

      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });

    it('should set correct sample rate from outputSampleRate', async () => {
      const rates = [8000, 16000, 22050, 24000, 44100];

      for (const rate of rates) {
        const provider = new CartesiaTTS(
          {
            apiKey: 'test-key',
            voiceId: 'test-voice-id',
            outputSampleRate: rate,
          },
          logger
        );

        await provider.initialize();
        expect(provider.config.sampleRate).toBe(rate);
        await provider.dispose();
      }
    });
  });

  describe('WebSocket Connection', () => {
    let provider: CartesiaTTS;
    let audioCallback: jest.Mock;
    let metadataCallback: jest.Mock;

    beforeEach(async () => {
      provider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
          modelId: 'sonic-2',
          outputEncoding: 'pcm_s16le',
          outputSampleRate: 16000,
        },
        logger
      );
      await provider.initialize();

      audioCallback = jest.fn();
      metadataCallback = jest.fn();
      provider.onAudio(audioCallback);
      provider.onMetadata(metadataCallback);
    });

    afterEach(async () => {
      await provider.dispose();
    });

    it('should connect successfully', async () => {
      await provider.connect();

      expect(provider.isWebSocketConnected()).toBe(true);
      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('wss://api.cartesia.ai/tts/websocket'),
        })
      );
      expect(mockWsManager.connect).toHaveBeenCalled();
    });

    it('should include api_key and cartesia_version in URL', async () => {
      await provider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'wss://api.cartesia.ai/tts/websocket?api_key=test-key&cartesia_version=2024-06-10',
        })
      );
    });

    it('should use proxy URL when configured', async () => {
      const proxyProvider = new CartesiaTTS(
        {
          proxyUrl: 'http://localhost:3000/api/proxy/cartesia',
          voiceId: 'test-voice-id',
        },
        logger
      );
      await proxyProvider.initialize();
      await proxyProvider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'ws://localhost:3000/api/proxy/cartesia',
        })
      );

      await proxyProvider.dispose();
    });

    it('should handle connection error', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should not connect when already connected', async () => {
      await provider.connect();

      // Reset mocks
      mockWsManager.connect.mockClear();

      await provider.connect(); // Second call should not reconnect

      expect(mockWsManager.connect).not.toHaveBeenCalled();
    });

    it('should throw error when not initialized', async () => {
      const uninitProvider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
        },
        logger
      );

      await expect(uninitProvider.connect()).rejects.toThrow();
    });

    it('should set up event handlers on WebSocketManager', async () => {
      await provider.connect();

      expect(mockWsManager.setHandlers).toHaveBeenCalledWith(
        expect.objectContaining({
          onMessage: expect.any(Function),
          onClose: expect.any(Function),
          onError: expect.any(Function),
        })
      );
    });

    it('should disable reconnection for TTS sessions', async () => {
      await provider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          reconnection: { enabled: false },
        })
      );
    });
  });

  describe('Text Sending', () => {
    let provider: CartesiaTTS;

    beforeEach(async () => {
      provider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
          modelId: 'sonic-2',
          language: 'en',
        },
        logger
      );
      await provider.initialize();
    });

    afterEach(async () => {
      await provider.dispose();
    });

    it('should send text chunks with Cartesia protocol', async () => {
      await provider.connect();

      provider.sendText('Hello, world!');

      expect(mockWsManager.send).toHaveBeenCalledTimes(1);

      const sent = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(sent.model_id).toBe('sonic-2');
      expect(sent.transcript).toBe('Hello, world!');
      expect(sent.voice).toEqual({ mode: 'id', id: 'test-voice-id' });
      expect(sent.output_format).toEqual({
        container: 'raw',
        encoding: 'pcm_s16le',
        sample_rate: 16000,
      });
      expect(sent.context_id).toBeDefined();
      expect(sent.continue).toBe(false); // First chunk
      expect(sent.language).toBe('en');
    });

    it('should set continue:true after first chunk', async () => {
      await provider.connect();

      provider.sendText('Hello');
      provider.sendText(' world');

      const firstSent = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      const secondSent = JSON.parse(mockWsManager.send.mock.calls[1][0]);

      expect(firstSent.continue).toBe(false);
      expect(secondSent.continue).toBe(true);
    });

    it('should use same context_id across chunks', async () => {
      await provider.connect();

      provider.sendText('Hello');
      provider.sendText(' world');

      const firstSent = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      const secondSent = JSON.parse(mockWsManager.send.mock.calls[1][0]);

      expect(firstSent.context_id).toBe(secondSent.context_id);
    });

    it('should not send text when not connected', () => {
      provider.sendText('Hello, world!');

      expect(mockWsManager.send).not.toHaveBeenCalled();
    });

    it('should handle multiple text chunks', async () => {
      await provider.connect();

      const chunks = ['Hello', ' ', 'world', '!'];
      chunks.forEach((chunk) => provider.sendText(chunk));

      expect(mockWsManager.send).toHaveBeenCalledTimes(4);
    });

    it('should handle send errors gracefully', async () => {
      await provider.connect();

      mockWsManager.send.mockImplementationOnce(() => {
        throw new Error('Send failed');
      });

      // Should not throw
      expect(() => provider.sendText('Hello')).not.toThrow();
    });

    it('should include speed when configured', async () => {
      const speedProvider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
          speed: 1.5,
        },
        logger
      );
      await speedProvider.initialize();
      await speedProvider.connect();

      speedProvider.sendText('Hello');

      const sent = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(sent.speed).toBe(1.5);

      await speedProvider.dispose();
    });

    it('should include emotion when configured', async () => {
      const emotionProvider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
          emotion: ['positivity:high', 'curiosity'],
        },
        logger
      );
      await emotionProvider.initialize();
      await emotionProvider.connect();

      emotionProvider.sendText('Hello');

      const sent = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(sent.emotion).toEqual(['positivity:high', 'curiosity']);

      await emotionProvider.dispose();
    });
  });

  describe('Audio Reception', () => {
    let provider: CartesiaTTS;
    let audioCallback: jest.Mock;
    let metadataCallback: jest.Mock;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messageHandler: (event: any) => void;

    beforeEach(async () => {
      provider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
          outputEncoding: 'pcm_s16le',
          outputSampleRate: 16000,
        },
        logger
      );
      await provider.initialize();

      audioCallback = jest.fn();
      metadataCallback = jest.fn();
      provider.onAudio(audioCallback);
      provider.onMetadata(metadataCallback);

      // Capture the message handler
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockWsManager.setHandlers.mockImplementation((handlers: any) => {
        messageHandler = handlers.onMessage;
      });

      await provider.connect();
    });

    afterEach(async () => {
      await provider.dispose();
    });

    it('should process base64 audio from JSON chunk messages', () => {
      const audioData = new Uint8Array([1, 2, 3, 4, 5]);
      const base64Audio = Buffer.from(audioData).toString('base64');

      const event = {
        data: JSON.stringify({ type: 'chunk', data: base64Audio, done: false }),
      } as MessageEvent;

      messageHandler(event);

      expect(audioCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(ArrayBuffer),
          timestamp: expect.any(Number),
          metadata: expect.objectContaining({
            sampleRate: 16000,
            encoding: 'linear16',
            channels: 1,
            bitDepth: 16,
          }),
        })
      );
    });

    it('should process ArrayBuffer audio data', () => {
      const audioData = new ArrayBuffer(1024);

      const event = {
        data: audioData,
      } as MessageEvent;

      messageHandler(event);

      expect(audioCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: audioData,
          timestamp: expect.any(Number),
          metadata: expect.objectContaining({
            sampleRate: 16000,
            encoding: 'linear16',
            channels: 1,
            bitDepth: 16,
          }),
        })
      );
    });

    it('should emit metadata on word timestamps', () => {
      const event = {
        data: JSON.stringify({
          type: 'timestamps',
          word_timestamps: {
            words: ['Hello', 'world'],
            start: [0, 0.5],
            end: [0.5, 1.0],
          },
        }),
      } as MessageEvent;

      messageHandler(event);

      expect(metadataCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          sampleRate: 16000,
          encoding: 'linear16',
          channels: 1,
          bitDepth: 16,
          mimeType: 'audio/linear16',
        })
      );
    });

    it('should handle done message', () => {
      const event = {
        data: JSON.stringify({ type: 'done' }),
      } as MessageEvent;

      expect(() => messageHandler(event)).not.toThrow();
    });

    it('should handle chunk with done:true', () => {
      const audioData = new Uint8Array([1, 2, 3]);
      const base64Audio = Buffer.from(audioData).toString('base64');

      const event = {
        data: JSON.stringify({ type: 'chunk', data: base64Audio, done: true }),
      } as MessageEvent;

      messageHandler(event);

      // Should still process the audio data
      expect(audioCallback).toHaveBeenCalled();
    });

    it('should handle error messages', () => {
      const event = {
        data: JSON.stringify({ type: 'error', error: 'Something went wrong' }),
      } as MessageEvent;

      expect(() => messageHandler(event)).not.toThrow();
    });

    it('should handle malformed messages gracefully', () => {
      const event = {
        data: 'not valid json{{{',
      } as MessageEvent;

      expect(() => messageHandler(event)).not.toThrow();
    });

    it('should use correct encoding for mulaw format', async () => {
      const mulawProvider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
          outputEncoding: 'pcm_mulaw',
          outputSampleRate: 8000,
        },
        logger
      );
      await mulawProvider.initialize();

      const mulawAudioCallback = jest.fn();
      mulawProvider.onAudio(mulawAudioCallback);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let mulawMessageHandler: (event: any) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockWsManager.setHandlers.mockImplementation((handlers: any) => {
        mulawMessageHandler = handlers.onMessage;
      });

      await mulawProvider.connect();

      const audioData = new Uint8Array([1, 2, 3]);
      const base64Audio = Buffer.from(audioData).toString('base64');

      mulawMessageHandler!({
        data: JSON.stringify({ type: 'chunk', data: base64Audio }),
      } as MessageEvent);

      expect(mulawAudioCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            sampleRate: 8000,
            encoding: 'mulaw',
          }),
        })
      );

      await mulawProvider.dispose();
    });

    it('should use correct encoding for alaw format', async () => {
      const alawProvider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
          outputEncoding: 'pcm_alaw',
          outputSampleRate: 8000,
        },
        logger
      );
      await alawProvider.initialize();

      const alawAudioCallback = jest.fn();
      alawProvider.onAudio(alawAudioCallback);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let alawMessageHandler: (event: any) => void;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockWsManager.setHandlers.mockImplementation((handlers: any) => {
        alawMessageHandler = handlers.onMessage;
      });

      await alawProvider.connect();

      const audioData = new Uint8Array([1, 2, 3]);
      const base64Audio = Buffer.from(audioData).toString('base64');

      alawMessageHandler!({
        data: JSON.stringify({ type: 'chunk', data: base64Audio }),
      } as MessageEvent);

      expect(alawAudioCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            sampleRate: 8000,
            encoding: 'alaw',
          }),
        })
      );

      await alawProvider.dispose();
    });
  });

  describe('Context Continuation', () => {
    let provider: CartesiaTTS;

    beforeEach(async () => {
      provider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
        },
        logger
      );
      await provider.initialize();
    });

    afterEach(async () => {
      await provider.dispose();
    });

    it('should generate a new context_id after finalize', async () => {
      await provider.connect();

      provider.sendText('First utterance');
      const firstContextId = JSON.parse(mockWsManager.send.mock.calls[0][0]).context_id;

      mockWsManager.isConnected.mockReturnValue(false);
      await provider.finalize();

      mockWsManager.send.mockClear();
      mockWsManager.isConnected.mockReturnValue(true);

      provider.sendText('Second utterance');
      const secondContextId = JSON.parse(mockWsManager.send.mock.calls[0][0]).context_id;

      // Context IDs should differ after finalize
      expect(firstContextId).not.toBe(secondContextId);
    });

    it('should reset continue flag after finalize', async () => {
      await provider.connect();

      provider.sendText('First chunk');
      provider.sendText('Second chunk');

      // After finalize, continue should reset
      mockWsManager.isConnected.mockReturnValue(false);
      await provider.finalize();

      mockWsManager.send.mockClear();
      mockWsManager.isConnected.mockReturnValue(true);

      provider.sendText('New utterance');
      const sent = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(sent.continue).toBe(false);
    });
  });

  describe('Finalization', () => {
    let provider: CartesiaTTS;

    beforeEach(async () => {
      provider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
        },
        logger
      );
      await provider.initialize();
    });

    afterEach(async () => {
      await provider.dispose();
    });

    it('should send end message on finalize', async () => {
      await provider.connect();
      mockWsManager.send.mockClear();

      mockWsManager.isConnected.mockReturnValue(false);
      await provider.finalize();

      expect(mockWsManager.send).toHaveBeenCalledTimes(1);

      const sent = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(sent.transcript).toBe('');
      expect(sent.continue).toBe(false);
      expect(sent.model_id).toBe('sonic-2');
      expect(sent.voice).toEqual({ mode: 'id', id: 'test-voice-id' });
    });

    it('should not finalize when not connected', async () => {
      await expect(provider.finalize()).resolves.not.toThrow();
      expect(mockWsManager.send).not.toHaveBeenCalled();
    });
  });

  describe('Disconnection', () => {
    let provider: CartesiaTTS;

    beforeEach(async () => {
      provider = new CartesiaTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
        },
        logger
      );
      await provider.initialize();
    });

    afterEach(async () => {
      if (provider.isReady()) {
        await provider.dispose();
      }
    });

    it('should disconnect successfully', async () => {
      await provider.connect();
      expect(provider.isWebSocketConnected()).toBe(true);

      await provider.disconnect();

      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should not disconnect when not connected', async () => {
      await expect(provider.disconnect()).resolves.not.toThrow();
      expect(mockWsManager.disconnect).not.toHaveBeenCalled();
    });

    it('should handle disconnect errors', async () => {
      await provider.connect();

      mockWsManager.disconnect.mockRejectedValueOnce(new Error('Disconnect failed'));

      await expect(provider.disconnect()).rejects.toThrow('Disconnect failed');
    });
  });

  describe('Configuration', () => {
    it('should get current configuration', async () => {
      const config = {
        apiKey: 'test-key',
        voiceId: 'custom-voice-id',
        modelId: 'sonic-multilingual' as const,
        language: 'fr',
        outputEncoding: 'pcm_mulaw' as const,
        outputSampleRate: 24000,
      };

      const provider = new CartesiaTTS(config, logger);
      await provider.initialize();

      const retrievedConfig = provider.getConfig();
      expect(retrievedConfig.apiKey).toBe(config.apiKey);
      expect((retrievedConfig as typeof config).voiceId).toBe(config.voiceId);
      expect((retrievedConfig as typeof config).modelId).toBe(config.modelId);

      await provider.dispose();
    });

    it('should support different model IDs', async () => {
      const models = ['sonic-2', 'sonic', 'sonic-multilingual'];

      for (const modelId of models) {
        const provider = new CartesiaTTS(
          {
            apiKey: 'test-key',
            voiceId: 'test-voice-id',
            modelId,
          },
          logger
        );

        await provider.initialize();
        expect(provider.isReady()).toBe(true);
        expect(provider.config.modelId).toBe(modelId);
        await provider.dispose();
      }
    });

    it('should support different output encodings', async () => {
      const encodings = ['pcm_s16le', 'pcm_f32le', 'pcm_mulaw', 'pcm_alaw'];

      for (const encoding of encodings) {
        const provider = new CartesiaTTS(
          {
            apiKey: 'test-key',
            voiceId: 'test-voice-id',
            outputEncoding: encoding,
          },
          logger
        );

        await provider.initialize();
        expect(provider.isReady()).toBe(true);
        expect(provider.config.outputEncoding).toBe(encoding);
        await provider.dispose();
      }
    });
  });
});
