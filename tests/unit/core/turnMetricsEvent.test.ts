/**
 * Tests for the 'turn.metrics' SDK event through a real CompositeVoice
 * pipeline, and for the audio.playback.* events now wired to the output
 * provider's callbacks.
 */

import { CompositeVoice } from '../../../src/CompositeVoice';
import type { TurnMetricsEvent, CompositeVoiceEvent } from '../../../src/core/events/types';
import type { AudioChunk } from '../../../src/core/types/audio';
import type { TranscriptionResult } from '../../../src/core/types/providers';
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

/**
 * STT that signals an early end-of-turn the way DeepgramFlux does, so the
 * eager pipeline can be exercised end to end.
 */
class PreflightSTT extends MockSTTProvider {
  override isPreflight(result: TranscriptionResult): boolean {
    return result.metadata?.preflight === true;
  }

  override isUtteranceComplete(result: TranscriptionResult): boolean {
    return result.isFinal === true;
  }

  emitPreflight(text: string): void {
    this.transcriptionCallback?.({
      text,
      isFinal: false,
      confidence: 0.9,
      metadata: { preflight: true },
    });
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

function buildEagerAgent(eagerLLM: { cancelOnTextChange?: boolean } = {}) {
  const stt = new PreflightSTT();
  const llm = new MockLLMProvider();
  const agent = new CompositeVoice({
    providers: [new MockInputProvider(), stt, llm, new MockTTSProvider(), new AutoPlayOutput()],
    eagerLLM: {
      enabled: true,
      similarityThreshold: 0.8,
      cancelOnTextChange: true,
      ...eagerLLM,
    },
  });
  return { agent, stt, llm };
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

  it('closes a turn whose generation is refused because the agent is not listening', async () => {
    const { agent, stt } = buildAgent();
    const metrics: TurnMetricsEvent[] = [];
    agent.on('turn.metrics', (e) => {
      metrics.push(e);
    });

    await agent.initialize(); // never started listening — processLLM will bail

    stt.emitTranscription('ignored question');
    await waitFor(() => metrics.length === 1);

    const m = metrics[0]!;
    expect(m).toMatchObject({ turnId: 1, transcript: 'ignored question', interrupted: true });
    // Reported immediately, not left open to absorb the next silence
    expect(m.timestamps.llmStart).toBeUndefined();
    expect(m.durations.turnTotal).toBeLessThan(1000);

    await agent.dispose();
  });

  it('reports the interrupted turn at the moment of barge-in', async () => {
    const { agent, stt } = buildEagerAgent();
    const metrics: TurnMetricsEvent[] = [];
    let chunks = 0;
    agent.on('turn.metrics', (e) => {
      metrics.push(e);
    });
    agent.on('llm.chunk', () => {
      chunks++;
    });

    await agent.initialize();
    await agent.startListening();

    stt.emitTranscription('first question');
    await waitFor(() => chunks > 0); // agent is now answering the first one

    stt.emitPreflight('second question'); // user talks over it

    // Reported synchronously by the barge-in itself, not deferred until the
    // next turn starts (which would inflate turnTotal by the interval)
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      turnId: 1,
      transcript: 'first question',
      interrupted: true,
    });

    await agent.dispose();
  });

  it('adopts an eager generation and reports the latency it saved', async () => {
    const { agent, stt, llm } = buildEagerAgent();
    const metrics: TurnMetricsEvent[] = [];
    let chunks = 0;
    agent.on('turn.metrics', (e) => {
      metrics.push(e);
    });
    agent.on('llm.chunk', () => {
      chunks++;
    });

    await agent.initialize();
    await agent.startListening();

    stt.emitPreflight('what time is it'); // early end-of-turn → eager generation
    await waitFor(() => chunks > 0); // first token, before speech_final
    stt.emitTranscription('what time is it'); // confirms the preflight

    await waitFor(() => metrics.length === 1);

    const m = metrics[0]!;
    expect(m).toMatchObject({ turnId: 1, eagerUsed: true, interrupted: false });
    expect(m.timestamps.preflight).toBeDefined();
    expect(m.timestamps.llmFirstToken).toBeLessThan(m.timestamps.sttFinal);
    // The negative number is the latency the eager pipeline saved
    expect(m.durations.sttFinalToFirstToken).toBeLessThan(0);
    // The speculative generation was reused, not restarted
    expect(llm.promptCount).toBe(1);

    await agent.dispose();
  });

  it('restarts on a diverged transcript and reports the turn without eager marks', async () => {
    const { agent, stt, llm } = buildEagerAgent();
    const metrics: TurnMetricsEvent[] = [];
    let chunks = 0;
    agent.on('turn.metrics', (e) => {
      metrics.push(e);
    });
    agent.on('llm.chunk', () => {
      chunks++;
    });

    await agent.initialize();
    await agent.startListening();

    stt.emitPreflight('what time is it');
    await waitFor(() => chunks > 0);
    stt.emitTranscription('tell me a joke instead'); // nothing like the preflight

    await waitFor(() => metrics.length === 1);

    const m = metrics[0]!;
    expect(m).toMatchObject({
      turnId: 1,
      transcript: 'tell me a joke instead',
      eagerUsed: false,
      interrupted: false,
    });
    // The preflight still marks when the user stopped speaking, even though
    // the generation it triggered was thrown away
    expect(m.timestamps.preflight).toBeDefined();
    expect(m.durations.sttFinalToFirstToken).toBeGreaterThanOrEqual(0);
    // Discarded generation plus the real one
    expect(llm.promptCount).toBe(2);
    expect(llm.lastPrompt).toContain('tell me a joke instead');

    await agent.dispose();
  });

  it('closes the turn immediately when speech_final adopts an already-finished eager generation', async () => {
    const { agent, stt, llm } = buildEagerAgent();
    const metrics: TurnMetricsEvent[] = [];
    let playbackEnded = false;
    agent.on('turn.metrics', (e) => {
      metrics.push(e);
    });
    agent.on('audio.playback.end', () => {
      playbackEnded = true;
    });

    await agent.initialize();
    await agent.startListening();

    stt.emitPreflight('what time is it');
    await waitFor(() => playbackEnded);
    // processLLM has now setIdle + finishTurn()'d a turn that did not exist yet
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(metrics).toHaveLength(0);

    stt.emitTranscription('what time is it');
    // Adoption closes the turn synchronously — no later utterance required
    expect(metrics).toHaveLength(1);

    const m = metrics[0]!;
    expect(m).toMatchObject({ turnId: 1, eagerUsed: true, interrupted: false });
    expect(m.timestamps.llmComplete).toBeDefined();
    expect(m.timestamps.playbackStart).toBeDefined();
    expect(m.durations.sttFinalToFirstToken).toBeLessThan(0);
    expect(llm.promptCount).toBe(1);

    await agent.dispose();
  });

  it('closes an already-finished eager turn when cancelOnTextChange is false', async () => {
    const { agent, stt, llm } = buildEagerAgent({ cancelOnTextChange: false });
    const metrics: TurnMetricsEvent[] = [];
    let playbackEnded = false;
    agent.on('turn.metrics', (e) => {
      metrics.push(e);
    });
    agent.on('audio.playback.end', () => {
      playbackEnded = true;
    });

    await agent.initialize();
    await agent.startListening();

    stt.emitPreflight('what time is it');
    await waitFor(() => playbackEnded);
    await new Promise((resolve) => setTimeout(resolve, 20));

    stt.emitTranscription('tell me a joke instead');
    expect(metrics).toHaveLength(1);
    expect(metrics[0]).toMatchObject({
      turnId: 1,
      transcript: 'tell me a joke instead',
      eagerUsed: true,
      interrupted: false,
    });
    expect(llm.promptCount).toBe(1);

    await agent.dispose();
  });
});
