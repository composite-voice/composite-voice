/**
 * Tests for FishAudioTTS provider
 *
 * Tests the FishAudioTTS provider which uses native `fetch` via HttpClient
 * with msgpack-encoded request bodies. Requests are decoded with the real
 * `@msgpack/msgpack` package (an optional peer dependency, installed as a
 * dev dependency for tests) and asserted field-by-field.
 */

// Polyfill TextEncoder/TextDecoder (not available in jsdom; required by @msgpack/msgpack)
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;

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

import { decode } from '@msgpack/msgpack';
import { FishAudioTTS } from '../../../../src/providers/tts/fishaudio/FishAudioTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError } from '../../../../src/utils/errors';
import * as importPeerDepModule from '../../../../src/utils/importPeerDep';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

/**
 * Create a mock Response-like object matching Fish Audio's raw-audio response.
 */
function createAudioResponse(bytes: Uint8Array = AUDIO_BYTES): Partial<Response> {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'audio/mpeg' }),
    arrayBuffer: async () => {
      const copy = new Uint8Array(bytes);
      return copy.buffer;
    },
    text: async () => '',
  };
}

/** Decode the msgpack request body captured by the fetch mock. */
function decodeRequestBody(init: { body: Uint8Array }): Record<string, unknown> {
  return decode(init.body) as Record<string, unknown>;
}

describe('FishAudioTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new FishAudioTTS({ apiKey: 'test-key' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
    });

    it('should initialize in proxy mode without an API key', async () => {
      const provider = new FishAudioTTS(
        { proxyUrl: 'http://localhost:3001/api/proxy/fishaudio' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new FishAudioTTS({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw a helpful error when @msgpack/msgpack is not installed', async () => {
      jest
        .spyOn(importPeerDepModule, 'importPeerDep')
        .mockRejectedValueOnce(
          new ProviderInitializationError(
            'FishAudioTTS',
            new Error(
              '@msgpack/msgpack is required but not installed. Install it with: pnpm add @msgpack/msgpack'
            )
          )
        );

      const provider = new FishAudioTTS({ apiKey: 'test-key' }, logger);

      const error = await provider.initialize().then(
        () => null,
        (e: unknown) => e as ProviderInitializationError
      );

      expect(error).toBeInstanceOf(ProviderInitializationError);
      // The install instruction is carried on the wrapped cause:
      // BaseProvider.initialize wraps the provider's ProviderInitializationError,
      // whose own cause is the Error carrying the install instructions.
      const inner = error?.context?.cause as ProviderInitializationError;
      const cause = inner?.context?.cause as Error;
      expect(cause.message).toMatch(
        /FishAudioTTS requires the optional peer dependency @msgpack\/msgpack/
      );
      expect(cause.message).toContain('pnpm add @msgpack/msgpack');
      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Synthesis', () => {
    it('should synthesize text and return the raw audio as a Blob', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new FishAudioTTS({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      const blob = await provider.synthesize('Hello, world!');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mpeg');
      expect(blob.size).toBe(AUDIO_BYTES.length);
    });

    it('should send a msgpack-encoded body with all configured fields', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const referenceAudio = new Uint8Array([9, 8, 7]);
      const provider = new FishAudioTTS(
        {
          apiKey: 'test-key',
          referenceId: 'voice-123',
          model: 's2.1-pro',
          format: 'mp3',
          mp3Bitrate: 192,
          chunkLength: 200,
          normalize: false,
          latency: 'balanced',
          speed: 1.2,
          volume: -3,
          references: [{ audio: referenceAudio, text: 'reference transcript' }],
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.fish.audio/v1/tts');
      expect(init.method).toBe('POST');
      expect(init.headers['content-type']).toBe('application/msgpack');
      expect(init.headers['authorization']).toBe('Bearer test-key');

      // The body must be binary msgpack, not a JSON string
      expect(init.body).toBeInstanceOf(Uint8Array);
      const body = decodeRequestBody(init);
      expect(body).toEqual({
        text: 'Hello',
        format: 'mp3',
        reference_id: 'voice-123',
        mp3_bitrate: 192,
        chunk_length: 200,
        normalize: false,
        latency: 'balanced',
        prosody: { speed: 1.2, volume: -3 },
        references: [{ audio: referenceAudio, text: 'reference transcript' }],
      });
    });

    it('should send minimal fields and defaults when options are omitted', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new FishAudioTTS({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      const body = decodeRequestBody(init);
      expect(body).toEqual({
        text: 'Hello',
        format: 'mp3',
      });
    });

    it('should send the model header, defaulting to s2.1-pro-free', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const defaultProvider = new FishAudioTTS({ apiKey: 'test-key' }, logger);
      await defaultProvider.initialize();
      await defaultProvider.synthesize('Hello');

      const [, defaultInit] = mockFetch.mock.calls[0];
      expect(defaultInit.headers['model']).toBe('s2.1-pro-free');

      const s1Provider = new FishAudioTTS({ apiKey: 'test-key', model: 's1' }, logger);
      await s1Provider.initialize();
      await s1Provider.synthesize('Hello');

      const [, s1Init] = mockFetch.mock.calls[1];
      expect(s1Init.headers['model']).toBe('s1');
    });

    it.each([
      ['mp3', 'audio/mpeg'],
      ['wav', 'audio/wav'],
      ['pcm', 'audio/pcm'],
      ['opus', 'audio/opus'],
    ] as const)('should map format %s to MIME type %s', async (format, mimeType) => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new FishAudioTTS({ apiKey: 'test-key', format }, logger);
      await provider.initialize();

      const blob = await provider.synthesize('Hello');

      expect(blob.type).toBe(mimeType);
      const [, init] = mockFetch.mock.calls[0];
      expect(decodeRequestBody(init).format).toBe(format);
    });

    it('should route requests through the proxy without an auth header', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new FishAudioTTS(
        { proxyUrl: 'http://localhost:3001/api/proxy/fishaudio' },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/fishaudio/v1/tts');
      expect(init.headers['authorization']).toBeUndefined();
      expect(init.headers['content-type']).toBe('application/msgpack');
    });

    it('should throw on a non-retryable API error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        headers: new Headers(),
        text: async () => JSON.stringify({ message: 'insufficient credit' }),
      });

      const provider = new FishAudioTTS({ apiKey: 'test-key', maxRetries: 0 }, logger);
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow('insufficient credit');
    });

    it('should throw when called before initialization', async () => {
      const provider = new FishAudioTTS({ apiKey: 'test-key' }, logger);

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further synthesis', async () => {
      const provider = new FishAudioTTS({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });
});
