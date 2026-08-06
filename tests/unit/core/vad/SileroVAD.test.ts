/**
 * Tests for SileroVAD — the ONNX-backed VAD engine.
 *
 * Uses a fake ONNX Runtime injected via the `ort` option, covering both
 * Silero model generations (v5 "state" and v4 "h"/"c" signatures).
 */

import { SileroVAD, DEFAULT_SILERO_MODEL_URL } from '../../../../src/core/vad/SileroVAD';
import type { OrtLike, OrtTensorLike } from '../../../../src/core/vad/SileroVAD';

class FakeTensor implements OrtTensorLike {
  constructor(
    public type: string,
    public data: Float32Array | BigInt64Array,
    public dims: number[]
  ) {}
}

interface FakeOrt {
  ort: OrtLike;
  createCalls: Array<string | Uint8Array>;
  runFeeds: Array<Record<string, FakeTensor>>;
  release: jest.Mock;
}

function makeFakeOrt(version: 'v4' | 'v5', probabilities: number[]): FakeOrt {
  let call = 0;
  const runFeeds: Array<Record<string, FakeTensor>> = [];
  const createCalls: Array<string | Uint8Array> = [];
  const release = jest.fn();

  const session = {
    inputNames: version === 'v5' ? ['input', 'state', 'sr'] : ['input', 'h', 'c', 'sr'],
    run: async (feeds: Record<string, OrtTensorLike>) => {
      runFeeds.push(feeds as Record<string, FakeTensor>);
      const p = probabilities[Math.min(call, probabilities.length - 1)] ?? 0;
      call++;
      if (version === 'v5') {
        return {
          output: { data: [p] },
          stateN: { data: new Float32Array(2 * 1 * 128).fill(call) },
        };
      }
      return {
        output: { data: [p] },
        hn: { data: new Float32Array(2 * 1 * 64).fill(call) },
        cn: { data: new Float32Array(2 * 1 * 64).fill(call) },
      };
    },
    release,
  };

  const ort: OrtLike = {
    Tensor: FakeTensor as unknown as OrtLike['Tensor'],
    InferenceSession: {
      create: async (pathOrBuffer: string | Uint8Array) => {
        createCalls.push(pathOrBuffer);
        return session;
      },
    },
  };

  return { ort, createCalls, runFeeds, release };
}

function frameOf(value: number): Float32Array {
  return new Float32Array(512).fill(value);
}

describe('SileroVAD', () => {
  it('exposes the Silero frame contract', () => {
    const vad = new SileroVAD();
    expect(vad.frameSamples).toBe(512);
    expect(vad.sampleRate).toBe(16000);
  });

  it('loads the default model URL when none is configured', async () => {
    const fake = makeFakeOrt('v5', [0.5]);
    const vad = new SileroVAD({ ort: fake.ort });
    await vad.initialize();

    expect(fake.createCalls).toEqual([DEFAULT_SILERO_MODEL_URL]);
  });

  it('loads a configured model URL', async () => {
    const fake = makeFakeOrt('v5', [0.5]);
    const vad = new SileroVAD({ ort: fake.ort, modelUrl: '/models/custom.onnx' });
    await vad.initialize();

    expect(fake.createCalls).toEqual(['/models/custom.onnx']);
  });

  describe('v5 models', () => {
    it('feeds context-prefixed input, state, and sample rate', async () => {
      const fake = makeFakeOrt('v5', [0.9]);
      const vad = new SileroVAD({ ort: fake.ort });
      await vad.initialize();

      const probability = await vad.process(frameOf(0.25));

      expect(probability).toBe(0.9);
      const feeds = fake.runFeeds[0]!;
      expect(feeds.input!.dims).toEqual([1, 576]); // 64 context + 512 frame
      expect(feeds.state!.dims).toEqual([2, 1, 128]);
      expect(feeds.sr!.type).toBe('int64');
      // First frame — context is silence
      expect((feeds.input!.data as Float32Array)[0]).toBe(0);
      expect((feeds.input!.data as Float32Array)[64]).toBeCloseTo(0.25);
    });

    it('carries the previous frame tail as context for the next frame', async () => {
      const fake = makeFakeOrt('v5', [0.5, 0.5]);
      const vad = new SileroVAD({ ort: fake.ort });
      await vad.initialize();

      await vad.process(frameOf(0.25));
      await vad.process(frameOf(0.75));

      const secondFeeds = fake.runFeeds[1]!;
      const input = secondFeeds.input!.data as Float32Array;
      // Context (first 64 samples) comes from the previous 0.25 frame
      expect(input[0]).toBeCloseTo(0.25);
      expect(input[64]).toBeCloseTo(0.75);
    });

    it('carries recurrent state between frames and clears it on reset', async () => {
      const fake = makeFakeOrt('v5', [0.5, 0.5, 0.5]);
      const vad = new SileroVAD({ ort: fake.ort });
      await vad.initialize();

      await vad.process(frameOf(0.1));
      await vad.process(frameOf(0.1));
      // Second run received the state produced by the first (filled with 1)
      expect((fake.runFeeds[1]!.state!.data as Float32Array)[0]).toBe(1);

      vad.reset();
      await vad.process(frameOf(0.1));
      expect((fake.runFeeds[2]!.state!.data as Float32Array)[0]).toBe(0);
    });
  });

  describe('v4 / legacy models', () => {
    it('detects the h/c signature and feeds both state tensors', async () => {
      const fake = makeFakeOrt('v4', [0.8]);
      const vad = new SileroVAD({ ort: fake.ort });
      await vad.initialize();

      const probability = await vad.process(frameOf(0.5));

      expect(probability).toBe(0.8);
      const feeds = fake.runFeeds[0]!;
      expect(feeds.input!.dims).toEqual([1, 512]);
      expect(feeds.h!.dims).toEqual([2, 1, 64]);
      expect(feeds.c!.dims).toEqual([2, 1, 64]);
    });

    it('carries hn/cn into the next frame', async () => {
      const fake = makeFakeOrt('v4', [0.5, 0.5]);
      const vad = new SileroVAD({ ort: fake.ort });
      await vad.initialize();

      await vad.process(frameOf(0.1));
      await vad.process(frameOf(0.1));

      expect((fake.runFeeds[1]!.h!.data as Float32Array)[0]).toBe(1);
      expect((fake.runFeeds[1]!.c!.data as Float32Array)[0]).toBe(1);
    });
  });

  describe('error handling', () => {
    it('rejects models with an unrecognized input signature', async () => {
      const fake = makeFakeOrt('v5', [0.5]);
      const brokenOrt: OrtLike = {
        ...fake.ort,
        InferenceSession: {
          create: async () => ({
            inputNames: ['weird_input'],
            run: async () => ({}),
          }),
        },
      };
      const vad = new SileroVAD({ ort: brokenOrt });

      await expect(vad.initialize()).rejects.toThrow(/unrecognized model input signature/);
    });

    it('releases a rejected session and stays uninitialized', async () => {
      const release = jest.fn(async () => {});
      const fake = makeFakeOrt('v5', [0.5]);
      const brokenOrt: OrtLike = {
        ...fake.ort,
        InferenceSession: {
          create: async () => ({
            inputNames: ['weird_input'],
            run: async () => ({}),
            release,
          }),
        },
      };
      const vad = new SileroVAD({ ort: brokenOrt });

      await expect(vad.initialize()).rejects.toThrow(/unrecognized model input signature/);
      expect(release).toHaveBeenCalled();

      // The bad session must not have been cached — a retry has to fail the
      // same way rather than short-circuit on it.
      await expect(vad.initialize()).rejects.toThrow(/unrecognized model input signature/);
      await expect(vad.process(frameOf(0))).rejects.toThrow(/not initialized/);
    });

    it('rejects frames of the wrong size', async () => {
      const fake = makeFakeOrt('v5', [0.5]);
      const vad = new SileroVAD({ ort: fake.ort });
      await vad.initialize();

      await expect(vad.process(new Float32Array(100))).rejects.toThrow(/512-sample/);
    });

    it('rejects process() before initialize()', async () => {
      const vad = new SileroVAD({ ort: makeFakeOrt('v5', [0.5]).ort });
      await expect(vad.process(frameOf(0))).rejects.toThrow(/not initialized/);
    });

    it('clamps probabilities into [0, 1]', async () => {
      const fake = makeFakeOrt('v5', [1.7]);
      const vad = new SileroVAD({ ort: fake.ort });
      await vad.initialize();

      expect(await vad.process(frameOf(0))).toBe(1);
    });
  });

  it('discards recurrent state from an inference that reset() interrupted', async () => {
    // Park the run so reset() lands between the frame going in and the new
    // state coming back.
    let release!: () => void;
    const parked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runFeeds: Array<Record<string, FakeTensor>> = [];
    let call = 0;

    const ort: OrtLike = {
      Tensor: FakeTensor as unknown as OrtLike['Tensor'],
      InferenceSession: {
        create: async () => ({
          inputNames: ['input', 'state', 'sr'],
          run: async (feeds: Record<string, OrtTensorLike>) => {
            runFeeds.push(feeds as Record<string, FakeTensor>);
            call++;
            if (call === 1) await parked;
            return {
              output: { data: [0.5] },
              stateN: { data: new Float32Array(2 * 1 * 128).fill(7) },
            };
          },
        }),
      },
    };

    const vad = new SileroVAD({ ort });
    await vad.initialize();

    const inFlight = vad.process(frameOf(0.4));
    await Promise.resolve();
    vad.reset();
    release();
    await inFlight;

    // The next frame must start from cleared state and context, not from
    // what the pre-reset inference returned.
    await vad.process(frameOf(0.4));
    const secondFeeds = runFeeds[1]!;
    expect((secondFeeds.state!.data as Float32Array).every((v) => v === 0)).toBe(true);
    expect((secondFeeds.input!.data as Float32Array).slice(0, 64).every((v) => v === 0)).toBe(true);
  });

  it('releases the session on dispose', async () => {
    const fake = makeFakeOrt('v5', [0.5]);
    const vad = new SileroVAD({ ort: fake.ort });
    await vad.initialize();

    await vad.dispose();

    expect(fake.release).toHaveBeenCalled();
    await expect(vad.process(frameOf(0))).rejects.toThrow(/not initialized/);
  });
});
