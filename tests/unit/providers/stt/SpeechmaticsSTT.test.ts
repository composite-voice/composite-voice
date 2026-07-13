/**
 * Tests for SpeechmaticsSTT provider
 */

import { SpeechmaticsSTT } from '../../../../src/providers/stt/speechmatics/SpeechmaticsSTT';
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

/** Simulate an incoming Speechmatics JSON message. */
function receive(message: unknown): void {
  getMessageHandler()({ data: JSON.stringify(message) } as MessageEvent);
}

/** Flush pending microtasks so connect() reaches the RecognitionStarted wait. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

/** Connect a provider, acknowledging the session with RecognitionStarted. */
async function connectProvider(provider: SpeechmaticsSTT): Promise<void> {
  const promise = provider.connect();
  await flushMicrotasks();
  receive({ message: 'RecognitionStarted', id: 'session-123' });
  await promise;
}

describe('SpeechmaticsSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.region).toBe('eu');
      expect(provider.config.language).toBe('en');
      expect(provider.config.audioFormat).toBe('pcm_s16le');
      expect(provider.config.sampleRate).toBe(16000);
      expect(provider.config.maxDelay).toBe(1);
      expect(provider.config.endOfUtteranceSilenceTrigger).toBe(0.75);
    });

    it('should initialize with proxyUrl', async () => {
      const provider = new SpeechmaticsSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/speechmatics' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize with custom configuration', async () => {
      const provider = new SpeechmaticsSTT(
        {
          apiKey: 'test-key',
          region: 'us',
          language: 'de',
          sampleRate: 44100,
          operatingPoint: 'enhanced',
          enableSpeakerDiarization: true,
        },
        logger
      );

      await provider.initialize();

      expect(provider.config.region).toBe('us');
      expect(provider.config.language).toBe('de');
      expect(provider.config.sampleRate).toBe(44100);
      expect(provider.config.operatingPoint).toBe('enhanced');
      expect(provider.config.enableSpeakerDiarization).toBe(true);
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new SpeechmaticsSTT({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should not be ready after dispose', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Connection', () => {
    it('should connect with the jwt query parameter and send StartRecognition in direct mode', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      expect(provider.isWebSocketConnected()).toBe(true);

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe('wss://eu.rt.speechmatics.com/v2?jwt=test-key');

      expect(mockWsManager.send).toHaveBeenCalledTimes(1);
      const startMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(startMessage).toEqual({
        message: 'StartRecognition',
        audio_format: {
          type: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: 16000,
        },
        transcription_config: {
          language: 'en',
          enable_partials: true,
          max_delay: 1,
          conversation_config: {
            end_of_utterance_silence_trigger: 0.75,
          },
        },
      });
    });

    it('should resolve apiKey factory functions for temporary keys', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: async () => 'temp-jwt-123' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe('wss://eu.rt.speechmatics.com/v2?jwt=temp-jwt-123');
    });

    it('should use the proxy URL without a jwt parameter in proxy mode', async () => {
      const provider = new SpeechmaticsSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/speechmatics' },
        logger
      );
      await provider.initialize();
      await connectProvider(provider);

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe('ws://localhost:3001/api/proxy/speechmatics/v2');
    });

    it('should connect to the configured region', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key', region: 'us' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe('wss://us.rt.speechmatics.com/v2?jwt=test-key');
    });

    it('should send a file audio_format without raw encoding fields', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key', audioFormat: 'file' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      const startMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(startMessage.audio_format).toEqual({ type: 'file' });
    });

    it('should omit conversation_config when end-of-utterance detection is disabled', async () => {
      const provider = new SpeechmaticsSTT(
        { apiKey: 'test-key', endOfUtteranceSilenceTrigger: 0 },
        logger
      );
      await provider.initialize();
      await connectProvider(provider);

      const startMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(startMessage.transcription_config.conversation_config).toBeUndefined();
    });

    it('should include optional transcription settings when configured', async () => {
      const provider = new SpeechmaticsSTT(
        {
          apiKey: 'test-key',
          operatingPoint: 'enhanced',
          maxDelayMode: 'fixed',
          enableSpeakerDiarization: true,
          additionalVocab: ['CompositeVoice', { content: 'Speechmatics' }],
          outputLocale: 'en-GB',
          domain: 'finance',
        },
        logger
      );
      await provider.initialize();
      await connectProvider(provider);

      const startMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(startMessage.transcription_config).toMatchObject({
        operating_point: 'enhanced',
        max_delay_mode: 'fixed',
        diarization: 'speaker',
        additional_vocab: ['CompositeVoice', { content: 'Speechmatics' }],
        output_locale: 'en-GB',
        domain: 'finance',
      });
    });

    it('should not send enable_partials when interimResults is false', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key', interimResults: false }, logger);
      await provider.initialize();
      await connectProvider(provider);

      const startMessage = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(startMessage.transcription_config.enable_partials).toBeUndefined();
    });

    it('should throw ProviderConnectionError when the connection fails', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('boom'));

      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should reject the connection when the server sends an Error message', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      const promise = provider.connect();
      await flushMicrotasks();
      receive({ message: 'Error', type: 'not_authorised', reason: 'Invalid API key' });

      await expect(promise).rejects.toThrow(ProviderConnectionError);
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should close the socket when sending StartRecognition fails', async () => {
      mockWsManager.send.mockImplementationOnce(() => {
        throw new Error('send failed');
      });

      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should throw when connecting before initialization', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);

      await expect(provider.connect()).rejects.toThrow();
    });
  });

  describe('Message handling', () => {
    let provider: SpeechmaticsSTT;
    let results: TranscriptionResult[];

    beforeEach(async () => {
      provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      results = [];
      provider.onTranscription((result) => results.push(result));
      await connectProvider(provider);
    });

    it('should emit interim results for partial transcripts', () => {
      receive({
        message: 'AddPartialTranscript',
        format: '2.9',
        metadata: { transcript: 'hello wor', start_time: 0, end_time: 0.9 },
        results: [
          {
            type: 'word',
            start_time: 0,
            end_time: 0.4,
            alternatives: [{ content: 'hello', confidence: 0.6 }],
          },
          {
            type: 'word',
            start_time: 0.5,
            end_time: 0.9,
            alternatives: [{ content: 'wor', confidence: 0.4 }],
          },
        ],
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: 'hello wor',
        isFinal: false,
      });
    });

    it('should accumulate final segments across messages into interim results', () => {
      receive({
        message: 'AddTranscript',
        format: '2.9',
        metadata: { transcript: 'Hello world.', start_time: 0, end_time: 1.2 },
        results: [
          {
            type: 'word',
            start_time: 0,
            end_time: 0.4,
            alternatives: [{ content: 'Hello', confidence: 1 }],
          },
          {
            type: 'word',
            start_time: 0.5,
            end_time: 1.1,
            alternatives: [{ content: 'world', confidence: 1 }],
          },
          {
            type: 'punctuation',
            start_time: 1.2,
            end_time: 1.2,
            is_eos: true,
            alternatives: [{ content: '.', confidence: 1 }],
          },
        ],
      });
      receive({
        message: 'AddPartialTranscript',
        format: '2.9',
        metadata: { transcript: 'how are', start_time: 1.5, end_time: 2.1 },
        results: [],
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ text: 'Hello world.', isFinal: false });
      expect(results[1]).toMatchObject({ text: 'Hello world. how are', isFinal: false });
    });

    it('should emit a final utterance when EndOfUtterance arrives', () => {
      receive({
        message: 'AddTranscript',
        format: '2.9',
        metadata: { transcript: 'gale eight becoming cyclonic.', start_time: 0.1, end_time: 1.7 },
        results: [
          {
            type: 'word',
            start_time: 0.11,
            end_time: 0.4,
            alternatives: [{ content: 'gale', confidence: 0.7 }],
          },
          {
            type: 'word',
            start_time: 0.41,
            end_time: 0.62,
            alternatives: [{ content: 'eight', confidence: 0.9 }],
          },
          {
            type: 'word',
            start_time: 0.65,
            end_time: 1.2,
            alternatives: [{ content: 'becoming', confidence: 0.8 }],
          },
          {
            type: 'word',
            start_time: 1.21,
            end_time: 1.6,
            alternatives: [{ content: 'cyclonic', confidence: 0.6 }],
          },
          {
            type: 'punctuation',
            start_time: 1.61,
            end_time: 1.61,
            is_eos: true,
            alternatives: [{ content: '.', confidence: 1 }],
          },
        ],
      });
      receive({
        message: 'EndOfUtterance',
        metadata: { start_time: 2.4, end_time: 2.4 },
      });

      const final = results[results.length - 1];
      expect(final).toMatchObject({
        text: 'gale eight becoming cyclonic.',
        isFinal: true,
        speechFinal: true,
        utteranceComplete: true,
      });
      expect(final?.confidence).toBeCloseTo(0.75);
      expect(final?.metadata?.startTime).toBe(2.4);
      expect(final?.metadata?.endTime).toBe(2.4);
    });

    it('should reset accumulation after an utterance', () => {
      receive({
        message: 'AddTranscript',
        metadata: { transcript: 'First.' },
        results: [{ type: 'word', alternatives: [{ content: 'First', confidence: 1 }] }],
      });
      receive({ message: 'EndOfUtterance', metadata: { start_time: 1, end_time: 1 } });
      receive({
        message: 'AddTranscript',
        metadata: { transcript: 'Second.' },
        results: [{ type: 'word', alternatives: [{ content: 'Second', confidence: 1 }] }],
      });
      receive({ message: 'EndOfUtterance', metadata: { start_time: 2, end_time: 2 } });

      const finals = results.filter((r) => r.isFinal);
      expect(finals.map((r) => r.text)).toEqual(['First.', 'Second.']);
    });

    it('should not emit anything for EndOfUtterance without accumulated speech', () => {
      receive({ message: 'EndOfUtterance', metadata: { start_time: 1, end_time: 1 } });

      expect(results).toHaveLength(0);
    });

    it('should emit remaining text as final when EndOfTranscript arrives', () => {
      receive({
        message: 'AddTranscript',
        metadata: { transcript: 'Goodbye.' },
        results: [{ type: 'word', alternatives: [{ content: 'Goodbye', confidence: 1 }] }],
      });
      receive({ message: 'EndOfTranscript' });

      const final = results[results.length - 1];
      expect(final).toMatchObject({
        text: 'Goodbye.',
        isFinal: true,
        utteranceComplete: true,
      });
    });

    it('should not emit interim results when interimResults is false', () => {
      receive({
        message: 'AddPartialTranscript',
        metadata: { transcript: 'loud' },
        results: [],
      });
      expect(results).toHaveLength(1); // interimResults defaults to true

      results.length = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider.config as any).interimResults = false;
      receive({
        message: 'AddPartialTranscript',
        metadata: { transcript: 'quiet' },
        results: [],
      });
      receive({
        message: 'AddTranscript',
        metadata: { transcript: 'quiet.' },
        results: [],
      });
      expect(results).toHaveLength(0);
    });

    it('should emit an error result on error messages after the handshake', () => {
      receive({
        message: 'Error',
        type: 'quota_exceeded',
        reason: 'Usage quota exceeded',
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: 'Usage quota exceeded',
          errorType: 'quota_exceeded',
        },
      });
    });

    it('should log but not emit on Warning messages', () => {
      receive({
        message: 'Warning',
        type: 'duration_limit_exceeded',
        reason: 'Approaching session limit',
      });

      expect(results).toHaveLength(0);
    });

    it('should ignore non-string messages', () => {
      getMessageHandler()({ data: new ArrayBuffer(4) } as MessageEvent);
      expect(results).toHaveLength(0);
    });

    it('should expose final word results with timing and speaker in final metadata', () => {
      receive({
        message: 'AddTranscript',
        metadata: { transcript: 'Hola.' },
        results: [
          {
            type: 'word',
            start_time: 0,
            end_time: 0.4,
            alternatives: [{ content: 'Hola', confidence: 0.95, speaker: 'S1', language: 'es' }],
          },
        ],
      });
      receive({ message: 'EndOfUtterance', metadata: { start_time: 1, end_time: 1 } });

      const final = results[results.length - 1];
      expect(final?.metadata?.results).toEqual([
        {
          type: 'word',
          start_time: 0,
          end_time: 0.4,
          alternatives: [{ content: 'Hola', confidence: 0.95, speaker: 'S1', language: 'es' }],
        },
      ]);

      // Results must not leak into the next utterance
      receive({
        message: 'AddTranscript',
        metadata: { transcript: 'Bye.' },
        results: [{ type: 'word', alternatives: [{ content: 'Bye', confidence: 1 }] }],
      });
      receive({ message: 'EndOfUtterance', metadata: { start_time: 2, end_time: 2 } });
      const next = results[results.length - 1];
      expect(next?.metadata?.results).toEqual([
        { type: 'word', alternatives: [{ content: 'Bye', confidence: 1 }] },
      ]);
    });
  });

  describe('Audio streaming', () => {
    it('should forward audio chunks as binary frames', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await connectProvider(provider);
      mockWsManager.send.mockClear();

      const chunk = new ArrayBuffer(8);
      provider.sendAudio(chunk);

      expect(mockWsManager.send).toHaveBeenCalledWith(chunk);
    });

    it('should drop audio when not connected', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      provider.sendAudio(new ArrayBuffer(8));

      expect(mockWsManager.send).not.toHaveBeenCalled();
    });
  });

  describe('ForceEndOfUtterance and disconnect', () => {
    it('should send a ForceEndOfUtterance control message', async () => {
      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await connectProvider(provider);
      mockWsManager.send.mockClear();

      provider.forceEndOfUtterance();

      expect(mockWsManager.send).toHaveBeenCalledWith(
        JSON.stringify({ message: 'ForceEndOfUtterance' })
      );
    });

    it('should send EndOfStream with the last sequence number and disconnect', async () => {
      mockWsManager.isConnected.mockReturnValue(false);

      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      provider.sendAudio(new ArrayBuffer(8));
      provider.sendAudio(new ArrayBuffer(8));
      provider.sendAudio(new ArrayBuffer(8));
      mockWsManager.send.mockClear();

      await provider.disconnect();

      const [endOfStream] = mockWsManager.send.mock.calls[0];
      expect(JSON.parse(endOfStream)).toEqual({ message: 'EndOfStream', last_seq_no: 3 });
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should complete disconnect as soon as EndOfTranscript arrives', async () => {
      jest.useFakeTimers();
      try {
        const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
        await provider.initialize();
        await connectProvider(provider);

        const disconnectPromise = provider.disconnect();
        receive({ message: 'EndOfTranscript' });

        // Resolves via the EndOfTranscript signal — no timer advance needed.
        // If the resolver were broken, this await would hang on the 1s fallback.
        await disconnectPromise;

        expect(mockWsManager.disconnect).toHaveBeenCalled();
        expect(provider.isWebSocketConnected()).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should dispose cleanly even when disconnect fails', async () => {
      mockWsManager.isConnected.mockReturnValue(false);
      mockWsManager.disconnect.mockRejectedValueOnce(new Error('close failed'));

      const provider = new SpeechmaticsSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await connectProvider(provider);

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(provider.isReady()).toBe(false);
    });
  });
});
