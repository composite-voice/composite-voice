/**
 * Tests for DeepgramTTS provider (V5 SDK)
 */

import { DeepgramTTS } from '../../../../src/providers/tts/deepgram/DeepgramTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';

// Mock raw WebSocket that backs the V5 socket
const rawSocketListeners: Record<string, Array<(event: unknown) => void>> = {};
const mockRawSocket = {
  addEventListener: jest.fn((event: string, handler: (event: unknown) => void) => {
    if (!rawSocketListeners[event]) {
      rawSocketListeners[event] = [];
    }
    rawSocketListeners[event].push(handler);
  }),
};

// Mock the V5 speak socket returned by speak.v1.connect()
const mockSpeakSocket = {
  on: jest.fn(),
  sendText: jest.fn(),
  sendFlush: jest.fn(),
  sendClear: jest.fn(),
  sendClose: jest.fn(),
  close: jest.fn(),
  socket: mockRawSocket,
};

const mockDeepgramClient = {
  speak: {
    v1: {
      connect: jest.fn((_options?: Record<string, unknown>) => Promise.resolve(mockSpeakSocket)),
    },
  },
};

// Mock the V5 DeepgramClient constructor
const MockDeepgramClient = jest.fn(() => mockDeepgramClient);

// Mock the @deepgram/sdk module (V5)
jest.mock('@deepgram/sdk', () => ({
  DeepgramClient: MockDeepgramClient,
}));

describe('DeepgramTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset raw socket listeners
    Object.keys(rawSocketListeners).forEach((key) => delete rawSocketListeners[key]);
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
      expect(MockDeepgramClient).toHaveBeenCalledWith({ apiKey: 'test-key' });
      expect(provider.config.voice).toBe('aura-2-thalia-en');
      expect(provider.config.sampleRate).toBe(24000);
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
    });

    it('should initialize in proxy mode', async () => {
      const provider = new DeepgramTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/deepgram',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(MockDeepgramClient).toHaveBeenCalledWith({
        apiKey: 'proxy',
        baseUrl: 'ws://localhost:3001/api/proxy/deepgram',
      });
    });

    it('should throw error if neither apiKey nor proxyUrl is configured', async () => {
      const provider = new DeepgramTTS({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
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
      // Setup mock to trigger 'open' event
      mockSpeakSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      expect(provider.isWebSocketConnected()).toBe(true);
      expect(mockDeepgramClient.speak.v1.connect).toHaveBeenCalled();
    });

    it('should pass configuration options to V5 connect', async () => {
      mockSpeakSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      expect(mockDeepgramClient.speak.v1.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'aura-asteria-en',
          encoding: 'linear16',
          sample_rate: '24000',
        })
      );
    });

    it('should pass sample_rate as string (V5 requirement)', async () => {
      mockSpeakSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      const connectCall = mockDeepgramClient.speak.v1.connect.mock.calls[0]?.[0] as
        | Record<string, unknown>
        | undefined;
      expect(connectCall).toBeDefined();
      expect(typeof connectCall!.sample_rate).toBe('string');
      expect(connectCall!.sample_rate).toBe('24000');
    });

    it('should handle connection timeout', async () => {
      // Don't trigger any events to simulate timeout
      mockSpeakSocket.on.mockImplementation(() => {});

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
      mockSpeakSocket.on.mockImplementation((event: string, callback: (error: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Connection failed')), 0);
        }
      });

      await expect(provider.connect!()).rejects.toThrow(ProviderConnectionError);
    });

    it('should send text chunks via V5 sendText', async () => {
      mockSpeakSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      const text = 'Hello, world!';
      provider.sendText!(text);

      expect(mockSpeakSocket.sendText).toHaveBeenCalledWith({ type: 'Speak', text });
    });

    it('should not send text when not connected', async () => {
      const text = 'Hello, world!';
      provider.sendText!(text);

      expect(mockSpeakSocket.sendText).not.toHaveBeenCalled();
    });

    it('should process binary audio data from raw socket', async () => {
      mockSpeakSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      // Simulate binary audio data via the raw socket
      const mockAudioData = new ArrayBuffer(1024);
      const messageListeners = rawSocketListeners['message'] || [];
      expect(messageListeners.length).toBeGreaterThan(0);

      // Fire the raw socket message event with binary data
      messageListeners.forEach((listener) => {
        listener({ data: mockAudioData });
      });

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

    it('should handle Buffer audio data from raw socket', async () => {
      mockSpeakSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      // Simulate Buffer data (Node.js style) via raw socket
      const buffer = Buffer.from(new Uint8Array(1024));
      const messageListeners = rawSocketListeners['message'] || [];

      messageListeners.forEach((listener) => {
        listener({ data: buffer });
      });

      expect(audioCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.any(ArrayBuffer),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should process metadata from V5 message event', async () => {
      let messageHandler: (msg: unknown) => void;

      mockSpeakSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'message') {
          messageHandler = callback as (msg: unknown) => void;
        }
      });

      await provider.connect!();

      // Simulate a V5 Metadata message
      const mockMetadata = {
        type: 'Metadata',
        request_id: 'test-request-id',
        model_name: 'aura-asteria-en',
        model_version: '1.0.0',
        model_uuid: 'test-uuid',
      };

      messageHandler!(mockMetadata);

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

    it('should handle Flushed message from V5', async () => {
      let messageHandler: (msg: unknown) => void;

      mockSpeakSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'message') {
          messageHandler = callback as (msg: unknown) => void;
        }
      });

      await provider.connect!();

      // Trigger Flushed message -- should not throw
      messageHandler!({ type: 'Flushed' });

      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should handle Cleared message from V5', async () => {
      let messageHandler: (msg: unknown) => void;

      mockSpeakSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'message') {
          messageHandler = callback as (msg: unknown) => void;
        }
      });

      await provider.connect!();

      // Trigger Cleared message -- should not throw
      messageHandler!({ type: 'Cleared' });

      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should handle Warning message from V5', async () => {
      let messageHandler: (msg: unknown) => void;

      mockSpeakSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'message') {
          messageHandler = callback as (msg: unknown) => void;
        }
      });

      await provider.connect!();

      // Trigger Warning message -- should not throw
      messageHandler!({ type: 'Warning' });

      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should ignore string messages in V5 message handler', async () => {
      let messageHandler: (msg: unknown) => void;

      mockSpeakSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'message') {
          messageHandler = callback as (msg: unknown) => void;
        }
      });

      await provider.connect!();

      // String messages should be silently handled
      expect(() => {
        messageHandler!('some unrecognized string');
      }).not.toThrow();
    });

    it('should finalize synthesis via V5 sendFlush', async () => {
      let messageHandler: (msg: unknown) => void;

      mockSpeakSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'message') {
          messageHandler = callback as (msg: unknown) => void;
        }
      });

      await provider.connect!();

      // Trigger finalize
      const finalizePromise = provider.finalize!();

      // Simulate the Flushed response
      messageHandler!({ type: 'Flushed' });
      await finalizePromise;

      expect(mockSpeakSocket.sendFlush).toHaveBeenCalledWith({ type: 'Flush' });
    });

    it('should not finalize when not connected', async () => {
      await expect(provider.finalize!()).resolves.not.toThrow();
      expect(mockSpeakSocket.sendFlush).not.toHaveBeenCalled();
    });

    it('should clear buffer via V5 sendClear', async () => {
      mockSpeakSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      provider.clearBuffer();

      expect(mockSpeakSocket.sendClear).toHaveBeenCalledWith({ type: 'Clear' });
    });

    it('should not clear buffer when not connected', () => {
      provider.clearBuffer();

      expect(mockSpeakSocket.sendClear).not.toHaveBeenCalled();
    });

    it('should handle errors during synthesis', async () => {
      const errorHandlers: Array<(error: Error) => void> = [];

      mockSpeakSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'error') {
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

    it('should disconnect successfully via V5 sendClose and close', async () => {
      let closeHandler: () => void;

      mockSpeakSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'close') {
          closeHandler = callback;
        }
      });

      await provider.connect!();
      expect(provider.isWebSocketConnected()).toBe(true);

      // Trigger disconnect
      const disconnectPromise = provider.disconnect!();
      closeHandler!();
      await disconnectPromise;

      expect(mockSpeakSocket.sendFlush).toHaveBeenCalledWith({ type: 'Flush' });
      expect(mockSpeakSocket.sendClose).toHaveBeenCalledWith({ type: 'Close' });
      expect(mockSpeakSocket.close).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should not disconnect when not connected', async () => {
      await expect(provider.disconnect!()).resolves.not.toThrow();
      expect(mockSpeakSocket.sendClose).not.toHaveBeenCalled();
    });

    it('should handle already connected state', async () => {
      mockSpeakSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();
      await provider.connect!(); // Second call should not throw

      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should handle multiple text chunks', async () => {
      mockSpeakSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      const chunks = ['Hello', ' ', 'world', '!'];

      chunks.forEach((chunk) => provider.sendText!(chunk));

      expect(mockSpeakSocket.sendText).toHaveBeenCalledTimes(4);
      chunks.forEach((chunk) => {
        expect(mockSpeakSocket.sendText).toHaveBeenCalledWith({ type: 'Speak', text: chunk });
      });
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
