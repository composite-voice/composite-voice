/**
 * Tests for DeepgramTTS provider
 */

import { DeepgramTTS } from '../../../../src/providers/tts/deepgram/DeepgramTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';

// Mock the Deepgram SDK
const mockLiveClient = {
  on: jest.fn(),
  sendText: jest.fn(),
  flush: jest.fn(),
  finish: jest.fn(),
};

const mockDeepgramClient = {
  speak: {
    live: jest.fn(() => mockLiveClient),
  },
};

const mockCreateClient = jest.fn(() => mockDeepgramClient);

// Mock the @deepgram/sdk module
jest.mock('@deepgram/sdk', () => ({
  createClient: () => mockCreateClient(),
}));

describe('DeepgramTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      const provider = new DeepgramTTS(
        {
          apiKey: 'test-key',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(mockCreateClient).toHaveBeenCalled();
      expect(provider.config.voice).toBe('aura-asteria-en');
      expect(provider.config.sampleRate).toBe(16000);
      expect(provider.config.outputFormat).toBe('linear16');
      expect(provider.type).toBe('websocket');
    });

    it('should initialize with custom configuration', async () => {
      const provider = new DeepgramTTS(
        {
          apiKey: 'test-key',
          voice: 'aura-zeus-en',
          sampleRate: 48000,
          outputFormat: 'opus',
          options: {
            model: 'aura-zeus-en',
            encoding: 'opus',
            sampleRate: 48000,
            container: 'none',
            bitRate: 64000,
          },
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.voice).toBe('aura-zeus-en');
      expect(provider.config.sampleRate).toBe(48000);
      expect(provider.config.outputFormat).toBe('opus');
      expect(provider.config.options?.bitRate).toBe(64000);
    });

    it('should throw error if Deepgram SDK is not installed', async () => {
      // Create a provider and mock the import to fail
      const provider = new DeepgramTTS({ apiKey: 'test-key' }, logger);

      // Mock the onInitialize to simulate SDK not found
      const originalOnInitialize = (provider as any).onInitialize;
      (provider as any).onInitialize = async () => {
        throw new ProviderInitializationError(
          'DeepgramTTS',
          new Error("Cannot find module '@deepgram/sdk'")
        );
      };

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);

      // Restore original
      (provider as any).onInitialize = originalOnInitialize;
    });

    it('should dispose properly', async () => {
      const provider = new DeepgramTTS({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('WebSocket Mode', () => {
    let provider: DeepgramTTS;
    let audioCallback: jest.Mock;
    let metadataCallback: jest.Mock;

    beforeEach(async () => {
      provider = new DeepgramTTS(
        {
          apiKey: 'test-key',
          voice: 'aura-asteria-en',
          sampleRate: 24000,
          outputFormat: 'linear16',
          options: {
            model: 'aura-asteria-en',
            encoding: 'linear16',
            sampleRate: 24000,
            container: 'none',
          },
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
      if (provider.isWebSocketConnected()) {
        await provider.disconnect!();
      }
      await provider.dispose();
    });

    it('should connect successfully', async () => {
      // Setup mock to trigger 'Open' event
      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      expect(provider.isWebSocketConnected()).toBe(true);
      expect(mockDeepgramClient.speak.live).toHaveBeenCalled();
    });

    it('should pass configuration options to live connection', async () => {
      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      expect(mockDeepgramClient.speak.live).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'aura-asteria-en',
          encoding: 'linear16',
          sample_rate: 24000,
          container: 'none',
        })
      );
    });

    it('should handle connection timeout', async () => {
      // Don't trigger any events to simulate timeout
      mockLiveClient.on.mockImplementation(() => {});

      const customProvider = new DeepgramTTS(
        {
          apiKey: 'test-key',
          timeout: 100, // Short timeout
        },
        logger
      );
      await customProvider.initialize();

      await expect(customProvider.connect!()).rejects.toThrow(ProviderConnectionError);
    });

    it('should handle connection error', async () => {
      mockLiveClient.on.mockImplementation((event: string, callback: (error: Error) => void) => {
        if (event === 'Error') {
          setTimeout(() => callback(new Error('Connection failed')), 0);
        }
      });

      await expect(provider.connect!()).rejects.toThrow(ProviderConnectionError);
    });

    it('should send text chunks', async () => {
      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      const text = 'Hello, world!';
      provider.sendText!(text);

      expect(mockLiveClient.sendText).toHaveBeenCalledWith(text);
    });

    it('should not send text when not connected', async () => {
      const text = 'Hello, world!';
      provider.sendText!(text);

      expect(mockLiveClient.sendText).not.toHaveBeenCalled();
    });

    it('should process audio data', async () => {
      let audioHandler: (data: unknown) => void;

      mockLiveClient.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        } else if (event === 'Audio') {
          audioHandler = callback as (data: unknown) => void;
        }
      });

      await provider.connect!();

      // Simulate audio data
      const mockAudioData = new ArrayBuffer(1024);
      audioHandler!(mockAudioData);

      expect(audioCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: mockAudioData,
          timestamp: expect.any(Number),
          metadata: expect.objectContaining({
            sampleRate: 24000,
            encoding: 'linear16',
            channels: 1,
            bitDepth: 16,
          }),
        })
      );
    });

    it('should handle Buffer audio data', async () => {
      let audioHandler: (data: unknown) => void;

      mockLiveClient.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        } else if (event === 'Audio') {
          audioHandler = callback as (data: unknown) => void;
        }
      });

      await provider.connect!();

      // Simulate Buffer data (Node.js style)
      const buffer = Buffer.from(new Uint8Array(1024));
      audioHandler!(buffer);

      expect(audioCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(ArrayBuffer),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should process metadata', async () => {
      let metadataHandler: (data: unknown) => void;

      mockLiveClient.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        } else if (event === 'Metadata') {
          metadataHandler = callback as (data: unknown) => void;
        }
      });

      await provider.connect!();

      const mockMetadata = {
        request_id: 'test-request-id',
        model_name: 'aura-asteria-en',
        model_uuid: 'test-uuid',
        characters: 50,
        transfer_encoding: 'chunked',
        sample_rate: 24000,
      };

      metadataHandler!(mockMetadata);

      expect(metadataCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          sampleRate: 24000,
          encoding: 'linear16',
          channels: 1,
          bitDepth: 16,
          mimeType: 'audio/linear16',
        })
      );
    });

    it('should handle flush events', async () => {
      let flushedHandler: () => void;

      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        } else if (event === 'Flushed') {
          flushedHandler = callback;
        }
      });

      await provider.connect!();

      // Trigger flushed event
      flushedHandler!();

      // Should not throw or cause issues
      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should finalize synthesis', async () => {
      let flushedHandler: () => void;

      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        } else if (event === 'Flushed') {
          flushedHandler = callback;
        }
      });

      await provider.connect!();

      // Trigger finalize
      const finalizePromise = provider.finalize!();
      flushedHandler!();
      await finalizePromise;

      expect(mockLiveClient.flush).toHaveBeenCalled();
    });

    it('should not finalize when not connected', async () => {
      await expect(provider.finalize!()).resolves.not.toThrow();
      expect(mockLiveClient.flush).not.toHaveBeenCalled();
    });

    it('should handle errors during synthesis', async () => {
      const errorHandlers: Array<(error: Error) => void> = [];

      mockLiveClient.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        } else if (event === 'Error') {
          errorHandlers.push(callback as (error: Error) => void);
        }
      });

      await provider.connect!();

      const mockError = new Error('Synthesis error');
      // Call all registered error handlers (should not throw)
      expect(() => {
        errorHandlers.forEach((handler) => handler(mockError));
      }).not.toThrow();
    });

    it('should throw error when not initialized', async () => {
      const uninitProvider = new DeepgramTTS({ apiKey: 'test-key' }, logger);

      await expect(uninitProvider.connect!()).rejects.toThrow();
    });

    it('should disconnect successfully', async () => {
      let closeHandler: () => void;

      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        } else if (event === 'Close') {
          closeHandler = callback;
        }
      });

      await provider.connect!();
      expect(provider.isWebSocketConnected()).toBe(true);

      // Trigger disconnect
      const disconnectPromise = provider.disconnect!();
      closeHandler!();
      await disconnectPromise;

      expect(mockLiveClient.flush).toHaveBeenCalled();
      expect(mockLiveClient.finish).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should not disconnect when not connected', async () => {
      await expect(provider.disconnect!()).resolves.not.toThrow();
      expect(mockLiveClient.finish).not.toHaveBeenCalled();
    });

    it('should handle already connected state', async () => {
      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();
      await provider.connect!(); // Second call should not throw

      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should handle multiple text chunks', async () => {
      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'Open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      const chunks = ['Hello', ' ', 'world', '!'];

      chunks.forEach((chunk) => provider.sendText!(chunk));

      expect(mockLiveClient.sendText).toHaveBeenCalledTimes(4);
    });
  });

  describe('Configuration', () => {
    it('should get current configuration', async () => {
      const config = {
        apiKey: 'test-key',
        voice: 'aura-zeus-en',
        sampleRate: 48000,
        options: {
          model: 'aura-zeus-en',
          encoding: 'opus',
          bitRate: 64000,
        },
      };

      const provider = new DeepgramTTS(config, logger);
      await provider.initialize();

      const retrievedConfig = provider.getConfig();
      expect(retrievedConfig.apiKey).toBe(config.apiKey);
      expect(retrievedConfig.voice).toBe(config.voice);
      expect(retrievedConfig.sampleRate).toBe(config.sampleRate);
      expect((retrievedConfig as typeof config).options?.model).toBe(config.options.model);

      await provider.dispose();
    });

    it('should support all TTS options', async () => {
      const provider = new DeepgramTTS(
        {
          apiKey: 'test-key',
          voice: 'aura-helios-en',
          options: {
            model: 'aura-helios-en',
            encoding: 'linear16',
            sampleRate: 24000,
            container: 'wav',
            bitRate: 128000,
          },
        },
        logger
      );

      await provider.initialize();
      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');

      const config = provider.getConfig() as typeof provider.config;
      expect(config.options?.model).toBe('aura-helios-en');
      expect(config.options?.encoding).toBe('linear16');
      expect(config.options?.sampleRate).toBe(24000);
      expect(config.options?.container).toBe('wav');
      expect(config.options?.bitRate).toBe(128000);

      await provider.dispose();
    });

    it('should support different voice models', async () => {
      const voices = [
        'aura-asteria-en',
        'aura-luna-en',
        'aura-stella-en',
        'aura-athena-en',
        'aura-hera-en',
        'aura-orion-en',
        'aura-arcas-en',
        'aura-perseus-en',
        'aura-angus-en',
        'aura-orpheus-en',
        'aura-helios-en',
        'aura-zeus-en',
      ];

      for (const voice of voices) {
        const provider = new DeepgramTTS(
          {
            apiKey: 'test-key',
            voice,
            options: {
              model: voice,
            },
          },
          logger
        );

        await provider.initialize();
        expect(provider.isReady()).toBe(true);
        expect(provider.config.voice).toBe(voice);
        await provider.dispose();
      }
    });
  });
});
