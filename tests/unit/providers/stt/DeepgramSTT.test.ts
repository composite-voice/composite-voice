/**
 * Tests for DeepgramSTT provider
 */

import { DeepgramSTT } from '../../../../src/providers/stt/deepgram/DeepgramSTT';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';

// Mock the Deepgram SDK
const mockLiveClient = {
  on: jest.fn(),
  send: jest.fn(),
  finish: jest.fn(),
};

const mockDeepgramClient = {
  listen: {
    live: jest.fn(() => mockLiveClient),
    prerecorded: {
      transcribeFile: jest.fn(),
    },
  },
};

const mockCreateClient = jest.fn(() => mockDeepgramClient);

// Mock the @deepgram/sdk module
jest.mock('@deepgram/sdk', () => ({
  createClient: () => mockCreateClient(),
}));

describe('DeepgramSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
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
      expect(mockCreateClient).toHaveBeenCalled();
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
      // Setup mock to trigger 'open' event
      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      expect(provider.isWebSocketConnected()).toBe(true);
      expect(mockDeepgramClient.listen.live).toHaveBeenCalled();
    });

    it('should pass configuration options to live connection', async () => {
      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      expect(mockDeepgramClient.listen.live).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'nova-2',
          language: 'en-US',
          punctuate: true,
          smart_format: true,
          interim_results: true,
          endpointing: 500,
          vad_events: true,
        })
      );
    });

    it('should handle connection timeout', async () => {
      // Don't trigger any events to simulate timeout
      mockLiveClient.on.mockImplementation(() => {});

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
      mockLiveClient.on.mockImplementation((event: string, callback: (error: Error) => void) => {
        if (event === 'error') {
          setTimeout(() => callback(new Error('Connection failed')), 0);
        }
      });

      await expect(provider.connect!()).rejects.toThrow(ProviderConnectionError);
    });

    it('should send audio chunks', async () => {
      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      const audioChunk = new ArrayBuffer(1024);
      provider.sendAudio!(audioChunk);

      expect(mockLiveClient.send).toHaveBeenCalled();
    });

    it('should not send audio when not connected', async () => {
      const audioChunk = new ArrayBuffer(1024);
      provider.sendAudio!(audioChunk);

      expect(mockLiveClient.send).not.toHaveBeenCalled();
    });

    it('should process transcription results', async () => {
      let transcriptHandler: (data: unknown) => void;

      mockLiveClient.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'Transcript') {
          transcriptHandler = callback as (data: unknown) => void;
        }
      });

      await provider.connect!();

      // Simulate transcription result
      const mockResult = {
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

      transcriptHandler!(mockResult);

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello world',
          isFinal: false,
          confidence: 0.95,
          metadata: {
            speechFinal: false,
            duration: 1.5,
          },
        })
      );
    });

    it('should process final transcription results', async () => {
      let transcriptHandler: (data: unknown) => void;

      mockLiveClient.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'Transcript') {
          transcriptHandler = callback as (data: unknown) => void;
        }
      });

      await provider.connect!();

      const mockResult = {
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

      transcriptHandler!(mockResult);

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Complete sentence.',
          isFinal: true,
          confidence: 0.98,
          metadata: {
            speechFinal: true,
            duration: 2.0,
          },
        })
      );
    });

    it('should handle utterance end events', async () => {
      let utteranceEndHandler: (data: unknown) => void;

      mockLiveClient.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'UtteranceEnd') {
          utteranceEndHandler = callback as (data: unknown) => void;
        }
      });

      await provider.connect!();

      const mockUtteranceData = { timestamp: Date.now() };
      utteranceEndHandler!(mockUtteranceData);

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          isFinal: true,
          metadata: {
            event: 'utterance_end',
            data: mockUtteranceData,
          },
        })
      );
    });

    it('should handle speech started events', async () => {
      let speechStartedHandler: (data: unknown) => void;

      mockLiveClient.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        } else if (event === 'SpeechStarted') {
          speechStartedHandler = callback as (data: unknown) => void;
        }
      });

      await provider.connect!();

      const mockSpeechData = { timestamp: Date.now() };
      speechStartedHandler!(mockSpeechData);

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          isFinal: false,
          metadata: {
            event: 'speech_started',
            data: mockSpeechData,
          },
        })
      );
    });

    it('should handle errors during transcription', async () => {
      const errorHandlers: Array<(error: Error) => void> = [];

      mockLiveClient.on.mockImplementation((event: string, callback: (data?: unknown) => void) => {
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

    it('should disconnect successfully', async () => {
      let closeHandler: () => void;

      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
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

      expect(mockLiveClient.finish).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should not disconnect when not connected', async () => {
      await expect(provider.disconnect!()).resolves.not.toThrow();
      expect(mockLiveClient.finish).not.toHaveBeenCalled();
    });

    it('should handle already connected state', async () => {
      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();
      await provider.connect!(); // Second call should not throw

      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should handle multiple audio chunks', async () => {
      mockLiveClient.on.mockImplementation((event: string, callback: () => void) => {
        if (event === 'open') {
          setTimeout(callback, 0);
        }
      });

      await provider.connect!();

      const chunks = [new ArrayBuffer(512), new ArrayBuffer(512), new ArrayBuffer(512)];

      chunks.forEach((chunk) => provider.sendAudio!(chunk));

      expect(mockLiveClient.send).toHaveBeenCalledTimes(3);
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
  });
});
