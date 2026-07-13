/**
 * Tests for RimeTTS provider
 *
 * Tests the RimeTTS provider which uses native `fetch` via HttpClient
 * (no vendor SDK dependency).
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

import { RimeTTS } from '../../../../src/providers/tts/rime/RimeTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

/**
 * Create a mock Response-like object matching Rime's raw-bytes audio response.
 */
function createAudioResponse(contentType = 'audio/mpeg'): Partial<Response> {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => AUDIO_BYTES.buffer.slice(0),
  };
}

describe('RimeTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new RimeTTS(
        {
          apiKey: 'test-key',
          speaker: 'astra',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
      expect(provider.config.speaker).toBe('astra');
    });

    it('should initialize in proxy mode without an API key', async () => {
      const provider = new RimeTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/rime',
          speaker: 'astra',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new RimeTTS({ speaker: 'astra' }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when speaker is not configured', async () => {
      const provider = new RimeTTS(
        { apiKey: 'test-key' } as unknown as ConstructorParameters<typeof RimeTTS>[0],
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });
  });

  describe('Synthesis', () => {
    it('should synthesize text and return an audio Blob', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new RimeTTS(
        {
          apiKey: 'test-key',
          speaker: 'astra',
        },
        logger
      );
      await provider.initialize();

      const blob = await provider.synthesize('Hello, world!');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mpeg');
      expect(blob.size).toBe(AUDIO_BYTES.length);
    });

    it('should send the correct request body, auth header, and Accept header', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse('audio/wav'));

      const provider = new RimeTTS(
        {
          apiKey: 'test-key',
          speaker: 'astra',
          model: 'mistv2',
          audioFormat: 'wav',
          language: 'en',
          samplingRate: 22050,
          speedAlpha: 1.2,
          noTextNormalization: true,
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://users.rime.ai/v1/rime-tts');
      expect(init.method).toBe('POST');
      expect(init.headers['authorization']).toBe('Bearer test-key');
      expect(init.headers['accept']).toBe('audio/wav');
      expect(JSON.parse(init.body)).toEqual({
        speaker: 'astra',
        text: 'Hello',
        modelId: 'mistv2',
        lang: 'en',
        samplingRate: 22050,
        speedAlpha: 1.2,
        noTextNormalization: true,
      });
    });

    it('should default to mp3 and arcana', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new RimeTTS({ apiKey: 'test-key', speaker: 'astra' }, logger);
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['accept']).toBe('audio/mpeg');
      const body = JSON.parse(init.body);
      expect(body.modelId).toBe('arcana');
      expect(body.lang).toBeUndefined();
      expect(body.samplingRate).toBeUndefined();
      expect(body.speedAlpha).toBeUndefined();
      expect(body.noTextNormalization).toBeUndefined();
      expect(body.timeScaleFactor).toBeUndefined();
    });

    it.each([
      ['mp3', 'audio/mpeg', 'audio/mpeg'],
      ['wav', 'audio/wav', 'audio/wav'],
      ['ogg', 'audio/ogg;codecs=opus', 'audio/ogg'],
      ['webm', 'audio/webm;codecs=opus', 'audio/webm'],
      ['pcm', 'audio/L16', 'audio/l16'],
      ['mulaw', 'audio/PCMU', 'audio/pcmu'],
    ] as const)(
      'should map format %s to Accept %s and Blob MIME %s',
      async (audioFormat, accept, mime) => {
        mockFetch.mockResolvedValueOnce(createAudioResponse(accept));

        const provider = new RimeTTS({ apiKey: 'test-key', speaker: 'astra', audioFormat }, logger);
        await provider.initialize();

        const blob = await provider.synthesize('Hello');

        const [, init] = mockFetch.mock.calls[0];
        expect(init.headers['accept']).toBe(accept);
        // Blob normalizes MIME types to lowercase
        expect(blob.type).toBe(mime);
      }
    );

    it('should route requests through the proxy without an auth header', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new RimeTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/rime',
          speaker: 'astra',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/rime/v1/rime-tts');
      expect(init.headers['authorization']).toBeUndefined();
    });

    it('should throw when the API returns a non-retryable error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers({ 'content-type': 'application/json' }),
        text: async () => JSON.stringify({ message: 'Invalid API key' }),
      });

      const provider = new RimeTTS({ apiKey: 'bad-key', speaker: 'astra', maxRetries: 0 }, logger);
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow('Invalid API key');
    });

    it('should throw when called before initialization', async () => {
      const provider = new RimeTTS({ apiKey: 'test-key', speaker: 'astra' }, logger);

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further synthesis', async () => {
      const provider = new RimeTTS({ apiKey: 'test-key', speaker: 'astra' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });
});
