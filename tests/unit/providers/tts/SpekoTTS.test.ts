/**
 * Tests for SpekoTTS provider
 *
 * Tests the SpekoTTS provider which uses native `fetch` via HttpClient
 * to call the Speko Relay's routed TTS endpoint.
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

import { SpekoTTS } from '../../../../src/providers/tts/speko/SpekoTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

/**
 * Create a mock Response-like object matching the relay's raw audio response.
 */
function createAudioResponse(): Partial<Response> {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': 'application/octet-stream',
      'Speko-Provider': 'cartesia',
      'Speko-Model': 'sonic-2',
      'Speko-Usage-Characters': '13',
    }),
    arrayBuffer: async () => AUDIO_BYTES.buffer.slice(0) as ArrayBuffer,
  };
}

describe('SpekoTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new SpekoTTS({ apiKey: 'sk_speko_test' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
      expect(provider.config.encoding).toBe('pcm_s16le');
      expect(provider.config.sampleRate).toBe(24000);
      expect(provider.config.channels).toBe(1);
    });

    it('should initialize in proxy mode without an API key', async () => {
      const provider = new SpekoTTS({ proxyUrl: 'http://localhost:3001/api/proxy/speko' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new SpekoTTS({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should not be ready after dispose', async () => {
      const provider = new SpekoTTS({ apiKey: 'sk_speko_test' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Synthesis', () => {
    it('should synthesize text and return an audio Blob', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new SpekoTTS({ apiKey: 'sk_speko_test' }, logger);
      await provider.initialize();

      const blob = await provider.synthesize('Your table is ready.');

      expect(blob).toBeInstanceOf(Blob);
      // Raw PCM from the relay is wrapped in a 44-byte WAV header so
      // browsers can decode it.
      expect(blob.type).toBe('audio/wav');
      expect(blob.size).toBe(AUDIO_BYTES.length + 44);
    });

    it('should send the correct request body and auth headers', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new SpekoTTS(
        {
          apiKey: 'sk_speko_test',
          routing: { mode: 'auto', objective: 'latency' },
          voice: 'aria',
          encoding: 'pcm_s16le',
          sampleRate: 16000,
          channels: 1,
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://relay.speko.dev/v1/tts/speech');
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toBe('Bearer sk_speko_test');
      expect(typeof init.headers['Idempotency-Key']).toBe('string');
      expect(init.headers['Idempotency-Key'].length).toBeGreaterThan(0);
      expect(JSON.parse(init.body)).toEqual({
        input: 'Hello',
        voice: 'aria',
        routing: { mode: 'auto', objective: 'latency' },
        audio: {
          encoding: 'pcm_s16le',
          sample_rate_hz: 16000,
          channels: 1,
        },
      });
    });

    it('should omit routing and voice when not configured', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new SpekoTTS({ apiKey: 'sk_speko_test' }, logger);
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.routing).toBeUndefined();
      expect(body.voice).toBeUndefined();
      expect(body.audio).toEqual({
        encoding: 'pcm_s16le',
        sample_rate_hz: 24000,
        channels: 1,
      });
    });

    it('should send explicit routing verbatim', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new SpekoTTS(
        {
          apiKey: 'sk_speko_test',
          routing: { mode: 'explicit', provider: 'elevenlabs', model: 'eleven_turbo_v2' },
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse(init.body).routing).toEqual({
        mode: 'explicit',
        provider: 'elevenlabs',
        model: 'eleven_turbo_v2',
      });
    });

    it('should generate a unique Idempotency-Key per request', async () => {
      mockFetch.mockResolvedValue(createAudioResponse());

      const provider = new SpekoTTS({ apiKey: 'sk_speko_test' }, logger);
      await provider.initialize();

      await provider.synthesize('One');
      await provider.synthesize('Two');

      const keyOne = mockFetch.mock.calls[0][1].headers['Idempotency-Key'];
      const keyTwo = mockFetch.mock.calls[1][1].headers['Idempotency-Key'];
      expect(keyOne).not.toBe(keyTwo);
    });

    it('should not attach the API key in proxy mode but still send an Idempotency-Key', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new SpekoTTS({ proxyUrl: 'http://localhost:3001/api/proxy/speko' }, logger);
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/speko/v1/tts/speech');
      expect(init.headers.Authorization).toBeUndefined();
      expect(typeof init.headers['Idempotency-Key']).toBe('string');
    });

    it('should map the opus encoding to the audio/opus MIME type', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new SpekoTTS({ apiKey: 'sk_speko_test', encoding: 'opus' }, logger);
      await provider.initialize();

      const blob = await provider.synthesize('Hello');

      expect(blob.type).toBe('audio/opus');
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).audio.encoding).toBe('opus');
    });

    it('should throw when the provider is not initialized', async () => {
      const provider = new SpekoTTS({ apiKey: 'sk_speko_test' }, logger);

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });

    it('should reject when the relay responds with an error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          error: { code: 'authentication_failed', message: 'Invalid bearer token' },
        }),
        text: async () =>
          JSON.stringify({
            error: { code: 'authentication_failed', message: 'Invalid bearer token' },
          }),
      });

      const provider = new SpekoTTS({ apiKey: 'sk_speko_bad' }, logger);
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Buffered chunk processing', () => {
    it('should buffer chunks and synthesize on finalize', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new SpekoTTS({ apiKey: 'sk_speko_test' }, logger);
      await provider.initialize();

      provider.processChunk('Hello, ');
      provider.processChunk('world!');
      await provider.finalize();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(JSON.parse(mockFetch.mock.calls[0][1].body).input).toBe('Hello, world!');
    });
  });

  describe('Roles', () => {
    it('should declare the tts role', () => {
      const provider = new SpekoTTS({ apiKey: 'sk_speko_test' }, logger);
      expect(provider.roles).toEqual(['tts']);
    });
  });
});
