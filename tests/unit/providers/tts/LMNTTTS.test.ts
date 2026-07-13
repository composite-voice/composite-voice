/**
 * Tests for LMNTTTS provider
 *
 * Tests the LMNTTTS provider which uses native `fetch` via HttpClient
 * (no lmnt SDK dependency).
 */

// Polyfill AbortSignal.timeout and AbortSignal.any (not available in jsdom)
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return controller.signal;
  };
}
if (typeof AbortSignal.any !== 'function') {
  AbortSignal.any = (signals: AbortSignal[]): AbortSignal => {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort(signal.reason);
        break;
      }
      signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
    }
    return controller.signal;
  };
}

import { LMNTTTS } from '../../../../src/providers/tts/lmnt/LMNTTTS';
import type { LMNTTTSFormat } from '../../../../src/providers/tts/lmnt/LMNTTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

/**
 * Create a mock Response-like object matching LMNT's binary audio response.
 */
function createAudioResponse(): Partial<Response> {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'audio/mpeg' }),
    arrayBuffer: async () => AUDIO_BYTES.buffer.slice(0) as ArrayBuffer,
  };
}

describe('LMNTTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new LMNTTTS(
        {
          apiKey: 'test-key',
          voice: 'leah',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
      expect(provider.config.voice).toBe('leah');
    });

    it('should initialize in proxy mode without an API key', async () => {
      const provider = new LMNTTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/lmnt',
          voice: 'leah',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new LMNTTTS({ voice: 'leah' }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when voice is not configured', async () => {
      const provider = new LMNTTTS(
        { apiKey: 'test-key' } as unknown as ConstructorParameters<typeof LMNTTTS>[0],
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });
  });

  describe('Synthesis', () => {
    it('should synthesize text and return an audio Blob', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new LMNTTTS(
        {
          apiKey: 'test-key',
          voice: 'leah',
        },
        logger
      );
      await provider.initialize();

      const blob = await provider.synthesize('Hello, world!');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mpeg');
      expect(blob.size).toBe(AUDIO_BYTES.length);
    });

    it('should send the correct request body and auth headers', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new LMNTTTS(
        {
          apiKey: 'test-key',
          voice: 'leah',
          model: 'blizzard',
          format: 'wav',
          sampleRate: 16000,
          language: 'en',
          temperature: 0.7,
          topP: 0.9,
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.lmnt.com/v1/ai/speech/bytes');
      expect(init.method).toBe('POST');
      expect(init.headers['X-API-Key']).toBe('test-key');
      expect(init.headers['lmnt-version']).toBe('1.2');
      expect(JSON.parse(init.body)).toEqual({
        text: 'Hello',
        voice: 'leah',
        model: 'blizzard',
        format: 'wav',
        sample_rate: 16000,
        language: 'en',
        temperature: 0.7,
        top_p: 0.9,
      });
    });

    it('should default to mp3 and blizzard', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new LMNTTTS({ apiKey: 'test-key', voice: 'leah' }, logger);
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.format).toBe('mp3');
      expect(body.model).toBe('blizzard');
      expect(body.sample_rate).toBeUndefined();
      expect(body.language).toBeUndefined();
      expect(body.temperature).toBeUndefined();
      expect(body.top_p).toBeUndefined();
    });

    it('should map formats to the correct MIME types', async () => {
      const cases: Array<[LMNTTTSFormat, string]> = [
        ['mp3', 'audio/mpeg'],
        ['wav', 'audio/wav'],
        ['aac', 'audio/aac'],
        ['ulaw', 'audio/wav'],
        ['webm', 'audio/webm'],
        ['pcm_s16le', 'audio/pcm'],
        ['pcm_f32le', 'audio/pcm'],
      ];

      for (const [format, mimeType] of cases) {
        mockFetch.mockResolvedValueOnce(createAudioResponse());

        const provider = new LMNTTTS(
          {
            apiKey: 'test-key',
            voice: 'leah',
            format,
          },
          logger
        );
        await provider.initialize();

        const blob = await provider.synthesize('Hello');
        expect(blob.type).toBe(mimeType);
      }
    });

    it('should route requests through the proxy without an auth header', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new LMNTTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/lmnt',
          voice: 'leah',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/lmnt/v1/ai/speech/bytes');
      expect(init.headers['X-API-Key']).toBeUndefined();
      expect(init.headers['lmnt-version']).toBe('1.2');
    });

    it('should throw when called before initialization', async () => {
      const provider = new LMNTTTS({ apiKey: 'test-key', voice: 'leah' }, logger);

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further synthesis', async () => {
      const provider = new LMNTTTS({ apiKey: 'test-key', voice: 'leah' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });
});
