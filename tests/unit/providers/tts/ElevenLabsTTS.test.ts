/**
 * Tests for ElevenLabsTTS provider
 */

import { ElevenLabsTTS } from '../../../../src/providers/tts/elevenlabs/ElevenLabsTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';

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

describe('ElevenLabsTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new ElevenLabsTTS(
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
      expect(provider.config.modelId).toBe('eleven_turbo_v2_5');
      expect(provider.config.outputFormat).toBe('pcm_16000');
      expect(provider.config.stability).toBe(0.5);
      expect(provider.config.similarityBoost).toBe(0.75);
    });

    it('should initialize with custom configuration', async () => {
      const provider = new ElevenLabsTTS(
        {
          apiKey: 'test-key',
          voiceId: 'custom-voice-id',
          modelId: 'eleven_multilingual_v2',
          outputFormat: 'pcm_24000',
          stability: 0.8,
          similarityBoost: 0.9,
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.config.voiceId).toBe('custom-voice-id');
      expect(provider.config.modelId).toBe('eleven_multilingual_v2');
      expect(provider.config.outputFormat).toBe('pcm_24000');
      expect(provider.config.stability).toBe(0.8);
      expect(provider.config.similarityBoost).toBe(0.9);
      expect(provider.config.sampleRate).toBe(24000);
    });

    it('should throw error when neither apiKey nor proxyUrl is provided', async () => {
      const provider = new ElevenLabsTTS(
        {
          voiceId: 'test-voice-id',
        },
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw error when voiceId is not provided', async () => {
      const provider = new ElevenLabsTTS(
        {
          apiKey: 'test-key',
          voiceId: '',
        } as any,
        logger
      );

      // Override voiceId to be falsy after construction
      (provider.config as any).voiceId = '';

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should initialize with proxyUrl instead of apiKey', async () => {
      const provider = new ElevenLabsTTS(
        {
          proxyUrl: 'http://localhost:3000/api/proxy/elevenlabs',
          voiceId: 'test-voice-id',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.config.proxyUrl).toBe('http://localhost:3000/api/proxy/elevenlabs');
    });

    it('should dispose properly', async () => {
      const provider = new ElevenLabsTTS(
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

    it('should set correct sample rate from output format', async () => {
      const formats: Array<{ format: string; expectedRate: number }> = [
        { format: 'pcm_16000', expectedRate: 16000 },
        { format: 'pcm_22050', expectedRate: 22050 },
        { format: 'pcm_24000', expectedRate: 24000 },
        { format: 'pcm_44100', expectedRate: 44100 },
        { format: 'mp3_44100_128', expectedRate: 44100 },
        { format: 'ulaw_8000', expectedRate: 8000 },
      ];

      for (const { format, expectedRate } of formats) {
        const provider = new ElevenLabsTTS(
          {
            apiKey: 'test-key',
            voiceId: 'test-voice-id',
            outputFormat: format,
          },
          logger
        );

        await provider.initialize();
        expect(provider.config.sampleRate).toBe(expectedRate);
        await provider.dispose();
      }
    });
  });

  describe('WebSocket Connection', () => {
    let provider: ElevenLabsTTS;
    let audioCallback: jest.Mock;
    let metadataCallback: jest.Mock;

    beforeEach(async () => {
      provider = new ElevenLabsTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
          modelId: 'eleven_turbo_v2_5',
          outputFormat: 'pcm_16000',
          stability: 0.5,
          similarityBoost: 0.75,
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
          url: expect.stringContaining(
            'wss://api.elevenlabs.io/v1/text-to-speech/test-voice-id/stream-input'
          ),
        })
      );
      expect(mockWsManager.connect).toHaveBeenCalled();
    });

    it('should send BOS message on connect', async () => {
      await provider.connect();

      // The first send call should be the BOS message
      expect(mockWsManager.send).toHaveBeenCalledWith(expect.stringContaining('"voice_settings"'));

      const bosMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(bosMessage.text).toBe(' ');
      expect(bosMessage.voice_settings.stability).toBe(0.5);
      expect(bosMessage.voice_settings.similarity_boost).toBe(0.75);
      expect(bosMessage.xi_api_key).toBe('test-key');
    });

    it('should not send api key in BOS when using proxy', async () => {
      const proxyProvider = new ElevenLabsTTS(
        {
          proxyUrl: 'http://localhost:3000/api/proxy/elevenlabs',
          voiceId: 'test-voice-id',
        },
        logger
      );
      await proxyProvider.initialize();
      await proxyProvider.connect();

      const bosMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(bosMessage.xi_api_key).toBeUndefined();

      await proxyProvider.dispose();
    });

    it('should build correct WebSocket URL with model and format params', async () => {
      await provider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'wss://api.elevenlabs.io/v1/text-to-speech/test-voice-id/stream-input?model_id=eleven_turbo_v2_5&output_format=pcm_16000',
        })
      );
    });

    it('should use proxy URL when configured', async () => {
      const proxyProvider = new ElevenLabsTTS(
        {
          proxyUrl: 'http://localhost:3000/api/proxy/elevenlabs',
          voiceId: 'test-voice-id',
        },
        logger
      );
      await proxyProvider.initialize();
      await proxyProvider.connect();

      expect(MockWebSocketManager).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'ws://localhost:3000/api/proxy/elevenlabs',
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
      const uninitProvider = new ElevenLabsTTS(
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
  });

  describe('Text Sending', () => {
    let provider: ElevenLabsTTS;

    beforeEach(async () => {
      provider = new ElevenLabsTTS(
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

    it('should send text chunks as JSON', async () => {
      await provider.connect();

      // Clear BOS message
      mockWsManager.send.mockClear();

      provider.sendText('Hello, world!');

      expect(mockWsManager.send).toHaveBeenCalledWith(
        JSON.stringify({
          text: 'Hello, world!',
          try_trigger_generation: true,
        })
      );
    });

    it('should not send text when not connected', () => {
      provider.sendText('Hello, world!');

      // Only BOS would be sent on connect, not this text
      expect(mockWsManager.send).not.toHaveBeenCalled();
    });

    it('should handle multiple text chunks', async () => {
      await provider.connect();

      // Clear BOS message
      mockWsManager.send.mockClear();

      const chunks = ['Hello', ' ', 'world', '!'];
      chunks.forEach((chunk) => provider.sendText(chunk));

      expect(mockWsManager.send).toHaveBeenCalledTimes(4);
    });

    it('should handle send errors gracefully', async () => {
      await provider.connect();
      mockWsManager.send.mockClear();

      mockWsManager.send.mockImplementationOnce(() => {
        throw new Error('Send failed');
      });

      // Should not throw
      expect(() => provider.sendText('Hello')).not.toThrow();
    });
  });

  describe('Audio Reception', () => {
    let provider: ElevenLabsTTS;
    let audioCallback: jest.Mock;
    let metadataCallback: jest.Mock;
    let messageHandler: (event: MessageEvent) => void;

    beforeEach(async () => {
      provider = new ElevenLabsTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
          outputFormat: 'pcm_16000',
        },
        logger
      );
      await provider.initialize();

      audioCallback = jest.fn();
      metadataCallback = jest.fn();
      provider.onAudio(audioCallback);
      provider.onMetadata(metadataCallback);

      // Capture the message handler
      mockWsManager.setHandlers.mockImplementation((handlers: any) => {
        messageHandler = handlers.onMessage;
      });

      await provider.connect();
    });

    afterEach(async () => {
      await provider.dispose();
    });

    it('should process base64 audio from JSON messages', () => {
      // Create a small base64-encoded audio chunk
      const audioData = new Uint8Array([1, 2, 3, 4, 5]);
      const base64Audio = Buffer.from(audioData).toString('base64');

      const event = {
        data: JSON.stringify({ audio: base64Audio }),
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

    it('should emit metadata on alignment data', () => {
      const event = {
        data: JSON.stringify({
          alignment: {
            char_start_times_ms: [0, 100, 200],
            chars_durations_ms: [100, 100, 100],
            chars: ['H', 'e', 'l'],
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

    it('should handle isFinal message', () => {
      const event = {
        data: JSON.stringify({ isFinal: true }),
      } as MessageEvent;

      // Should not throw
      expect(() => messageHandler(event)).not.toThrow();
    });

    it('should handle malformed messages gracefully', () => {
      const event = {
        data: 'not valid json{{{',
      } as MessageEvent;

      // Should not throw
      expect(() => messageHandler(event)).not.toThrow();
    });

    it('should use correct encoding for mp3 format', async () => {
      const mp3Provider = new ElevenLabsTTS(
        {
          apiKey: 'test-key',
          voiceId: 'test-voice-id',
          outputFormat: 'mp3_44100_128',
        },
        logger
      );
      await mp3Provider.initialize();

      const mp3AudioCallback = jest.fn();
      mp3Provider.onAudio(mp3AudioCallback);

      // Capture handler
      let mp3MessageHandler: (event: MessageEvent) => void;
      mockWsManager.setHandlers.mockImplementation((handlers: any) => {
        mp3MessageHandler = handlers.onMessage;
      });

      await mp3Provider.connect();

      const audioData = new Uint8Array([1, 2, 3]);
      const base64Audio = Buffer.from(audioData).toString('base64');

      mp3MessageHandler!({
        data: JSON.stringify({ audio: base64Audio }),
      } as MessageEvent);

      expect(mp3AudioCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            sampleRate: 44100,
            encoding: 'mp3',
          }),
        })
      );

      await mp3Provider.dispose();
    });
  });

  describe('Finalization', () => {
    let provider: ElevenLabsTTS;

    beforeEach(async () => {
      provider = new ElevenLabsTTS(
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

    it('should send EOS message on finalize', async () => {
      await provider.connect();
      mockWsManager.send.mockClear();

      await provider.finalize();

      expect(mockWsManager.send).toHaveBeenCalledWith(
        JSON.stringify({
          text: '',
          flush: true,
        })
      );
    });

    it('should not finalize when not connected', async () => {
      await expect(provider.finalize()).resolves.not.toThrow();
      expect(mockWsManager.send).not.toHaveBeenCalled();
    });
  });

  describe('Disconnection', () => {
    let provider: ElevenLabsTTS;

    beforeEach(async () => {
      provider = new ElevenLabsTTS(
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
        modelId: 'eleven_multilingual_v2' as const,
        outputFormat: 'pcm_24000' as const,
        stability: 0.7,
        similarityBoost: 0.8,
      };

      const provider = new ElevenLabsTTS(config, logger);
      await provider.initialize();

      const retrievedConfig = provider.getConfig();
      expect(retrievedConfig.apiKey).toBe(config.apiKey);
      expect((retrievedConfig as typeof config).voiceId).toBe(config.voiceId);
      expect((retrievedConfig as typeof config).modelId).toBe(config.modelId);
      expect(retrievedConfig.outputFormat).toBe(config.outputFormat);

      await provider.dispose();
    });

    it('should support all output formats', async () => {
      const formats = [
        'pcm_16000',
        'pcm_22050',
        'pcm_24000',
        'pcm_44100',
        'mp3_44100_128',
        'ulaw_8000',
      ];

      for (const format of formats) {
        const provider = new ElevenLabsTTS(
          {
            apiKey: 'test-key',
            voiceId: 'test-voice-id',
            outputFormat: format,
          },
          logger
        );

        await provider.initialize();
        expect(provider.isReady()).toBe(true);
        expect(provider.config.outputFormat).toBe(format);
        await provider.dispose();
      }
    });

    it('should support different model IDs', async () => {
      const models = [
        'eleven_turbo_v2_5',
        'eleven_turbo_v2',
        'eleven_multilingual_v2',
        'eleven_monolingual_v1',
      ];

      for (const modelId of models) {
        const provider = new ElevenLabsTTS(
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
  });
});
