/**
 * Tests for ElevenLabsAgent (ElevenLabs Conversational AI agent).
 */

import { ElevenLabsAgent } from '../../../../src/providers/agent/elevenlabs/ElevenLabsAgent';
import type { ElevenLabsAgentEvent } from '../../../../src/providers/agent/elevenlabs/types';
import type { TranscriptionResult } from '../../../../src/core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../../../src/core/types/audio';
import { ProviderInitializationError } from '../../../../src/utils/errors';
import { arrayBufferToBase64 } from '../../../../src/utils/base64';
import {
  installMockWebSocket,
  waitForSocket,
  resetMockWebSocket,
  MockAgentWebSocket,
} from './mockWebSocket';

installMockWebSocket();

/** Drive the initiation handshake to completion and return the socket. */
async function connectAgent(
  agent: ElevenLabsAgent,
  outputFormat = 'pcm_16000'
): Promise<MockAgentWebSocket> {
  const connecting = agent.connect();
  const sock = await waitForSocket();
  sock._open();
  sock._message({
    type: 'conversation_initiation_metadata',
    conversation_initiation_metadata_event: {
      conversation_id: 'conv_1',
      agent_output_audio_format: outputFormat,
      user_input_audio_format: 'pcm_16000',
    },
  });
  await connecting;
  return sock;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ElevenLabsAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockWebSocket();
  });

  describe('roles and lifecycle', () => {
    it('covers stt + llm + tts', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();

      expect(agent.roles).toEqual(['stt', 'llm', 'tts']);
      expect(agent.type).toBe('websocket');
    });

    it('requires agentId or signedUrl', async () => {
      const agent = new ElevenLabsAgent({ apiKey: 'xi-key' });
      await expect(agent.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('accepts a signedUrl without agentId', async () => {
      const agent = new ElevenLabsAgent({ signedUrl: 'wss://api.elevenlabs.io/signed?token=abc' });
      await expect(agent.initialize()).resolves.toBeUndefined();
    });

    it('closes the socket on dispose', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      await agent.dispose();

      expect(sock.close).toHaveBeenCalled();
    });
  });

  describe('connection handshake', () => {
    it('connects with agent_id (public agent, no key)', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      expect(sock.url).toBe('wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_1');
    });

    it('adds xi-api-key as a query parameter in direct mode with a key', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1', apiKey: 'xi-key' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      expect(sock.url).toBe(
        'wss://api.elevenlabs.io/v1/convai/conversation?agent_id=agent_1&xi-api-key=xi-key'
      );
    });

    it('prefers a signed URL over everything else', async () => {
      const signedUrl = jest.fn().mockResolvedValue('wss://api.elevenlabs.io/signed?token=abc');
      const agent = new ElevenLabsAgent({ agentId: 'agent_1', apiKey: 'xi-key', signedUrl });
      await agent.initialize();
      const sock = await connectAgent(agent);

      expect(signedUrl).toHaveBeenCalled();
      expect(sock.url).toBe('wss://api.elevenlabs.io/signed?token=abc');
    });

    it('routes through the proxy without a key', async () => {
      const agent = new ElevenLabsAgent({
        agentId: 'agent_1',
        proxyUrl: 'http://localhost:3000/api/proxy/elevenlabs',
      });
      await agent.initialize();
      const sock = await connectAgent(agent);

      expect(sock.url).toBe(
        'ws://localhost:3000/api/proxy/elevenlabs/v1/convai/conversation?agent_id=agent_1'
      );
    });

    it('sends initiation data with overrides on open', async () => {
      const agent = new ElevenLabsAgent({
        agentId: 'agent_1',
        systemPrompt: 'Be brief.',
        firstMessage: 'Hi!',
        language: 'en',
        voiceId: 'voice_9',
        dynamicVariables: { user_name: 'Astrid' },
      });
      await agent.initialize();
      const sock = await connectAgent(agent);

      const init = sock
        .sentJson()
        .find((m) => m.type === 'conversation_initiation_client_data') as Record<string, any>;
      expect(init.conversation_config_override.agent).toEqual({
        prompt: { prompt: 'Be brief.' },
        first_message: 'Hi!',
        language: 'en',
      });
      expect(init.conversation_config_override.tts).toEqual({ voice_id: 'voice_9' });
      expect(init.dynamic_variables).toEqual({ user_name: 'Astrid' });
    });

    it('parses the announced output format into metadata', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const metadata: AudioMetadata[] = [];
      agent.onMetadata((m) => metadata.push(m));

      await connectAgent(agent, 'pcm_44100');

      expect(metadata).toEqual([
        { sampleRate: 44100, encoding: 'linear16', channels: 1, bitDepth: 16 },
      ]);
    });

    it('parses ulaw output formats', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const metadata: AudioMetadata[] = [];
      agent.onMetadata((m) => metadata.push(m));

      await connectAgent(agent, 'ulaw_8000');

      expect(metadata).toEqual([
        { sampleRate: 8000, encoding: 'mulaw', channels: 1, bitDepth: 16 },
      ]);
    });

    it('rejects when the handshake times out', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1', timeout: 30 });
      await agent.initialize();

      const connecting = agent.connect();
      (await waitForSocket())._open();

      await expect(connecting).rejects.toThrow(/timed out/);
    });

    it('resolves both callers when a second connect() piggybacks', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();

      const first = agent.connect();
      const sock = await waitForSocket();
      sock._open();
      const second = agent.connect();
      sock._message({
        type: 'conversation_initiation_metadata',
        conversation_initiation_metadata_event: {
          conversation_id: 'conv_1',
          agent_output_audio_format: 'pcm_16000',
        },
      });

      await expect(first).resolves.toBeUndefined();
      await expect(second).resolves.toBeUndefined();
    });

    it('rejects both callers when a piggybacked handshake fails', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
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

  describe('keep-alive', () => {
    it('answers server pings with pongs carrying the event id', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({ type: 'ping', ping_event: { event_id: 42 } });

      const pong = sock.sentJson().find((m) => m.type === 'pong');
      expect(pong).toEqual({ type: 'pong', event_id: 42 });
    });
  });

  describe('audio transport', () => {
    it('base64-encodes microphone audio into user_audio_chunk', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      const chunk = new Uint8Array([1, 2, 3]).buffer;
      agent.sendAudio(chunk);

      const frame = sock.sentJson().find((m) => m.user_audio_chunk);
      expect(frame?.user_audio_chunk).toBe(arrayBufferToBase64(chunk));
    });

    it('re-emits output metadata with every audio chunk', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const metadata: AudioMetadata[] = [];
      agent.onMetadata((m) => metadata.push(m));
      const sock = await connectAgent(agent, 'pcm_44100');

      expect(metadata).toHaveLength(1);

      const audio = arrayBufferToBase64(new Uint8Array([1, 2]).buffer);
      sock._message({ type: 'audio', audio_event: { audio_base_64: audio, event_id: 1 } });
      sock._message({ type: 'audio', audio_event: { audio_base_64: audio, event_id: 2 } });

      expect(metadata).toHaveLength(3);
      expect(metadata.every((m) => m.sampleRate === 44100)).toBe(true);
    });

    it('decodes audio events into audio chunks', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const chunks: AudioChunk[] = [];
      agent.onAudio((c) => chunks.push(c));
      const sock = await connectAgent(agent);

      const audio = new Uint8Array([4, 5, 6]).buffer;
      sock._message({
        type: 'audio',
        audio_event: { audio_base_64: arrayBufferToBase64(audio), event_id: 1 },
      });

      expect(chunks).toHaveLength(1);
      expect(new Uint8Array(chunks[0]!.data)).toEqual(new Uint8Array([4, 5, 6]));
    });
  });

  describe('conversation flow', () => {
    it('emits user transcripts as utterance-complete results', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const results: TranscriptionResult[] = [];
      agent.onTranscription((r) => results.push(r));
      const sock = await connectAgent(agent);

      sock._message({ type: 'user_transcript', user_transcription_event: { user_transcript: 'hello' } });

      expect(results).toEqual([
        { text: 'hello', isFinal: true, utteranceComplete: true, confidence: 1 },
      ]);
    });

    it('resolves the LLM iterator with the agent response', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({ type: 'user_transcript', user_transcription_event: { user_transcript: 'hi' } });

      const iterable = await agent.generateFromMessages([{ role: 'user', content: 'hi' }]);
      const iterator = iterable[Symbol.asyncIterator]();
      const pending = iterator.next();

      sock._message({ type: 'agent_response', agent_response_event: { agent_response: 'Hello!' } });

      const { value } = await pending;
      expect(value).toBe('Hello!');
    });

    it('buffers an agent response that arrives before the iterator starts', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({ type: 'user_transcript', user_transcription_event: { user_transcript: 'hi' } });
      sock._message({ type: 'agent_response', agent_response_event: { agent_response: 'Fast!' } });

      const iterable = await agent.generateFromMessages([{ role: 'user', content: 'hi' }]);
      const iterator = iterable[Symbol.asyncIterator]();
      const { value } = await iterator.next();

      expect(value).toBe('Fast!');
    });

    it('marks the turn done after audio goes silent', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1', audioDoneSilenceMs: 20 });
      await agent.initialize();
      const events: ElevenLabsAgentEvent[] = [];
      agent.onAgentEvent((e) => events.push(e));
      const sock = await connectAgent(agent);

      sock._message({ type: 'user_transcript', user_transcription_event: { user_transcript: 'hi' } });
      sock._message({
        type: 'audio',
        audio_event: { audio_base_64: arrayBufferToBase64(new Uint8Array([1]).buffer), event_id: 1 },
      });

      await agent.finalize();

      expect(events.some((e) => e.type === 'agent_audio_done')).toBe(true);
    });

    it('does not let the previous turn\'s idle timer end the next turn', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1', audioDoneSilenceMs: 30 });
      await agent.initialize();
      const sock = await connectAgent(agent);

      const audio = arrayBufferToBase64(new Uint8Array([1]).buffer);
      sock._message({ type: 'user_transcript', user_transcription_event: { user_transcript: 'hi' } });
      sock._message({ type: 'audio', audio_event: { audio_base_64: audio, event_id: 1 } });

      // The user speaks again inside the idle window, before the timer fires
      sock._message({
        type: 'user_transcript',
        user_transcription_event: { user_transcript: 'and another thing' },
      });

      // The stale timer would have fired by now — the new turn must still be open
      let settled = false;
      void agent.finalize().then(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(settled).toBe(false);

      // The new turn ends on its own audio going silent
      sock._message({ type: 'audio', audio_event: { audio_base_64: audio, event_id: 2 } });
      await agent.finalize();
      expect(settled).toBe(true);
    });

    it('unblocks the turn immediately on interruption', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1', audioDoneSilenceMs: 5000 });
      await agent.initialize();
      const events: ElevenLabsAgentEvent[] = [];
      agent.onAgentEvent((e) => events.push(e));
      const sock = await connectAgent(agent);

      sock._message({ type: 'user_transcript', user_transcription_event: { user_transcript: 'hi' } });
      sock._message({
        type: 'audio',
        audio_event: { audio_base_64: arrayBufferToBase64(new Uint8Array([1]).buffer), event_id: 1 },
      });
      sock._message({ type: 'interruption', interruption_event: { reason: 'user speech' } });

      await agent.finalize();

      expect(events.some((e) => e.type === 'interrupted')).toBe(true);
    });

    it('surfaces conversation lifecycle via onAgentEvent', async () => {
      const agent = new ElevenLabsAgent({ agentId: 'agent_1' });
      await agent.initialize();
      const events: ElevenLabsAgentEvent[] = [];
      agent.onAgentEvent((e) => events.push(e));
      const sock = await connectAgent(agent);

      sock._message({ type: 'vad_score', vad_score_event: { vad_score: 0.9 } });
      sock._message({
        type: 'internal_tentative_agent_response',
        internal_tentative_agent_response_event: { tentative_agent_response: 'maybe...' },
      });

      expect(events).toEqual([
        { type: 'conversation_started', conversationId: 'conv_1' },
        { type: 'vad_score', score: 0.9 },
        { type: 'tentative_agent_response', content: 'maybe...' },
      ]);
    });
  });

  describe('client tools', () => {
    it('executes the handler and sends client_tool_result', async () => {
      const handler = jest.fn().mockResolvedValue({ result: { ok: true } });
      const agent = new ElevenLabsAgent({ agentId: 'agent_1', onClientToolCall: handler });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({
        type: 'client_tool_call',
        client_tool_call: { tool_name: 'open_page', tool_call_id: 'tc_1', parameters: { url: '/x' } },
      });
      await flush();

      expect(handler).toHaveBeenCalledWith({
        toolCallId: 'tc_1',
        toolName: 'open_page',
        parameters: { url: '/x' },
      });
      const result = sock.sentJson().find((m) => m.type === 'client_tool_result');
      expect(result).toEqual({
        type: 'client_tool_result',
        tool_call_id: 'tc_1',
        result: { ok: true },
        is_error: false,
      });
    });

    it('reports handler failures as error results', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('nope'));
      const agent = new ElevenLabsAgent({ agentId: 'agent_1', onClientToolCall: handler });
      await agent.initialize();
      const sock = await connectAgent(agent);

      sock._message({
        type: 'client_tool_call',
        client_tool_call: { tool_name: 'open_page', tool_call_id: 'tc_2', parameters: {} },
      });
      await flush();

      const result = sock.sentJson().find((m) => m.type === 'client_tool_result');
      expect(result?.is_error).toBe(true);
    });
  });
});
