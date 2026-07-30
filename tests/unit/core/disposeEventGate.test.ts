/**
 * Tests for event suppression during dispose().
 *
 * Teardown is asynchronous, so a provider can deliver one last callback while
 * dispose() is still awaiting — an STT flushing buffered audio, a socket close
 * handler firing. Those late events must not reach listeners, because by then
 * the application already considers the agent gone. Guarding on `initialized`
 * is not enough: it only clears once teardown has finished.
 */

import { CompositeVoice } from '../../../src/CompositeVoice';
import type { CompositeVoiceEvent } from '../../../src/core/events/types';
import type { TranscriptionResult } from '../../../src/core/types/providers';
import { MockSTTProvider, MockLLMProvider, MockTTSProvider } from '../../mocks/MockProviders';

/**
 * An STT provider that flushes a final transcript from inside its own
 * dispose() — exactly the race a live Deepgram socket produces when a call
 * ends mid-utterance.
 */
class FlushOnDisposeSTT extends MockSTTProvider {
  private captured?: (result: TranscriptionResult) => void;
  public flushText = 'late flush after teardown';

  override onTranscription(callback: (result: TranscriptionResult) => void): void {
    this.captured = callback;
    super.onTranscription(callback);
  }

  /** Deliver a transcript the way the provider would outside of teardown. */
  emitFinal(text: string): void {
    this.captured?.({ text, isFinal: true, confidence: 0.9 });
  }

  override async dispose(): Promise<void> {
    // A real provider flushes asynchronously as its socket closes.
    await new Promise((resolve) => setTimeout(resolve, 1));
    this.emitFinal(this.flushText);
    await super.dispose();
  }
}

/** Counts how many times dispose() ran, to catch double teardown. */
class CountingTTS extends MockTTSProvider {
  public disposeCount = 0;

  override async dispose(): Promise<void> {
    this.disposeCount++;
    await new Promise((resolve) => setTimeout(resolve, 2));
    await super.dispose();
  }
}

describe('event suppression during dispose()', () => {
  it('delivers transcripts normally while the agent is live', async () => {
    // Control: proves the flush path below is one that would otherwise emit.
    const stt = new FlushOnDisposeSTT();
    const voice = new CompositeVoice({
      providers: [stt, new MockLLMProvider(), new MockTTSProvider()],
    });
    await voice.initialize();
    await voice.startListening();

    const finals: string[] = [];
    voice.on('transcription.final', (event) => {
      finals.push(event.text);
    });

    stt.emitFinal('hello while live');

    expect(finals).toEqual(['hello while live']);

    await voice.dispose();
  });

  it('drops a transcript flushed by a provider during teardown', async () => {
    const stt = new FlushOnDisposeSTT();
    const voice = new CompositeVoice({
      providers: [stt, new MockLLMProvider(), new MockTTSProvider()],
    });
    await voice.initialize();
    await voice.startListening();

    const finals: string[] = [];
    voice.on('transcription.final', (event) => {
      finals.push(event.text);
    });

    await voice.dispose();

    expect(finals).toEqual([]);
  });

  it('suppresses events emitted between the start and end of dispose()', async () => {
    const stt = new FlushOnDisposeSTT();
    const voice = new CompositeVoice({
      providers: [stt, new MockLLMProvider(), new CountingTTS()],
    });
    await voice.initialize();
    await voice.startListening();

    const seen: string[] = [];
    voice.on('*', (event: CompositeVoiceEvent) => {
      seen.push(event.type);
    });

    // Do not await: emit while teardown is still in flight.
    const disposal = voice.dispose();
    stt.emitFinal('mid-teardown');
    await disposal;

    expect(seen).toEqual([]);
  });

  it('disposes each provider once when dispose() is called concurrently', async () => {
    const tts = new CountingTTS();
    const voice = new CompositeVoice({
      providers: [new MockSTTProvider(), new MockLLMProvider(), tts],
    });
    await voice.initialize();

    await Promise.all([voice.dispose(), voice.dispose(), voice.dispose()]);

    expect(tts.disposeCount).toBe(1);
  });

  it('reopens the event gate if dispose() fails, so it can be retried', async () => {
    class FailingOnceTTS extends MockTTSProvider {
      public attempts = 0;

      override async dispose(): Promise<void> {
        this.attempts++;
        if (this.attempts === 1) throw new Error('teardown boom');
        await super.dispose();
      }
    }

    const stt = new FlushOnDisposeSTT();
    const tts = new FailingOnceTTS();
    const voice = new CompositeVoice({
      providers: [stt, new MockLLMProvider(), tts],
    });
    await voice.initialize();
    await voice.startListening();

    await expect(voice.dispose()).rejects.toThrow('teardown boom');

    // The agent is still live, so events must flow again.
    const finals: string[] = [];
    voice.on('transcription.final', (event) => {
      finals.push(event.text);
    });
    stt.emitFinal('after failed dispose');
    expect(finals).toEqual(['after failed dispose']);

    // And a retry must be allowed rather than short-circuiting as "already disposed".
    await voice.dispose();
    expect(tts.attempts).toBe(2);
  });
});
