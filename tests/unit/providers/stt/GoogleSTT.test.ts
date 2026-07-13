/**
 * Tests for GoogleSTT provider
 *
 * Tests the GoogleSTT provider which uses native `fetch` via HttpClient
 * (no @google-cloud/speech dependency). GoogleSTT is a batch (REST)
 * provider: each transcribe() call uploads a complete recording to the
 * synchronous `speech:recognize` endpoint.
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

import { GoogleSTT } from '../../../../src/providers/stt/google/GoogleSTT';
import type { TranscriptionResult } from '../../../../src/core/types/providers';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderResponseError } from '../../../../src/utils/errors';

// --- Global fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

/** Fake audio bytes used across tests. */
const AUDIO_BYTES = new Uint8Array([10, 20, 30, 40, 50]);
const AUDIO_BASE64 = btoa(String.fromCharCode(...AUDIO_BYTES));

/**
 * Create an audio Blob whose bytes are readable in jsdom.
 *
 * @remarks
 * JSDOM doesn't implement `Blob.arrayBuffer()`, so it is stubbed per instance
 * (same approach as the AudioPlayer tests).
 */
function createAudioBlob(bytes: Uint8Array<ArrayBuffer> = AUDIO_BYTES): Blob {
  const blob = new Blob([bytes]);
  (blob as unknown as { arrayBuffer: () => Promise<ArrayBuffer> }).arrayBuffer = async () =>
    bytes.slice().buffer;
  return blob;
}

/**
 * Create a mock Response-like object matching Google's `speech:recognize` response.
 */
function createRecognizeResponse(data: Record<string, unknown>): Partial<Response> {
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

describe('GoogleSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with an API key', async () => {
      const provider = new GoogleSTT({ apiKey: 'test-key' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('rest');
    });

    it('should initialize in proxy mode without an API key', async () => {
      const provider = new GoogleSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/google-stt' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new GoogleSTT({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });
  });

  describe('Transcription', () => {
    it('should transcribe audio and emit a final utterance-complete result', async () => {
      mockFetch.mockResolvedValueOnce(
        createRecognizeResponse({
          results: [
            {
              alternatives: [{ transcript: 'hello world', confidence: 0.92 }],
              languageCode: 'en-us',
            },
          ],
          totalBilledTime: '3s',
          requestId: '12345',
        })
      );

      const provider = new GoogleSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      const results: TranscriptionResult[] = [];
      provider.onTranscription((result) => results.push(result));

      await provider.transcribe(createAudioBlob());

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        text: 'hello world',
        isFinal: true,
        utteranceComplete: true,
        confidence: 0.92,
        metadata: {
          languageCode: 'en-us',
          totalBilledTime: '3s',
          requestId: '12345',
        },
      });
    });

    it('should send the correct request body and X-goog-api-key header', async () => {
      mockFetch.mockResolvedValueOnce(
        createRecognizeResponse({
          results: [{ alternatives: [{ transcript: 'hi' }] }],
        })
      );

      const provider = new GoogleSTT(
        {
          apiKey: 'test-key',
          language: 'en-GB',
          encoding: 'LINEAR16',
          sampleRate: 16000,
          model: 'latest_short',
          enableWordTimeOffsets: true,
          alternativeLanguageCodes: ['es-ES', 'fr-FR'],
          profanityFilter: true,
          keywords: ['CompositeVoice'],
        },
        logger
      );
      await provider.initialize();
      provider.onTranscription(() => {});

      await provider.transcribe(createAudioBlob());

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('https://speech.googleapis.com/v1/speech:recognize');
      expect(init.method).toBe('POST');
      expect(init.headers['X-goog-api-key']).toBe('test-key');
      expect(JSON.parse(init.body)).toEqual({
        config: {
          languageCode: 'en-GB',
          enableAutomaticPunctuation: true,
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          model: 'latest_short',
          enableWordTimeOffsets: true,
          alternativeLanguageCodes: ['es-ES', 'fr-FR'],
          profanityFilter: true,
          speechContexts: [{ phrases: ['CompositeVoice'] }],
        },
        audio: { content: AUDIO_BASE64 },
      });
    });

    it('should default to en-US with automatic punctuation and omit unset fields', async () => {
      mockFetch.mockResolvedValueOnce(
        createRecognizeResponse({
          results: [{ alternatives: [{ transcript: 'hi' }] }],
        })
      );

      const provider = new GoogleSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      provider.onTranscription(() => {});

      await provider.transcribe(createAudioBlob());

      const [, init] = mockFetch.mock.calls[0];
      const body = JSON.parse(init.body);
      expect(body.config).toEqual({
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
      });
    });

    it('should allow disabling automatic punctuation', async () => {
      mockFetch.mockResolvedValueOnce(
        createRecognizeResponse({
          results: [{ alternatives: [{ transcript: 'hi' }] }],
        })
      );

      const provider = new GoogleSTT({ apiKey: 'test-key', punctuation: false }, logger);
      await provider.initialize();
      provider.onTranscription(() => {});

      await provider.transcribe(createAudioBlob());

      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse(init.body).config.enableAutomaticPunctuation).toBe(false);
    });

    it('should concatenate multiple result segments and average confidence', async () => {
      mockFetch.mockResolvedValueOnce(
        createRecognizeResponse({
          results: [
            { alternatives: [{ transcript: 'first segment', confidence: 0.8 }] },
            { alternatives: [{ transcript: 'second segment', confidence: 0.6 }] },
          ],
        })
      );

      const provider = new GoogleSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      const results: TranscriptionResult[] = [];
      provider.onTranscription((result) => results.push(result));

      await provider.transcribe(createAudioBlob());

      expect(results).toHaveLength(1);
      expect(results[0]?.text).toBe('first segment second segment');
      expect(results[0]?.confidence).toBeCloseTo(0.7);
    });

    it('should expose word time offsets in metadata', async () => {
      const words = [
        { startTime: '0s', endTime: '0.400s', word: 'hello' },
        { startTime: '0.400s', endTime: '0.900s', word: 'world' },
      ];
      mockFetch.mockResolvedValueOnce(
        createRecognizeResponse({
          results: [{ alternatives: [{ transcript: 'hello world', confidence: 0.9, words }] }],
        })
      );

      const provider = new GoogleSTT({ apiKey: 'test-key', enableWordTimeOffsets: true }, logger);
      await provider.initialize();

      const results: TranscriptionResult[] = [];
      provider.onTranscription((result) => results.push(result));

      await provider.transcribe(createAudioBlob());

      expect(results[0]?.metadata?.words).toEqual(words);
    });

    it('should emit nothing when Google detects no speech', async () => {
      mockFetch.mockResolvedValueOnce(createRecognizeResponse({ totalBilledTime: '0s' }));

      const provider = new GoogleSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      const results: TranscriptionResult[] = [];
      provider.onTranscription((result) => results.push(result));

      await provider.transcribe(createAudioBlob());

      expect(results).toHaveLength(0);
    });

    it('should route requests through the proxy without an auth header', async () => {
      mockFetch.mockResolvedValueOnce(
        createRecognizeResponse({
          results: [{ alternatives: [{ transcript: 'hi' }] }],
        })
      );

      const provider = new GoogleSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/google-stt' },
        logger
      );
      await provider.initialize();
      provider.onTranscription(() => {});

      await provider.transcribe(createAudioBlob());

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3001/api/proxy/google-stt/v1/speech:recognize');
      expect(init.headers['X-goog-api-key']).toBeUndefined();
    });

    it('should surface the Google error message on a non-retryable failure', async () => {
      mockFetch.mockResolvedValue(
        createErrorResponse(
          400,
          'Sync input too long. For audio longer than 1 min use LongRunningRecognize.',
          'INVALID_ARGUMENT'
        )
      );

      const provider = new GoogleSTT({ apiKey: 'test-key', maxRetries: 0 }, logger);
      await provider.initialize();
      provider.onTranscription(() => {});

      const error = await provider.transcribe(createAudioBlob()).catch((e: Error) => e);
      expect(error).toBeInstanceOf(ProviderResponseError);
      expect((error as Error).message).toContain('Sync input too long');
    });

    it('should throw when called before initialization', async () => {
      const provider = new GoogleSTT({ apiKey: 'test-key' }, logger);

      await expect(provider.transcribe(createAudioBlob())).rejects.toThrow();
    });

    it('should treat processAudio as a no-op (REST provider)', async () => {
      const provider = new GoogleSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      expect(() => provider.processAudio(new ArrayBuffer(8))).not.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('Disposal', () => {
    it('should dispose cleanly and reject further transcription', async () => {
      const provider = new GoogleSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      await expect(provider.transcribe(createAudioBlob())).rejects.toThrow();
    });
  });
});
