/**
 * Tests for DeepgramSTT provider (native WebSocket — no SDK)
 */

import { DeepgramSTT } from '../../../../src/providers/stt/deepgram/DeepgramSTT';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';

// ─── Mock WebSocket ────────────────────────────────────────────────────────

/** Captured handler assignments from the most recently constructed MockWebSocket. */
let mockWs: MockWebSocket;

class MockWebSocket {
  url: string;
  protocols: string | string[] | undefined;
  binaryType = 'blob';

  // Handler slots mirroring the real WebSocket API
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;

  send = jest.fn();
  close = jest.fn();

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    mockWs = this;
  }

  // ─── Helpers for simulating server-side behaviour in tests ──────────

  /** Simulate the WebSocket `open` event. */
  _triggerOpen(): void {
    this.onopen?.({} as Event);
  }

  /** Simulate a text message from Deepgram (JSON). */
  _triggerMessage(data: string | ArrayBuffer): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  /** Simulate a WebSocket error. */
  _triggerError(message = 'connection failed'): void {
    this.onerror?.({ message } as unknown as Event);
  }

  /** Simulate the WebSocket `close` event. */
  _triggerClose(code = 1000, reason = ''): void {
    this.onclose?.({ code, reason } as CloseEvent);
  }
}

// Install the mock globally so `new WebSocket(...)` in the provider hits it.
(globalThis as any).WebSocket = MockWebSocket;

// ────────────────────────────────────────────────────────────────────────────

describe('DeepgramSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  // ─── Initialization ──────────────────────────────────────────────────

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      const provider = new DeepgramSTT({ apiKey: 'test-key' }, logger);

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

    it('should throw error when neither apiKey nor proxyUrl is set', async () => {
      const provider = new DeepgramSTT({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should dispose properly', async () => {
      const provider = new DeepgramSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  // ─── WebSocket Mode ──────────────────────────────────────────────────

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

    /** Helper: connect the provider by triggering `onopen`. */
    async function connectProvider(): Promise<void> {
      const connectPromise = provider.connect!();
      // The constructor runs synchronously, so mockWs is ready
      mockWs._triggerOpen();
      await connectPromise;
    }

    it('should connect successfully via native WebSocket', async () => {
      await connectProvider();

      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should build connection URL with query parameters', async () => {
      await connectProvider();

      const url = new URL(mockWs.url);
      expect(url.pathname).toBe('/v1/listen');
      expect(url.searchParams.get('model')).toBe('nova-2');
      expect(url.searchParams.get('language')).toBe('en-US');
      expect(url.searchParams.get('punctuate')).toBe('true');
      expect(url.searchParams.get('smart_format')).toBe('true');
      expect(url.searchParams.get('interim_results')).toBe('true');
      expect(url.searchParams.get('endpointing')).toBe('500');
      expect(url.searchParams.get('vad_events')).toBe('true');
    });

    it('should use subprotocol auth in direct mode', async () => {
      await connectProvider();

      expect(mockWs.protocols).toEqual(['token', 'test-key']);
    });

    it('should use no subprotocol in proxy mode', async () => {
      const proxyProvider = new DeepgramSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/deepgram' },
        logger
      );
      await proxyProvider.initialize();

      const proxyConnectPromise = proxyProvider.connect!();
      mockWs._triggerOpen();
      await proxyConnectPromise;

      expect(mockWs.protocols).toBeUndefined();
      expect(mockWs.url).toContain('ws://localhost:3001/api/proxy/deepgram/v1/listen');

      await proxyProvider.dispose();
    });

    it('should handle connection timeout', async () => {
      const customProvider = new DeepgramSTT(
        { apiKey: 'test-key', timeout: 100 },
        logger
      );
      await customProvider.initialize();

      // Don't trigger onopen — let it time out
      await expect(customProvider.connect!()).rejects.toThrow(ProviderConnectionError);
    });

    it('should handle connection error', async () => {
      const connectPromise = provider.connect!();
      mockWs._triggerError('Connection refused');
      await expect(connectPromise).rejects.toThrow(ProviderConnectionError);
    });

    it('should send audio chunks via ws.send()', async () => {
      await connectProvider();

      const audioChunk = new ArrayBuffer(1024);
      provider.sendAudio!(audioChunk);

      expect(mockWs.send).toHaveBeenCalledWith(audioChunk);
    });

    it('should not send audio when not connected', () => {
      const audioChunk = new ArrayBuffer(1024);
      provider.sendAudio!(audioChunk);

      expect(mockWs?.send).not.toHaveBeenCalled();
    });

    it('should process interim transcription results', async () => {
      await connectProvider();

      const mockResult = {
        type: 'Results',
        channel: {
          alternatives: [{ transcript: 'Hello world', confidence: 0.95 }],
        },
        is_final: false,
        speech_final: false,
        duration: 1.5,
      };

      mockWs._triggerMessage(JSON.stringify(mockResult));

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello world',
          isFinal: false,
          confidence: 0.95,
          metadata: expect.objectContaining({ duration: 1.5 }),
        })
      );
    });

    it('should process final transcription results with speechFinal', async () => {
      await connectProvider();

      const mockResult = {
        type: 'Results',
        channel: {
          alternatives: [{ transcript: 'Complete sentence.', confidence: 0.98 }],
        },
        is_final: true,
        speech_final: true,
        duration: 2.0,
      };

      mockWs._triggerMessage(JSON.stringify(mockResult));

      // With speech_final=true the provider emits two calls:
      // 1. The segment itself (isFinal:true, speechFinal:false)
      // 2. The accumulated utterance (isFinal:true, speechFinal:true)
      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Complete sentence.',
          isFinal: true,
          speechFinal: true,
          confidence: 0.98,
          metadata: expect.objectContaining({ speechFinal: true, duration: 2.0 }),
        })
      );
    });

    it('should accumulate utterance buffer across multiple is_final segments', async () => {
      await connectProvider();

      // First is_final segment (not speech_final yet)
      mockWs._triggerMessage(
        JSON.stringify({
          type: 'Results',
          channel: { alternatives: [{ transcript: 'Hello', confidence: 0.9 }] },
          is_final: true,
          speech_final: false,
          duration: 1.0,
        })
      );

      // Second is_final segment with speech_final
      mockWs._triggerMessage(
        JSON.stringify({
          type: 'Results',
          channel: { alternatives: [{ transcript: 'world', confidence: 0.95 }] },
          is_final: true,
          speech_final: true,
          duration: 1.5,
        })
      );

      // The speech_final emission should contain the full accumulated utterance
      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello world',
          isFinal: true,
          speechFinal: true,
        })
      );
    });

    it('should handle UtteranceEnd events', async () => {
      await connectProvider();

      mockWs._triggerMessage(
        JSON.stringify({ type: 'UtteranceEnd', last_word_end: 1.5 })
      );

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          isFinal: true,
          metadata: expect.objectContaining({ event: 'utterance_end' }),
        })
      );
    });

    it('should handle SpeechStarted events', async () => {
      await connectProvider();

      mockWs._triggerMessage(JSON.stringify({ type: 'SpeechStarted' }));

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          isFinal: false,
          metadata: expect.objectContaining({ event: 'speech_started' }),
        })
      );
    });

    it('should handle WebSocket errors after connection', async () => {
      await connectProvider();
      transcriptionCallback.mockClear();

      mockWs._triggerError('Transcription error');

      expect(transcriptionCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          isFinal: true,
          confidence: 0,
          metadata: expect.objectContaining({ error: expect.any(String) }),
        })
      );
    });

    it('should throw error when not initialized', async () => {
      const uninitProvider = new DeepgramSTT({ apiKey: 'test-key' }, logger);

      await expect(uninitProvider.connect!()).rejects.toThrow();
    });

    it('should disconnect successfully', async () => {
      await connectProvider();
      expect(provider.isWebSocketConnected()).toBe(true);

      // disconnect sends CloseStream then waits for close event
      const disconnectPromise = provider.disconnect!();
      mockWs._triggerClose();
      await disconnectPromise;

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'CloseStream' })
      );
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should not disconnect when not connected', async () => {
      await expect(provider.disconnect!()).resolves.not.toThrow();
    });

    it('should handle already connected state', async () => {
      await connectProvider();
      await provider.connect!(); // Second call should not throw (no-op)

      expect(provider.isWebSocketConnected()).toBe(true);
    });

    it('should handle multiple audio chunks', async () => {
      await connectProvider();

      const chunks = [new ArrayBuffer(512), new ArrayBuffer(512), new ArrayBuffer(512)];
      chunks.forEach((chunk) => provider.sendAudio!(chunk));

      expect(mockWs.send).toHaveBeenCalledTimes(3);
    });

    it('should send keep-alive as JSON message', async () => {
      await connectProvider();

      provider.sendKeepAlive();

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'KeepAlive' }));
    });

    it('should not send keep-alive when not connected', () => {
      provider.sendKeepAlive();
      // mockWs won't exist yet since we never connected
    });

    it('should send finalize as JSON message', async () => {
      await connectProvider();

      provider.sendFinalize();

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'Finalize' }));
    });

    it('should not send finalize when not connected', () => {
      provider.sendFinalize();
      // No assertion needed — just shouldn't throw
    });
  });

  // ─── Configuration ───────────────────────────────────────────────────

  describe('Configuration', () => {
    it('should get current configuration', async () => {
      const config = {
        apiKey: 'test-key',
        language: 'en-US',
        options: { model: 'nova-2', punctuation: true },
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

      const retrievedConfig = provider.getConfig() as typeof provider.config;
      expect(retrievedConfig.options?.model).toBe('enhanced');
      expect(retrievedConfig.options?.diarize).toBe(true);
      expect(retrievedConfig.options?.redact).toEqual(['pci', 'ssn']);
      expect(retrievedConfig.options?.keywords).toEqual(['test', 'example']);

      await provider.dispose();
    });

    it('should wire all V1 options through the WebSocket URL query params', async () => {
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

      const connectPromise = provider.connect!();
      mockWs._triggerOpen();
      await connectPromise;

      const url = new URL(mockWs.url);
      const p = url.searchParams;

      // Core params
      expect(p.get('model')).toBe('nova-3');
      expect(p.get('language')).toBe('en-US');
      expect(p.get('punctuate')).toBe('true');
      expect(p.get('smart_format')).toBe('true');
      expect(p.get('interim_results')).toBe('true');
      expect(p.get('endpointing')).toBe('300');
      expect(p.get('vad_events')).toBe('true');
      expect(p.get('profanity_filter')).toBe('true');
      expect(p.get('diarize')).toBe('true');

      // Optional params
      expect(p.get('encoding')).toBe('linear16');
      expect(p.get('sample_rate')).toBe('16000');
      expect(p.get('channels')).toBe('2');
      expect(p.getAll('redact')).toEqual(['pci', 'ssn']);
      expect(p.getAll('keywords')).toEqual(['hello', 'world']);
      expect(p.getAll('keyterm')).toEqual(['CompositeVoice']);
      expect(p.get('alternatives')).toBe('3');
      expect(p.get('detect_entities')).toBe('true');
      expect(p.get('numerals')).toBe('true');
      expect(p.get('multichannel')).toBe('true');
      expect(p.get('dictation')).toBe('true');
      expect(p.getAll('replace')).toEqual(['colour:color']);
      expect(p.getAll('search')).toEqual(['action item']);
      expect(p.get('utterance_end_ms')).toBe('1000');
      expect(p.get('version')).toBe('2024-01-01');
      expect(p.get('tag')).toBe('test-tag');
      expect(p.get('mip_opt_out')).toBe('true');
      expect(p.getAll('extra')).toEqual(['key1:val1']);

      await provider.dispose();
    });

    it('should support proxy mode URL construction', async () => {
      const provider = new DeepgramSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/deepgram' },
        logger
      );

      await provider.initialize();

      const connectPromise = provider.connect!();
      mockWs._triggerOpen();
      await connectPromise;

      expect(mockWs.url).toContain('ws://localhost:3001/api/proxy/deepgram/v1/listen');

      await provider.dispose();
    });
  });
});
