/**
 * Tests for OpenAIRealtimeAgent (OpenAI Realtime speech-to-speech agent).
 */

import { OpenAIRealtimeAgent } from '../../../../src/providers/agent/openai/OpenAIRealtimeAgent';
import type { OpenAIRealtimeAgentEvent } from '../../../../src/providers/agent/openai/types';
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

/** Drive the standard handshake to completion and return the socket. */
async function connectAgent(agent: OpenAIRealtimeAgent): Promise<MockAgentWebSocket> {
  const connecting = agent.connect();
  const sock = await waitForSocket();
  sock._open();
  sock._message({ type: 'session.created' });
  sock._message({ type: 'session.updated' });
  await connecting;
  return sock;
}

describe('OpenAIRealtimeAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockWebSocket();
  });

  describe('roles and lifecycle', () => {
    it('covers stt + llm + tts and defaults the model', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();

      expect(agent.roles).toEqual(['stt', 'llm', 'tts']);
      expect(agent.type).toBe('websocket');
      expect(agent.config.model).toBe('gpt-realtime');
    });

    it('requires apiKey or proxyUrl', async () => {
      const agent = new OpenAIRealtimeAgent({});
      await expect(agent.initialize()).rejects.toThrow();
    });

    it('closes the socket on dispose', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      await agent.dispose();

      expect(sock.close).toHaveBeenCalled();
    });
  });

  describe('connection handshake', () => {
    it('connects with the model URL and auth subprotocols in direct mode', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key', model: 'gpt-realtime' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      expect(sock.url).toBe('wss://api.openai.com/v1/realtime?model=gpt-realtime');
      expect(sock.protocols).toEqual(['realtime', 'openai-insecure-api-key.test-key']);
    });

    it('uses the proxy URL without subprotocols in proxy mode', async () => {
      const agent = new OpenAIRealtimeAgent({
        proxyUrl: 'http://localhost:3000/api/proxy/openai-realtime',
      });
      await agent.initialize();
      const sock = await connectAgent(agent);

      expect(sock.url).toBe(
        'ws://localhost:3000/api/proxy/openai-realtime/v1/realtime?model=gpt-realtime'
      );
      expect(sock.protocols).toBeUndefined();
    });

    it('sends session.update after session.created', async () => {
      const agent = new OpenAIRealtimeAgent({
        apiKey: 'test-key',
        voice: 'marin',
        instructions: 'Be brief.',
        tools: [{ name: 'get_weather', description: 'Weather lookup' }],
      });
      await agent.initialize();
      const sock = await connectAgent(agent);

      const update = sock.sentJson().find((m) => m.type === 'session.update');
      expect(update).toBeDefined();
      const session = update?.session as Record<string, any>;
      expect(session.type).toBe('realtime');
      expect(session.output_modalities).toEqual(['audio']);
      expect(session.audio.input.format).toEqual({ type: 'audio/pcm', rate: 24000 });
      expect(session.audio.input.turn_detection).toEqual({ type: 'server_vad' });
      expect(session.audio.output.voice).toBe('marin');
      expect(session.instructions).toBe('Be brief.');
      expect(session.tools).toEqual([
        { type: 'function', name: 'get_weather', description: 'Weather lookup' },
      ]);
    });

    it('emits output metadata (24 kHz PCM) once the session is ready', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const metadata: AudioMetadata[] = [];
      agent.onMetadata((m) => metadata.push(m));

      await connectAgent(agent);

      expect(metadata).toEqual([
        { sampleRate: 24000, encoding: 'linear16', channels: 1, bitDepth: 16 },
      ]);
    });

    it('rejects when the handshake times out', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key', timeout: 30 });
      await agent.initialize();

      const connecting = agent.connect();
      (await waitForSocket())._open();
      // No session events arrive

      await expect(connecting).rejects.toThrow(/timed out/);
    });

    it('resolves both callers when a second connect() piggybacks', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();

      const first = agent.connect();
      const sock = await waitForSocket();
      sock._open();
      const second = agent.connect();
      sock._message({ type: 'session.created' });
      sock._message({ type: 'session.updated' });

      await expect(first).resolves.toBeUndefined();
      await expect(second).resolves.toBeUndefined();
      expect(agent.isWebSocketConnected()).toBe(true);
    });

    it('rejects both callers when a piggybacked handshake fails', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
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
    it('base64-encodes microphone audio into input_audio_buffer.append', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      const chunk = new Uint8Array([1, 2, 3, 4]).buffer;
      agent.sendAudio(chunk);

      const append = sock.sentJson().find((m) => m.type === 'input_audio_buffer.append');
      expect(append?.audio).toBe(arrayBufferToBase64(chunk));
    });

    it('decodes response audio deltas into audio chunks', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const chunks: AudioChunk[] = [];
      agent.onAudio((c) => chunks.push(c));
      const sock = await connectAgent(agent);

      const audio = new Uint8Array([9, 8, 7]).buffer;
      sock._message({ type: 'response.output_audio.delta', delta: arrayBufferToBase64(audio) });

      expect(chunks).toHaveLength(1);
      expect(new Uint8Array(chunks[0]!.data)).toEqual(new Uint8Array([9, 8, 7]));
    });

    it('re-emits output metadata with every audio chunk so barge-in cannot mute the session', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const metadata: AudioMetadata[] = [];
      agent.onMetadata((m) => metadata.push(m));
      const sock = await connectAgent(agent);

      // One from the handshake
      expect(metadata).toHaveLength(1);

      const audio = arrayBufferToBase64(new Uint8Array([1, 2]).buffer);
      sock._message({ type: 'response.output_audio.delta', delta: audio });
      sock._message({ type: 'response.output_audio.delta', delta: audio });

      expect(metadata).toHaveLength(3);
      expect(metadata.every((m) => m.sampleRate === 24000)).toBe(true);
    });

    it('asks an auto-created microphone for 24 kHz', () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      expect(agent.preferredInputSampleRate).toBe(24000);
    });

    it('resamples a 16 kHz input up to the 24 kHz the Realtime API requires', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      agent.configureInputFormat({
        sampleRate: 16000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });

      // 160 samples @ 16 kHz (10 ms) → 240 samples @ 24 kHz
      agent.sendAudio(new Int16Array(160).buffer);

      const append = sock.sentJson().find((m) => m.type === 'input_audio_buffer.append');
      const bytes = Buffer.from(append?.audio as string, 'base64');
      expect(bytes.byteLength).toBe(240 * 2);
    });

    it('sends 24 kHz input through untouched', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      agent.configureInputFormat({
        sampleRate: 24000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });

      const chunk = new Uint8Array([1, 2, 3, 4]).buffer;
      agent.sendAudio(chunk);

      const append = sock.sentJson().find((m) => m.type === 'input_audio_buffer.append');
      expect(append?.audio).toBe(arrayBufferToBase64(chunk));
    });
  });

  describe('conversation flow', () => {
    it('emits user transcriptions as utterance-complete results', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const results: TranscriptionResult[] = [];
      agent.onTranscription((r) => results.push(r));
      const sock = await connectAgent(agent);

      sock._message({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hello there',
      });

      expect(results).toEqual([
        { text: 'hello there', isFinal: true, utteranceComplete: true, confidence: 1 },
      ]);
    });

    it('resolves the LLM iterator with the response transcript on response.done', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hi',
      });

      const iterable = await agent.generateFromMessages([{ role: 'user', content: 'hi' }]);
      const iterator = iterable[Symbol.asyncIterator]();
      const pending = iterator.next();

      sock._message({ type: 'response.output_audio_transcript.delta', delta: 'Hello ' });
      sock._message({ type: 'response.output_audio_transcript.delta', delta: 'world' });
      sock._message({ type: 'response.done' });

      const { value } = await pending;
      expect(value).toBe('Hello world');
    });

    it('buffers assistant text that arrives before the LLM iterator starts', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hi',
      });
      // The server answers before the orchestrator's LLM flow runs
      sock._message({ type: 'response.output_audio_transcript.delta', delta: 'Early reply' });
      sock._message({ type: 'response.done' });

      const iterable = await agent.generateFromMessages([{ role: 'user', content: 'hi' }]);
      const iterator = iterable[Symbol.asyncIterator]();
      const { value } = await iterator.next();

      expect(value).toBe('Early reply');
    });

    it('keeps buffered text when the user transcription arrives after response.done', async () => {
      // OpenAI's input transcription is asynchronous and unordered against
      // the response events, so it can land after the answer it belongs to.
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({ type: 'input_audio_buffer.speech_started' });
      sock._message({ type: 'input_audio_buffer.speech_stopped' });
      sock._message({ type: 'response.output_audio_transcript.delta', delta: 'Late reply' });
      sock._message({ type: 'response.done' });
      sock._message({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hi',
      });

      const iterable = await agent.generateFromMessages([{ role: 'user', content: 'hi' }]);
      const { value } = await iterable[Symbol.asyncIterator]().next();

      expect(value).toBe('Late reply');
    });

    it('drops text from an abandoned response when the user speaks again', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      // A response nobody consumed
      sock._message({ type: 'response.output_audio_transcript.delta', delta: 'Stale reply' });
      sock._message({ type: 'response.done' });

      // The user barges in and asks something new
      sock._message({ type: 'input_audio_buffer.speech_started' });
      sock._message({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'actually, something else',
      });

      const iterable = await agent.generateFromMessages([{ role: 'user', content: 'x' }]);
      const pending = iterable[Symbol.asyncIterator]().next();

      sock._message({ type: 'response.output_audio_transcript.delta', delta: 'Fresh reply' });
      sock._message({ type: 'response.done' });

      await expect(pending).resolves.toEqual({ done: false, value: 'Fresh reply' });
    });

    it('resolves finalize() when the response completes', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hi',
      });
      sock._message({ type: 'response.done' });

      await expect(agent.finalize()).resolves.toBeUndefined();
    });

    it('surfaces speaking state and transcript deltas via onAgentEvent', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const events: OpenAIRealtimeAgentEvent[] = [];
      agent.onAgentEvent((e) => events.push(e));
      const sock = await connectAgent(agent);

      sock._message({ type: 'input_audio_buffer.speech_started' });
      sock._message({ type: 'input_audio_buffer.speech_stopped' });
      sock._message({ type: 'response.output_audio_transcript.delta', delta: 'Hi' });

      expect(events).toEqual([
        { type: 'user_started_speaking' },
        { type: 'user_stopped_speaking' },
        { type: 'agent_transcript_delta', delta: 'Hi' },
      ]);
    });
  });

  describe('function calling', () => {
    it('executes the handler and returns the output to the server', async () => {
      const handler = jest.fn().mockResolvedValue({ content: '{"temp": 21}' });
      const agent = new OpenAIRealtimeAgent({
        apiKey: 'test-key',
        tools: [{ name: 'get_weather' }],
        onFunctionCall: handler,
      });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({
        type: 'response.output_item.done',
        item: { type: 'function_call', call_id: 'call_1', name: 'get_weather', arguments: '{}' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(handler).toHaveBeenCalledWith({ callId: 'call_1', name: 'get_weather', arguments: '{}' });
      const sent = sock.sentJson();
      const output = sent.find((m) => m.type === 'conversation.item.create');
      expect(output?.item).toEqual({
        type: 'function_call_output',
        call_id: 'call_1',
        output: '{"temp": 21}',
      });
      expect(sent.some((m) => m.type === 'response.create')).toBe(true);
    });

    it('does not end the turn on the silent tool-call response', async () => {
      const agent = new OpenAIRealtimeAgent({
        apiKey: 'test-key',
        tools: [{ name: 'get_weather' }],
        onFunctionCall: jest.fn().mockResolvedValue({ content: '{"temp": 21}' }),
      });
      await agent.initialize();
      const events: OpenAIRealtimeAgentEvent[] = [];
      agent.onAgentEvent((e) => events.push(e));
      const sock = await connectAgent(agent);

      sock._message({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'weather?',
      });
      sock._message({
        type: 'response.output_item.done',
        item: { type: 'function_call', call_id: 'call_1', name: 'get_weather', arguments: '{}' },
      });
      // The tool-call response completes without producing any audio
      sock._message({ type: 'response.done' });

      expect(events.some((e) => e.type === 'agent_audio_done')).toBe(false);

      // The spoken answer arrives in the follow-up response
      const audio = arrayBufferToBase64(new Uint8Array([1, 2]).buffer);
      sock._message({ type: 'response.output_audio.delta', delta: audio });
      sock._message({ type: 'response.done' });

      expect(events.some((e) => e.type === 'agent_audio_done')).toBe(true);
      await expect(agent.finalize()).resolves.toBeUndefined();
    });

    it('still ends the turn on a tool call with no handler configured', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key', tools: [{ name: 'noop' }] });
      await agent.initialize();
      const events: OpenAIRealtimeAgentEvent[] = [];
      agent.onAgentEvent((e) => events.push(e));
      const sock = await connectAgent(agent);

      sock._message({
        type: 'response.output_item.done',
        item: { type: 'function_call', call_id: 'call_1', name: 'noop', arguments: '{}' },
      });
      sock._message({ type: 'response.done' });

      // Without a handler nothing follows up, so the turn must not stall
      expect(events.some((e) => e.type === 'agent_audio_done')).toBe(true);
    });
  });

  describe('errors', () => {
    it('rejects the pending LLM iterator on a server error', async () => {
      const agent = new OpenAIRealtimeAgent({ apiKey: 'test-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'hi',
      });
      const iterable = await agent.generateFromMessages([{ role: 'user', content: 'hi' }]);
      const iterator = iterable[Symbol.asyncIterator]();
      const pending = iterator.next();

      sock._message({ type: 'error', error: { code: 'rate_limit', message: 'slow down' } });

      await expect(pending).rejects.toThrow('slow down');
    });
  });
});
