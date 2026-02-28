/**
 * Tests for AudioHeaderCache — accumulates stream bytes, detects format, caches header.
 */

import { AudioHeaderCache } from '../../../../src/core/pipeline/AudioHeaderCache';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates an ArrayBuffer from a Uint8Array of bytes. */
function buf(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

/** Creates a valid WAV header (≥44 bytes) as an ArrayBuffer. */
function makeWavBuffer(totalSize: number = 100): ArrayBuffer {
  const arr = new Uint8Array(totalSize);
  // "RIFF"
  [0x52, 0x49, 0x46, 0x46].forEach((b, i) => { arr[i] = b; });
  // file size (little-endian, arbitrary)
  arr[4] = (totalSize - 8) & 0xff;
  // "WAVE"
  [0x57, 0x41, 0x56, 0x45].forEach((b, i) => { arr[8 + i] = b; });
  // "fmt " sub-chunk
  [0x66, 0x6d, 0x74, 0x20].forEach((b, i) => { arr[12 + i] = b; });
  // fmt chunk size = 16 (PCM)
  arr[16] = 16;
  // audio format = 1 (PCM)
  arr[20] = 1;
  // channels = 1
  arr[22] = 1;
  // sample rate = 16000 (little-endian: 0x3E80)
  arr[24] = 0x80; arr[25] = 0x3e;
  // "data" sub-chunk header at offset 36
  [0x64, 0x61, 0x74, 0x61].forEach((b, i) => { arr[36 + i] = b; });
  return arr.buffer;
}

/** Creates an OGG-like buffer with two OggS markers. */
function makeOggBuffer(): ArrayBuffer {
  const arr = new Uint8Array(80);
  // First OggS at offset 0
  [0x4f, 0x67, 0x67, 0x53].forEach((b, i) => { arr[i] = b; });
  // Second OggS at offset 40
  [0x4f, 0x67, 0x67, 0x53].forEach((b, i) => { arr[40 + i] = b; });
  return arr.buffer;
}

// ─── AudioHeaderCache ─────────────────────────────────────────────────────────

describe('AudioHeaderCache', () => {
  let cache: AudioHeaderCache;

  beforeEach(() => {
    cache = new AudioHeaderCache();
  });

  describe('initial state', () => {
    it('starts unresolved', () => {
      expect(cache.isResolved()).toBe(false);
    });

    it('getHeader() returns null before resolution', () => {
      expect(cache.getHeader()).toBeNull();
    });

    it('getFormat() returns null before resolution', () => {
      expect(cache.getFormat()).toBeNull();
    });
  });

  describe('accumulation phase', () => {
    it('does not resolve with fewer than MIN_SNIFF_BYTES', () => {
      // Feed 6 bytes, then 5 bytes = 11 total (one less than needed)
      cache.process(buf(0x52, 0x49, 0x46, 0x46, 0x00, 0x00));
      expect(cache.isResolved()).toBe(false);
      expect(cache.getHeader()).toBeNull();

      cache.process(buf(0x00, 0x00, 0x57, 0x41, 0x56));
      expect(cache.isResolved()).toBe(false);
    });

    it('resolves once MIN_SNIFF_BYTES are accumulated across multiple chunks', () => {
      // Feed WAV magic bytes split across 3 chunks
      cache.process(buf(0x52, 0x49, 0x46, 0x46)); // "RIFF" (4 bytes)
      expect(cache.isResolved()).toBe(false);

      cache.process(buf(0x00, 0x00, 0x00, 0x00)); // size (8 total)
      expect(cache.isResolved()).toBe(false);

      cache.process(buf(0x57, 0x41, 0x56, 0x45)); // "WAVE" (12 total)
      expect(cache.isResolved()).toBe(true);
      expect(cache.getFormat()).toBe('wav');
    });
  });

  describe('WAV detection and header caching', () => {
    it('caches the 44-byte WAV header', () => {
      const wavBuffer = makeWavBuffer(100);
      cache.process(wavBuffer);

      expect(cache.isResolved()).toBe(true);
      expect(cache.getFormat()).toBe('wav');
      expect(cache.getHeader()).not.toBeNull();
      expect(cache.getHeader()!.byteLength).toBe(44);
    });
  });

  describe('OGG detection and header caching', () => {
    it('caches the first OGG page', () => {
      const oggBuffer = makeOggBuffer();
      cache.process(oggBuffer);

      expect(cache.isResolved()).toBe(true);
      expect(cache.getFormat()).toBe('ogg');
      expect(cache.getHeader()).not.toBeNull();
      expect(cache.getHeader()!.byteLength).toBe(40); // up to second OggS
    });
  });

  describe('PCM / unknown format', () => {
    it('resolves with null format and null header for raw PCM', () => {
      const pcmData = new ArrayBuffer(64); // all zeros — no magic bytes
      cache.process(pcmData);

      expect(cache.isResolved()).toBe(true);
      expect(cache.getFormat()).toBeNull();
      expect(cache.getHeader()).toBeNull();
    });
  });

  describe('stream formats (no extractable header)', () => {
    it('detects MP3 but returns null header', () => {
      const mp3Buffer = buf(
        0x49, 0x44, 0x33, // ID3
        0x04, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
      );
      cache.process(mp3Buffer);

      expect(cache.isResolved()).toBe(true);
      expect(cache.getFormat()).toBe('mp3');
      expect(cache.getHeader()).toBeNull();
    });
  });

  describe('post-resolution no-op', () => {
    it('ignores additional chunks after resolution', () => {
      const wavBuffer = makeWavBuffer(100);
      cache.process(wavBuffer);
      expect(cache.isResolved()).toBe(true);

      // Process more data — should be a no-op
      const oggBuffer = makeOggBuffer();
      cache.process(oggBuffer);

      // Still reports WAV, not OGG
      expect(cache.getFormat()).toBe('wav');
    });
  });

  describe('reset()', () => {
    it('clears all state and returns to accumulation phase', () => {
      const wavBuffer = makeWavBuffer(100);
      cache.process(wavBuffer);
      expect(cache.isResolved()).toBe(true);
      expect(cache.getFormat()).toBe('wav');
      expect(cache.getHeader()).not.toBeNull();

      cache.reset();

      expect(cache.isResolved()).toBe(false);
      expect(cache.getFormat()).toBeNull();
      expect(cache.getHeader()).toBeNull();
    });

    it('allows re-detection after reset', () => {
      // First stream: WAV
      cache.process(makeWavBuffer(100));
      expect(cache.getFormat()).toBe('wav');

      cache.reset();

      // Second stream: OGG
      cache.process(makeOggBuffer());
      expect(cache.getFormat()).toBe('ogg');
    });
  });

  describe('single-byte accumulation edge case', () => {
    it('correctly accumulates and detects when fed one byte at a time', () => {
      // Feed FLAC magic bytes one at a time
      const flacBytes = [
        0x66, 0x4c, 0x61, 0x43, // "fLaC"
        0x00, 0x00, 0x00, 0x22, // STREAMINFO block header (length=34)
        0x00, 0x00, 0x00, 0x00, // padding to reach 12 bytes
      ];

      for (let i = 0; i < flacBytes.length - 1; i++) {
        cache.process(buf(flacBytes[i]!));
        expect(cache.isResolved()).toBe(false);
      }

      cache.process(buf(flacBytes[flacBytes.length - 1]!));
      expect(cache.isResolved()).toBe(true);
      expect(cache.getFormat()).toBe('flac');
    });
  });
});
