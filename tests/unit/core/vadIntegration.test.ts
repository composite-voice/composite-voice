/**
 * Tests for local VAD wired through a real CompositeVoice pipeline:
 * vad.speechStart/vad.speechEnd events, provider-independent barge-in,
 * and graceful degradation when the engine fails to load.
 */

import { CompositeVoice } from '../../../src/CompositeVoice';
import type { CompositeVoiceEvent } from '../../../src/core/events/types';
import type { VADEngine } from '../../../src/core/vad/types';
import {
  MockSTTProvider,
  MockLLMProvider,
  MockTTSProvider,
  MockInputProvider,
  MockOutputProvider,
} from '../../mocks/MockProviders';

/** Engine whose probability is set directly by the test. */
class FakeEngine implements VADEngine {
  readonly frameSamples = 512;
  readonly sampleRate = 16000;
  probability = 0;
  initialized = false;
  disposed = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async process(): Promise<number> {
    return this.probability;
  }

  reset(): void {}

  async dispose(): Promise<void> {
    this.disposed = true;
  }
}

class FailingEngine extends FakeEngine {
  override async initialize(): Promise<void> {
    throw new Error('model unreachable');
  }
}

function frameChunk(): ArrayBuffer {
  return Int16Array.from({ length: 512 }, () => 1000).buffer;
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function buildAgent(engine: VADEngine) {
  const stt = new MockSTTProvider();
  const input = new MockInputProvider();
  const agent = new CompositeVoice({
    providers: [
      input,
      stt,
      new MockLLMProvider(),
      new MockTTSProvider(),
      new MockOutputProvider(),
    ],
    vad: {
      engine,
      // 1 frame (32ms) confirms speech; 2 frames of silence end it
      minSpeechDurationMs: 32,
      silenceDurationMs: 64,
      threshold: 0.5,
      bargeInThreshold: 0.9,
    },
  });

  const events: CompositeVoiceEvent[] = [];
  agent.on('*', (event: CompositeVoiceEvent) => {
    events.push(event);
  });

  return { agent, stt, input, events };
}

describe('local VAD integration', () => {
  it('emits vad.speechStart and vad.speechEnd from input audio', async () => {
    const engine = new FakeEngine();
    const { agent, input, events } = buildAgent(engine);

    await agent.initialize();
    expect(engine.initialized).toBe(true);
    await agent.startListening();

    engine.probability = 0.95;
    input.pushChunk(frameChunk());
    await waitFor(() => events.some((e) => e.type === 'vad.speechStart'));

    engine.probability = 0.05;
    input.pushChunk(frameChunk());
    input.pushChunk(frameChunk());
    await waitFor(() => events.some((e) => e.type === 'vad.speechEnd'));

    const start = events.find((e) => e.type === 'vad.speechStart');
    expect(start).toMatchObject({ type: 'vad.speechStart', probability: 0.95 });
    const end = events.find((e) => e.type === 'vad.speechEnd');
    expect(end).toMatchObject({ type: 'vad.speechEnd' });

    await agent.dispose();
    expect(engine.disposed).toBe(true);
  });

  it('triggers provider-independent barge-in while the agent is thinking', async () => {
    const engine = new FakeEngine();
    const { agent, stt, input, events } = buildAgent(engine);

    await agent.initialize();
    await agent.startListening();

    // Start a turn — MockLLM streams slowly, so the agent stays 'thinking'
    stt.emitTranscription('tell me a story');
    await waitFor(() => events.some((e) => e.type === 'llm.start'));

    // The user starts talking — local VAD should interrupt without any STT text
    engine.probability = 0.95;
    input.pushChunk(frameChunk());
    await waitFor(() => events.some((e) => e.type === 'vad.bargeIn'));

    const bargeIn = events.find((e) => e.type === 'vad.bargeIn');
    expect(bargeIn).toMatchObject({ type: 'vad.bargeIn', probability: 0.95 });

    await agent.dispose();
  });

  it('does not barge in when vad.bargeIn is disabled', async () => {
    const engine = new FakeEngine();
    const stt = new MockSTTProvider();
    const input = new MockInputProvider();
    const agent = new CompositeVoice({
      providers: [
        input,
        stt,
        new MockLLMProvider(),
        new MockTTSProvider(),
        new MockOutputProvider(),
      ],
      vad: { engine, minSpeechDurationMs: 32, bargeIn: false },
    });
    const events: CompositeVoiceEvent[] = [];
    agent.on('*', (event: CompositeVoiceEvent) => {
      events.push(event);
    });

    await agent.initialize();
    await agent.startListening();

    stt.emitTranscription('tell me a story');
    await waitFor(() => events.some((e) => e.type === 'llm.start'));

    engine.probability = 0.95;
    input.pushChunk(frameChunk());
    await waitFor(() => events.some((e) => e.type === 'vad.speechStart'));

    expect(events.some((e) => e.type === 'vad.bargeIn')).toBe(false);

    await agent.dispose();
  });

  it('continues without VAD when the engine fails to initialize', async () => {
    const engine = new FailingEngine();
    const { agent, stt, input, events } = buildAgent(engine);

    await agent.initialize(); // must not throw
    await agent.startListening();

    input.pushChunk(frameChunk());
    stt.emitTranscription('hello');
    await waitFor(() => events.some((e) => e.type === 'llm.complete'));

    expect(events.some((e) => e.type === 'vad.speechStart')).toBe(false);

    await agent.dispose();
  });
});
