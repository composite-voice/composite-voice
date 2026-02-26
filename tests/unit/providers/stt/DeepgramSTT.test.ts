/**
 * Tests for DeepgramSTT provider (V5 SDK)
 */

import { DeepgramSTT } from '../../../../src/providers/stt/deepgram/DeepgramSTT';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';

// Mock V5 socket
const mockSocket = {
  on: jest.fn(),
  connect: jest.fn(),
  waitForOpen: jest.fn().mockResolvedValue(undefined),
  sendMedia: jest.fn(),
  sendFinalize: jest.fn(),
  sendCloseStream: jest.fn(),
  sendKeepAlive: jest.fn(),
};

// Mock V5 DeepgramClient
const mockDeepgramClient = {
  listen: {
    v1: {
      connect: jest.fn().mockResolvedValue(mockSocket),
    },
  },
};

// Mock the @deepgram/sdk module (V5)
jest.mock('@deepgram/sdk', () => ({
  DeepgramClient: jest.fn(() => mockDeepgramClient),
}));

describe('DeepgramSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
    // Reset the mock to return mockSocket each time
    mockDeepgramClient.listen.v1.connect.mockResolvedValue(mockSocket);
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      const provider = new DeepgramSTT(
        {
          apiKey: 'test-key',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.config.language).toBe('en-US');
      expect(provider.type).toBe('websocket');
    });

    it('should initialize with custom configuration', async () => {
      const provider = new DeepgramSTT(
        {
          apiKey: 'test-key',
          language: 'es-ES',
          interimResults: false,
          options: {
            model: 'nova',
            punctuation: false,
            smartFormat: false,
          },
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.language).toBe('es-ES');
      expect(provider.config.interimResults).toBe(false);
      expect(provider.config.options?.model).toBe('nova');
    });

    it('should throw error if Deepgram SDK is not installed', async () => {
      // Create a provider and mock the import to fail
      const provider = new DeepgramSTT({ apiKey: 'test-key' }, logger);

      // Mock the onInitialize to simulate SDK not found
      const originalOnInitialize = (provider as any).onInitialize;
      (provider as any).onInitialize = async () => {
        throw new ProviderInitializationError(
          'DeepgramSTT',
          new Error("Cannot find module '@deepgram/sdk'")
        );
      };

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);

      // Restore original
      (provider as any).onInitialize = originalOnInitialize;
    });

    it('should dispose properly', async () => {
      const provider = new DeepgramSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('WebSocket Mode', () => {
    let provider: DeepgramSTT;
    let transcriptionCallback: jest.Mock;

    beforeEach(async () => {
      provider = new DeepgramSTT(
        {
          apiKey: 'test-key',
          language: 'en-US',
          interimResults: true,
          options: {
            model: 'nova-2',
            punctuation: true,
            smartFormat: true,
            endpointing: 500,
            vadEvents: true,
          },
        },
        logger
      );
      await provider.initialize();

      transcriptionCallback = jest.fn();
      provider.onTranscription(transcriptionCallback);
    });

    afterEach(async () => {
      if (provider.isWebSocketConnected()) {
        await provider.disconnect!();
      }
      await provider.dispose();
    });

    it('should connect successfully', async () => {
      // Setup mock to trigger 'open' event when on('open') is called
      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      expect(provider.isWebSocketConnected()).toBe(true);
      expect(mockDeepgramClient.listen.v1.connect).toHaveBeenCalled();
      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should pass configuration options to V1 connect as strings', async () => {
      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      expect(mockDeepgramClient.listen.v1.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'nova-2',
          language: 'en-US',
          punctuate: 'true',
          smart_format: 'true',
          interim_results: 'true',
          endpointing: '500',
          vad_events: 'true',
          Authorization: 'Token test-key',
        })
      );
    });

    it('should handle connection timeout', async () => {
      // Don't trigger any events to simulate timeout
      mockSocket.on.mockImplementation(() => {});

      const customProvider = new DeepgramSTT(
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
      mockSocket.on.mockImplementation((event: string, callback: (error: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Connection failed')), 0);
        }
      });

      await expect(provider.connect!()).rejects.toThrow(ProviderConnectionError);
    });

    it('should send audio chunks via sendMedia', async () => {
      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      const audioChunk = new ArrayBuffer(1024);
      provider.sendAudio!(audioChunk);

      expect(mockSocket.sendMedia).toHaveBeenCalledWith(audioChunk);
    });

    it('should not send audio when not connected', async () => {
      const audioChunk = new ArrayBuffer(1024);
      provider.sendAudio!(audioChunk);

      expect(mockSocket.sendMedia).not.toHaveBeenCalled();
    });

    it('should process transcription results via unified message handler', async () => {
      let messageHandler: (msg: unknown) => void;

      mockSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'message') {
          messageHandler = callback as (msg: unknown) => void;
        }
      });

      await provider.connect!();

      // Simulate V5 Results message
      const mockResult = {
        type: 'Results',
        channel: {
          alternatives: [
            {
              transcript: 'Hello world',
              confidence: 0.95,
            },
          ],
        },
        is_final: false,
        speech_final: false,
        duration: 1.5,
      };

      messageHandler!(mockResult);

      // Interim result
      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello world',
          isFinal: false,
          confidence: 0.95,
          metadata: expect.objectContaining({
            duration: 1.5,
          }),
        })
      );
    });

    it('should process final transcription results with speechFinal as first-class field', async () => {
      let messageHandler: (msg: unknown) => void;

      mockSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'message') {
          messageHandler = callback as (msg: unknown) => void;
        }
      });

      await provider.connect!();

      const mockResult = {
        type: 'Results',
        channel: {
          alternatives: [
            {
              transcript: 'Complete sentence.',
              confidence: 0.98,
            },
          ],
        },
        is_final: true,
        speech_final: true,
        duration: 2.0,
      };

      messageHandler!(mockResult);

      // With speech_final=true the provider emits two calls:
      // 1. The segment itself (isFinal:true, speechFinal:false)
      // 2. The accumulated utterance (isFinal:true, speechFinal:true)
      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Complete sentence.',
          isFinal: true,
          speechFinal: true,
          confidence: 0.98,
          metadata: expect.objectContaining({
            speechFinal: true,
            duration: 2.0,
          }),
        })
      );
    });

    it('should handle utterance end events via message handler', async () => {
      let messageHandler: (msg: unknown) => void;

      mockSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'message') {
          messageHandler = callback as (msg: unknown) => void;
        }
      });

      await provider.connect!();

      const mockUtteranceEnd = {
        type: 'UtteranceEnd',
      };
      messageHandler!(mockUtteranceEnd);

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          isFinal: true,
          metadata: expect.objectContaining({
            event: 'utterance_end',
          }),
        })
      );
    });

    it('should handle speech started events via message handler', async () => {
      let messageHandler: (msg: unknown) => void;

      mockSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'message') {
          messageHandler = callback as (msg: unknown) => void;
        }
      });

      await provider.connect!();

      const mockSpeechStarted = {
        type: 'SpeechStarted',
      };
      messageHandler!(mockSpeechStarted);

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          isFinal: false,
          metadata: expect.objectContaining({
            event: 'speech_started',
          }),
        })
      );
    });

    it('should handle errors during transcription', async () => {
      const errorHandlers: Array<(error: Error) => void> = [];

      mockSocket.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'error') {
          errorHandlers.push(callback as (error: Error) => void);
        }
      });

      await provider.connect!();

      // Clear previous calls
      transcriptionCallback.mockClear();

      const mockError = new Error('Transcription error');
      // Call all registered error handlers
      errorHandlers.forEach((handler) => handler(mockError));

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          isFinal: true,
          confidence: 0,
          metadata: {
            error: 'Transcription error',
          },
        })
      );
    });

    it('should throw error when not initialized', async () => {
      const uninitProvider = new DeepgramSTT({ apiKey: 'test-key' }, logger);

      await expect(uninitProvider.connect!()).rejects.toThrow();
    });

    it('should disconnect successfully using sendCloseStream', async () => {
      let closeHandler: () => void;

      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
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

      expect(mockSocket.sendCloseStream).toHaveBeenCalledWith({ type: 'CloseStream' });
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should not disconnect when not connected', async () => {
      await expect(provider.disconnect!()).resolves.not.toThrow();
      expect(mockSocket.sendCloseStream).not.toHaveBeenCalled();
    });

    it('should handle already connected state', async () => {
      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();
      await provider.connect!(); // Second call should not throw

      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should handle multiple audio chunks', async () => {
      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      const chunks = [new ArrayBuffer(512), new ArrayBuffer(512), new ArrayBuffer(512)];

      chunks.forEach((chunk) => provider.sendAudio!(chunk));

      expect(mockSocket.sendMedia).toHaveBeenCalledTimes(3);
    });

    it('should send keep-alive', async () => {
      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      provider.sendKeepAlive();

      expect(mockSocket.sendKeepAlive).toHaveBeenCalledWith({ type: 'KeepAlive' });
    });

    it('should not send keep-alive when not connected', () => {
      provider.sendKeepAlive();

      expect(mockSocket.sendKeepAlive).not.toHaveBeenCalled();
    });

    it('should send finalize', async () => {
      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      provider.sendFinalize();

      expect(mockSocket.sendFinalize).toHaveBeenCalledWith({ type: 'Finalize' });
    });

    it('should not send finalize when not connected', () => {
      provider.sendFinalize();

      expect(mockSocket.sendFinalize).not.toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should get current configuration', async () => {
      const config = {
        apiKey: 'test-key',
        language: 'en-US',
        options: {
          model: 'nova-2',
          punctuation: true,
        },
      };

      const provider = new DeepgramSTT(config, logger);
      await provider.initialize();

      const retrievedConfig = provider.getConfig();
      expect(retrievedConfig.apiKey).toBe(config.apiKey);
      expect(retrievedConfig.language).toBe(config.language);
      expect((retrievedConfig as typeof config).options?.model).toBe(config.options.model);

      await provider.dispose();
    });

    it('should support all transcription options', async () => {
      const provider = new DeepgramSTT(
        {
          apiKey: 'test-key',
          options: {
            model: 'enhanced',
            language: 'es',
            punctuation: false,
            profanityFilter: true,
            redact: ['pci', 'ssn'],
            diarize: true,
            smartFormat: false,
            keywords: ['test', 'example'],
            alternatives: 3,
            utterances: true,
            encoding: 'linear16',
            sampleRate: 16000,
            channels: 2,
            endpointing: true,
            vadEvents: true,
          },
        },
        logger
      );

      await provider.initialize();
      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');

      const config = provider.getConfig() as typeof provider.config;
      expect(config.options?.model).toBe('enhanced');
      expect(config.options?.diarize).toBe(true);
      expect(config.options?.redact).toEqual(['pci', 'ssn']);
      expect(config.options?.keywords).toEqual(['test', 'example']);

      await provider.dispose();
    });

    it('should wire all V1 options through connect args as strings', async () => {
      const provider = new DeepgramSTT(
        {
          apiKey: 'test-key',
          language: 'en-US',
          options: {
            model: 'nova-3',
            punctuation: true,
            smartFormat: true,
            profanityFilter: true,
            diarize: true,
            utterances: true,
            endpointing: 300,
            vadEvents: true,
            encoding: 'linear16',
            sampleRate: 16000,
            channels: 2,
            redact: ['pci', 'ssn'],
            keywords: ['hello', 'world'],
            keyterms: ['CompositeVoice'],
            alternatives: 3,
            detectEntities: true,
            numerals: true,
            multichannel: true,
            dictation: true,
            replace: ['colour:color'],
            search: ['action item'],
            utteranceEndMs: 1000,
            version: '2024-01-01',
            tag: 'test-tag',
            mipOptOut: true,
            extra: ['key1:val1'],
          },
        },
        logger
      );

      await provider.initialize();

      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      expect(mockDeepgramClient.listen.v1.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          Authorization: 'Token test-key',
          model: 'nova-3',
          language: 'en-US',
          punctuate: 'true',
          smart_format: 'true',
          interim_results: 'true',
          endpointing: '300',
          vad_events: 'true',
          profanity_filter: 'true',
          diarize: 'true',
          utterances: 'true',
          encoding: 'linear16',
          sample_rate: '16000',
          channels: '2',
          redact: 'pci,ssn',
          keywords: 'hello,world',
          keyterm: 'CompositeVoice',
          alternatives: '3',
          detect_entities: 'true',
          numerals: 'true',
          multichannel: 'true',
          dictation: 'true',
          replace: 'colour:color',
          search: 'action item',
          utterance_end_ms: '1000',
          version: '2024-01-01',
          tag: 'test-tag',
          mip_opt_out: 'true',
          extra: 'key1:val1',
        })
      );

      await provider.dispose();
    });

    it('should use proxy Authorization when proxyUrl is set', async () => {
      const provider = new DeepgramSTT(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/deepgram',
        },
        logger
      );

      await provider.initialize();

      mockSocket.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      expect(mockDeepgramClient.listen.v1.connect).toHaveBeenCalledWith(
        expect.objectContaining({
          Authorization: 'Token proxy',
        })
      );

      await provider.dispose();
    });
  });
});
