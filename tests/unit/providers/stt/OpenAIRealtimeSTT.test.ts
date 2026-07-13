/**
 * Tests for OpenAIRealtimeSTT provider
 */

import { OpenAIRealtimeSTT } from '../../../../src/providers/stt/openai/OpenAIRealtimeSTT';
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

/** Get the handlers registered via setHandlers. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getHandlers(): any {
  return mockWsManager.setHandlers.mock.calls[0][0];
}

/** Simulate an incoming OpenAI Realtime JSON event. */
function receive(message: unknown): void {
  getHandlers().onMessage({ data: JSON.stringify(message) } as MessageEvent);
}

/** Parse the session.update sent on connect (always the first send). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSessionUpdate(): any {
  return JSON.parse(mockWsManager.send.mock.calls[0][0]);
}

describe('OpenAIRealtimeSTT', () => {
  let logger: Logger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new Logger('test', { enabled: false });
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.config.model).toBe('gpt-4o-mini-transcribe');
      expect(provider.config.inputAudioFormat).toBe('audio/pcm');
      expect(provider.config.interimResults).toBe(true);
    });

    it('should initialize with proxyUrl', async () => {
      const provider = new OpenAIRealtimeSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/openai-realtime' },
        logger
      );

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should initialize with custom configuration', async () => {
      const provider = new OpenAIRealtimeSTT(
        {
          apiKey: 'test-key',
          model: 'gpt-4o-transcribe',
          language: 'en',
          prompt: 'Keywords: CompositeVoice',
          turnDetection: { type: 'semantic_vad', eagerness: 'high' },
          noiseReduction: 'near_field',
        },
        logger
      );

      await provider.initialize();

      expect(provider.config.model).toBe('gpt-4o-transcribe');
      expect(provider.config.turnDetection).toEqual({ type: 'semantic_vad', eagerness: 'high' });
      expect(provider.config.noiseReduction).toBe('near_field');
    });

    it('should throw when neither apiKey nor proxyUrl is configured', async () => {
      const provider = new OpenAIRealtimeSTT({}, logger);

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should not be ready after dispose', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Connection', () => {
    it('should connect with auth subprotocols and send session.update in direct mode', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();

      expect(provider.isWebSocketConnected()).toBe(true);

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe('wss://api.openai.com/v1/realtime?intent=transcription');
      expect(wsOptions.protocols).toEqual(['realtime', 'openai-insecure-api-key.test-key']);

      expect(mockWsManager.send).toHaveBeenCalledTimes(1);
      expect(getSessionUpdate()).toEqual({
        type: 'session.update',
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              transcription: { model: 'gpt-4o-mini-transcribe' },
              turn_detection: { type: 'server_vad' },
            },
          },
        },
      });
    });

    it('should resolve async apiKey factories for ephemeral client secrets', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: async () => 'ek_ephemeral_123' }, logger);
      await provider.initialize();
      await provider.connect();

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.protocols).toEqual(['realtime', 'openai-insecure-api-key.ek_ephemeral_123']);
    });

    it('should append organization and project subprotocols when configured', async () => {
      const provider = new OpenAIRealtimeSTT(
        { apiKey: 'test-key', organizationId: 'org-abc', projectId: 'proj-xyz' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.protocols).toEqual([
        'realtime',
        'openai-insecure-api-key.test-key',
        'openai-organization.org-abc',
        'openai-project.proj-xyz',
      ]);
    });

    it('should use the proxy URL without subprotocols in proxy mode', async () => {
      const provider = new OpenAIRealtimeSTT(
        { proxyUrl: 'http://localhost:3001/api/proxy/openai-realtime' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const wsOptions = MockWebSocketManager.mock.calls[0]![0];
      expect(wsOptions.url).toBe(
        'ws://localhost:3001/api/proxy/openai-realtime/v1/realtime?intent=transcription'
      );
      expect(wsOptions.protocols).toBeUndefined();
    });

    it('should include language, prompt, and delay in the transcription config', async () => {
      const provider = new OpenAIRealtimeSTT(
        {
          apiKey: 'test-key',
          model: 'gpt-realtime-whisper',
          language: 'en',
          prompt: 'Keywords: CompositeVoice',
          transcriptionDelay: 'low',
          turnDetection: null,
        },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const input = getSessionUpdate().session.audio.input;
      expect(input.transcription).toEqual({
        model: 'gpt-realtime-whisper',
        language: 'en',
        prompt: 'Keywords: CompositeVoice',
        delay: 'low',
      });
      expect(input.turn_detection).toBeNull();
    });

    it('should omit the PCM sample rate for G.711 formats', async () => {
      const provider = new OpenAIRealtimeSTT(
        { apiKey: 'test-key', inputAudioFormat: 'audio/pcmu' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const input = getSessionUpdate().session.audio.input;
      expect(input.format).toEqual({ type: 'audio/pcmu' });
    });

    it('should map server VAD tuning options to the wire format', async () => {
      const provider = new OpenAIRealtimeSTT(
        {
          apiKey: 'test-key',
          turnDetection: {
            type: 'server_vad',
            threshold: 0.6,
            prefixPaddingMs: 200,
            silenceDurationMs: 700,
          },
        },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const input = getSessionUpdate().session.audio.input;
      expect(input.turn_detection).toEqual({
        type: 'server_vad',
        threshold: 0.6,
        prefix_padding_ms: 200,
        silence_duration_ms: 700,
      });
    });

    it('should map semantic VAD eagerness to the wire format', async () => {
      const provider = new OpenAIRealtimeSTT(
        { apiKey: 'test-key', turnDetection: { type: 'semantic_vad', eagerness: 'low' } },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const input = getSessionUpdate().session.audio.input;
      expect(input.turn_detection).toEqual({ type: 'semantic_vad', eagerness: 'low' });
    });

    it('should include noise reduction when configured', async () => {
      const provider = new OpenAIRealtimeSTT(
        { apiKey: 'test-key', noiseReduction: 'far_field' },
        logger
      );
      await provider.initialize();
      await provider.connect();

      const input = getSessionUpdate().session.audio.input;
      expect(input.noise_reduction).toEqual({ type: 'far_field' });
    });

    it('should re-send the session configuration after a reconnection', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      // WebSocketManager fires onOpen again after an automatic reconnect
      getHandlers().onOpen();

      expect(mockWsManager.send).toHaveBeenCalledTimes(1);
      const resent = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(resent.type).toBe('session.update');
      expect(resent.session.type).toBe('transcription');
    });

    it('should throw ProviderConnectionError when the connection fails', async () => {
      mockWsManager.connect.mockRejectedValueOnce(new Error('boom'));

      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should close the socket when sending session.update fails', async () => {
      mockWsManager.send.mockImplementationOnce(() => {
        throw new Error('send failed');
      });

      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should throw when connecting before initialization', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);

      await expect(provider.connect()).rejects.toThrow();
    });
  });

  describe('Message handling', () => {
    let provider: OpenAIRealtimeSTT;
    let results: TranscriptionResult[];

    beforeEach(async () => {
      provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      results = [];
      provider.onTranscription((result) => results.push(result));
      await provider.connect();
    });

    it('should accumulate deltas into interim results', () => {
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_1',
        delta: 'Hello',
      });
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_1',
        delta: ' world',
      });

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ text: 'Hello', isFinal: false });
      expect(results[1]).toMatchObject({
        text: 'Hello world',
        isFinal: false,
        metadata: { itemId: 'item_1' },
      });
    });

    it('should accumulate deltas per item independently', () => {
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_1',
        delta: 'First',
      });
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_2',
        delta: 'Second',
      });

      expect(results.map((r) => r.text)).toEqual(['First', 'Second']);
    });

    it('should emit a final utterance when the completed event arrives', () => {
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_1',
        delta: 'Hello wor',
      });
      receive({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'item_1',
        transcript: 'Hello world',
        usage: { input_tokens: 10 },
      });

      const final = results[results.length - 1];
      expect(final).toMatchObject({
        text: 'Hello world',
        isFinal: true,
        speechFinal: true,
        utteranceComplete: true,
        metadata: {
          itemId: 'item_1',
          usage: { input_tokens: 10 },
        },
      });
    });

    it('should fall back to accumulated deltas when the completed transcript is missing', () => {
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_1',
        delta: 'Partial text',
      });
      receive({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'item_1',
      });

      const final = results[results.length - 1];
      expect(final).toMatchObject({
        text: 'Partial text',
        isFinal: true,
        utteranceComplete: true,
      });
    });

    it('should reset accumulation after a completed turn', () => {
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_1',
        delta: 'First',
      });
      receive({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'item_1',
        transcript: 'First',
      });
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_2',
        delta: 'Second',
      });

      const interim = results[results.length - 1];
      expect(interim).toMatchObject({ text: 'Second', isFinal: false });
    });

    it('should not emit a final result for an empty completed transcript', () => {
      receive({
        type: 'conversation.item.input_audio_transcription.completed',
        item_id: 'item_1',
        transcript: '  ',
      });

      expect(results).toHaveLength(0);
    });

    it('should not emit interim results when interimResults is false', () => {
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_1',
        delta: 'quiet',
      });
      expect(results).toHaveLength(1); // interimResults defaults to true

      results.length = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (provider.config as any).interimResults = false;
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_1',
        delta: ' still quiet',
      });
      expect(results).toHaveLength(0);
    });

    it('should emit an error result on error events', () => {
      receive({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          code: 'invalid_api_key',
          message: 'Invalid API key',
        },
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: 'Invalid API key',
          errorCode: 'invalid_api_key',
          errorType: 'invalid_request_error',
        },
      });
    });

    it('should emit an error result on transcription failed events', () => {
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_1',
        delta: 'doomed',
      });
      receive({
        type: 'conversation.item.input_audio_transcription.failed',
        item_id: 'item_1',
        error: { type: 'server_error', message: 'Transcription failed' },
      });

      const errorResult = results[results.length - 1];
      expect(errorResult).toMatchObject({
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: 'Transcription failed',
          errorType: 'server_error',
        },
      });

      // The failed item's accumulated text must not leak into later turns
      receive({
        type: 'conversation.item.input_audio_transcription.delta',
        item_id: 'item_1',
        delta: 'Fresh',
      });
      expect(results[results.length - 1]).toMatchObject({ text: 'Fresh', isFinal: false });
    });

    it('should not emit results for VAD lifecycle events', () => {
      receive({ type: 'input_audio_buffer.speech_started', audio_start_ms: 100 });
      receive({ type: 'input_audio_buffer.speech_stopped', audio_end_ms: 900 });
      receive({ type: 'input_audio_buffer.committed', item_id: 'item_1' });

      expect(results).toHaveLength(0);
    });

    it('should ignore non-string messages', () => {
      getHandlers().onMessage({ data: new ArrayBuffer(4) } as MessageEvent);
      expect(results).toHaveLength(0);
    });
  });

  describe('Audio streaming', () => {
    it('should forward audio chunks as base64 input_audio_buffer.append events', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      const chunk = new Uint8Array([72, 105, 33]).buffer; // "Hi!"
      provider.sendAudio(chunk);

      expect(mockWsManager.send).toHaveBeenCalledTimes(1);
      const message = JSON.parse(mockWsManager.send.mock.calls[0][0]);
      expect(message).toEqual({
        type: 'input_audio_buffer.append',
        audio: 'SGkh', // base64 of "Hi!"
      });
    });

    it('should drop audio when not connected', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      provider.sendAudio(new ArrayBuffer(8));

      expect(mockWsManager.send).not.toHaveBeenCalled();
    });
  });

  describe('Finalize and disconnect', () => {
    it('should send an input_audio_buffer.commit event on finalize', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();
      mockWsManager.send.mockClear();

      provider.finalize();

      expect(mockWsManager.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'input_audio_buffer.commit' })
      );
    });

    it('should not send commit when not connected', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      provider.finalize();

      expect(mockWsManager.send).not.toHaveBeenCalled();
    });

    it('should disconnect cleanly', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();

      await provider.disconnect();

      expect(mockWsManager.disconnect).toHaveBeenCalled();
      expect(provider.isWebSocketConnected()).toBe(false);
    });

    it('should warn and return when disconnecting while not connected', async () => {
      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();

      await expect(provider.disconnect()).resolves.toBeUndefined();
      expect(mockWsManager.disconnect).not.toHaveBeenCalled();
    });

    it('should dispose cleanly even when disconnect fails', async () => {
      mockWsManager.disconnect.mockRejectedValueOnce(new Error('close failed'));

      const provider = new OpenAIRealtimeSTT({ apiKey: 'test-key' }, logger);
      await provider.initialize();
      await provider.connect();

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(provider.isReady()).toBe(false);
    });
  });
});
