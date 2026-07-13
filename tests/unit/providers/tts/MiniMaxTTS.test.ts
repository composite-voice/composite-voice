/**
 * Tests for MiniMaxTTS provider
 *
 * Tests the MiniMaxTTS provider which uses native `fetch` via HttpClient
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

import { MiniMaxTTS } from '../../../../src/providers/tts/minimax/MiniMaxTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 255]);
const AUDIO_HEX = Array.from(AUDIO_BYTES)
  .map((b) => b.toString(16).padStart(2, '0'))
  .join('');

/**
 * Create a mock Response-like object matching MiniMax's JSON t2a_v2 response.
 */
function createT2AResponse(overrides: Record<string, unknown> = {}): Partial<Response> {
  const data = {
    data: { audio: AUDIO_HEX, status: 2 },
    extra_info: { audio_length: 1000, audio_size: AUDIO_BYTES.length, usage_characters: 13 },
    trace_id: 'trace-123',
    base_resp: { status_code: 0, status_msg: 'success' },
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

describe('MiniMaxTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new MiniMaxTTS(
        {
          apiKey: 'test-key',
          voiceId: 'English_expressive_narrator',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
      expect(provider.config.voiceId).toBe('English_expressive_narrator');
    });

    it('should initialize in proxy mode without an API key', async () => {
      const provider = new MiniMaxTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/minimax',
          voiceId: 'English_expressive_narrator',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new MiniMaxTTS({ voiceId: 'English_expressive_narrator' }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when voiceId is not configured', async () => {
      const provider = new MiniMaxTTS(
        { apiKey: 'test-key' } as unknown as ConstructorParameters<typeof MiniMaxTTS>[0],
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });
  });

  describe('Synthesis', () => {
    it('should synthesize text and return a hex-decoded audio Blob', async () => {
      mockFetch.mockResolvedValueOnce(createT2AResponse());

      const provider = new MiniMaxTTS(
        {
          apiKey: 'test-key',
          voiceId: 'English_expressive_narrator',
        },
        logger
      );
      await provider.initialize();

      const blob = await provider.synthesize('Hello, world!');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mpeg');
      expect(blob.size).toBe(AUDIO_BYTES.length);
      // jsdom's Blob lacks arrayBuffer(); read the bytes via FileReader to
      // verify the hex decode round-trips exactly.
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (): void => resolve(new Uint8Array(reader.result as ArrayBuffer));
        reader.onerror = (): void => reject(reader.error ?? new Error('FileReader failed'));
        reader.readAsArrayBuffer(blob);
      });
      expect(bytes).toEqual(AUDIO_BYTES);
    });

    it('should send the correct request body and auth header', async () => {
      mockFetch.mockResolvedValueOnce(createT2AResponse());

      const provider = new MiniMaxTTS(
        {
          apiKey: 'test-key',
          voiceId: 'English_expressive_narrator',
          model: 'speech-2.8-hd',
          audioFormat: 'flac',
          speed: 1.2,
          volume: 2,
          pitch: -3,
          emotion: 'happy',
          sampleRate: 44100,
          bitrate: 256000,
          channel: 2,
          languageBoost: 'English',
          pronunciationDict: { tone: ['omg/oh my god'] },
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.minimax.io/v1/t2a_v2');
      expect(init.method).toBe('POST');
      expect(init.headers['authorization']).toBe('Bearer test-key');
      expect(JSON.parse(init.body)).toEqual({
        model: 'speech-2.8-hd',
        text: 'Hello',
        stream: false,
        voice_setting: {
          voice_id: 'English_expressive_narrator',
          speed: 1.2,
          vol: 2,
          pitch: -3,
          emotion: 'happy',
        },
        audio_setting: {
          format: 'flac',
          sample_rate: 44100,
          bitrate: 256000,
          channel: 2,
        },
        language_boost: 'English',
        pronunciation_dict: { tone: ['omg/oh my god'] },
      });
    });

    it('should default to mp3 and speech-02-hd', async () => {
      mockFetch.mockResolvedValueOnce(createT2AResponse());

      const provider = new MiniMaxTTS(
        { apiKey: 'test-key', voiceId: 'English_expressive_narrator' },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.model).toBe('speech-02-hd');
      expect(body.voice_setting).toEqual({ voice_id: 'English_expressive_narrator' });
      expect(body.audio_setting).toEqual({ format: 'mp3' });
      expect(body.language_boost).toBeUndefined();
      expect(body.pronunciation_dict).toBeUndefined();
    });

    it('should append GroupId as a query parameter when configured', async () => {
      mockFetch.mockResolvedValueOnce(createT2AResponse());

      const provider = new MiniMaxTTS(
        {
          apiKey: 'test-key',
          voiceId: 'English_expressive_narrator',
          groupId: '1234 5678',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.minimax.io/v1/t2a_v2?GroupId=1234%205678');
    });

    it('should route requests through the proxy without an auth header', async () => {
      mockFetch.mockResolvedValueOnce(createT2AResponse());

      const provider = new MiniMaxTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/minimax',
          voiceId: 'English_expressive_narrator',
          groupId: 'group-1',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/minimax/v1/t2a_v2?GroupId=group-1');
      expect(init.headers['authorization']).toBeUndefined();
    });

    it('should map each output format to its MIME type', async () => {
      const formats: Array<['mp3' | 'wav' | 'flac' | 'pcm', string]> = [
        ['mp3', 'audio/mpeg'],
        ['wav', 'audio/wav'],
        ['flac', 'audio/flac'],
        ['pcm', 'audio/pcm'],
      ];

      for (const [format, mime] of formats) {
        mockFetch.mockResolvedValueOnce(createT2AResponse());

        const provider = new MiniMaxTTS(
          { apiKey: 'test-key', voiceId: 'English_expressive_narrator', audioFormat: format },
          logger
        );
        await provider.initialize();

        const blob = await provider.synthesize('Hello');
        expect(blob.type).toBe(mime);
      }
    });

    it('should throw with status details when base_resp reports an error', async () => {
      mockFetch.mockResolvedValueOnce(
        createT2AResponse({
          data: undefined,
          base_resp: { status_code: 1004, status_msg: 'authentication failed' },
        })
      );

      const provider = new MiniMaxTTS(
        { apiKey: 'test-key', voiceId: 'English_expressive_narrator' },
        logger
      );
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'MiniMax TTS request failed (status_code 1004): authentication failed'
      );
    });

    it('should throw when the response contains no audio data', async () => {
      mockFetch.mockResolvedValueOnce(createT2AResponse({ data: { audio: '', status: 2 } }));

      const provider = new MiniMaxTTS(
        { apiKey: 'test-key', voiceId: 'English_expressive_narrator' },
        logger
      );
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'MiniMax TTS response did not contain audio data'
      );
    });

    it('should throw when called before initialization', async () => {
      const provider = new MiniMaxTTS(
        { apiKey: 'test-key', voiceId: 'English_expressive_narrator' },
        logger
      );

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further synthesis', async () => {
      const provider = new MiniMaxTTS(
        { apiKey: 'test-key', voiceId: 'English_expressive_narrator' },
        logger
      );
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });
});
