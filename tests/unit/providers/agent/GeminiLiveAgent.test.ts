/**
 * Tests for GeminiLiveAgent (Gemini Live speech-to-speech agent).
 */

import { GeminiLiveAgent } from '../../../../src/providers/agent/gemini/GeminiLiveAgent';
import type { GeminiLiveAgentEvent } from '../../../../src/providers/agent/gemini/types';
import type { TranscriptionResult } from '../../../../src/core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../../../src/core/types/audio';
import { arrayBufferToBase64 } from '../../../../src/utils/base64';
import {
  installMockWebSocket,
  waitForSocket,
  resetMockWebSocket,
  MockAgentWebSocket,
} from './mockWebSocket';

installMockWebSocket();

// jsdom does not provide TextDecoder — install Node's implementation for the
// provider's binary-frame parsing path.
import { TextDecoder } from 'util';
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;

/**
 * Encode a JSON value as a realm-local ArrayBuffer (ASCII).
 *
 * @remarks
 * Node's util.TextEncoder allocates buffers in the Node realm, which fail
 * `instanceof ArrayBuffer` checks inside jsdom — so encode manually.
 */
function jsonToArrayBuffer(value: unknown): ArrayBuffer {
  const json = JSON.stringify(value);
  const bytes = new Uint8Array(json.length);
  for (let i = 0; i < json.length; i++) {
    bytes[i] = json.charCodeAt(i);
  }
  return bytes.buffer;
}

/** Drive the setup handshake to completion and return the socket. */
async function connectAgent(agent: GeminiLiveAgent): Promise<MockAgentWebSocket> {
  const connecting = agent.connect();
  const sock = await waitForSocket();
  sock._open();
  sock._message({ setupComplete: {} });
  await connecting;
  return sock;
}

/** Let queued microtasks/macrotasks run (async message handling). */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('GeminiLiveAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockWebSocket();
  });

  describe('roles and lifecycle', () => {
    it('covers stt + llm + tts and defaults the model', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();

      expect(agent.roles).toEqual(['stt', 'llm', 'tts']);
      expect(agent.config.model).toBe('gemini-2.0-flash-live-001');
    });

    it('requires apiKey or proxyUrl', async () => {
      const agent = new GeminiLiveAgent({});
      await expect(agent.initialize()).rejects.toThrow();
    });

    it('closes the socket on dispose', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      await agent.dispose();

      expect(sock.close).toHaveBeenCalled();
    });
  });

  describe('connection handshake', () => {
    it('appends the API key as a query parameter in direct mode', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      expect(sock.url).toBe(
        'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=test-key'
      );
    });

    it('omits the key in proxy mode', async () => {
      const agent = new GeminiLiveAgent({ proxyUrl: 'http://localhost:3000/api/proxy/gemini-live' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      expect(sock.url).toBe(
        'ws://localhost:3000/api/proxy/gemini-live/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent'
      );
    });

    it('sends the setup message on open', async () => {
      const agent = new GeminiLiveAgent({
        apiKey: 'test-key',
        voice: 'Puck',
        systemInstruction: 'Be brief.',
        functionDeclarations: [{ name: 'get_weather', description: 'Weather lookup' }],
      });
      await agent.initialize();
      const sock = await connectAgent(agent);

      const setup = sock.sentJson().find((m) => m.setup)?.setup as Record<string, any>;
      expect(setup.model).toBe('models/gemini-2.0-flash-live-001');
      expect(setup.generationConfig.responseModalities).toEqual(['AUDIO']);
      expect(setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe(
        'Puck'
      );
      expect(setup.systemInstruction).toEqual({ parts: [{ text: 'Be brief.' }] });
      expect(setup.inputAudioTranscription).toEqual({});
      expect(setup.outputAudioTranscription).toEqual({});
      expect(setup.tools[0].functionDeclarations[0].name).toBe('get_weather');
    });

    it('emits output metadata (24 kHz PCM) after setupComplete', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const metadata: AudioMetadata[] = [];
      agent.onMetadata((m) => metadata.push(m));

      await connectAgent(agent);

      expect(metadata).toEqual([
        { sampleRate: 24000, encoding: 'linear16', channels: 1, bitDepth: 16 },
      ]);
    });

    it('rejects when the handshake times out', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key', timeout: 30 });
      await agent.initialize();

      const connecting = agent.connect();
      (await waitForSocket())._open();

      await expect(connecting).rejects.toThrow(/timed out/);
    });

    it('does not treat a non-setup frame as handshake completion', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key', timeout: 30 });
      await agent.initialize();

      const connecting = agent.connect();
      const sock = await waitForSocket();
      sock._open();
      sock._message({ goAway: { timeLeft: '10s' } });
      await flush();

      await expect(connecting).rejects.toThrow(/timed out/);
    });

    it('rejects connect when the server errors before setupComplete', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();

      const connecting = agent.connect();
      const sock = await waitForSocket();
      sock._open();
      const rejected = expect(connecting).rejects.toThrow('model not found');
      sock._message({ error: { code: 404, message: 'model not found', status: 'NOT_FOUND' } });
      await rejected;
    });

    it('resolves both callers when a second connect() piggybacks', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();

      const first = agent.connect();
      const sock = await waitForSocket();
      sock._open();
      const second = agent.connect();
      sock._message({ setupComplete: {} });
      await flush();

      await expect(first).resolves.toBeUndefined();
      await expect(second).resolves.toBeUndefined();
    });

    it('rejects both callers when a piggybacked handshake fails', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();

      const first = agent.connect();
      const sock = await waitForSocket();
      sock._open();
      const second = agent.connect();
      sock._error();

      await expect(first).rejects.toThrow(/WebSocket error/);
      await expect(second).rejects.toThrow(/WebSocket error/);
    });
  });

  describe('audio transport', () => {
    it('base64-encodes microphone audio into realtimeInput at 16 kHz', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      const chunk = new Uint8Array([1, 2, 3]).buffer;
      agent.sendAudio(chunk);

      const frame = sock.sentJson().find((m) => m.realtimeInput) as Record<string, any>;
      expect(frame.realtimeInput.audio).toEqual({
        data: arrayBufferToBase64(chunk),
        mimeType: 'audio/pcm;rate=16000',
      });
    });

    it('labels frames with the input provider\'s actual rate', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      expect(agent.preferredInputSampleRate).toBe(16000);
      agent.configureInputFormat({
        sampleRate: 48000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });
      agent.sendAudio(new Uint8Array([1, 2, 3]).buffer);

      const frame = sock.sentJson().find((m) => m.realtimeInput) as Record<string, any>;
      expect(frame.realtimeInput.audio.mimeType).toBe('audio/pcm;rate=48000');
    });

    it('re-emits output metadata with every audio chunk', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const metadata: AudioMetadata[] = [];
      agent.onMetadata((m) => metadata.push(m));
      const sock = await connectAgent(agent);

      expect(metadata).toHaveLength(1);

      const audio = arrayBufferToBase64(new Uint8Array([5, 6]).buffer);
      sock._message({
        serverContent: {
          modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm', data: audio } }] },
        },
      });
      await flush();

      expect(metadata).toHaveLength(2);
    });

    it('decodes modelTurn inline audio into audio chunks', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const chunks: AudioChunk[] = [];
      agent.onAudio((c) => chunks.push(c));
      const sock = await connectAgent(agent);

      const audio = new Uint8Array([5, 6, 7]).buffer;
      sock._message({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: arrayBufferToBase64(audio) } }],
          },
        },
      });
      await flush();

      expect(chunks).toHaveLength(1);
      expect(new Uint8Array(chunks[0]!.data)).toEqual(new Uint8Array([5, 6, 7]));
    });

    it('skips malformed base64 audio without throwing', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const chunks: AudioChunk[] = [];
      agent.onAudio((c) => chunks.push(c));
      const sock = await connectAgent(agent);

      sock._message({
        serverContent: {
          modelTurn: {
            parts: [{ inlineData: { mimeType: 'audio/pcm', data: '%%%not-base64%%%' } }],
          },
        },
      });
      await flush();

      expect(chunks).toHaveLength(0);
    });

    it('parses JSON delivered as binary frames', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const results: TranscriptionResult[] = [];
      agent.onTranscription((r) => results.push(r));
      const sock = await connectAgent(agent);

      const frame = jsonToArrayBuffer({
        serverContent: {
          inputTranscription: { text: 'binary hello' },
          outputTranscription: { text: 'reply' },
        },
      });
      sock._message(frame);
      await flush();

      expect(results[0]?.text).toBe('binary hello');
    });
  });

  describe('conversation flow', () => {
    it('accumulates input transcription fragments and emits once the model responds', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const results: TranscriptionResult[] = [];
      agent.onTranscription((r) => results.push(r));
      const sock = await connectAgent(agent);

      sock._message({ serverContent: { inputTranscription: { text: 'hello ' } } });
      sock._message({ serverContent: { inputTranscription: { text: 'world' } } });
      await flush();
      expect(results).toHaveLength(0);

      sock._message({ serverContent: { outputTranscription: { text: 'Hi!' } } });
      await flush();

      expect(results).toEqual([
        { text: 'hello world', isFinal: true, utteranceComplete: true, confidence: 1 },
      ]);
    });

    it('resolves the LLM iterator with the output transcription on turnComplete', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({ serverContent: { inputTranscription: { text: 'hi' } } });
      sock._message({ serverContent: { outputTranscription: { text: 'Hello ' } } });
      await flush();

      const iterable = await agent.generateFromMessages([{ role: 'user', content: 'hi' }]);
      const iterator = iterable[Symbol.asyncIterator]();
      const pending = iterator.next();

      sock._message({ serverContent: { outputTranscription: { text: 'there' } } });
      sock._message({ serverContent: { turnComplete: true } });
      await flush();

      const { value } = await pending;
      expect(value).toBe('Hello there');
    });

    it('resolves finalize() on turnComplete', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({ serverContent: { inputTranscription: { text: 'hi' } } });
      sock._message({ serverContent: { outputTranscription: { text: 'Hello' } } });
      sock._message({ serverContent: { turnComplete: true } });
      await flush();

      await expect(agent.finalize()).resolves.toBeUndefined();
    });

    it('discards the partial response and unblocks on interruption', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const events: GeminiLiveAgentEvent[] = [];
      agent.onAgentEvent((e) => events.push(e));
      const sock = await connectAgent(agent);

      sock._message({ serverContent: { inputTranscription: { text: 'hi' } } });
      sock._message({ serverContent: { outputTranscription: { text: 'partial answer' } } });
      sock._message({ serverContent: { interrupted: true } });
      await flush();

      expect(events.some((e) => e.type === 'interrupted')).toBe(true);
      await expect(agent.finalize()).resolves.toBeUndefined();

      // A later turnComplete must not emit the discarded text
      sock._message({ serverContent: { turnComplete: true } });
      await flush();
      expect(
        events.filter((e) => e.type === 'conversation_text' && e.role === 'assistant')
      ).toHaveLength(0);
    });

    it('still emits the next user turn after an interruption', async () => {
      // The Live API sends no turnComplete for a generation it aborted, so
      // the interruption itself has to reset the turn state.
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const results: TranscriptionResult[] = [];
      agent.onTranscription((r) => results.push(r));
      const sock = await connectAgent(agent);

      sock._message({ serverContent: { inputTranscription: { text: 'first question' } } });
      sock._message({ serverContent: { outputTranscription: { text: 'partial' } } });
      sock._message({ serverContent: { interrupted: true } });
      await flush();

      expect(results.map((r) => r.text)).toEqual(['first question']);

      // Next utterance — no turnComplete ever arrived for the aborted turn
      sock._message({ serverContent: { inputTranscription: { text: 'second question' } } });
      sock._message({ serverContent: { outputTranscription: { text: 'Answer' } } });
      await flush();

      expect(results.map((r) => r.text)).toEqual(['first question', 'second question']);
    });

    it('sendUserMessage sends a completed clientContent turn', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      agent.sendUserMessage('What time is it?');

      const frame = sock.sentJson().find((m) => m.clientContent) as Record<string, any>;
      expect(frame.clientContent.turnComplete).toBe(true);
      expect(frame.clientContent.turns[0].parts[0].text).toBe('What time is it?');
    });

    it('warns via go_away when the server announces shutdown', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const events: GeminiLiveAgentEvent[] = [];
      agent.onAgentEvent((e) => events.push(e));
      const sock = await connectAgent(agent);

      sock._message({ goAway: { timeLeft: '10s' } });
      await flush();

      expect(events).toEqual([{ type: 'go_away', timeLeft: '10s' }]);
    });

    it('emits error and rejects the pending LLM iterator on a server error', async () => {
      const agent = new GeminiLiveAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const events: GeminiLiveAgentEvent[] = [];
      agent.onAgentEvent((e) => events.push(e));
      const sock = await connectAgent(agent);

      const iterable = await agent.generateFromMessages([{ role: 'user', content: 'hi' }]);
      const pending = iterable[Symbol.asyncIterator]().next();

      const rejected = expect(pending).rejects.toThrow('invalid argument');
      sock._message({ error: { code: 400, message: 'invalid argument', status: 'INVALID_ARGUMENT' } });
      await rejected;

      expect(events).toEqual([{ type: 'error', message: 'invalid argument' }]);
    });
  });

  describe('tool calling', () => {
    it('executes the handler and sends the toolResponse', async () => {
      const handler = jest.fn().mockResolvedValue({ response: { temp: 21 } });
      const agent = new GeminiLiveAgent({
        apiKey: 'test-key',
        functionDeclarations: [{ name: 'get_weather' }],
        onFunctionCall: handler,
      });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({
        toolCall: { functionCalls: [{ id: 'fc_1', name: 'get_weather', args: { city: 'SF' } }] },
      });
      await flush();

      expect(handler).toHaveBeenCalledWith({ id: 'fc_1', name: 'get_weather', args: { city: 'SF' } });
      const frame = sock.sentJson().find((m) => m.toolResponse) as Record<string, any>;
      expect(frame.toolResponse.functionResponses).toEqual([
        { id: 'fc_1', name: 'get_weather', response: { temp: 21 } },
      ]);
    });
  });
});
