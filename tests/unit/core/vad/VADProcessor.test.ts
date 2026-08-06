/**
 * Tests for VADProcessor — framing, format conversion, and the
 * speech/silence hysteresis state machine.
 */

import { VADProcessor } from '../../../../src/core/vad/VADProcessor';
import type { VADEngine } from '../../../../src/core/vad/types';
import { encodeMulaw } from '../../../../src/utils/g711';

/** Scripted engine: returns a queued probability per processed frame. */
class FakeEngine implements VADEngine {
  readonly frameSamples = 512;
  readonly sampleRate = 16000;

  probabilities: number[] = [];
  processedFrames: Float32Array[] = [];
  resetCount = 0;
  private index = 0;

  async initialize(): Promise<void> {}

  async process(frame: Float32Array): Promise<number> {
    this.processedFrames.push(frame);
    const p = this.probabilities[Math.min(this.index, this.probabilities.length - 1)] ?? 0;
    this.index++;
    return p;
  }

  reset(): void {
    this.resetCount++;
    this.index = 0;
  }

  async dispose(): Promise<void> {}
}

/** Build a linear16 chunk of N samples with a constant value. */
function pcmChunk(samples: number, value = 1000): ArrayBuffer {
  return Int16Array.from({ length: samples }, () => value).buffer;
}

const LINEAR16_16K = { sampleRate: 16000, encoding: 'linear16' as const, channels: 1, bitDepth: 16 };

// One 512-sample frame at 16 kHz = 32 ms.
// minSpeechDurationMs: 64 → 2 frames to confirm speech.
// silenceDurationMs: 64 → 2 frames of silence to end the segment.
function makeProcessor(engine: FakeEngine, overrides = {}) {
  const processor = new VADProcessor(engine, {
    threshold: 0.5,
    minSpeechDurationMs: 64,
    silenceDurationMs: 64,
    ...overrides,
  });
  processor.configure(LINEAR16_16K);
  return processor;
}

describe('VADProcessor', () => {
  describe('framing and conversion', () => {
    it('slices linear16 input into engine-sized frames', async () => {
      const engine = new FakeEngine();
      const processor = makeProcessor(engine);

      processor.push(pcmChunk(512 + 256));
      processor.push(pcmChunk(256));
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(2);
      expect(engine.processedFrames[0]!.length).toBe(512);
    });

    it('converts int16 to normalized float32', async () => {
      const engine = new FakeEngine();
      const processor = makeProcessor(engine);

      processor.push(pcmChunk(512, 16384)); // ~0.5 full scale
      await processor.flush();

      expect(engine.processedFrames[0]![0]).toBeCloseTo(0.5, 1);
    });

    it('resamples 48 kHz input down to the engine rate', async () => {
      const engine = new FakeEngine();
      const processor = new VADProcessor(engine, { threshold: 0.5 });
      processor.configure({ sampleRate: 48000, encoding: 'linear16', channels: 1, bitDepth: 16 });

      processor.push(pcmChunk(1536)); // 1536 @ 48k → 512 @ 16k
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(1);
    });

    it('decodes and upsamples 8 kHz mulaw input', async () => {
      const engine = new FakeEngine();
      const processor = new VADProcessor(engine, { threshold: 0.5 });
      processor.configure({ sampleRate: 8000, encoding: 'mulaw', channels: 1, bitDepth: 8 });

      const mulaw = encodeMulaw(Int16Array.from({ length: 512 }, () => 8000));
      processor.push(mulaw.buffer as ArrayBuffer); // 512 @ 8k → 1024 @ 16k = 2 frames
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(2);
    });

    it('downmixes interleaved stereo to mono', async () => {
      const engine = new FakeEngine();
      const processor = new VADProcessor(engine, { threshold: 0.5 });
      processor.configure({ sampleRate: 16000, encoding: 'linear16', channels: 2, bitDepth: 16 });

      processor.push(pcmChunk(2048)); // 2048 interleaved → 1024 mono → 2 frames
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(2);
    });

    it('ignores unsupported encodings without throwing', async () => {
      const engine = new FakeEngine();
      const processor = new VADProcessor(engine, { threshold: 0.5 });
      processor.configure({ sampleRate: 16000, encoding: 'opus', channels: 1, bitDepth: 16 });

      processor.push(pcmChunk(512));
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(0);
    });

    it('drops a trailing odd byte from linear16 chunks', async () => {
      const engine = new FakeEngine();
      const processor = makeProcessor(engine);

      const odd = new Uint8Array(512 * 2 + 1).buffer;
      processor.push(odd);
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(1);
    });

    it('drops chunks pushed before configure()', async () => {
      const engine = new FakeEngine();
      const processor = new VADProcessor(engine, {});

      processor.push(pcmChunk(512));
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(0);
    });
  });

  describe('speech detection', () => {
    it('fires onSpeechStart only after sustained speech (debounce)', async () => {
      const engine = new FakeEngine();
      engine.probabilities = [0.9, 0.9, 0.9];
      const processor = makeProcessor(engine);
      const starts: number[] = [];
      processor.onSpeechStart(({ probability }) => starts.push(probability));

      processor.push(pcmChunk(512)); // frame 1 — not yet
      await processor.flush();
      expect(starts).toHaveLength(0);

      processor.push(pcmChunk(512)); // frame 2 — 64ms reached
      await processor.flush();
      expect(starts).toEqual([0.9]);
    });

    it('does not fire for a single transient hot frame', async () => {
      const engine = new FakeEngine();
      engine.probabilities = [0.9, 0.1, 0.9, 0.1];
      const processor = makeProcessor(engine);
      const starts: unknown[] = [];
      processor.onSpeechStart((info) => starts.push(info));

      for (let i = 0; i < 4; i++) processor.push(pcmChunk(512));
      await processor.flush();

      expect(starts).toHaveLength(0);
    });

    it('fires onSpeechEnd after sustained silence with the segment duration', async () => {
      const engine = new FakeEngine();
      engine.probabilities = [0.9, 0.9, 0.1, 0.1];
      const processor = makeProcessor(engine);
      const ends: number[] = [];
      processor.onSpeechEnd(({ durationMs }) => ends.push(durationMs));

      for (let i = 0; i < 4; i++) processor.push(pcmChunk(512));
      await processor.flush();

      expect(ends).toHaveLength(1);
      expect(ends[0]).toBeGreaterThanOrEqual(0);
      expect(processor.isSpeaking).toBe(false);
    });

    it('keeps the segment open through mid-sentence dips (hysteresis band)', async () => {
      const engine = new FakeEngine();
      // 0.4 is below the 0.5 entry threshold but above the 0.35 exit threshold
      engine.probabilities = [0.9, 0.9, 0.4, 0.4, 0.4, 0.4];
      const processor = makeProcessor(engine);
      const ends: unknown[] = [];
      processor.onSpeechEnd((info) => ends.push(info));

      for (let i = 0; i < 6; i++) processor.push(pcmChunk(512));
      await processor.flush();

      expect(ends).toHaveLength(0);
      expect(processor.isSpeaking).toBe(true);
    });

    it('requires the override threshold while one is set (echo resistance)', async () => {
      const engine = new FakeEngine();
      engine.probabilities = [0.6, 0.6, 0.6, 0.6];
      const processor = makeProcessor(engine);
      const starts: unknown[] = [];
      processor.onSpeechStart((info) => starts.push(info));

      processor.setThresholdOverride(0.85); // agent speaking — echo must clear 0.85
      processor.push(pcmChunk(512));
      processor.push(pcmChunk(512));
      await processor.flush();
      expect(starts).toHaveLength(0); // 0.6 echo-level speech filtered

      processor.setThresholdOverride(null); // playback over — normal threshold
      processor.push(pcmChunk(512));
      processor.push(pcmChunk(512));
      await processor.flush();
      expect(starts).toHaveLength(1);
    });

    it('reset() clears segment state without firing onSpeechEnd', async () => {
      const engine = new FakeEngine();
      engine.probabilities = [0.9, 0.9];
      const processor = makeProcessor(engine);
      const ends: unknown[] = [];
      processor.onSpeechEnd((info) => ends.push(info));

      processor.push(pcmChunk(512));
      processor.push(pcmChunk(512));
      await processor.flush();
      expect(processor.isSpeaking).toBe(true);

      processor.reset();

      expect(processor.isSpeaking).toBe(false);
      expect(ends).toHaveLength(0);
      expect(engine.resetCount).toBe(1);
    });
  });
});
