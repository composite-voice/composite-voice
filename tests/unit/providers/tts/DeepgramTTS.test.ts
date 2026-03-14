/**
 * Tests for DeepgramTTS provider (native WebSocket — no SDK)
 */

import { DeepgramTTS } from '../../../../src/providers/tts/deepgram/DeepgramTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';

// ─── Mock WebSocket ────────────────────────────────────────────────────────

/** Reference to the most recently constructed MockWebSocket instance. */
let mockWs: MockWebSocket;

class MockWebSocket {
  url: string;
  protocols: string | string[] | undefined;
  binaryType = 'blob';

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

  // ─── Helpers for simulating server-side behaviour ───────────────────

  _triggerOpen(): void {
    this.onopen?.({} as Event);
  }

  /** Simulate a text or binary message from Deepgram. */
  _triggerMessage(data: string | ArrayBuffer): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  _triggerError(message = 'connection failed'): void {
    this.onerror?.({ message } as unknown as Event);
  }

  _triggerClose(code = 1000, reason = ''): void {
    this.onclose?.({ code, reason } as CloseEvent);
  }
}

(globalThis as any).WebSocket = MockWebSocket;

// ────────────────────────────────────────────────────────────────────────────

describe('DeepgramTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  // ─── Initialization ──────────────────────────────────────────────────

  describe('Initialization', () => {
    it('should initialize with default configuration', async () => {
      const provider = new DeepgramTTS({ apiKey: 'test-key' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
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
        { proxyUrl: 'http://localhost:3001/api/proxy/deepgram' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw error if neither apiKey nor proxyUrl is configured', async () => {
      const provider = new DeepgramTTS({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should dispose properly', async () => {
      const provider = new DeepgramTTS({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  // ─── WebSocket Mode ──────────────────────────────────────────────────

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

    /** Helper: connect the provider by triggering `onopen`. */
    async function connectProvider(): Promise<void> {
      const connectPromise = provider.connect!();
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
      expect(url.pathname).toBe('/v1/speak');
      expect(url.searchParams.get('model')).toBe('aura-asteria-en');
      expect(url.searchParams.get('encoding')).toBe('linear16');
      expect(url.searchParams.get('sample_rate')).toBe('24000');
    });

    it('should use subprotocol auth in direct mode', async () => {
      await connectProvider();

      expect(mockWs.protocols).toEqual(['token', 'test-key']);
    });

    it('should use no subprotocol in proxy mode', async () => {
      const proxyProvider = new DeepgramTTS(
        { proxyUrl: 'http://localhost:3001/api/proxy/deepgram' },
        logger
      );
      await proxyProvider.initialize();

      const proxyConnectPromise = proxyProvider.connect!();
      mockWs._triggerOpen();
      await proxyConnectPromise;

      expect(mockWs.protocols).toBeUndefined();
      expect(mockWs.url).toContain('ws://localhost:3001/api/proxy/deepgram/v1/speak');

      await proxyProvider.dispose();
    });

    it('should set binaryType to arraybuffer', async () => {
      await connectProvider();

      expect(mockWs.binaryType).toBe('arraybuffer');
    });

    it('should handle connection timeout', async () => {
      const customProvider = new DeepgramTTS(
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

    it('should send text chunks as JSON Speak messages', async () => {
      await connectProvider();

      provider.processChunk('Hello, world!');

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'Speak', text: 'Hello, world!' })
      );
    });

    it('should not send text when not connected', () => {
      provider.processChunk('Hello, world!');
      // Should not throw — just silently returns
    });

    it('should process binary audio data from WebSocket', async () => {
      await connectProvider();

      const mockAudioData = new ArrayBuffer(1024);
      mockWs._triggerMessage(mockAudioData);

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

    it('should process Metadata JSON messages', async () => {
      await connectProvider();

      const mockMetadata = {
        type: 'Metadata',
        request_id: 'test-request-id',
        model_name: 'aura-asteria-en',
      };

      mockWs._triggerMessage(JSON.stringify(mockMetadata));

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

    it('should handle Flushed event and resolve finalize()', async () => {
      await connectProvider();

      const finalizePromise = provider.finalize!();

      // Provider sends Flush, then waits for Flushed event
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'Flush' }));

      // Simulate server Flushed response
      mockWs._triggerMessage(JSON.stringify({ type: 'Flushed', sequence_id: 1 }));

      await finalizePromise;
    });

    it('should not finalize when not connected', async () => {
      await expect(provider.finalize!()).resolves.not.toThrow();
    });

    it('should clear buffer by sending Clear JSON message', async () => {
      await connectProvider();

      provider.clearBuffer();

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'Clear' }));
    });

    it('should not clear buffer when not connected', () => {
      provider.clearBuffer();
      // Should not throw
    });

    it('should handle WebSocket errors after connection', async () => {
      await connectProvider();

      // Should not throw — just logs error
      expect(() => mockWs._triggerError('Synthesis error')).not.toThrow();
    });

    it('should throw error when not initialized', async () => {
      const uninitProvider = new DeepgramTTS({ apiKey: 'test-key' }, logger);

      await expect(uninitProvider.connect!()).rejects.toThrow();
    });

    it('should disconnect successfully', async () => {
      await connectProvider();
      expect(provider.isWebSocketConnected()).toBe(true);

      // disconnect sends Flush + Close then waits for close event
      const disconnectPromise = provider.disconnect!();
      mockWs._triggerClose();
      await disconnectPromise;

      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'Flush' }));
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'Close' }));
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

    it('should handle multiple text chunks', async () => {
      await connectProvider();

      const chunks = ['Hello', ' ', 'world', '!'];
      chunks.forEach((chunk) => provider.processChunk(chunk));

      expect(mockWs.send).toHaveBeenCalledTimes(4);
      chunks.forEach((chunk) => {
        expect(mockWs.send).toHaveBeenCalledWith(
          JSON.stringify({ type: 'Speak', text: chunk })
        );
      });
    });

    it('should handle Warning messages without throwing', async () => {
      await connectProvider();

      const warningMsg = {
        type: 'Warning',
        code: 1001,
        description: 'Rate limit approaching',
      };

      expect(() => mockWs._triggerMessage(JSON.stringify(warningMsg))).not.toThrow();
    });

    it('should handle Cleared messages', async () => {
      await connectProvider();

      const clearedMsg = {
        type: 'Cleared',
        sequence_id: 1,
      };

      expect(() => mockWs._triggerMessage(JSON.stringify(clearedMsg))).not.toThrow();
    });
  });

  // ─── Configuration ───────────────────────────────────────────────────

  describe('Configuration', () => {
    it('should get current configuration', async () => {
      const config = {
        apiKey: 'test-key',
        voice: 'aura-zeus-en',
        sampleRate: 48000,
        options: { model: 'aura-zeus-en', encoding: 'opus' },
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

      const retrievedConfig = provider.getConfig() as typeof provider.config;
      expect(retrievedConfig.options?.model).toBe('aura-helios-en');
      expect(retrievedConfig.options?.encoding).toBe('linear16');
      expect(retrievedConfig.options?.sampleRate).toBe(24000);

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
          { apiKey: 'test-key', voice, options: { model: voice } },
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
