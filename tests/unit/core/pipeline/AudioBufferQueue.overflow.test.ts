/**
 * Overflow and stress tests for AudioBufferQueue.
 *
 * Covers sustained overflow, rapid cycling, stats accuracy,
 * overflow callbacks, and mode transition sequences.
 */

import { AudioBufferQueue } from '../../../../src/core/pipeline/AudioBufferQueue';
import type { AudioChunk } from '../../../../src/core/types/audio';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChunk(sequence: number, timestampOffset = 0): AudioChunk {
  return {
    data: new Uint8Array([sequence & 0xff]).buffer as ArrayBuffer,
    timestamp: Date.now() - timestampOffset,
    sequence,
  };
}

function defaultConfig(
  overrides: Partial<{
    name: string;
    maxSize: number;
    overflowStrategy: 'drop-oldest' | 'drop-newest' | 'block';
  }> = {}
) {
  return {
    name: overrides.name ?? 'test-queue',
    maxSize: overrides.maxSize ?? 5,
    overflowStrategy: overrides.overflowStrategy ?? ('drop-oldest' as const),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AudioBufferQueue — overflow stress', () => {
  describe('drop-oldest under sustained load', () => {
    it('retains only the newest maxSize chunks when enqueuing 2x maxSize', () => {
      const maxSize = 10;
      const queue = new AudioBufferQueue(defaultConfig({ maxSize }));

      // Enqueue 2x the capacity
      for (let i = 0; i < maxSize * 2; i++) {
        queue.enqueue(makeChunk(i));
      }

      expect(queue.size).toBe(maxSize);

      // Drain and verify only the newest half remains
      const drained: number[] = [];
      queue.startDraining((chunk) => drained.push(chunk.sequence!));

      expect(drained).toHaveLength(maxSize);
      // Should be [10, 11, 12, ..., 19]
      for (let i = 0; i < maxSize; i++) {
        expect(drained[i]).toBe(maxSize + i);
      }
    });

    it('tracks correct totalDropped for sustained overflow', () => {
      const maxSize = 5;
      const total = 50;
      const queue = new AudioBufferQueue(defaultConfig({ maxSize }));

      for (let i = 0; i < total; i++) {
        queue.enqueue(makeChunk(i));
      }

      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(total);
      expect(stats.totalDropped).toBe(total - maxSize);
      expect(stats.size).toBe(maxSize);
    });
  });

  describe('drop-newest under sustained load', () => {
    it('retains only the oldest maxSize chunks when enqueuing 2x maxSize', () => {
      const maxSize = 10;
      const queue = new AudioBufferQueue(
        defaultConfig({ maxSize, overflowStrategy: 'drop-newest' })
      );

      for (let i = 0; i < maxSize * 2; i++) {
        queue.enqueue(makeChunk(i));
      }

      expect(queue.size).toBe(maxSize);

      // Drain and verify only the oldest half remains
      const drained: number[] = [];
      queue.startDraining((chunk) => drained.push(chunk.sequence!));

      expect(drained).toHaveLength(maxSize);
      // Should be [0, 1, 2, ..., 9]
      for (let i = 0; i < maxSize; i++) {
        expect(drained[i]).toBe(i);
      }
    });

    it('tracks correct totalDropped for sustained overflow', () => {
      const maxSize = 5;
      const total = 50;
      const queue = new AudioBufferQueue(
        defaultConfig({ maxSize, overflowStrategy: 'drop-newest' })
      );

      for (let i = 0; i < total; i++) {
        queue.enqueue(makeChunk(i));
      }

      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(total);
      expect(stats.totalDropped).toBe(total - maxSize);
      expect(stats.size).toBe(maxSize);
    });
  });

  describe('rapid enqueue/drain cycling', () => {
    it('simulates realistic audio streaming with repeated stop/start cycles', () => {
      const maxSize = 100;
      const queue = new AudioBufferQueue(defaultConfig({ maxSize }));
      const allReceived: number[] = [];
      let seq = 0;

      // Cycle 1: buffer some, drain
      for (let i = 0; i < 20; i++) {
        queue.enqueue(makeChunk(seq++));
      }
      queue.startDraining((chunk) => allReceived.push(chunk.sequence!));
      // First 20 chunks flushed

      // Pass-through mode: enqueue 10 more directly
      for (let i = 0; i < 10; i++) {
        queue.enqueue(makeChunk(seq++));
      }

      // Cycle 2: stop draining, buffer, drain again
      queue.stopDraining();
      for (let i = 0; i < 15; i++) {
        queue.enqueue(makeChunk(seq++));
      }
      queue.startDraining((chunk) => allReceived.push(chunk.sequence!));

      // Cycle 3: stop, buffer, drain
      queue.stopDraining();
      for (let i = 0; i < 5; i++) {
        queue.enqueue(makeChunk(seq++));
      }
      queue.startDraining((chunk) => allReceived.push(chunk.sequence!));

      // All 50 chunks should have been received in order
      expect(allReceived).toHaveLength(50);
      for (let i = 0; i < 50; i++) {
        expect(allReceived[i]).toBe(i);
      }
    });

    it('no chunks are lost during rapid cycling without overflow', () => {
      const maxSize = 1000;
      const queue = new AudioBufferQueue(defaultConfig({ maxSize }));
      const received: number[] = [];
      let seq = 0;
      const cycles = 20;
      const chunksPerCycle = 10;

      for (let c = 0; c < cycles; c++) {
        // Buffer phase
        for (let i = 0; i < chunksPerCycle; i++) {
          queue.enqueue(makeChunk(seq++));
        }
        // Drain phase
        queue.startDraining((chunk) => received.push(chunk.sequence!));
        // Stop
        queue.stopDraining();
      }

      // Final drain to catch anything buffered in the last stop phase
      queue.startDraining((chunk) => received.push(chunk.sequence!));

      const totalChunks = cycles * chunksPerCycle;
      expect(received).toHaveLength(totalChunks);

      // Verify strict ordering
      for (let i = 0; i < totalChunks; i++) {
        expect(received[i]).toBe(i);
      }
    });
  });

  describe('queue stats accuracy', () => {
    it('totalEnqueued includes both buffered and pass-through chunks', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 100 }));

      // Buffer 5
      for (let i = 0; i < 5; i++) queue.enqueue(makeChunk(i));

      // Drain + pass-through 3
      queue.startDraining(() => {});
      for (let i = 0; i < 3; i++) queue.enqueue(makeChunk(i));

      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(8);
      expect(stats.totalDequeued).toBe(8);
      expect(stats.totalDropped).toBe(0);
    });

    it('totalDequeued counts chunks delivered to drain callback', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 100 }));

      for (let i = 0; i < 10; i++) queue.enqueue(makeChunk(i));

      // Drain only 5 (by stopping and re-draining)
      let count = 0;
      queue.startDraining(() => {
        count++;
      });
      // All 10 flushed synchronously
      expect(count).toBe(10);
      expect(queue.getStats().totalDequeued).toBe(10);
    });

    it('totalDropped is accurate across multiple overflow events', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 3 }));

      // Enqueue 3 (fills to capacity)
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3));

      // Overflow 4 more times
      queue.enqueue(makeChunk(4)); // drops 1
      queue.enqueue(makeChunk(5)); // drops 2
      queue.enqueue(makeChunk(6)); // drops 3
      queue.enqueue(makeChunk(7)); // drops 4

      const stats = queue.getStats();
      expect(stats.totalDropped).toBe(4);
      expect(stats.totalEnqueued).toBe(7);
      expect(stats.size).toBe(3);
    });

    it('stats remain consistent after clear()', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 5 }));

      for (let i = 0; i < 8; i++) queue.enqueue(makeChunk(i)); // 3 dropped

      queue.clear();

      const stats = queue.getStats();
      expect(stats.size).toBe(0);
      expect(stats.totalEnqueued).toBe(8);
      expect(stats.totalDropped).toBe(3);
      // totalDequeued not affected by clear
      expect(stats.totalDequeued).toBe(0);
    });
  });

  describe('overflow callback', () => {
    it('fires on each drop-oldest overflow with correct metadata', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 3 }));
      const overflowCalls: Array<{ dropped: number; size: number }> = [];

      queue.onOverflow((dropped, size) => {
        overflowCalls.push({ dropped, size });
      });

      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3));
      expect(overflowCalls).toHaveLength(0);

      queue.enqueue(makeChunk(4)); // overflow
      expect(overflowCalls).toHaveLength(1);
      expect(overflowCalls[0]).toEqual({ dropped: 1, size: 3 });

      queue.enqueue(makeChunk(5)); // overflow
      expect(overflowCalls).toHaveLength(2);
      expect(overflowCalls[1]).toEqual({ dropped: 1, size: 3 });
    });

    it('fires on each drop-newest overflow with correct metadata', () => {
      const queue = new AudioBufferQueue(
        defaultConfig({ maxSize: 2, overflowStrategy: 'drop-newest' })
      );
      const overflowCalls: Array<{ dropped: number; size: number }> = [];

      queue.onOverflow((dropped, size) => {
        overflowCalls.push({ dropped, size });
      });

      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3)); // dropped

      expect(overflowCalls).toHaveLength(1);
      expect(overflowCalls[0]).toEqual({ dropped: 1, size: 2 });
    });

    it('does not fire when queue is not full', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 100 }));
      const overflowCalls: number[] = [];

      queue.onOverflow((dropped) => overflowCalls.push(dropped));

      for (let i = 0; i < 50; i++) queue.enqueue(makeChunk(i));

      expect(overflowCalls).toHaveLength(0);
    });

    it('does not fire after callback is cleared with null', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 2 }));
      const overflowCalls: number[] = [];

      queue.onOverflow((dropped) => overflowCalls.push(dropped));

      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3)); // fires callback

      expect(overflowCalls).toHaveLength(1);

      queue.onOverflow(null); // clear callback

      queue.enqueue(makeChunk(4)); // should NOT fire
      expect(overflowCalls).toHaveLength(1);
    });

    it('does not fire in draining (pass-through) mode', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 2 }));
      const overflowCalls: number[] = [];

      queue.onOverflow((dropped) => overflowCalls.push(dropped));

      queue.startDraining(() => {});

      // Pass-through mode: chunks bypass the buffer entirely
      for (let i = 0; i < 100; i++) queue.enqueue(makeChunk(i));

      expect(overflowCalls).toHaveLength(0);
    });
  });

  describe('mode transitions: buffering → draining → stopDraining → re-draining', () => {
    it('full lifecycle with overflow during buffering phases', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 3 }));
      const received: number[] = [];

      // Phase 1: buffer with overflow (enqueue 5 into maxSize=3)
      for (let i = 0; i < 5; i++) queue.enqueue(makeChunk(i));
      expect(queue.size).toBe(3);
      expect(queue.getStats().totalDropped).toBe(2);

      // Phase 2: start draining — flushes [2, 3, 4]
      queue.startDraining((chunk) => received.push(chunk.sequence!));
      expect(received).toEqual([2, 3, 4]);
      expect(queue.isDraining()).toBe(true);

      // Phase 3: pass-through
      queue.enqueue(makeChunk(5));
      queue.enqueue(makeChunk(6));
      expect(received).toEqual([2, 3, 4, 5, 6]);

      // Phase 4: stop draining
      queue.stopDraining();
      expect(queue.isDraining()).toBe(false);

      // Phase 5: buffer with overflow again (enqueue 5 into maxSize=3)
      for (let i = 10; i < 15; i++) queue.enqueue(makeChunk(i));
      expect(queue.size).toBe(3);

      // Phase 6: re-drain — flushes [12, 13, 14]
      const secondBatch: number[] = [];
      queue.startDraining((chunk) => secondBatch.push(chunk.sequence!));
      expect(secondBatch).toEqual([12, 13, 14]);

      // Verify cumulative stats
      const stats = queue.getStats();
      // Total enqueued: 5 (phase1) + 2 (phase3) + 5 (phase5) = 12
      expect(stats.totalEnqueued).toBe(12);
      // Dropped: 2 (phase1) + 2 (phase5) = 4
      expect(stats.totalDropped).toBe(4);
    });

    it('draining to buffering preserves queue emptiness', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 10 }));

      queue.startDraining(() => {});
      expect(queue.isDraining()).toBe(true);
      expect(queue.size).toBe(0);

      queue.stopDraining();
      expect(queue.isDraining()).toBe(false);
      expect(queue.size).toBe(0);
    });

    it('multiple startDraining calls replace callback correctly', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 10 }));
      const callbackA: number[] = [];
      const callbackB: number[] = [];
      const callbackC: number[] = [];

      queue.enqueue(makeChunk(1));
      queue.startDraining((chunk) => callbackA.push(chunk.sequence!));
      expect(callbackA).toEqual([1]);

      queue.startDraining((chunk) => callbackB.push(chunk.sequence!));
      queue.enqueue(makeChunk(2));
      expect(callbackA).toEqual([1]); // old callback not called
      expect(callbackB).toEqual([2]);

      queue.startDraining((chunk) => callbackC.push(chunk.sequence!));
      queue.enqueue(makeChunk(3));
      expect(callbackB).toEqual([2]); // old callback not called
      expect(callbackC).toEqual([3]);
    });
  });
});
