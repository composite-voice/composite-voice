/**
 * Tests for SmallestTTS provider
 *
 * Tests the SmallestTTS provider which uses native `fetch` via HttpClient
 * (no smallestai dependency).
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

import { SmallestTTS } from '../../../../src/providers/tts/smallest/SmallestTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderResponseError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

/**
 * Create a mock Response-like object matching the Waves raw-audio response.
 */
function createAudioResponse(contentType = 'audio/wav'): Partial<Response> {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => AUDIO_BYTES.buffer.slice(0),
  };
}

/**
 * Create a mock error Response-like object with a JSON error body.
 */
function createErrorResponse(status: number, message: string): Partial<Response> {
  return {
    ok: false,
    status,
    statusText: 'Error',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify({ message }),
  };
}

describe('SmallestTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new SmallestTTS(
        {
          apiKey: 'test-key',
          voiceId: 'meher',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
      expect(provider.config.voiceId).toBe('meher');
    });

    it('should initialize in proxy mode without an API key', async () => {
      const provider = new SmallestTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/smallest',
          voiceId: 'meher',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new SmallestTTS({ voiceId: 'meher' }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when voiceId is not configured', async () => {
      const provider = new SmallestTTS(
        { apiKey: 'test-key' } as unknown as ConstructorParameters<typeof SmallestTTS>[0],
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });
  });

  describe('Synthesis', () => {
    it('should synthesize text and return an audio Blob', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new SmallestTTS(
        {
          apiKey: 'test-key',
          voiceId: 'meher',
        },
        logger
      );
      await provider.initialize();

      const blob = await provider.synthesize('Hello, world!');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/wav');
      expect(blob.size).toBe(AUDIO_BYTES.length);
    });

    it('should send the correct request body and auth header', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse('audio/mpeg'));

      const provider = new SmallestTTS(
        {
          apiKey: 'test-key',
          voiceId: 'meher',
          model: 'lightning_v3.1_pro',
          outputFormat: 'mp3',
          sampleRate: 24000,
          speed: 1.2,
          language: 'hi',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.smallest.ai/waves/v1/tts');
      expect(init.method).toBe('POST');
      expect(init.headers['authorization']).toBe('Bearer test-key');
      expect(init.headers['accept']).toBe('audio/mpeg');
      expect(JSON.parse(init.body)).toEqual({
        text: 'Hello',
        voice_id: 'meher',
        model: 'lightning_v3.1_pro',
        output_format: 'mp3',
        sample_rate: 24000,
        speed: 1.2,
        language: 'hi',
      });
    });

    it('should default to wav and lightning_v3.1', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new SmallestTTS({ apiKey: 'test-key', voiceId: 'meher' }, logger);
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['accept']).toBe('audio/wav');
      const body = JSON.parse(init.body);
      expect(body.model).toBe('lightning_v3.1');
      expect(body.output_format).toBe('wav');
      expect(body.sample_rate).toBeUndefined();
      expect(body.speed).toBeUndefined();
      expect(body.language).toBeUndefined();
    });

    it('should route requests through the proxy without an auth header', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new SmallestTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/smallest',
          voiceId: 'meher',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/smallest/waves/v1/tts');
      expect(init.headers['authorization']).toBeUndefined();
    });

    it('should throw a ProviderResponseError on a non-retryable API error', async () => {
      mockFetch.mockResolvedValueOnce(createErrorResponse(401, 'Invalid API key'));

      const provider = new SmallestTTS(
        { apiKey: 'bad-key', voiceId: 'meher', maxRetries: 0 },
        logger
      );
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow(ProviderResponseError);
    });

    it('should throw when called before initialization', async () => {
      const provider = new SmallestTTS({ apiKey: 'test-key', voiceId: 'meher' }, logger);

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further synthesis', async () => {
      const provider = new SmallestTTS({ apiKey: 'test-key', voiceId: 'meher' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });
});
