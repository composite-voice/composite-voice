/**
 * Audio utilities tests
 */

import {
  floatTo16BitPCM,
  int16ToFloat,
  concatenateArrayBuffers,
  downsampleAudio,
  calculateRMS,
  isSilent,
} from '../../../src/utils/audio';

describe('Audio Utilities', () => {
  describe('floatTo16BitPCM', () => {
    it('should convert Float32Array to Int16Array', () => {
      const input = new Float32Array([0, 0.5, -0.5, 1, -1]);
      const output = floatTo16BitPCM(input);

      expect(output).toBeInstanceOf(Int16Array);
      expect(output.length).toBe(input.length);
      expect(output[0]).toBe(0);
      expect(output[3]).toBe(32767); // Max positive
      expect(output[4]).toBe(-32768); // Max negative
    });

    it('should clamp values outside [-1, 1] range', () => {
      const input = new Float32Array([1.5, -1.5]);
      const output = floatTo16BitPCM(input);

      expect(output[0]).toBe(32767); // Clamped to 1
      expect(output[1]).toBe(-32768); // Clamped to -1
    });
  });

  describe('int16ToFloat', () => {
    it('should convert Int16Array to Float32Array', () => {
      const input = new Int16Array([0, 16383, -16384, 32767, -32768]);
      const output = int16ToFloat(input);

      expect(output).toBeInstanceOf(Float32Array);
      expect(output.length).toBe(input.length);
      expect(output[0]).toBeCloseTo(0);
      expect(output[3]).toBeCloseTo(1, 2);
      expect(output[4]).toBeCloseTo(-1, 2);
    });
  });

  describe('concatenateArrayBuffers', () => {
    it('should concatenate multiple array buffers', () => {
      const buf1 = new Uint8Array([1, 2, 3]).buffer;
      const buf2 = new Uint8Array([4, 5]).buffer;
      const buf3 = new Uint8Array([6, 7, 8, 9]).buffer;

      const result = concatenateArrayBuffers([buf1, buf2, buf3]);
      const resultArray = new Uint8Array(result);

      expect(result.byteLength).toBe(9);
      expect(Array.from(resultArray)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });

    it('should handle empty array', () => {
      const result = concatenateArrayBuffers([]);
      expect(result.byteLength).toBe(0);
    });
  });

  describe('downsampleAudio', () => {
    it('should downsample audio data', () => {
      const input = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const output = downsampleAudio(input, 8000, 4000);

      expect(output.length).toBeLessThan(input.length);
      expect(output).toBeInstanceOf(Float32Array);
    });

    it('should return same data if sample rates match', () => {
      const input = new Float32Array([1, 2, 3, 4]);
      const output = downsampleAudio(input, 8000, 8000);

      expect(output).toBe(input);
    });
  });

  describe('calculateRMS', () => {
    it('should calculate root mean square', () => {
      const samples = new Float32Array([0.5, -0.5, 0.3, -0.3]);
      const rms = calculateRMS(samples);

      expect(rms).toBeGreaterThan(0);
      expect(rms).toBeLessThan(1);
    });

    it('should return 0 for silent audio', () => {
      const samples = new Float32Array([0, 0, 0, 0]);
      const rms = calculateRMS(samples);

      expect(rms).toBe(0);
    });
  });

  describe('isSilent', () => {
    it('should detect silence', () => {
      const silentSamples = new Float32Array([0.001, -0.001, 0.002]);
      expect(isSilent(silentSamples, 0.01)).toBe(true);
    });

    it('should detect non-silence', () => {
      const loudSamples = new Float32Array([0.5, -0.5, 0.3]);
      expect(isSilent(loudSamples, 0.01)).toBe(false);
    });
  });
});
