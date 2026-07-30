/**
 * Tests for the linear-interpolation resampler.
 */

import { resamplePcm } from '../../../src/utils/audio';

describe('resamplePcm', () => {
  it('returns the same buffer when rates match', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    expect(resamplePcm(input, 16000, 16000)).toBe(input);
  });

  it('downsamples 2:1 to half the length', () => {
    const input = new Float32Array(480); // 10ms at 48kHz
    const output = resamplePcm(input, 48000, 24000);
    expect(output.length).toBe(240);
  });

  it('upsamples 1:2 to double the length', () => {
    const input = new Float32Array(240); // 10ms at 24kHz
    const output = resamplePcm(input, 24000, 48000);
    expect(output.length).toBe(480);
  });

  it('upsamples 16k to 48k (3x)', () => {
    const input = new Float32Array(160);
    expect(resamplePcm(input, 16000, 48000).length).toBe(480);
  });

  it('interpolates linearly between neighbouring samples', () => {
    const input = new Float32Array([0, 1]);
    const output = resamplePcm(input, 8000, 16000);
    expect(output.length).toBe(4);
    expect(output[0]).toBeCloseTo(0, 5);
    expect(output[1]).toBeCloseTo(0.5, 5);
    expect(output[2]).toBeCloseTo(1, 5); // clamped at the last sample
  });

  it('preserves a constant (DC) signal', () => {
    const input = new Float32Array(100).fill(0.5);
    const output = resamplePcm(input, 24000, 16000);
    for (const v of output) {
      expect(v).toBeCloseTo(0.5, 5);
    }
  });

  it('roughly preserves a sine wave through a round trip', () => {
    const rate = 16000;
    const input = new Float32Array(rate / 100); // 10ms
    for (let i = 0; i < input.length; i++) {
      input[i] = Math.sin((2 * Math.PI * 440 * i) / rate);
    }
    const up = resamplePcm(input, rate, 48000);
    const down = resamplePcm(up, 48000, rate);
    expect(down.length).toBe(input.length);
    for (let i = 0; i < input.length - 1; i++) {
      expect(Math.abs((down[i] as number) - (input[i] as number))).toBeLessThan(0.05);
    }
  });

  it('handles an empty buffer', () => {
    const output = resamplePcm(new Float32Array(0), 48000, 16000);
    expect(output.length).toBe(1); // minimum length guard, silent sample
    expect(output[0]).toBe(0);
  });
});
