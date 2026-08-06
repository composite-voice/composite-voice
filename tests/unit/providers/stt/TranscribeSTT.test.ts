/**
 * Tests for TranscribeSTT provider
 */

// jsdom does not provide crypto.subtle or TextEncoder — install Node's implementations.
import { webcrypto } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;

import { TranscribeSTT } from '../../../../src/providers/stt/transcribe/TranscribeSTT';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';
import {
  encodeEventStreamMessage,
  decodeEventStreamMessage,
} from '../../../../src/utils/aws/eventstream';
import type { TranscriptionResult } from '../../../../src/core/types/providers';

// Mock WebSocketManager
const mockWsManager = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  getState: jest.fn().mockReturnValue('connected'),
  setHandlers: jest.fn(),
  expectClose: jest.fn(),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MockWebSocketManager = jest.fn((_options?: any) => mockWsManager);

jest.mock('../../../../src/utils/websocket', () => {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    WebSocketManager: function (this: unknown, options: any) {
      return MockWebSocketManager(options);
    },
    WebSocketState: {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      RECONNECTING: 'reconnecting',
      CLOSING: 'closing',
      CLOSED: 'closed',
    },
  };
});

const CREDENTIALS = {
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
};

/** Get the wsOptions passed to the WebSocketManager constructor. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getWsOptions(): any {
  return MockWebSocketManager.mock.calls[0]![0];
}

/** Get the message handler registered via setHandlers. */
function getMessageHandler(): (event: MessageEvent) => void {
  const handlers = mockWsManager.setHandlers.mock.calls[0][0];
  return handlers.onMessage;
}

/** Simulate an incoming Transcribe event-stream frame. */
function receiveEvent(eventType: string, body: unknown): void {
  const frame = encodeEventStreamMessage(
    {
      ':message-type': 'event',
      ':event-type': eventType,
      ':content-type': 'application/json',
    },
    new TextEncoder().encode(JSON.stringify(body)) as Uint8Array
  );
  getMessageHandler()({ data: frame.buffer } as MessageEvent);
}

/** Simulate an incoming Transcribe exception frame. */
function receiveException(exceptionType: string, message: string): void {
  const frame = encodeEventStreamMessage(
    {
      ':message-type': 'exception',
      ':exception-type': exceptionType,
      ':content-type': 'application/json',
    },
    new TextEncoder().encode(JSON.stringify({ Message: message })) as Uint8Array
  );
  getMessageHandler()({ data: frame.buffer } as MessageEvent);
}

/** Build a TranscriptEvent body with a single result. */
function transcriptEvent(result: Record<string, unknown>): unknown {
  return { Transcript: { Results: [result] } };
}

describe('TranscribeSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with credentials and region', async () => {
      const provider = new TranscribeSTT(
        { credentials: CREDENTIALS, region: 'us-east-1' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.mediaEncoding).toBe('pcm');
      expect(provider.config.sampleRate).toBe(16000);
    });

    it('should initialize with proxyUrl', async () => {
      const provider = new TranscribeSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/transcribe' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither credentials nor proxyUrl is configured', async () => {
      const provider = new TranscribeSTT({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when region is missing in direct mode', async () => {
      const provider = new TranscribeSTT({ credentials: CREDENTIALS }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should not be ready after dispose', async () => {
      const provider = new TranscribeSTT(
        { credentials: CREDENTIALS, region: 'us-east-1' },
        logger
      );
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Connection', () => {
    it('should connect with a SigV4-presigned URL in direct mode', async () => {
      const provider = new TranscribeSTT(
        { credentials: CREDENTIALS, region: 'us-east-1', languageCode: 'en-US' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      expect(provider.isWebSocketConnected()).toBe(true);

      const wsUrl: string = getWsOptions().url;
      expect(wsUrl).toMatch(
        /^wss:\/\/transcribestreaming\.us-east-1\.amazonaws\.com:8443\/stream-transcription-websocket\?/
      );

      const params = new URL(wsUrl).searchParams;
      expect(params.get('language-code')).toBe('en-US');
      expect(params.get('media-encoding')).toBe('pcm');
      expect(params.get('sample-rate')).toBe('16000');
      expect(params.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
      expect(params.get('X-Amz-Credential')).toMatch(
        /^AKIDEXAMPLE\/\d{8}\/us-east-1\/transcribe\/aws4_request$/
      );
      expect(params.get('X-Amz-Date')).toMatch(/^\d{8}T\d{6}Z$/);
      expect(params.get('X-Amz-Expires')).toBe('300');
      expect(params.get('X-Amz-SignedHeaders')).toBe('host');
      expect(params.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should resolve async credentials factories and sign the session token', async () => {
      const factory = jest.fn().mockResolvedValue({
        accessKeyId: 'ASIATEMP',
        secretAccessKey: 'TEMPSECRET',
        sessionToken: 'TEMP-TOKEN',
      });

      const provider = new TranscribeSTT({ credentials: factory, region: 'us-east-1' }, logger);
      await provider.initialize();
      await provider.connect();

      expect(factory).toHaveBeenCalledTimes(1);
      const params = new URL(getWsOptions().url).searchParams;
      expect(params.get('X-Amz-Security-Token')).toBe('TEMP-TOKEN');
      expect(params.get('X-Amz-Credential')).toContain('ASIATEMP/');
    });

    it('should connect through the proxy with unsigned query parameters', async () => {
      const provider = new TranscribeSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/transcribe', languageCode: 'es-US' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const wsUrl: string = getWsOptions().url;
      expect(wsUrl).toMatch(
        /^ws:\/\/localhost:3001\/api\/proxy\/transcribe\/stream-transcription-websocket\?/
      );
      const params = new URL(wsUrl).searchParams;
      expect(params.get('language-code')).toBe('es-US');
      expect(params.get('X-Amz-Signature')).toBeNull();
      expect(params.get('X-Amz-Algorithm')).toBeNull();
    });

    it('should include optional feature query parameters', async () => {
      const provider = new TranscribeSTT(
        {
          credentials: CREDENTIALS,
          region: 'us-east-1',
          languageCode: 'en-GB',
          sampleRate: 8000,
          enablePartialResultsStabilization: true,
          partialResultsStability: 'high',
          vocabularyName: 'jargon',
          vocabularyFilterName: 'profanity',
          vocabularyFilterMethod: 'mask',
          showSpeakerLabel: true,
          sessionId: '12345678-1234-1234-1234-123456789012',
        },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const params = new URL(getWsOptions().url).searchParams;
      expect(params.get('language-code')).toBe('en-GB');
      expect(params.get('sample-rate')).toBe('8000');
      expect(params.get('enable-partial-results-stabilization')).toBe('true');
      expect(params.get('partial-results-stability')).toBe('high');
      expect(params.get('vocabulary-name')).toBe('jargon');
      expect(params.get('vocabulary-filter-name')).toBe('profanity');
      expect(params.get('vocabulary-filter-method')).toBe('mask');
      expect(params.get('show-speaker-label')).toBe('true');
      expect(params.get('session-id')).toBe('12345678-1234-1234-1234-123456789012');
    });

    it('should use identify-language instead of language-code when enabled', async () => {
      const provider = new TranscribeSTT(
        {
          credentials: CREDENTIALS,
          region: 'us-east-1',
          identifyLanguage: true,
          languageOptions: ['en-US', 'es-US'],
          preferredLanguage: 'en-US',
        },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const params = new URL(getWsOptions().url).searchParams;
      expect(params.get('identify-language')).toBe('true');
      expect(params.get('language-options')).toBe('en-US,es-US');
      expect(params.get('preferred-language')).toBe('en-US');
      expect(params.get('language-code')).toBeNull();
    });

    it('should fall back to the base language option', async () => {
      const provider = new TranscribeSTT(
        { credentials: CREDENTIALS, region: 'us-east-1', language: 'fr-FR' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const params = new URL(getWsOptions().url).searchParams;
      expect(params.get('language-code')).toBe('fr-FR');
    });

    it('should throw ProviderConnectionError when the connection fails', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('boom'));

      const provider = new TranscribeSTT(
        { credentials: CREDENTIALS, region: 'us-east-1' },
        logger
      );
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should throw when connecting before initialization', async () => {
      const provider = new TranscribeSTT(
        { credentials: CREDENTIALS, region: 'us-east-1' },
        logger
      );

      await expect(provider.connect()).rejects.toThrow();
    });
  });

  describe('Message handling', () => {
    let provider: TranscribeSTT;
    let results: TranscriptionResult[];

    beforeEach(async () => {
      provider = new TranscribeSTT({ credentials: CREDENTIALS, region: 'us-east-1' }, logger);
      await provider.initialize();
      results = [];
      provider.onTranscription((result) => results.push(result));
      await provider.connect();
    });

    it('should emit interim results for partial segments', () => {
      receiveEvent(
        'TranscriptEvent',
        transcriptEvent({
          ResultId: 'r-1',
          StartTime: 0,
          EndTime: 0.8,
          IsPartial: true,
          Alternatives: [{ Transcript: 'Hello wor', Items: [] }],
        })
      );

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: 'Hello wor',
        isFinal: false,
        metadata: { resultId: 'r-1' },
      });
    });

    it('should emit a final utterance when a segment completes (IsPartial: false)', () => {
      receiveEvent(
        'TranscriptEvent',
        transcriptEvent({
          ResultId: 'r-1',
          IsPartial: true,
          Alternatives: [{ Transcript: 'Hello' }],
        })
      );
      receiveEvent(
        'TranscriptEvent',
        transcriptEvent({
          ResultId: 'r-1',
          StartTime: 0,
          EndTime: 1.2,
          IsPartial: false,
          Alternatives: [
            {
              Transcript: 'Hello world.',
              Items: [
                { Content: 'Hello', Type: 'pronunciation', Confidence: 0.9, StartTime: 0, EndTime: 0.5 },
                { Content: 'world', Type: 'pronunciation', Confidence: 0.7, StartTime: 0.6, EndTime: 1.1 },
                { Content: '.', Type: 'punctuation' },
              ],
            },
          ],
        })
      );

      const final = results[results.length - 1];
      expect(final).toMatchObject({
        text: 'Hello world.',
        isFinal: true,
        speechFinal: true,
        utteranceComplete: true,
      });
      expect(final?.confidence).toBeCloseTo(0.8);
      expect(final?.metadata?.items).toHaveLength(3);
      expect(final?.metadata?.resultId).toBe('r-1');
    });

    it('should handle multiple results in one TranscriptEvent', () => {
      receiveEvent('TranscriptEvent', {
        Transcript: {
          Results: [
            { ResultId: 'a', IsPartial: false, Alternatives: [{ Transcript: 'First.' }] },
            { ResultId: 'b', IsPartial: true, Alternatives: [{ Transcript: 'Sec' }] },
          ],
        },
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ text: 'First.', isFinal: true, utteranceComplete: true });
      expect(results[1]).toMatchObject({ text: 'Sec', isFinal: false });
    });

    it('should ignore empty transcripts', () => {
      receiveEvent(
        'TranscriptEvent',
        transcriptEvent({ IsPartial: true, Alternatives: [{ Transcript: '' }] })
      );
      receiveEvent('TranscriptEvent', { Transcript: { Results: [] } });

      expect(results).toHaveLength(0);
    });

    it('should not emit interim results when interimResults is false', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider.config as any).interimResults = false;

      receiveEvent(
        'TranscriptEvent',
        transcriptEvent({ IsPartial: true, Alternatives: [{ Transcript: 'quiet' }] })
      );
      expect(results).toHaveLength(0);

      receiveEvent(
        'TranscriptEvent',
        transcriptEvent({ IsPartial: false, Alternatives: [{ Transcript: 'Final.' }] })
      );
      expect(results).toHaveLength(1);
      expect(results[0]?.isFinal).toBe(true);
    });

    it('should emit an error result on exception messages', () => {
      receiveException('BadRequestException', 'A complete signal was sent without the preceding empty frame.');

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: 'A complete signal was sent without the preceding empty frame.',
          errorType: 'BadRequestException',
        },
      });
    });

    it('should expose the detected language in final metadata', () => {
      receiveEvent(
        'TranscriptEvent',
        transcriptEvent({
          IsPartial: false,
          LanguageCode: 'es-US',
          Alternatives: [{ Transcript: 'Hola.' }],
        })
      );

      expect(results[0]?.metadata?.languageCode).toBe('es-US');
    });

    it('should ignore corrupt frames without emitting results', () => {
      const frame = encodeEventStreamMessage(
        { ':message-type': 'event', ':event-type': 'TranscriptEvent' },
        new TextEncoder().encode('{}') as Uint8Array
      );
      frame[frame.length - 1] = (frame[frame.length - 1] as number) ^ 0xff; // break the CRC
      getMessageHandler()({ data: frame.buffer } as MessageEvent);

      expect(results).toHaveLength(0);
    });

    it('should ignore unexpected text messages', () => {
      getMessageHandler()({ data: 'not-binary' } as MessageEvent);
      expect(results).toHaveLength(0);
    });
  });

  describe('Audio streaming', () => {
    it('should wrap audio chunks in event-stream AudioEvent frames', async () => {
      const provider = new TranscribeSTT(
        { credentials: CREDENTIALS, region: 'us-east-1' },
        logger
      );
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      const chunk = new Uint8Array([10, 20, 30, 40]).buffer;
      provider.sendAudio(chunk);

      expect(mockWsManager.send).toHaveBeenCalledTimes(1);
      const [frame] = mockWsManager.send.mock.calls[0];
      expect(frame).toBeInstanceOf(ArrayBuffer);

      const decoded = decodeEventStreamMessage(frame as ArrayBuffer);
      expect(decoded.headers).toEqual({
        ':message-type': 'event',
        ':event-type': 'AudioEvent',
        ':content-type': 'application/octet-stream',
      });
      expect(Array.from(decoded.payload)).toEqual([10, 20, 30, 40]);
    });

    it('should drop audio when not connected', async () => {
      const provider = new TranscribeSTT(
        { credentials: CREDENTIALS, region: 'us-east-1' },
        logger
      );
      await provider.initialize();

      provider.sendAudio(new ArrayBuffer(8));

      expect(mockWsManager.send).not.toHaveBeenCalled();
    });
  });

  describe('Disconnect', () => {
    it('should send an empty AudioEvent end-of-stream frame and disconnect', async () => {
      const provider = new TranscribeSTT(
        { credentials: CREDENTIALS, region: 'us-east-1' },
        logger
      );
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      await provider.disconnect();

      const [endFrame] = mockWsManager.send.mock.calls[0];
      const decoded = decodeEventStreamMessage(endFrame as ArrayBuffer);
      expect(decoded.headers[':event-type']).toBe('AudioEvent');
      expect(decoded.payload.length).toBe(0);
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should dispose cleanly even when disconnect fails', async () => {
      mockWsManager.disconnect.mockRejectedValueOnce(new Error('close failed'));

      const provider = new TranscribeSTT(
        { credentials: CREDENTIALS, region: 'us-east-1' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(provider.isReady()).toBe(false);
    });
  });
});
