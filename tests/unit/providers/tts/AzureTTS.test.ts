/**
 * Tests for AzureTTS provider
 *
 * Tests the AzureTTS provider which uses native `fetch` via HttpClient
 * (no microsoft-cognitiveservices-speech-sdk dependency).
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

import { AzureTTS } from '../../../../src/providers/tts/azure/AzureTTS';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderResponseError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

/**
 * Create a mock Response-like object matching Azure's raw-audio response.
 */
function createAudioResponse(bytes: Uint8Array = AUDIO_BYTES): Partial<Response> {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': 'audio/mpeg' }),
    arrayBuffer: async () => {
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      return buffer;
    },
    text: async () => '',
  };
}

describe('AzureTTS', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new AzureTTS(
        {
          apiKey: 'test-key',
          region: 'eastus',
          voiceName: 'en-US-AriaNeural',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
      expect(provider.config.voiceName).toBe('en-US-AriaNeural');
    });

    it('should initialize in proxy mode without an API key or region', async () => {
      const provider = new AzureTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/azure-tts',
          voiceName: 'en-US-AriaNeural',
        },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new AzureTTS(
        { region: 'eastus', voiceName: 'en-US-AriaNeural' },
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when voiceName is not configured', async () => {
      const provider = new AzureTTS(
        { apiKey: 'test-key', region: 'eastus' } as unknown as ConstructorParameters<
          typeof AzureTTS
        >[0],
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when region is missing in direct mode', async () => {
      const provider = new AzureTTS(
        { apiKey: 'test-key', voiceName: 'en-US-AriaNeural' },
        logger
      );

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });
  });

  describe('Synthesis', () => {
    it('should POST SSML to the regional endpoint and return an audio Blob', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new AzureTTS(
        {
          apiKey: 'test-key',
          region: 'eastus',
          voiceName: 'en-US-AriaNeural',
        },
        logger
      );
      await provider.initialize();

      const blob = await provider.synthesize('Hello, world!');

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mpeg');
      expect(blob.size).toBe(AUDIO_BYTES.length);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://eastus.tts.speech.microsoft.com/cognitiveservices/v1');
      expect(init.method).toBe('POST');
      expect(init.body).toBe(
        "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
          "<voice name='en-US-AriaNeural'>Hello, world!</voice></speak>"
      );
    });

    it('should send subscription key, content type, and output format headers', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new AzureTTS(
        {
          apiKey: 'test-key',
          region: 'eastus',
          voiceName: 'en-US-AriaNeural',
          outputFormat: 'riff-24khz-16bit-mono-pcm',
          userAgent: 'my-voice-app',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['ocp-apim-subscription-key']).toBe('test-key');
      expect(init.headers['content-type']).toBe('application/ssml+xml');
      expect(init.headers['x-microsoft-outputformat']).toBe('riff-24khz-16bit-mono-pcm');
      expect(init.headers['user-agent']).toBe('my-voice-app');
      expect(init.headers['authorization']).toBeUndefined();
    });

    it('should send a bearer token when apiKey is an async factory', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new AzureTTS(
        {
          apiKey: async () => 'issued-token-123',
          region: 'eastus',
          voiceName: 'en-US-AriaNeural',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['authorization']).toBe('Bearer issued-token-123');
      expect(init.headers['ocp-apim-subscription-key']).toBeUndefined();
    });

    it('should XML-escape user text in the SSML body', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new AzureTTS(
        { apiKey: 'test-key', region: 'eastus', voiceName: 'en-US-AriaNeural' },
        logger
      );
      await provider.initialize();

      await provider.synthesize(`Tom & Jerry <say> "it's" done`);

      const [, init] = mockFetch.mock.calls[0];
      expect(init.body).toContain(
        'Tom &amp; Jerry &lt;say&gt; &quot;it&apos;s&quot; done'
      );
      expect(init.body).not.toContain('<say>');
    });

    it('should wrap text in express-as and prosody elements when style/rate/pitch are set', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new AzureTTS(
        {
          apiKey: 'test-key',
          region: 'eastus',
          voiceName: 'en-US-AriaNeural',
          style: 'cheerful',
          styleDegree: 1.5,
          rate: 1.25,
          pitch: -2,
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hi');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.body).toContain("xmlns:mstts='https://www.w3.org/2001/mstts'");
      expect(init.body).toContain(
        "<mstts:express-as style='cheerful' styledegree='1.5'>" +
          "<prosody rate='+25.00%' pitch='-2st'>Hi</prosody>" +
          '</mstts:express-as>'
      );
    });

    it('should derive the SSML locale from the voice name', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new AzureTTS(
        { apiKey: 'test-key', region: 'westeurope', voiceName: 'de-DE-KatjaNeural' },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hallo');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.body).toContain("xml:lang='de-DE'");
    });

    it('should default to audio-24khz-48kbitrate-mono-mp3 output', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse());

      const provider = new AzureTTS(
        { apiKey: 'test-key', region: 'eastus', voiceName: 'en-US-AriaNeural' },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers['x-microsoft-outputformat']).toBe('audio-24khz-48kbitrate-mono-mp3');
    });

    it('should map output formats to Blob MIME types', async () => {
      const cases: Array<[string, string]> = [
        ['audio-24khz-48kbitrate-mono-mp3', 'audio/mpeg'],
        ['riff-24khz-16bit-mono-pcm', 'audio/wav'],
        ['ogg-24khz-16bit-mono-opus', 'audio/ogg'],
        ['webm-24khz-16bit-mono-opus', 'audio/webm'],
        ['raw-16khz-16bit-mono-pcm', 'application/octet-stream'],
      ];

      for (const [outputFormat, mimeType] of cases) {
        mockFetch.mockResolvedValueOnce(createAudioResponse());
        const provider = new AzureTTS(
          {
            apiKey: 'test-key',
            region: 'eastus',
            voiceName: 'en-US-AriaNeural',
            outputFormat: outputFormat as never,
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

      const provider = new AzureTTS(
        {
          proxyUrl: 'http://localhost:3001/api/proxy/azure-tts',
          voiceName: 'en-US-AriaNeural',
        },
        logger
      );
      await provider.initialize();

      await provider.synthesize('Hello');

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/azure-tts/cognitiveservices/v1');
      expect(init.headers['ocp-apim-subscription-key']).toBeUndefined();
      expect(init.headers['authorization']).toBeUndefined();
    });

    it('should throw a ProviderResponseError on HTTP errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        text: async () => 'invalid subscription key',
      });

      const provider = new AzureTTS(
        { apiKey: 'bad-key', region: 'eastus', voiceName: 'en-US-AriaNeural', maxRetries: 0 },
        logger
      );
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow(ProviderResponseError);
      mockFetch.mockReset();
    });

    it('should throw when the response contains no audio data', async () => {
      mockFetch.mockResolvedValueOnce(createAudioResponse(new Uint8Array(0)));

      const provider = new AzureTTS(
        { apiKey: 'test-key', region: 'eastus', voiceName: 'en-US-AriaNeural' },
        logger
      );
      await provider.initialize();

      await expect(provider.synthesize('Hello')).rejects.toThrow(
        'Azure TTS response did not contain audio data'
      );
    });

    it('should throw when called before initialization', async () => {
      const provider = new AzureTTS(
        { apiKey: 'test-key', region: 'eastus', voiceName: 'en-US-AriaNeural' },
        logger
      );

      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further synthesis', async () => {
      const provider = new AzureTTS(
        { apiKey: 'test-key', region: 'eastus', voiceName: 'en-US-AriaNeural' },
        logger
      );
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.synthesize('Hello')).rejects.toThrow();
    });
  });
});
