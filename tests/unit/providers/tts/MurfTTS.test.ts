/**
 * Tests for MurfTTS provider
 *
 * Tests the MurfTTS provider which uses native `fetch` via HttpClient
 * (no Murf SDK dependency).
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

import { MurfTTS } from '../../../../src/providers/tts/murf/MurfTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const AUDIO_BASE64 = btoa(String.fromCharCode(...AUDIO_BYTES));

/**
 * Create a mock Response-like object matching Murf's JSON generate response.
 */
function createGenerateResponse(overrides: Record<string, unknown> = {}): Partial<Response> {
  const data = {
    encodedAudio: AUDIO_BASE64,
    audioLengthInSeconds: 1.5,
    remainingCharacterCount: 9987,
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
 * Create a mock Response-like object for a raw audio file download.
 */
function createAudioFileResponse(): Partial<Response> {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'audio/mpeg' }),
    arrayBuffer: async () => AUDIO_BYTES.buffer.slice(0),
  };
}

describe('MurfTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new MurfTTS(
        {
          apiKey: 'test-key',
          voiceId: 'en-US-natalie',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
      expect(provider.config.voiceId).toBe('en-US-natalie');
    });

    it('should initialize in proxy mode without an API key', async () => {
      const provider = new MurfTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/murf',
          voiceId: 'en-US-natalie',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new MurfTTS({ voiceId: 'en-US-natalie' }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when voiceId is not configured', async () => {
      const provider = new MurfTTS(
        { apiKey: 'test-key' } as unknown as ConstructorParameters<typeof MurfTTS>[0],
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });
  });

  describe('Synthesis', () => {
    it('should synthesize text and return a decoded audio Blob', async () => {
      mockFetch.mockResolvedValueOnce(createGenerateResponse());

      const provider = new MurfTTS(
        {
          apiKey: 'test-key',
          voiceId: 'en-US-natalie',
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
      mockFetch.mockResolvedValueOnce(createGenerateResponse());

      const provider = new MurfTTS(
        {
          apiKey: 'test-key',
          voiceId: 'en-US-natalie',
          format: 'wav',
          sampleRate: 24000,
          channelType: 'MONO',
          style: 'Conversational',
          rate: 10,
          pitch: -5,
          variation: 2,
          locale: 'en-US',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.murf.ai/v1/speech/generate');
      expect(init.method).toBe('POST');
      expect(init.headers['api-key']).toBe('test-key');
      expect(JSON.parse(init.body)).toEqual({
        text: 'Hello',
        voiceId: 'en-US-natalie',
        modelVersion: 'GEN2',
        format: 'WAV',
        encodeAsBase64: true,
        sampleRate: 24000,
        channelType: 'MONO',
        style: 'Conversational',
        rate: 10,
        pitch: -5,
        variation: 2,
        locale: 'en-US',
      });
    });

    it('should default to mp3 and GEN2', async () => {
      mockFetch.mockResolvedValueOnce(createGenerateResponse());

      const provider = new MurfTTS({ apiKey: 'test-key', voiceId: 'en-US-natalie' }, logger);
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.format).toBe('MP3');
      expect(body.modelVersion).toBe('GEN2');
      expect(body.encodeAsBase64).toBe(true);
      expect(body.sampleRate).toBeUndefined();
      expect(body.channelType).toBeUndefined();
      expect(body.style).toBeUndefined();
      expect(body.rate).toBeUndefined();
      expect(body.pitch).toBeUndefined();
      expect(body.variation).toBeUndefined();
      expect(body.locale).toBeUndefined();
    });

    it('should map formats to the correct MIME types', async () => {
      const cases: Array<['mp3' | 'wav' | 'flac' | 'alaw' | 'ulaw', string]> = [
        ['mp3', 'audio/mpeg'],
        ['wav', 'audio/wav'],
        ['flac', 'audio/flac'],
        ['alaw', 'audio/alaw'],
        ['ulaw', 'audio/mulaw'],
      ];

      for (const [format, mimeType] of cases) {
        mockFetch.mockResolvedValueOnce(createGenerateResponse());

        const provider = new MurfTTS(
          {
            apiKey: 'test-key',
            voiceId: 'en-US-natalie',
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
      mockFetch.mockResolvedValueOnce(createGenerateResponse());

      const provider = new MurfTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/murf',
          voiceId: 'en-US-natalie',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/murf/v1/speech/generate');
      expect(init.headers['api-key']).toBeUndefined();
    });

    it('should fetch the audioFile URL when the response contains no base64 audio', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createGenerateResponse({
            encodedAudio: undefined,
            audioFile: 'https://murf.ai/user-upload/audio.mp3',
          })
        )
        .mockResolvedValueOnce(createAudioFileResponse());

      const provider = new MurfTTS({ apiKey: 'test-key', voiceId: 'en-US-natalie' }, logger);
      await provider.initialize();

      const blob = await provider.synthesize('Hello');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [audioUrl, audioInit] = mockFetch.mock.calls[1];
      expect(audioUrl).toBe('https://murf.ai/user-upload/audio.mp3');
      expect(audioInit).toBeUndefined();
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mpeg');
      expect(blob.size).toBe(AUDIO_BYTES.length);
    });

    it('should throw when the audioFile download fails', async () => {
      mockFetch
        .mockResolvedValueOnce(
          createGenerateResponse({
            encodedAudio: undefined,
            audioFile: 'https://murf.ai/user-upload/audio.mp3',
          })
        )
        .mockResolvedValueOnce({ ok: false, status: 404 });

      const provider = new MurfTTS({ apiKey: 'test-key', voiceId: 'en-US-natalie' }, logger);
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'Murf TTS audio file download failed with status 404'
      );
    });

    it('should throw when the response contains no audio data', async () => {
      mockFetch.mockResolvedValueOnce(
        createGenerateResponse({ encodedAudio: undefined, audioFile: undefined })
      );

      const provider = new MurfTTS({ apiKey: 'test-key', voiceId: 'en-US-natalie' }, logger);
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'Murf TTS response did not contain audio data'
      );
    });

    it('should throw when called before initialization', async () => {
      const provider = new MurfTTS({ apiKey: 'test-key', voiceId: 'en-US-natalie' }, logger);

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further synthesis', async () => {
      const provider = new MurfTTS({ apiKey: 'test-key', voiceId: 'en-US-natalie' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });
});
