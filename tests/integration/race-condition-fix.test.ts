/**
 * Integration tests proving the race condition fix.
 *
 * @remarks
 * The original bug: Deepgram misses the first audio frames because
 * `stt.connect()` (WebSocket handshake) completes AFTER `audioCapture.start()`
 * (getUserMedia + AudioContext setup). Audio produced during the handshake
 * is lost.
 *
 * The fix: An AudioBufferQueue sits between the input provider and the STT.
 * Audio chunks are buffered while the STT connects, then flushed in order
 * when `startDraining()` is called.
 *
 * These tests exercise the exact wiring pattern used by CompositeVoice's
 * `startListening()` method:
 *
 * 1. Wire: input.onAudio → queue.enqueue
 * 2. Start: input.start() (begins producing audio)
 * 3. Connect: await stt.connect() (async delay — chunks buffer)
 * 4. Drain: queue.startDraining(chunk => stt.processAudio(chunk.data))
 */

import { AudioBufferQueue } from '../../src/core/pipeline/AudioBufferQueue';
import type { AudioChunk } from '../../src/core/types/audio';
import { MockInputProvider, MockLiveSTTProvider } from '../mocks/MockProviders';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a default input queue config matching CompositeVoice defaults. */
function createInputQueue(maxSize = 1000) {
  return new AudioBufferQueue({
    name: 'input',
    maxSize,
    overflowStrategy: 'drop-oldest',
  });
}

/** Creates a minimal AudioChunk with a given sequence number. */
function makeChunk(sequence: number): AudioChunk {
  return {
    data: new Uint8Array([sequence & 0xff]).buffer as ArrayBuffer,
    timestamp: Date.now(),
    sequence,
  };
}

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Race condition fix — InputProvider → AudioBufferQueue → LiveSTT', () => {
  describe('buffered chunks delivered after delayed STT connect', () => {
    it('delivers all 5 pre-connect chunks in order after STT connects', async () => {
      // Setup
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider(50); // 50ms connect delay
      const queue = createInputQueue();

      await input.initialize();
      await stt.initialize();

      // 1. Wire: input.onAudio → queue.enqueue
      input.onAudio((chunk: AudioChunk) => {
        queue.enqueue(chunk);
      });

      // 2. Start input — begins producing audio
      input.start();

      // 3. Produce 5 chunks (these arrive while STT is not connected)
      const produced = input.pushChunks(5);
      expect(queue.size).toBe(5);
      expect(stt.isConnected()).toBe(false);

      // 4. Connect STT (async — simulates WebSocket handshake delay)
      await stt.connect();
      expect(stt.isConnected()).toBe(true);

      // 5. Start draining — flushes buffered chunks then switches to pass-through
      queue.startDraining((chunk: AudioChunk) => {
        stt.processAudio(chunk.data);
      });

      // Assert: all 5 chunks delivered to STT in order
      expect(stt.receivedAudio).toHaveLength(5);
      for (let i = 0; i < 5; i++) {
        expect(stt.receivedAudio[i]).toBe(produced[i]!.data);
      }

      // Assert: queue is now empty and in draining mode
      expect(queue.size).toBe(0);
      expect(queue.isDraining()).toBe(true);

      // Assert: stats reflect the full lifecycle
      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(5);
      expect(stats.totalDequeued).toBe(5);
      expect(stats.totalDropped).toBe(0);
    });

    it('also delivers post-connect chunks via pass-through', async () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider(20);
      const queue = createInputQueue();

      await input.initialize();
      await stt.initialize();

      input.onAudio((chunk: AudioChunk) => {
        queue.enqueue(chunk);
      });
      input.start();

      // Pre-connect chunks
      input.pushChunks(3);

      // Connect and drain
      await stt.connect();
      queue.startDraining((chunk: AudioChunk) => {
        stt.processAudio(chunk.data);
      });

      expect(stt.receivedAudio).toHaveLength(3);

      // Post-connect chunks go straight through (pass-through mode)
      const postChunks = input.pushChunks(2);

      expect(stt.receivedAudio).toHaveLength(5);
      // Verify the last two are the post-connect chunks
      expect(stt.receivedAudio[3]).toBe(postChunks[0]!.data);
      expect(stt.receivedAudio[4]).toBe(postChunks[1]!.data);
    });
  });

  describe('continuous audio during mid-stream STT connect', () => {
    it('loses no chunks when input runs continuously and STT connects mid-stream', async () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider(100); // 100ms delay
      const queue = createInputQueue();

      await input.initialize();
      await stt.initialize();

      input.onAudio((chunk: AudioChunk) => {
        queue.enqueue(chunk);
      });
      input.start();

      // Phase 1: Push chunks while STT is connecting
      const preConnectChunks = input.pushChunks(10);

      // Phase 2: Start connecting (async — takes 100ms)
      const connectPromise = stt.connect();

      // Phase 3: More chunks arrive during the handshake
      const midConnectChunks = input.pushChunks(5);

      // Wait for connect to complete
      await connectPromise;

      // Phase 4: Start draining — flush all 15 buffered chunks
      queue.startDraining((chunk: AudioChunk) => {
        stt.processAudio(chunk.data);
      });

      // Phase 5: Even more chunks arrive after draining starts (pass-through)
      const postConnectChunks = input.pushChunks(3);

      // Assert: all 18 chunks delivered (10 + 5 + 3), none lost
      const allProduced = [...preConnectChunks, ...midConnectChunks, ...postConnectChunks];
      expect(stt.receivedAudio).toHaveLength(18);

      // Verify exact ordering — every chunk's data matches in sequence
      for (let i = 0; i < allProduced.length; i++) {
        expect(stt.receivedAudio[i]).toBe(allProduced[i]!.data);
      }

      // Stats confirm nothing was dropped
      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(18);
      expect(stats.totalDequeued).toBe(18);
      expect(stats.totalDropped).toBe(0);
    });

    it('handles rapid chunk production during slow connect', async () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider(200); // slower connect
      const queue = createInputQueue(2000);

      await input.initialize();
      await stt.initialize();

      input.onAudio((chunk: AudioChunk) => {
        queue.enqueue(chunk);
      });
      input.start();

      // Simulate rapid audio production (50 chunks)
      const allChunks = input.pushChunks(50);

      // Connect STT
      await stt.connect();

      // Drain all buffered chunks
      queue.startDraining((chunk: AudioChunk) => {
        stt.processAudio(chunk.data);
      });

      // All 50 chunks delivered in exact order
      expect(stt.receivedAudio).toHaveLength(50);
      for (let i = 0; i < 50; i++) {
        expect(stt.receivedAudio[i]).toBe(allChunks[i]!.data);
      }
    });
  });

  describe('exact sequence: enqueue during connect, flush on startDraining', () => {
    it('verifies the 3-phase lifecycle: buffer → flush → pass-through', async () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider(30);
      const queue = createInputQueue();

      await input.initialize();
      await stt.initialize();

      // Track the sequence of operations
      const log: string[] = [];

      input.onAudio((chunk: AudioChunk) => {
        log.push(`enqueue:${chunk.sequence}`);
        queue.enqueue(chunk);
      });

      // ── Phase 1: Buffering ──────────────────────────────────────────
      input.start();
      log.push('input:started');

      input.pushChunks(3);
      expect(queue.size).toBe(3);
      expect(queue.isDraining()).toBe(false);
      log.push('phase1:buffered');

      // ── Phase 2: Connect (async) ────────────────────────────────────
      log.push('stt:connecting');
      await stt.connect();
      log.push('stt:connected');

      // Queue still has chunks — they haven't been sent yet
      expect(queue.size).toBe(3);

      // ── Phase 3: Drain ──────────────────────────────────────────────
      log.push('drain:start');
      queue.startDraining((chunk: AudioChunk) => {
        log.push(`drain:${chunk.sequence}`);
        stt.processAudio(chunk.data);
      });
      log.push('drain:started');

      // All buffered chunks flushed synchronously
      expect(queue.size).toBe(0);
      expect(queue.isDraining()).toBe(true);

      // Push one more — goes through pass-through
      input.pushChunk();
      log.push('phase3:pass-through');

      // Verify the exact operation sequence
      expect(log).toEqual([
        'input:started',
        'enqueue:0',
        'enqueue:1',
        'enqueue:2',
        'phase1:buffered',
        'stt:connecting',
        'stt:connected',
        'drain:start',
        'drain:0', // flush: chunk 0
        'drain:1', // flush: chunk 1
        'drain:2', // flush: chunk 2
        'drain:started',
        'enqueue:3', // pass-through enqueue
        'drain:3', // pass-through drain (synchronous)
        'phase3:pass-through',
      ]);

      // All 4 chunks received by STT
      expect(stt.receivedAudio).toHaveLength(4);
    });

    it('flush is synchronous — all buffered chunks delivered before startDraining returns', () => {
      const queue = createInputQueue();
      const received: number[] = [];

      // Buffer 5 chunks manually
      for (let i = 0; i < 5; i++) {
        queue.enqueue(makeChunk(i));
      }

      // Start draining — the flush happens inside this call
      queue.startDraining((chunk) => {
        received.push(chunk.sequence!);
      });

      // By this line, all 5 must already be delivered
      expect(received).toEqual([0, 1, 2, 3, 4]);
    });

    it('chunks enqueued during connect() are not lost when connect resolves', async () => {
      const stt = new MockLiveSTTProvider(50);
      const queue = createInputQueue();

      await stt.initialize();

      // Start enqueueing before connect
      queue.enqueue(makeChunk(0));
      queue.enqueue(makeChunk(1));

      // Start connecting (will take 50ms)
      const connectPromise = stt.connect();

      // More chunks arrive during the handshake
      queue.enqueue(makeChunk(2));
      queue.enqueue(makeChunk(3));

      await connectPromise;

      // Chunks arrived after connect resolves
      queue.enqueue(makeChunk(4));

      // All 5 are buffered (none lost to the void)
      expect(queue.size).toBe(5);

      // Drain them all to STT
      queue.startDraining((chunk) => {
        stt.processAudio(chunk.data);
      });

      expect(stt.receivedAudio).toHaveLength(5);

      // Verify ordering
      const stats = queue.getStats();
      expect(stats.totalEnqueued).toBe(5);
      expect(stats.totalDequeued).toBe(5);
      expect(stats.totalDropped).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles zero pre-connect chunks gracefully', async () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider(10);
      const queue = createInputQueue();

      await input.initialize();
      await stt.initialize();

      input.onAudio((chunk: AudioChunk) => {
        queue.enqueue(chunk);
      });
      input.start();

      // No chunks produced before connect
      await stt.connect();
      queue.startDraining((chunk: AudioChunk) => {
        stt.processAudio(chunk.data);
      });

      expect(stt.receivedAudio).toHaveLength(0);

      // Post-connect chunks still work
      input.pushChunks(3);
      expect(stt.receivedAudio).toHaveLength(3);
    });

    it('handles immediate STT connect (zero delay)', async () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider(0); // instant connect
      const queue = createInputQueue();

      await input.initialize();
      await stt.initialize();

      input.onAudio((chunk: AudioChunk) => {
        queue.enqueue(chunk);
      });
      input.start();

      // Push some chunks
      const chunks = input.pushChunks(3);

      // Instant connect
      await stt.connect();
      queue.startDraining((chunk: AudioChunk) => {
        stt.processAudio(chunk.data);
      });

      // All chunks delivered even with zero connect delay
      expect(stt.receivedAudio).toHaveLength(3);
      for (let i = 0; i < 3; i++) {
        expect(stt.receivedAudio[i]).toBe(chunks[i]!.data);
      }
    });

    it('queue prevents data loss even when STT reconnects', async () => {
      const input = new MockInputProvider();
      const stt = new MockLiveSTTProvider(20);
      const queue = createInputQueue();

      await input.initialize();
      await stt.initialize();

      input.onAudio((chunk: AudioChunk) => {
        queue.enqueue(chunk);
      });
      input.start();

      // First connection cycle
      input.pushChunks(3);
      await stt.connect();
      queue.startDraining((chunk: AudioChunk) => {
        stt.processAudio(chunk.data);
      });
      expect(stt.receivedAudio).toHaveLength(3);

      // Simulate disconnect (turn-taking: stop draining)
      queue.stopDraining();
      await stt.disconnect();
      expect(queue.isDraining()).toBe(false);

      // Chunks produced while disconnected get buffered
      input.pushChunks(4);
      expect(queue.size).toBe(4);

      // Reconnect
      await stt.connect();
      queue.startDraining((chunk: AudioChunk) => {
        stt.processAudio(chunk.data);
      });

      // All 4 reconnect-buffered chunks delivered (total 7)
      expect(stt.receivedAudio).toHaveLength(7);

      const stats = queue.getStats();
      expect(stats.totalDropped).toBe(0);
    });
  });
});
