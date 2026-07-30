/**
 * Tests for G.711 mu-law and A-law codec utilities.
 *
 * Known-value vectors follow the ITU-T G.711 companding tables as
 * implemented by the Sun Microsystems reference code (SoX, FFmpeg,
 * alawmulaw all match these values).
 */

import {
  encodeMulawSample,
  decodeMulawSample,
  encodeMulaw,
  decodeMulaw,
  encodeAlawSample,
  decodeAlawSample,
  encodeAlaw,
  decodeAlaw,
} from '../../../src/utils/g711';

describe('g711', () => {
  describe('mu-law known vectors', () => {
    it('encodes positive zero to 0xFF', () => {
      expect(encodeMulawSample(0)).toBe(0xff);
    });

    it('encodes maximum positive to 0x80', () => {
      expect(encodeMulawSample(32767)).toBe(0x80);
    });

    it('encodes maximum negative to 0x00', () => {
      expect(encodeMulawSample(-32768)).toBe(0x00);
    });

    it('decodes 0xFF to 0', () => {
      expect(decodeMulawSample(0xff)).toBe(0);
    });

    it('decodes 0x80 to the maximum positive step (32124)', () => {
      expect(decodeMulawSample(0x80)).toBe(32124);
    });

    it('decodes 0x00 to the maximum negative step (-32124)', () => {
      expect(decodeMulawSample(0x00)).toBe(-32124);
    });

    it('decodes 0x7F to negative zero region (0)', () => {
      expect(decodeMulawSample(0x7f)).toBe(-0);
    });
  });

  describe('mu-law round trip', () => {
    it('re-encodes every decoded byte value to itself', () => {
      // decode -> encode must be the identity for all 256 code words
      // (modulo the two zero representations 0xFF / 0x7F).
      for (let byte = 0; byte < 256; byte++) {
        const pcm = decodeMulawSample(byte);
        const reencoded = encodeMulawSample(pcm);
        if (byte === 0x7f) {
          // -0 encodes as +0 (0xFF); both decode to 0.
          expect(reencoded).toBe(0xff);
        } else {
          expect(reencoded).toBe(byte);
        }
      }
    });

    it('round trips arbitrary samples within quantization error', () => {
      const samples = [-30000, -12345, -1000, -33, 0, 33, 1000, 12345, 30000];
      for (const s of samples) {
        const decoded = decodeMulawSample(encodeMulawSample(s));
        // mu-law quantization error grows with magnitude; 3% + 8 covers all segments
        expect(Math.abs(decoded - s)).toBeLessThanOrEqual(Math.abs(s) * 0.03 + 8);
      }
    });

    it('clamps out-of-range input', () => {
      expect(encodeMulawSample(40000)).toBe(0x80);
      expect(encodeMulawSample(-40000)).toBe(0x00);
    });
  });

  describe('A-law known vectors', () => {
    it('encodes zero to 0xD5', () => {
      expect(encodeAlawSample(0)).toBe(0xd5);
    });

    it('encodes maximum positive to 0xAA', () => {
      expect(encodeAlawSample(32767)).toBe(0xaa);
    });

    it('encodes maximum negative to 0x2A', () => {
      expect(encodeAlawSample(-32768)).toBe(0x2a);
    });

    it('decodes 0xD5 to +8 (A-law has no exact zero)', () => {
      expect(decodeAlawSample(0xd5)).toBe(8);
    });

    it('decodes 0xAA to the maximum positive step (32256)', () => {
      expect(decodeAlawSample(0xaa)).toBe(32256);
    });

    it('decodes 0x2A to the maximum negative step (-32256)', () => {
      expect(decodeAlawSample(0x2a)).toBe(-32256);
    });
  });

  describe('A-law round trip', () => {
    it('re-encodes every decoded byte value to itself', () => {
      for (let byte = 0; byte < 256; byte++) {
        const pcm = decodeAlawSample(byte);
        expect(encodeAlawSample(pcm)).toBe(byte);
      }
    });

    it('round trips arbitrary samples within quantization error', () => {
      const samples = [-30000, -12345, -1000, -100, 0, 100, 1000, 12345, 30000];
      for (const s of samples) {
        const decoded = decodeAlawSample(encodeAlawSample(s));
        // A-law is 13-bit: error bounded by ~6% in the lowest segment + step size
        expect(Math.abs(decoded - s)).toBeLessThanOrEqual(Math.abs(s) * 0.07 + 16);
      }
    });
  });

  describe('array helpers', () => {
    it('encodeMulaw/decodeMulaw operate element-wise', () => {
      const pcm = new Int16Array([0, 1000, -1000, 32767, -32768]);
      const encoded = encodeMulaw(pcm);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBe(pcm.length);
      expect(encoded[0]).toBe(0xff);
      expect(encoded[3]).toBe(0x80);
      expect(encoded[4]).toBe(0x00);

      const decoded = decodeMulaw(encoded);
      expect(decoded).toBeInstanceOf(Int16Array);
      expect(decoded.length).toBe(pcm.length);
      expect(decoded[0]).toBe(0);
    });

    it('encodeAlaw/decodeAlaw operate element-wise', () => {
      const pcm = new Int16Array([0, 500, -500, 32767, -32768]);
      const encoded = encodeAlaw(pcm);
      expect(encoded.length).toBe(pcm.length);
      expect(encoded[0]).toBe(0xd5);

      const decoded = decodeAlaw(encoded);
      expect(decoded.length).toBe(pcm.length);
      for (let i = 0; i < pcm.length; i++) {
        expect(Math.abs((decoded[i] as number) - (pcm[i] as number))).toBeLessThanOrEqual(
          Math.abs(pcm[i] as number) * 0.07 + 16
        );
      }
    });

    it('handles empty arrays', () => {
      expect(encodeMulaw(new Int16Array(0)).length).toBe(0);
      expect(decodeMulaw(new Uint8Array(0)).length).toBe(0);
      expect(encodeAlaw(new Int16Array(0)).length).toBe(0);
      expect(decodeAlaw(new Uint8Array(0)).length).toBe(0);
    });

    it('mu-law silence byte is 0xFF for a zero buffer (Twilio silence)', () => {
      const silence = encodeMulaw(new Int16Array(160)); // 20ms at 8kHz
      expect(silence.every((b) => b === 0xff)).toBe(true);
    });
  });
});
