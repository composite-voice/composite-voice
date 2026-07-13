/**
 * Tests for PollyTTS provider
 *
 * Tests the PollyTTS provider which uses native `fetch` via HttpClient with
 * SigV4-signed requests (no AWS SDK dependency).
 */

// jsdom does not provide crypto.subtle or TextEncoder — install Node's implementations.
import { webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
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

import { PollyTTS } from '../../../../src/providers/tts/polly/PollyTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([0x49, 0x44, 0x33, 0x04, 0x00]);

const CREDENTIALS = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};

/**
 * Create a mock Response-like object matching Polly's raw-audio response.
 */
function createAudioResponse(bytes: Uint8Array = AUDIO_BYTES): Partial<Response> {
  return {
    ok: true,
    status: 200,
    headers: new Headers({
      'content-type': 'audio/mpeg',
      'x-amzn-requestcharacters': '13',
    }),
    arrayBuffer: async () => bytes.slice().buffer,
    text: async () => '',
  };
}

describe('PollyTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with credentials, region, and voiceId', async () => {
      const provider = new PollyTTS(
        { credentials: CREDENTIALS, region: 'us-east-1', voiceId: 'Joanna' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
      expect(provider.config.voiceId).toBe('Joanna');
    });

    it('should initialize in proxy mode without credentials or region', async () => {
      const provider = new PollyTTS(
        { proxyUrl: 'http://localhost:3001/api/proxy/polly', voiceId: 'Joanna' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither credentials nor proxyUrl is configured', async () => {
      const provider = new PollyTTS({ voiceId: 'Joanna' }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when region is missing in direct mode', async () => {
      const provider = new PollyTTS({ credentials: CREDENTIALS, voiceId: 'Joanna' }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when voiceId is not configured', async () => {
      const provider = new PollyTTS(
        { credentials: CREDENTIALS, region: 'us-east-1' } as unknown as ConstructorParameters<
          typeof PollyTTS
        >[0],
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });
  });

  describe('Synthesis', () => {
    it('should synthesize text and return the raw audio as a Blob', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new PollyTTS(
        { credentials: CREDENTIALS, region: 'us-east-1', voiceId: 'Joanna' },
        logger
      );
      await provider.initialize();

      const blob = await provider.synthesize('Hello, world!');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mpeg');
      expect(blob.size).toBe(AUDIO_BYTES.length);
    });

    it('should send the SynthesizeSpeech body and SigV4-signed headers', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new PollyTTS(
        {
          credentials: CREDENTIALS,
          region: 'us-east-1',
          voiceId: 'Joanna',
          engine: 'generative',
          outputFormat: 'pcm',
          sampleRate: 16000,
          languageCode: 'en-US',
          lexiconNames: ['acronyms'],
          textType: 'ssml',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('<speak>Hello</speak>');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://polly.us-east-1.amazonaws.com/v1/speech');
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body)).toEqual({
        Text: '<speak>Hello</speak>',
        TextType: 'ssml',
        VoiceId: 'Joanna',
        Engine: 'generative',
        OutputFormat: 'pcm',
        SampleRate: '16000',
        LanguageCode: 'en-US',
        LexiconNames: ['acronyms'],
      });

      // SigV4 signature shape
      expect(init.headers['x-amz-date']).toMatch(/^\d{8}T\d{6}Z$/);
      expect(init.headers['authorization']).toMatch(
        /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{8}\/us-east-1\/polly\/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=[0-9a-f]{64}$/
      );
      expect(init.headers['content-type']).toBe('application/json');
    });

    it('should default to neural engine, text input, and mp3 output', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new PollyTTS(
        { credentials: CREDENTIALS, region: 'eu-west-2', voiceId: 'Amy' },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://polly.eu-west-2.amazonaws.com/v1/speech');
      const body = JSON.parse(init.body);
      expect(body).toEqual({
        Text: 'Hello',
        TextType: 'text',
        VoiceId: 'Amy',
        Engine: 'neural',
        OutputFormat: 'mp3',
      });
      expect(body.SampleRate).toBeUndefined();
      expect(body.LanguageCode).toBeUndefined();
      expect(body.LexiconNames).toBeUndefined();
    });

    it('should resolve async credentials factories and sign the session token', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());
      const factory = jest.fn().mockResolvedValue({
        accessKeyId: 'ASIATEMP',
        secretAccessKey: 'TEMPSECRET',
        sessionToken: 'TEMP-TOKEN',
      });

      const provider = new PollyTTS(
        { credentials: factory, region: 'us-east-1', voiceId: 'Joanna' },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      expect(factory).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['x-amz-security-token']).toBe('TEMP-TOKEN');
      expect(init.headers['authorization']).toContain('Credential=ASIATEMP/');
      expect(init.headers['authorization']).toContain(
        'SignedHeaders=content-type;host;x-amz-date;x-amz-security-token'
      );
    });

    it('should route requests through the proxy without signing', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new PollyTTS(
        { proxyUrl: 'http://localhost:3001/api/proxy/polly', voiceId: 'Joanna' },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/polly/v1/speech');
      expect(init.headers['authorization']).toBeUndefined();
      expect(init.headers['x-amz-date']).toBeUndefined();
    });

    it('should map output formats to MIME types', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new PollyTTS(
        {
          credentials: CREDENTIALS,
          region: 'us-east-1',
          voiceId: 'Joanna',
          outputFormat: 'ogg_vorbis',
        },
        logger
      );
      await provider.initialize();

      const blob = await provider.synthesize('Hello');
      expect(blob.type).toBe('audio/ogg');
    });

    it('should throw when the response contains no audio data', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse(new Uint8Array(0)));

      const provider = new PollyTTS(
        { credentials: CREDENTIALS, region: 'us-east-1', voiceId: 'Joanna' },
        logger
      );
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'Polly TTS response did not contain audio data'
      );
    });

    it('should throw when called before initialization', async () => {
      const provider = new PollyTTS(
        { credentials: CREDENTIALS, region: 'us-east-1', voiceId: 'Joanna' },
        logger
      );

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further synthesis', async () => {
      const provider = new PollyTTS(
        { credentials: CREDENTIALS, region: 'us-east-1', voiceId: 'Joanna' },
        logger
      );
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });
});
