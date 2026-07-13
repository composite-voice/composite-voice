/**
 * Tests for AzureSTT provider
 *
 * Covers the Azure Speech real-time WebSocket wire protocol: framed text
 * messages (header block + \r\n\r\n + JSON body), binary audio messages
 * (2-byte big-endian header-length prefix), query-parameter auth, and the
 * turn lifecycle.
 */

// Polyfill TextEncoder/TextDecoder for jsdom
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;

import { AzureSTT } from '../../../../src/providers/stt/azure/AzureSTT';
import { Logger } from '../../../../src/utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';
import type { TranscriptionResult } from '../../../../src/core/types/providers';

// Mock WebSocketManager
const mockWsManager = {
  connect: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn(),
  isConnected: jest.fn().mockReturnValue(true),
  getState: jest.fn().mockReturnValue('connected'),
  setHandlers: jest.fn(),
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

/** Get the message handler registered via setHandlers. */
function getMessageHandler(): (event: MessageEvent) => void {
  const handlers = mockWsManager.setHandlers.mock.calls[0][0];
  return handlers.onMessage;
}

/** Simulate an incoming Azure service message (header block + JSON body). */
function receive(path: string, body: unknown, requestId = 'a'.repeat(32)): void {
  const message =
    `Path: ${path}\r\n` +
    `X-RequestId: ${requestId}\r\n` +
    `X-Timestamp: ${new Date().toISOString()}\r\n` +
    `Content-Type: application/json; charset=utf-8\r\n` +
    `\r\n` +
    JSON.stringify(body);
  getMessageHandler()({ data: message } as MessageEvent);
}

/** Parsed representation of an outgoing client message. */
interface ParsedClientMessage {
  headers: Record<string, string>;
  body: string | Uint8Array;
}

/** Parse an outgoing text message (headers + \r\n\r\n + body). */
function parseTextMessage(raw: string): ParsedClientMessage {
  const [headerBlock, ...bodyParts] = raw.split('\r\n\r\n');
  const headers: Record<string, string> = {};
  for (const line of headerBlock!.split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return { headers, body: bodyParts.join('\r\n\r\n') };
}

/** Parse an outgoing binary message (2-byte BE prefix + headers + body). */
function parseBinaryMessage(raw: ArrayBuffer): ParsedClientMessage {
  const bytes = new Uint8Array(raw);
  const headerLength = (bytes[0]! << 8) | bytes[1]!;
  const headerBlock = new TextDecoder().decode(bytes.slice(2, 2 + headerLength));
  const headers: Record<string, string> = {};
  for (const line of headerBlock.split('\r\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
  }
  return { headers, body: bytes.slice(2 + headerLength) };
}

describe('AzureSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockWsManager.isConnected.mockReturnValue(true);
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration and defaults', async () => {
      const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.language).toBe('en-US');
      expect(provider.config.recognitionMode).toBe('conversation');
      expect(provider.config.outputFormat).toBe('simple');
      expect(provider.config.sampleRate).toBe(16000);
      expect(provider.config.numChannels).toBe(1);
      expect(provider.config.bitsPerSample).toBe(16);
    });

    it('should initialize in proxy mode without an API key or region', async () => {
      const provider = new AzureSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/azure-stt' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new AzureSTT({ region: 'eastus' }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when region is missing in direct mode', async () => {
      const provider = new AzureSTT({ apiKey: 'test-key' }, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should not be ready after dispose', async () => {
      const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Connection URL and auth', () => {
    it('should build the regional URL with subscription key query auth in direct mode', async () => {
      const provider = new AzureSTT(
        { apiKey: 'test-key', region: 'eastus', language: 'en-GB' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      expect(provider.isWebSocketConnected()).toBe(true);

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      const url = new URL(wsOptions.url);
      expect(url.protocol).toBe('wss:');
      expect(url.host).toBe('eastus.stt.speech.microsoft.com');
      expect(url.pathname).toBe('/speech/recognition/conversation/cognitiveservices/v1');
      expect(url.searchParams.get('language')).toBe('en-GB');
      expect(url.searchParams.get('format')).toBe('simple');
      expect(url.searchParams.get('Ocp-Apim-Subscription-Key')).toBe('test-key');
      expect(url.searchParams.get('Authorization')).toBeNull();
      expect(url.searchParams.get('X-ConnectionId')).toMatch(/^[0-9a-f]{32}$/);
    });

    it('should send an Authorization bearer query parameter for apiKey factories', async () => {
      const provider = new AzureSTT(
        { apiKey: async () => 'issued-token-123', region: 'eastus' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      const url = new URL(wsOptions.url);
      expect(url.searchParams.get('Authorization')).toBe('Bearer issued-token-123');
      expect(url.searchParams.get('Ocp-Apim-Subscription-Key')).toBeNull();
    });

    it('should use the recognition mode and detailed format in the URL', async () => {
      const provider = new AzureSTT(
        {
          apiKey: 'test-key',
          region: 'westeurope',
          recognitionMode: 'dictation',
          outputFormat: 'detailed',
          profanity: 'raw',
        },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      const url = new URL(wsOptions.url);
      expect(url.pathname).toBe('/speech/recognition/dictation/cognitiveservices/v1');
      expect(url.searchParams.get('format')).toBe('detailed');
      expect(url.searchParams.get('profanity')).toBe('raw');
    });

    it('should use the proxy URL without auth query parameters in proxy mode', async () => {
      const provider = new AzureSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/azure-stt' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe(
        'ws://localhost:3001/api/proxy/azure-stt/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple'
      );
    });

    it('should throw ProviderConnectionError when the connection fails', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('boom'));

      const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should close the socket when sending the config messages fails', async () => {
      mockWsManager.send.mockImplementationOnce(() => {
        throw new Error('send failed');
      });

      const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should throw when connecting before initialization', async () => {
      const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);

      await expect(provider.connect()).rejects.toThrow();
    });
  });

  describe('Handshake messages', () => {
    let provider: AzureSTT;

    beforeEach(async () => {
      provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
      await provider.initialize();
      await provider.connect();
    });

    it('should send speech.config, speech.context, and a WAV header on connect', () => {
      expect(mockWsManager.send).toHaveBeenCalledTimes(3);

      const config = parseTextMessage(mockWsManager.send.mock.calls[0][0] as string);
      expect(config.headers['path']).toBe('speech.config');
      expect(config.headers['x-requestid']).toMatch(/^[0-9a-f]{32}$/);
      expect(config.headers['x-timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(config.headers['content-type']).toBe('application/json');
      const configBody = JSON.parse(config.body as string);
      expect(configBody.context.system.name).toBe('composite-voice');
      expect(configBody.context.os.platform).toBeDefined();

      const context = parseTextMessage(mockWsManager.send.mock.calls[1][0] as string);
      expect(context.headers['path']).toBe('speech.context');
      expect(context.headers['x-requestid']).toBe(config.headers['x-requestid']);
      expect(JSON.parse(context.body as string)).toEqual({});

      const wavHeader = parseBinaryMessage(mockWsManager.send.mock.calls[2][0] as ArrayBuffer);
      expect(wavHeader.headers['path']).toBe('audio');
      expect(wavHeader.headers['content-type']).toBe('audio/x-wav');
      const wavBytes = wavHeader.body as Uint8Array;
      expect(wavBytes.byteLength).toBe(44);
      expect(new TextDecoder().decode(wavBytes.slice(0, 4))).toBe('RIFF');
      expect(new TextDecoder().decode(wavBytes.slice(8, 16))).toBe('WAVEfmt ');
      // 16 kHz sample rate, little-endian at offset 24
      const view = new DataView(wavBytes.buffer, wavBytes.byteOffset, wavBytes.byteLength);
      expect(view.getUint32(24, true)).toBe(16000);
      expect(view.getUint16(22, true)).toBe(1); // mono
      expect(view.getUint16(34, true)).toBe(16); // bits per sample
    });

    it('should include the configured speech.context payload', async () => {
      jest.clearAllMocks();
      const contextual = new AzureSTT(
        {
          apiKey: 'test-key',
          region: 'eastus',
          context: { phraseDetection: { mode: 'Conversation' } },
        },
        logger
      );
      await contextual.initialize();
      await contextual.connect();

      const context = parseTextMessage(mockWsManager.send.mock.calls[1][0] as string);
      expect(JSON.parse(context.body as string)).toEqual({
        phraseDetection: { mode: 'Conversation' },
      });
    });
  });

  describe('Audio streaming', () => {
    it('should frame audio chunks with the 2-byte header-length prefix', async () => {
      const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      const chunk = new Uint8Array([10, 20, 30, 40]).buffer;
      provider.sendAudio(chunk);

      expect(mockWsManager.send).toHaveBeenCalledTimes(1);
      const raw = mockWsManager.send.mock.calls[0][0] as ArrayBuffer;
      const bytes = new Uint8Array(raw);
      const headerLength = (bytes[0]! << 8) | bytes[1]!;
      expect(headerLength).toBeGreaterThan(0);
      expect(raw.byteLength).toBe(2 + headerLength + 4);

      const parsed = parseBinaryMessage(raw);
      expect(parsed.headers['path']).toBe('audio');
      expect(parsed.headers['x-requestid']).toMatch(/^[0-9a-f]{32}$/);
      expect(parsed.headers['content-type']).toBeUndefined();
      expect(Array.from(parsed.body as Uint8Array)).toEqual([10, 20, 30, 40]);
    });

    it('should drop audio when not connected', async () => {
      const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
      await provider.initialize();

      provider.sendAudio(new ArrayBuffer(8));

      expect(mockWsManager.send).not.toHaveBeenCalled();
    });
  });

  describe('Message handling', () => {
    let provider: AzureSTT;
    let results: TranscriptionResult[];

    beforeEach(async () => {
      provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
      await provider.initialize();
      results = [];
      provider.onTranscription((result) => results.push(result));
      await provider.connect();
      mockWsManager.send.mockClear();
    });

    it('should emit interim results for speech.hypothesis messages', () => {
      receive('speech.hypothesis', { Text: 'hello wor', Offset: 100000, Duration: 5000000 });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: 'hello wor',
        isFinal: false,
        metadata: { offset: 100000, duration: 5000000 },
      });
    });

    it('should emit a final result with utteranceComplete for a Success phrase', () => {
      receive('speech.hypothesis', { Text: 'hello', Offset: 0, Duration: 100 });
      receive('speech.phrase', {
        RecognitionStatus: 'Success',
        DisplayText: 'Hello, world.',
        Offset: 100000,
        Duration: 12300000,
      });
      receive('speech.endDetected', { Offset: 12400000 });

      const final = results[results.length - 1];
      expect(final).toMatchObject({
        text: 'Hello, world.',
        isFinal: true,
        speechFinal: true,
        utteranceComplete: true,
        metadata: {
          recognitionStatus: 'Success',
          offset: 100000,
          duration: 12300000,
        },
      });
    });

    it('should parse detailed-format phrases with NBest confidence', async () => {
      jest.clearAllMocks();
      const detailed = new AzureSTT(
        { apiKey: 'test-key', region: 'eastus', outputFormat: 'detailed' },
        logger
      );
      await detailed.initialize();
      const detailedResults: TranscriptionResult[] = [];
      detailed.onTranscription((result) => detailedResults.push(result));
      await detailed.connect();

      receive('speech.phrase', {
        RecognitionStatus: 'Success',
        Offset: 0,
        Duration: 5000000,
        NBest: [
          {
            Confidence: 0.92,
            Lexical: 'hello world',
            ITN: 'hello world',
            MaskedITN: 'hello world',
            Display: 'Hello, world.',
          },
        ],
      });

      expect(detailedResults).toHaveLength(1);
      expect(detailedResults[0]).toMatchObject({
        text: 'Hello, world.',
        isFinal: true,
        utteranceComplete: true,
        confidence: 0.92,
      });
      expect(detailedResults[0]?.metadata?.nBest).toHaveLength(1);
    });

    it('should not emit results for NoMatch or silence-timeout phrases', () => {
      receive('speech.phrase', { RecognitionStatus: 'NoMatch', Offset: 0, Duration: 0 });
      receive('speech.phrase', {
        RecognitionStatus: 'InitialSilenceTimeout',
        Offset: 0,
        Duration: 0,
      });
      receive('speech.phrase', { RecognitionStatus: 'EndOfDictation', Offset: 0, Duration: 0 });

      expect(results).toHaveLength(0);
    });

    it('should not emit interim results when interimResults is false', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider.config as any).interimResults = false;
      receive('speech.hypothesis', { Text: 'quiet', Offset: 0, Duration: 100 });

      expect(results).toHaveLength(0);
    });

    it('should ignore turn.start, speech.startDetected, and non-text messages', () => {
      receive('turn.start', { context: { serviceTag: 'abc123' } });
      receive('speech.startDetected', { Offset: 0 });
      getMessageHandler()({ data: new ArrayBuffer(4) } as MessageEvent);

      expect(results).toHaveLength(0);
    });

    it('should start a new turn with a fresh request id after turn.end', () => {
      // Capture the request id used for audio before turn.end
      provider.sendAudio(new Uint8Array([1]).buffer);
      const before = parseBinaryMessage(mockWsManager.send.mock.calls[0][0] as ArrayBuffer);
      mockWsManager.send.mockClear();

      receive('turn.end', {});

      // New turn: speech.context + WAV header re-sent with a new X-RequestId
      expect(mockWsManager.send).toHaveBeenCalledTimes(2);
      const context = parseTextMessage(mockWsManager.send.mock.calls[0][0] as string);
      expect(context.headers['path']).toBe('speech.context');
      expect(context.headers['x-requestid']).toMatch(/^[0-9a-f]{32}$/);
      expect(context.headers['x-requestid']).not.toBe(before.headers['x-requestid']);

      const wavHeader = parseBinaryMessage(mockWsManager.send.mock.calls[1][0] as ArrayBuffer);
      expect(wavHeader.headers['path']).toBe('audio');
      expect(wavHeader.headers['content-type']).toBe('audio/x-wav');
      expect(wavHeader.headers['x-requestid']).toBe(context.headers['x-requestid']);

      // Subsequent audio uses the new request id
      mockWsManager.send.mockClear();
      provider.sendAudio(new Uint8Array([2]).buffer);
      const after = parseBinaryMessage(mockWsManager.send.mock.calls[0][0] as ArrayBuffer);
      expect(after.headers['x-requestid']).toBe(context.headers['x-requestid']);
    });
  });

  describe('Disconnect', () => {
    it('should send a zero-length end-of-stream audio message and disconnect', async () => {
      mockWsManager.isConnected.mockReturnValue(false);

      const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      await provider.disconnect();

      const raw = mockWsManager.send.mock.calls[0][0] as ArrayBuffer;
      const parsed = parseBinaryMessage(raw);
      expect(parsed.headers['path']).toBe('audio');
      expect((parsed.body as Uint8Array).byteLength).toBe(0);
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should complete disconnect as soon as turn.end arrives', async () => {
      jest.useFakeTimers();
      try {
        const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
        await provider.initialize();
        await provider.connect();

        const disconnectPromise = provider.disconnect();
        receive('turn.end', {});

        // Resolves via the turn.end signal — no timer advance needed. If the
        // resolver were broken, this await would hang on the 1s fallback.
        await disconnectPromise;

        expect(mockWsManager.disconnect).toHaveBeenCalled();
        expect(provider.isWebSocketConnected()).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should not start a new turn for turn.end during disconnect', async () => {
      const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      const disconnectPromise = provider.disconnect();
      receive('turn.end', {});
      await disconnectPromise;

      // Only the end-of-stream frame — no new speech.context / WAV header
      expect(mockWsManager.send).toHaveBeenCalledTimes(1);
    });

    it('should dispose cleanly even when disconnect fails', async () => {
      mockWsManager.isConnected.mockReturnValue(false);
      mockWsManager.disconnect.mockRejectedValueOnce(new Error('close failed'));

      const provider = new AzureSTT({ apiKey: 'test-key', region: 'eastus' }, logger);
      await provider.initialize();
      await provider.connect();

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(provider.isReady()).toBe(false);
    });
  });
});
