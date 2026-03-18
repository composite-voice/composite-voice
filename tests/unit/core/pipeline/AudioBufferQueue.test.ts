/**
 * Tests for AudioBufferQueue — bounded FIFO queue between pipeline stages.
 */

import { AudioBufferQueue } from '../../../../src/core/pipeline/AudioBufferQueue';
import type { AudioChunk } from '../../../../src/core/types/audio';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a minimal AudioChunk with the given sequence number. */
function makeChunk(sequence: number, timestampOffset = 0): AudioChunk {
  return {
    data: new Uint8Array([sequence & 0xff]).buffer as ArrayBuffer,
    timestamp: Date.now() - timestampOffset,
    sequence,
  };
}

/** Creates a default AudioBufferQueue config. */
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

// ─── AudioBufferQueue ─────────────────────────────────────────────────────────

describe('AudioBufferQueue', () => {
  describe('initial state', () => {
    it('starts with size 0', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      expect(queue.size).toBe(0);
    });

    it('starts in buffering mode (not draining)', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      expect(queue.isDraining()).toBe(false);
    });

    it('peek() returns undefined when empty', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      expect(queue.peek()).toBeUndefined();
    });

    it('getStats() returns zero counters', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      const stats = queue.getStats();
      expect(stats.name).toBe('test-queue');
      expect(stats.size).toBe(0);
      expect(stats.totalEnqueued).toBe(0);
      expect(stats.totalDequeued).toBe(0);
      expect(stats.totalDropped).toBe(0);
      expect(stats.oldestChunkAge).toBe(0);
    });
  });

  describe('enqueue/dequeue ordering (FIFO)', () => {
    it('buffers chunks in FIFO order', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      const c1 = makeChunk(1);
      const c2 = makeChunk(2);
      const c3 = makeChunk(3);

      queue.enqueue(c1);
      queue.enqueue(c2);
      queue.enqueue(c3);

      expect(queue.size).toBe(3);
      expect(queue.peek()).toBe(c1);
    });

    it('drains in the same order as enqueued', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      const chunks = [makeChunk(1), makeChunk(2), makeChunk(3)];
      chunks.forEach((c) => queue.enqueue(c));

      const drained: AudioChunk[] = [];
      queue.startDraining((chunk) => drained.push(chunk));

      expect(drained).toHaveLength(3);
      expect(drained[0]!.sequence).toBe(1);
      expect(drained[1]!.sequence).toBe(2);
      expect(drained[2]!.sequence).toBe(3);
    });
  });

  describe('startDraining() — flush and pass-through', () => {
    it('flushes all buffered chunks immediately', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      for (let i = 0; i < 5; i++) {
        queue.enqueue(makeChunk(i));
      }
      expect(queue.size).toBe(5);

      const drained: AudioChunk[] = [];
      queue.startDraining((chunk) => drained.push(chunk));

      expect(drained).toHaveLength(5);
      expect(queue.size).toBe(0);
    });

    it('switches to pass-through mode after flush', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      queue.enqueue(makeChunk(0));

      const drained: AudioChunk[] = [];
      queue.startDraining((chunk) => drained.push(chunk));
      expect(drained).toHaveLength(1);

      // Subsequent enqueue goes directly to callback
      const passThrough = makeChunk(99);
      queue.enqueue(passThrough);

      expect(drained).toHaveLength(2);
      expect(drained[1]).toBe(passThrough);
      expect(queue.size).toBe(0); // never touches the buffer
    });

    it('works when called on an empty queue', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      const drained: AudioChunk[] = [];
      queue.startDraining((chunk) => drained.push(chunk));

      expect(drained).toHaveLength(0);
      expect(queue.isDraining()).toBe(true);

      // Pass-through works immediately
      queue.enqueue(makeChunk(1));
      expect(drained).toHaveLength(1);
    });

    it('replaces the callback when called while already draining', () => {
      const queue = new AudioBufferQueue(defaultConfig());

      const first: AudioChunk[] = [];
      queue.startDraining((chunk) => first.push(chunk));

      queue.enqueue(makeChunk(1));
      expect(first).toHaveLength(1);

      // Replace callback
      const second: AudioChunk[] = [];
      queue.startDraining((chunk) => second.push(chunk));

      queue.enqueue(makeChunk(2));
      expect(first).toHaveLength(1); // old callback no longer called
      expect(second).toHaveLength(1);
    });
  });

  describe('stopDraining() — return to buffering', () => {
    it('returns to buffering mode', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      const drained: AudioChunk[] = [];
      queue.startDraining((chunk) => drained.push(chunk));
      expect(queue.isDraining()).toBe(true);

      queue.stopDraining();
      expect(queue.isDraining()).toBe(false);

      // Chunks now buffer instead of passing through
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));

      expect(drained).toHaveLength(0); // nothing new passed through
      expect(queue.size).toBe(2);
    });

    it('allows re-draining after stop', () => {
      const queue = new AudioBufferQueue(defaultConfig());

      // Drain, enqueue one chunk pass-through
      const first: AudioChunk[] = [];
      queue.startDraining((chunk) => first.push(chunk));
      queue.enqueue(makeChunk(1));
      expect(first).toHaveLength(1);

      // Stop — buffer two more
      queue.stopDraining();
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3));
      expect(queue.size).toBe(2);

      // Re-drain — flushes the 2 buffered, then pass-through
      const second: AudioChunk[] = [];
      queue.startDraining((chunk) => second.push(chunk));
      expect(second).toHaveLength(2);
      expect(second[0]!.sequence).toBe(2);
      expect(second[1]!.sequence).toBe(3);
      expect(queue.size).toBe(0);

      // Pass-through works
      queue.enqueue(makeChunk(4));
      expect(second).toHaveLength(3);
    });
  });

  describe('overflow: drop-oldest (default)', () => {
    it('drops oldest chunk when buffer is full', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 3 }));

      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3));
      expect(queue.size).toBe(3);

      // This should drop chunk 1
      queue.enqueue(makeChunk(4));
      expect(queue.size).toBe(3);
      expect(queue.peek()!.sequence).toBe(2);

      // Verify ordering after drain
      const drained: AudioChunk[] = [];
      queue.startDraining((chunk) => drained.push(chunk));
      expect(drained.map((c) => c.sequence)).toEqual([2, 3, 4]);
    });

    it('increments totalDropped counter', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 2 }));

      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3)); // drops 1
      queue.enqueue(makeChunk(4)); // drops 2

      const stats = queue.getStats();
      expect(stats.totalDropped).toBe(2);
      expect(stats.totalEnqueued).toBe(4);
    });
  });

  describe('overflow: drop-newest', () => {
    it('discards incoming chunk when buffer is full', () => {
      const queue = new AudioBufferQueue(
        defaultConfig({ maxSize: 3, overflowStrategy: 'drop-newest' })
      );

      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3));

      // This should be discarded
      queue.enqueue(makeChunk(4));
      expect(queue.size).toBe(3);
      expect(queue.peek()!.sequence).toBe(1); // oldest is preserved

      const drained: AudioChunk[] = [];
      queue.startDraining((chunk) => drained.push(chunk));
      expect(drained.map((c) => c.sequence)).toEqual([1, 2, 3]);
    });

    it('increments totalDropped counter', () => {
      const queue = new AudioBufferQueue(
        defaultConfig({ maxSize: 2, overflowStrategy: 'drop-newest' })
      );

      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3)); // dropped
      queue.enqueue(makeChunk(4)); // dropped

      const stats = queue.getStats();
      expect(stats.totalDropped).toBe(2);
    });
  });

  describe('overflow: block', () => {
    it('returns a promise when buffer is full', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 2, overflowStrategy: 'block' }));

      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));

      const result = queue.enqueue(makeChunk(3));
      expect(result).toBeInstanceOf(Promise);
    });

    it('resolves blocked promise when startDraining is called', async () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 2, overflowStrategy: 'block' }));

      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));

      let resolved = false;
      const promise = queue.enqueue(makeChunk(3)) as Promise<void>;
      promise.then(() => {
        resolved = true;
      });

      // Not resolved yet
      await Promise.resolve(); // flush microtask
      expect(resolved).toBe(false);

      // Start draining — should resolve the blocked promise
      queue.startDraining(() => {});
      await promise;
      expect(resolved).toBe(true);
    });

    it('resolves blocked promise when clear is called', async () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 1, overflowStrategy: 'block' }));

      queue.enqueue(makeChunk(1));
      const promise = queue.enqueue(makeChunk(2)) as Promise<void>;

      let resolved = false;
      promise.then(() => {
        resolved = true;
      });

      queue.clear();
      await promise;
      expect(resolved).toBe(true);
    });
  });

  describe('peek()', () => {
    it('returns the oldest chunk without removing it', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      const c1 = makeChunk(1);
      queue.enqueue(c1);
      queue.enqueue(makeChunk(2));

      expect(queue.peek()).toBe(c1);
      expect(queue.size).toBe(2); // not removed
    });
  });

  describe('clear()', () => {
    it('removes all chunks from the buffer', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3));
      expect(queue.size).toBe(3);

      queue.clear();
      expect(queue.size).toBe(0);
      expect(queue.peek()).toBeUndefined();
    });

    it('does not affect draining state', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      queue.startDraining(() => {});
      expect(queue.isDraining()).toBe(true);

      queue.clear();
      expect(queue.isDraining()).toBe(true);
    });
  });

  describe('getStats()', () => {
    it('tracks enqueue and dequeue counts through drain cycle', () => {
      const queue = new AudioBufferQueue(defaultConfig());

      queue.enqueue(makeChunk(1));
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3));

      let stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(3);
      expect(stats.totalDequeued).toBe(0);

      queue.startDraining(() => {});

      stats = queue.getStats();
      expect(stats.totalDequeued).toBe(3); // flushed

      // Pass-through enqueue
      queue.enqueue(makeChunk(4));
      stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(4);
      expect(stats.totalDequeued).toBe(4);
    });

    it('reports oldestChunkAge correctly', () => {
      const queue = new AudioBufferQueue(defaultConfig());

      // Chunk with timestamp 500ms in the past
      const chunk = makeChunk(1, 500);
      queue.enqueue(chunk);

      const stats = queue.getStats();
      // Allow ±50ms for test execution time
      expect(stats.oldestChunkAge).toBeGreaterThanOrEqual(450);
      expect(stats.oldestChunkAge).toBeLessThan(600);
    });

    it('reports 0 oldestChunkAge when empty', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      expect(queue.getStats().oldestChunkAge).toBe(0);
    });

    it('returns a snapshot that does not update', () => {
      const queue = new AudioBufferQueue(defaultConfig());
      queue.enqueue(makeChunk(1));

      const snapshot = queue.getStats();
      expect(snapshot.size).toBe(1);

      queue.enqueue(makeChunk(2));
      expect(snapshot.size).toBe(1); // unchanged
      expect(queue.getStats().size).toBe(2); // fresh snapshot
    });
  });

  describe('race condition fix scenario', () => {
    it('buffers chunks during simulated STT connect, then flushes all in order', () => {
      const queue = new AudioBufferQueue(defaultConfig({ maxSize: 1000 }));

      // Simulate: input provider starts producing audio before STT is connected
      const chunks: AudioChunk[] = [];
      for (let i = 0; i < 10; i++) {
        chunks.push(makeChunk(i));
        queue.enqueue(chunks[i]!);
      }
      expect(queue.size).toBe(10);

      // Simulate: STT connects and starts draining
      const received: number[] = [];
      queue.startDraining((chunk) => {
        received.push(chunk.sequence!);
      });

      // All 10 chunks delivered in order
      expect(received).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(queue.size).toBe(0);

      // Subsequent chunks pass through
      queue.enqueue(makeChunk(10));
      expect(received).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });
});
