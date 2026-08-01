/**
 * Tests for role-scoped stop dispatch.
 *
 * A duplex provider fills both `'input'` and `'output'` with one object, so a
 * bare `stop()` cannot say which side the pipeline meant. It used to infer
 * that from playback state, which is wrong for the most ordinary barge-in
 * there is: interrupting while the agent is still `thinking`, before any TTS
 * audio exists. The provider saw an idle output, assumed "stop listening",
 * and went deaf for the rest of the session.
 *
 * The pipeline now calls stopPlayback() and stopCapture() explicitly.
 */

import { CompositeVoice } from '../../../src/CompositeVoice';
import type { AudioChunk, AudioMetadata } from '../../../src/core/types/audio';
import type {
  AudioInputProvider,
  AudioOutputProvider,
  ProviderType,
} from '../../../src/core/types/providers';
import type { ProviderRole } from '../../../src/core/types/roles';
import { MockSTTProvider, MockLLMProvider, MockTTSProvider } from '../../mocks/MockProviders';

/** A duplex provider that records which side the pipeline asked it to stop. */
class MockDuplexProvider implements AudioInputProvider, AudioOutputProvider {
  type = 'rest' as ProviderType;
  roles: readonly ProviderRole[] = ['input', 'output'];

  public stopCalls = 0;
  public stopPlaybackCalls = 0;
  public stopCaptureCalls = 0;
  public capturing = false;

  private ready = false;
  private audioCallback?: (chunk: AudioChunk) => void;

  async initialize(): Promise<void> {
    this.ready = true;
  }
  async dispose(): Promise<void> {
    this.ready = false;
  }
  isReady(): boolean {
    return this.ready;
  }

  // ── input ──
  start(): void {
    this.capturing = true;
  }
  stop(): void {
    // The ambiguous call. Nothing should reach it once the pipeline routes
    // barge-in and stop-listening to the explicit methods.
    this.stopCalls++;
    this.capturing = false;
  }
  stopCapture(): void {
    this.stopCaptureCalls++;
    this.capturing = false;
  }
  pause(): void {}
  resume(): void {}
  isActive(): boolean {
    return this.capturing;
  }
  onAudio(cb: (chunk: AudioChunk) => void): void {
    this.audioCallback = cb;
  }
  getMetadata(): AudioMetadata {
    return { sampleRate: 16000, encoding: 'linear16', channels: 1, bitDepth: 16 };
  }
  push(chunk: AudioChunk): void {
    if (this.capturing) this.audioCallback?.(chunk);
  }

  // ── output ──
  configure(): void {}
  enqueue(): void {}
  async flush(): Promise<void> {}
  stopPlayback(): void {
    this.stopPlaybackCalls++;
  }
  isPlaying(): boolean {
    return false;
  }
  onPlaybackStart(): void {}
  onPlaybackEnd(): void {}
  onPlaybackError(): void {}
}

/** STT whose transcription callback can be fired from the test. */
class CapturingSTT extends MockSTTProvider {
  private captured?: (result: { text: string; isFinal: boolean; confidence: number }) => void;

  override onTranscription(
    callback: (result: { text: string; isFinal: boolean; confidence: number }) => void
  ): void {
    this.captured = callback;
    super.onTranscription(callback as Parameters<MockSTTProvider['onTranscription']>[0]);
  }

  emitFinal(text: string): void {
    this.captured?.({ text, isFinal: true, confidence: 0.99 });
  }
}

/** LLM whose stream never yields, parking the agent in `thinking`. */
class HangingLLM extends MockLLMProvider {
  /** Resolves once generation has actually begun. */
  readonly started: Promise<void>;
  private markStarted: () => void = () => undefined;

  constructor() {
    super();
    this.started = new Promise<void>((resolve) => {
      this.markStarted = resolve;
    });
  }

  override async processText(prompt: string) {
    this.generateCalled = true;
    this.lastPrompt = prompt;
    const begun = this.markStarted;
    return {
      async *[Symbol.asyncIterator]() {
        begun();
        await new Promise(() => undefined); // never resolves
        yield '';
      },
    };
  }
}

async function createAgent() {
  const duplex = new MockDuplexProvider();
  const voice = new CompositeVoice({
    providers: [duplex, new MockSTTProvider(), new MockLLMProvider(), new MockTTSProvider()],
  });
  await voice.initialize();
  return { duplex, voice };
}

describe('duplex stop dispatch', () => {
  it('routes stop-listening to stopCapture(), never the ambiguous stop()', async () => {
    const { duplex, voice } = await createAgent();
    await voice.startListening();

    await voice.stopListening();

    expect(duplex.stopCaptureCalls).toBe(1);
    expect(duplex.stopCalls).toBe(0);
    expect(duplex.capturing).toBe(false);

    await voice.dispose();
  });

  it('keeps capture running when interrupted mid-thought', async () => {
    // The case the old heuristic got wrong: the user talks over the agent
    // while the LLM is still generating. No audio is playing, so a provider
    // inferring intent from playback state concludes "stop listening" and
    // never hears anything again.
    const stt = new CapturingSTT();
    const duplex = new MockDuplexProvider();
    const llm = new HangingLLM();
    const voice = new CompositeVoice({
      providers: [duplex, stt, llm, new MockTTSProvider()],
    });
    await voice.initialize();
    await voice.startListening();

    // A final transcript sends the agent into `thinking`, where it stays
    // because the LLM never resolves.
    stt.emitFinal('tell me a long story');
    await llm.started; // the agent is now genuinely in `thinking`

    await voice.stopSpeaking();

    expect(duplex.stopPlaybackCalls).toBeGreaterThanOrEqual(1);
    expect(duplex.stopCaptureCalls).toBe(0);
    expect(duplex.stopCalls).toBe(0);
    expect(duplex.capturing).toBe(true);

    await voice.dispose();
  });

  it('never calls the ambiguous stop() on a provider offering both hooks', async () => {
    const { duplex, voice } = await createAgent();
    await voice.startListening();
    await voice.stopSpeaking();
    await voice.stopListening();

    expect(duplex.stopCalls).toBe(0);

    await voice.dispose();
  });
});
