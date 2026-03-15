/**
 * Tests for AudioRouter — audio buffer queue and header cache collaborator.
 */

import { AudioRouter } from '../../../../src/core/collaborators/AudioRouter';
import { AudioBufferQueue } from '../../../../src/core/pipeline/AudioBufferQueue';
import { AudioHeaderCache } from '../../../../src/core/pipeline/AudioHeaderCache';
import type { AudioChunk } from '../../../../src/core/types/audio';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeChunk(sequence: number): AudioChunk {
  return {
    data: new Uint8Array([sequence & 0xff]).buffer as ArrayBuffer,
    timestamp: Date.now(),
    sequence,
  };
}

describe('AudioRouter', () => {
  describe('constructor', () => {
    it('creates inputQueue and outputQueue', () => {
      const router = new AudioRouter();
      expect(router.inputQueue).toBeInstanceOf(AudioBufferQueue);
      expect(router.outputQueue).toBeInstanceOf(AudioBufferQueue);
    });

    it('inputQueue and outputQueue are AudioBufferQueue instances', () => {
      const router = new AudioRouter();

      // Verify they function as queues
      router.inputQueue.enqueue(makeChunk(1));
      expect(router.inputQueue.size).toBe(1);

      router.outputQueue.enqueue(makeChunk(2));
      expect(router.outputQueue.size).toBe(1);
    });

    it('headerCache is an AudioHeaderCache instance', () => {
      const router = new AudioRouter();
      expect(router.headerCache).toBeInstanceOf(AudioHeaderCache);
    });

    it('applies default config (name, maxSize, overflowStrategy)', () => {
      const router = new AudioRouter();

      const inputStats = router.inputQueue.getStats();
      expect(inputStats.name).toBe('input');

      const outputStats = router.outputQueue.getStats();
      expect(outputStats.name).toBe('output');
    });

    it('accepts custom config overrides for input queue', () => {
      const router = new AudioRouter({ maxSize: 50 });

      // Fill beyond default 50 — drop-oldest should keep size at 50
      for (let i = 0; i < 60; i++) {
        router.inputQueue.enqueue(makeChunk(i));
      }
      expect(router.inputQueue.size).toBe(50);
    });

    it('accepts custom config overrides for output queue', () => {
      const router = new AudioRouter(undefined, { maxSize: 10 });

      for (let i = 0; i < 15; i++) {
        router.outputQueue.enqueue(makeChunk(i));
      }
      expect(router.outputQueue.size).toBe(10);
    });
  });

  describe('stopAndClear', () => {
    it('clears both queues', () => {
      const router = new AudioRouter();

      router.inputQueue.enqueue(makeChunk(1));
      router.inputQueue.enqueue(makeChunk(2));
      router.outputQueue.enqueue(makeChunk(3));

      expect(router.inputQueue.size).toBe(2);
      expect(router.outputQueue.size).toBe(1);

      router.stopAndClear();

      expect(router.inputQueue.size).toBe(0);
      expect(router.outputQueue.size).toBe(0);
    });
  });

  describe('resetHeaderCache', () => {
    it('resets the header cache', () => {
      const router = new AudioRouter();

      // Process enough bytes to resolve the header cache
      const wavHeader = new Uint8Array(44);
      // RIFF magic bytes
      wavHeader[0] = 0x52; // R
      wavHeader[1] = 0x49; // I
      wavHeader[2] = 0x46; // F
      wavHeader[3] = 0x46; // F
      // File size placeholder
      wavHeader[4] = 0x00;
      wavHeader[5] = 0x00;
      wavHeader[6] = 0x00;
      wavHeader[7] = 0x00;
      // WAVE
      wavHeader[8] = 0x57;  // W
      wavHeader[9] = 0x41;  // A
      wavHeader[10] = 0x56; // V
      wavHeader[11] = 0x45; // E

      router.headerCache.process(wavHeader.buffer as ArrayBuffer);
      expect(router.headerCache.isResolved()).toBe(true);

      router.resetHeaderCache();
      expect(router.headerCache.isResolved()).toBe(false);
    });
  });
});
