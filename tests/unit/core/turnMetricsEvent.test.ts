/**
 * Tests for the 'turn.metrics' SDK event through a real CompositeVoice
 * pipeline, and for the audio.playback.* events now wired to the output
 * provider's callbacks.
 */

import { CompositeVoice } from '../../../src/CompositeVoice';
import type { TurnMetricsEvent, CompositeVoiceEvent } from '../../../src/core/events/types';
import type { AudioChunk } from '../../../src/core/types/audio';
import {
  MockSTTProvider,
  MockLLMProvider,
  MockTTSProvider,
  MockInputProvider,
  MockOutputProvider,
} from '../../mocks/MockProviders';

// jsdom's Blob lacks arrayBuffer(); the REST-TTS path needs it.
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.readAsArrayBuffer(this);
    });
  };
}

/**
 * Output that reports playback boundaries the way a real speaker path
 * does: playback starts when audio is enqueued and ends on flush.
 */
class AutoPlayOutput extends MockOutputProvider {
  override enqueue(chunk: AudioChunk): void {
    super.enqueue(chunk);
    this.emitPlaybackStart();
  }

  override async flush(): Promise<void> {
    await super.flush();
    this.emitPlaybackEnd();
  }
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function buildAgent() {
  const stt = new MockSTTProvider();
  const llm = new MockLLMProvider();
  const tts = new MockTTSProvider();
  const input = new MockInputProvider();
  const output = new AutoPlayOutput();
  const agent = new CompositeVoice({
    providers: [input, stt, llm, tts, output],
  });
  return { agent, stt, llm, tts, input, output };
}

describe('turn.metrics event', () => {
  it('emits one summary per completed voice turn with ordered marks', async () => {
    const { agent, stt } = buildAgent();
    const metrics: TurnMetricsEvent[] = [];
    agent.on('turn.metrics', (e) => {
      metrics.push(e);
    });

    await agent.initialize();
    await agent.startListening();

    stt.emitTranscription('what time is it');
    await waitFor(() => metrics.length === 1);

    const m = metrics[0]!;
    expect(m).toMatchObject({
      type: 'turn.metrics',
      turnId: 1,
      transcript: 'what time is it',
      modality: 'voice',
      eagerUsed: false,
      interrupted: false,
    });

    const t = m.timestamps;
    expect(t.llmStart).toBeGreaterThanOrEqual(t.sttFinal);
    expect(t.llmFirstToken).toBeGreaterThanOrEqual(t.llmStart!);
    expect(t.llmComplete).toBeGreaterThanOrEqual(t.llmFirstToken!);
    expect(t.ttsFirstAudio).toBeGreaterThanOrEqual(t.llmComplete!);
    expect(t.playbackStart).toBeGreaterThanOrEqual(t.ttsFirstAudio!);
    expect(t.turnEnd).toBeGreaterThanOrEqual(t.playbackStart!);

    const d = m.durations;
    expect(d.sttFinalToFirstToken).toBeGreaterThanOrEqual(0);
    expect(d.voiceToVoice).toBeGreaterThanOrEqual(0);
    expect(d.llmTotal).toBeGreaterThanOrEqual(0);
    expect(d.turnTotal).toBeGreaterThanOrEqual(d.voiceToVoice!);

    await agent.dispose();
  });

  it('reports a superseded turn as interrupted and numbers turns monotonically', async () => {
    const { agent, stt } = buildAgent();
    const metrics: TurnMetricsEvent[] = [];
    agent.on('turn.metrics', (e) => {
      metrics.push(e);
    });

    await agent.initialize();
    await agent.startListening();

    stt.emitTranscription('first question');
    // Barge-in while the agent is thinking about the first one
    stt.emitTranscription('second question');

    await waitFor(() => metrics.length === 2);

    expect(metrics[0]).toMatchObject({
      turnId: 1,
      transcript: 'first question',
      interrupted: true,
    });
    expect(metrics[1]).toMatchObject({
      turnId: 2,
      transcript: 'second question',
      interrupted: false,
    });

    await agent.dispose();
  });

  it('emits metrics for typed turns via sendMessage', async () => {
    const { agent } = buildAgent();
    const metrics: TurnMetricsEvent[] = [];
    agent.on('turn.metrics', (e) => {
      metrics.push(e);
    });

    await agent.initialize();
    // Not listening — sendMessage runs through the 'ready' state path
    await agent.sendMessage('typed hello');
    await waitFor(() => metrics.length === 1);

    expect(metrics[0]).toMatchObject({
      turnId: 1,
      transcript: 'typed hello',
      modality: 'text',
      interrupted: false,
    });
    expect(metrics[0]!.timestamps.llmComplete).toBeDefined();

    await agent.dispose();
  });

  it('emits audio.playback.start and audio.playback.end from output callbacks', async () => {
    const { agent, stt } = buildAgent();
    const playbackEvents: string[] = [];
    let sawMetrics = false;
    agent.on('*', (event: CompositeVoiceEvent) => {
      if (event.type === 'audio.playback.start' || event.type === 'audio.playback.end') {
        playbackEvents.push(event.type);
      }
      if (event.type === 'turn.metrics') sawMetrics = true;
    });

    await agent.initialize();
    await agent.startListening();

    stt.emitTranscription('hello');
    await waitFor(() => sawMetrics);

    expect(playbackEvents).toContain('audio.playback.start');
    expect(playbackEvents).toContain('audio.playback.end');

    await agent.dispose();
  });
});
