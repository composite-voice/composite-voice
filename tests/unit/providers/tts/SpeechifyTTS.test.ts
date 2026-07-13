/**
 * Tests for SpeechifyTTS provider
 *
 * Tests the SpeechifyTTS provider which uses native `fetch` via HttpClient
 * (no @speechify/api dependency).
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

import { SpeechifyTTS } from '../../../../src/providers/tts/speechify/SpeechifyTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const AUDIO_BASE64 = btoa(String.fromCharCode(...AUDIO_BYTES));

/**
 * Create a mock Response-like object matching Speechify's JSON speech response.
 */
function createSpeechResponse(overrides: Record<string, unknown> = {}): Partial<Response> {
  const data = {
    audio_data: AUDIO_BASE64,
    audio_format: 'mp3',
    billable_characters_count: 13,
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

describe('SpeechifyTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new SpeechifyTTS(
        {
          apiKey: 'test-key',
          voiceId: 'geffen_32',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
      expect(provider.config.voiceId).toBe('geffen_32');
    });

    it('should initialize in proxy mode without an API key', async () => {
      const provider = new SpeechifyTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/speechify',
          voiceId: 'geffen_32',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new SpeechifyTTS({ voiceId: 'geffen_32' }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when voiceId is not configured', async () => {
      const provider = new SpeechifyTTS(
        { apiKey: 'test-key' } as unknown as ConstructorParameters<typeof SpeechifyTTS>[0],
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });
  });

  describe('Synthesis', () => {
    it('should synthesize text and return a decoded audio Blob', async () => {
      mockFetch.mockResolvedValueOnce(createSpeechResponse());

      const provider = new SpeechifyTTS(
        {
          apiKey: 'test-key',
          voiceId: 'geffen_32',
        },
        logger
      );
      await provider.initialize();

      const blob = await provider.synthesize('Hello, world!');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mpeg');
      expect(blob.size).toBe(AUDIO_BYTES.length);
    });

    it('should send the correct request body and auth header', async () => {
      mockFetch.mockResolvedValueOnce(createSpeechResponse());

      const provider = new SpeechifyTTS(
        {
          apiKey: 'test-key',
          voiceId: 'geffen_32',
          model: 'simba-3.2',
          audioFormat: 'wav',
          language: 'en-US',
          loudnessNormalization: true,
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.speechify.ai/v1/audio/speech');
      expect(init.method).toBe('POST');
      expect(init.headers['authorization']).toBe('Bearer test-key');
      expect(JSON.parse(init.body)).toEqual({
        input: 'Hello',
        voice_id: 'geffen_32',
        audio_format: 'wav',
        model: 'simba-3.2',
        language: 'en-US',
        options: { loudness_normalization: true },
      });
    });

    it('should default to mp3 and simba-english', async () => {
      mockFetch.mockResolvedValueOnce(createSpeechResponse());

      const provider = new SpeechifyTTS({ apiKey: 'test-key', voiceId: 'geffen_32' }, logger);
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.audio_format).toBe('mp3');
      expect(body.model).toBe('simba-english');
      expect(body.language).toBeUndefined();
      expect(body.options).toBeUndefined();
    });

    it('should route requests through the proxy without an auth header', async () => {
      mockFetch.mockResolvedValueOnce(createSpeechResponse());

      const provider = new SpeechifyTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/speechify',
          voiceId: 'geffen_32',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/speechify/v1/audio/speech');
      expect(init.headers['authorization']).toBeUndefined();
    });

    it('should throw when the response contains no audio data', async () => {
      mockFetch.mockResolvedValueOnce(createSpeechResponse({ audio_data: '' }));

      const provider = new SpeechifyTTS({ apiKey: 'test-key', voiceId: 'geffen_32' }, logger);
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'Speechify TTS response did not contain audio data'
      );
    });

    it('should throw when called before initialization', async () => {
      const provider = new SpeechifyTTS({ apiKey: 'test-key', voiceId: 'geffen_32' }, logger);

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further synthesis', async () => {
      const provider = new SpeechifyTTS({ apiKey: 'test-key', voiceId: 'geffen_32' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });
});
