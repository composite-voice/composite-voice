/**
 * Tests for VADProcessor — framing, format conversion, and the
 * speech/silence hysteresis state machine.
 */

import { VADProcessor } from '../../../../src/core/vad/VADProcessor';
import type { VADEngine } from '../../../../src/core/vad/types';
import { encodeMulaw } from '../../../../src/utils/g711';
import { Logger } from '../../../../src/utils/logger';

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

const LINEAR16_16K = {
  sampleRate: 16000,
  encoding: 'linear16' as const,
  channels: 1,
  bitDepth: 16,
};

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

    it('holds back a trailing odd byte from linear16 chunks', async () => {
      const engine = new FakeEngine();
      const processor = makeProcessor(engine);

      const odd = new Uint8Array(512 * 2 + 1).buffer;
      processor.push(odd);
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(1);
    });

    it('carries a partial linear16 sample across chunks without shifting alignment', async () => {
      const engine = new FakeEngine();
      const processor = makeProcessor(engine);

      // 512 samples plus the low byte of a 513th, then the high byte plus the
      // rest. If the odd byte were dropped the second chunk would decode
      // byte-shifted and every later sample would be garbage.
      const full = new Uint8Array(Int16Array.from({ length: 1024 }, () => 16384).buffer);
      processor.push(full.slice(0, 512 * 2 + 1).buffer);
      processor.push(full.slice(512 * 2 + 1).buffer);
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(2);
      // Both frames decode to the same ~0.5 full-scale value.
      expect(engine.processedFrames[1]![0]).toBeCloseTo(0.5, 1);
      expect(engine.processedFrames[1]![511]).toBeCloseTo(0.5, 1);
    });

    it('carries a partial stereo sample across chunks so channels stay aligned', async () => {
      const engine = new FakeEngine();
      const processor = new VADProcessor(engine, { threshold: 0.5 });
      processor.configure({ sampleRate: 16000, encoding: 'linear16', channels: 2, bitDepth: 16 });

      // Left channel at full-ish scale, right channel silent — downmix ≈ 0.25.
      // Split mid-sample-frame (3 bytes into a 4-byte stereo frame).
      const stereo = new Uint8Array(
        Int16Array.from({ length: 2048 }, (_, i) => (i % 2 === 0 ? 16384 : 0)).buffer
      );
      processor.push(stereo.slice(0, 1027).buffer);
      processor.push(stereo.slice(1027).buffer);
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(2);
      // A rotated channel order would flip the pattern and change the mean.
      expect(engine.processedFrames[1]![0]).toBeCloseTo(0.25, 1);
    });

    it('clears held-back bytes when the input format changes', async () => {
      const engine = new FakeEngine();
      const processor = makeProcessor(engine);

      processor.push(new Uint8Array(1).buffer); // one byte, held back
      await processor.flush();

      processor.configure(LINEAR16_16K);
      processor.push(pcmChunk(512));
      await processor.flush();

      // The stale byte must not have shifted this chunk into a partial frame.
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

    it('reports speech duration without the trailing silence window', async () => {
      // Advance the clock one frame (32 ms) per scored frame, so the reported
      // duration can be checked against a known real-time timeline.
      let clock = 0;
      const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock);

      try {
        class ClockedEngine extends FakeEngine {
          override async process(frame: Float32Array): Promise<number> {
            clock += 32;
            return super.process(frame);
          }
        }

        const engine = new ClockedEngine();
        // 2 speech frames (64 ms of speech), then 2 silence frames to confirm.
        engine.probabilities = [0.9, 0.9, 0.1, 0.1];
        const processor = makeProcessor(engine);
        const ends: number[] = [];
        processor.onSpeechEnd(({ durationMs }) => ends.push(durationMs));

        for (let i = 0; i < 4; i++) processor.push(pcmChunk(512));
        await processor.flush();

        // Speech ran 0–64 ms; the segment closed at 128 ms after the 64 ms
        // silence window. Reporting 128 would count the silence as speech.
        expect(ends).toEqual([64]);
      } finally {
        nowSpy.mockRestore();
      }
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

    it('discards frames whose inference was in flight when reset() ran', async () => {
      // Engine that parks the second frame until we release it, so reset()
      // lands between the frame going in and its probability coming back.
      let release!: () => void;
      const parked = new Promise<void>((resolve) => {
        release = resolve;
      });

      class ParkingEngine extends FakeEngine {
        calls = 0;
        override async process(frame: Float32Array): Promise<number> {
          this.calls++;
          if (this.calls === 2) await parked;
          return super.process(frame);
        }
      }

      const engine = new ParkingEngine();
      engine.probabilities = [0.9, 0.9, 0.9];
      const processor = makeProcessor(engine);
      const starts: unknown[] = [];
      processor.onSpeechStart((info) => starts.push(info));

      processor.push(pcmChunk(512));
      processor.push(pcmChunk(512)); // second frame parks mid-inference
      await Promise.resolve();

      processor.reset();
      release();
      await processor.flush();

      // The parked frame belonged to the finished session — it must not
      // complete the debounce and open a segment.
      expect(starts).toHaveLength(0);
      expect(processor.isSpeaking).toBe(false);
    });
  });

  describe('error recovery', () => {
    it('drops the failed audio so later chunks still get scored', async () => {
      class FlakyEngine extends FakeEngine {
        failNext = true;
        override async process(frame: Float32Array): Promise<number> {
          if (this.failNext) {
            this.failNext = false;
            throw new Error('inference exploded');
          }
          return super.process(frame);
        }
      }

      const engine = new FlakyEngine();
      engine.probabilities = [0.9];
      const logger = new Logger('VADProcessorTest', { enabled: false });
      const warn = jest.spyOn(logger, 'warn');
      const processor = new VADProcessor(
        engine,
        { threshold: 0.5, minSpeechDurationMs: 64, silenceDurationMs: 64 },
        logger
      );
      processor.configure(LINEAR16_16K);

      processor.push(pcmChunk(512)); // fails
      await processor.flush();
      expect(warn).toHaveBeenCalled();

      // Without clearing the buffer the failed frame would sit at the head
      // forever and this chunk would produce nothing.
      processor.push(pcmChunk(512));
      await processor.flush();

      expect(engine.processedFrames).toHaveLength(1);
    });

    it('bounds the input backlog when inference falls behind', async () => {
      // Park the first frame so the queue builds up behind it.
      let release!: () => void;
      const parked = new Promise<void>((resolve) => {
        release = resolve;
      });

      class StalledEngine extends FakeEngine {
        calls = 0;
        override async process(frame: Float32Array): Promise<number> {
          this.calls++;
          if (this.calls === 1) await parked;
          return super.process(frame);
        }
      }

      const engine = new StalledEngine();
      const logger = new Logger('VADProcessorTest', { enabled: false });
      const warn = jest.spyOn(logger, 'warn');
      const processor = new VADProcessor(engine, { threshold: 0.5 }, logger);
      processor.configure(LINEAR16_16K);

      // 16384 samples = 32768 bytes = 32 frames per chunk.
      const CHUNK_FRAMES = 32;
      const CHUNKS = 13;
      for (let i = 0; i < CHUNKS; i++) processor.push(pcmChunk(16384));
      await Promise.resolve();

      release();
      await processor.flush();

      expect(warn).toHaveBeenCalledWith(expect.stringContaining('input backlog exceeded'));
      // Oldest chunks were dropped rather than retained for the whole call.
      expect(engine.processedFrames.length).toBeLessThan(CHUNKS * CHUNK_FRAMES);
      // …but the newest audio still got scored.
      expect(engine.processedFrames.length).toBeGreaterThan(0);
    });
  });
});
