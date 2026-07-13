/**
 * Tests for GoogleTTS provider
 *
 * Tests the GoogleTTS provider which uses native `fetch` via HttpClient
 * (no @google-cloud/text-to-speech dependency).
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

import { GoogleTTS } from '../../../../src/providers/tts/google/GoogleTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderResponseError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const AUDIO_BASE64 = btoa(String.fromCharCode(...AUDIO_BYTES));

/**
 * Create a mock Response-like object matching Google's `text:synthesize` response.
 */
function createSynthesizeResponse(overrides: Record<string, unknown> = {}): Partial<Response> {
  const data = {
    audioContent: AUDIO_BASE64,
    ...overrides,
  };
  const text = JSON.stringify(data);
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => text,
    json: async () => data,
  };
}

/**
 * Create a mock error Response matching Google's error envelope
 * `{error: {code, message, status}}`.
 */
function createErrorResponse(code: number, message: string, status: string): Partial<Response> {
  const text = JSON.stringify({ error: { code, message, status } });
  return {
    ok: false,
    status: code,
    statusText: status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

describe('GoogleTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with an API key', async () => {
      const provider = new GoogleTTS({ apiKey: 'test-key' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
    });

    it('should initialize in proxy mode without an API key', async () => {
      const provider = new GoogleTTS(
        { proxyUrl: 'http://localhost:3001/api/proxy/google-tts' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new GoogleTTS({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });
  });

  describe('Synthesis', () => {
    it('should synthesize text and return a decoded audio Blob', async () => {
      mockFetch.mockResolvedValueOnce(createSynthesizeResponse());

      const provider = new GoogleTTS({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      const blob = await provider.synthesize('Hello, world!');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mpeg');
      expect(blob.size).toBe(AUDIO_BYTES.length);
    });

    it('should send the correct request body and X-goog-api-key header', async () => {
      mockFetch.mockResolvedValueOnce(createSynthesizeResponse());

      const provider = new GoogleTTS(
        {
          apiKey: 'test-key',
          languageCode: 'en-GB',
          voiceName: 'en-GB-Neural2-A',
          ssmlGender: 'FEMALE',
          audioEncoding: 'OGG_OPUS',
          speakingRate: 1.2,
          pitch: -2,
          volumeGainDb: 3,
          sampleRateHertz: 24000,
          effectsProfileId: ['headphone-class-device'],
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize');
      expect(init.method).toBe('POST');
      expect(init.headers['X-goog-api-key']).toBe('test-key');
      expect(JSON.parse(init.body)).toEqual({
        input: { text: 'Hello' },
        voice: {
          languageCode: 'en-GB',
          name: 'en-GB-Neural2-A',
          ssmlGender: 'FEMALE',
        },
        audioConfig: {
          audioEncoding: 'OGG_OPUS',
          speakingRate: 1.2,
          pitch: -2,
          volumeGainDb: 3,
          sampleRateHertz: 24000,
          effectsProfileId: ['headphone-class-device'],
        },
      });
    });

    it('should default to en-US and MP3 with minimal config', async () => {
      mockFetch.mockResolvedValueOnce(createSynthesizeResponse());

      const provider = new GoogleTTS({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.voice).toEqual({ languageCode: 'en-US' });
      expect(body.audioConfig).toEqual({ audioEncoding: 'MP3' });
    });

    it('should send SSML input when the text starts with <speak', async () => {
      mockFetch.mockResolvedValueOnce(createSynthesizeResponse());

      const provider = new GoogleTTS({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      const ssml = '<speak>Hello <break time="200ms"/> world</speak>';
      await provider.synthesize(ssml);

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.input).toEqual({ ssml });
    });

    it('should use audio/wav MIME type for LINEAR16 output', async () => {
      mockFetch.mockResolvedValueOnce(createSynthesizeResponse());

      const provider = new GoogleTTS({ apiKey: 'test-key', audioEncoding: 'LINEAR16' }, logger);
      await provider.initialize();

      const blob = await provider.synthesize('Hello');

      expect(blob.type).toBe('audio/wav');
    });

    it('should route requests through the proxy without an auth header', async () => {
      mockFetch.mockResolvedValueOnce(createSynthesizeResponse());

      const provider = new GoogleTTS(
        { proxyUrl: 'http://localhost:3001/api/proxy/google-tts' },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/google-tts/v1/text:synthesize');
      expect(init.headers['X-goog-api-key']).toBeUndefined();
    });

    it('should throw when the response contains no audio content', async () => {
      mockFetch.mockResolvedValueOnce(createSynthesizeResponse({ audioContent: '' }));

      const provider = new GoogleTTS({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'Google Cloud TTS response did not contain audio content'
      );
    });

    it('should surface the Google error message on a non-retryable failure', async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(400, 'Invalid SSML input.', 'INVALID_ARGUMENT')
      );

      const provider = new GoogleTTS({ apiKey: 'test-key', maxRetries: 0 }, logger);
      await provider.initialize();

      const error = await provider.synthesize('Hello').catch((e: Error) => e);
      expect(error).toBeInstanceOf(ProviderResponseError);
      expect((error as Error).message).toContain('Invalid SSML input.');
    });

    it('should throw when called before initialization', async () => {
      const provider = new GoogleTTS({ apiKey: 'test-key' }, logger);

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further synthesis', async () => {
      const provider = new GoogleTTS({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });
});
