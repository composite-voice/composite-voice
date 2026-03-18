/**
 * Tests for TTSBackpressure — counting semaphore for LLM→TTS flow control.
 */

import { TTSBackpressure } from '../../../../src/core/pipeline/TTSBackpressure';

describe('TTSBackpressure', () => {
  describe('initial state', () => {
    it('starts with zero pending chunks', () => {
      const bp = new TTSBackpressure(3);
      expect(bp.pendingCount).toBe(0);
    });

    it('waitForCapacity resolves immediately when under limit', async () => {
      const bp = new TTSBackpressure(3);
      // Should resolve without blocking
      await bp.waitForCapacity();
    });
  });

  describe('acquire / release', () => {
    it('increments pending count on acquire', () => {
      const bp = new TTSBackpressure(5);
      bp.acquire();
      expect(bp.pendingCount).toBe(1);
      bp.acquire();
      expect(bp.pendingCount).toBe(2);
    });

    it('decrements pending count on release', () => {
      const bp = new TTSBackpressure(5);
      bp.acquire();
      bp.acquire();
      bp.release();
      expect(bp.pendingCount).toBe(1);
      bp.release();
      expect(bp.pendingCount).toBe(0);
    });

    it('release does not go below zero', () => {
      const bp = new TTSBackpressure(5);
      bp.release();
      expect(bp.pendingCount).toBe(0);
      bp.release();
      expect(bp.pendingCount).toBe(0);
    });
  });

  describe('backpressure — LLM pauses when maxPendingChunks is reached', () => {
    it('waitForCapacity blocks when pending equals maxPendingChunks', async () => {
      const bp = new TTSBackpressure(2);

      bp.acquire();
      bp.acquire();
      expect(bp.pendingCount).toBe(2);

      let resolved = false;
      const promise = bp.waitForCapacity().then(() => {
        resolved = true;
      });

      // Flush microtasks — should NOT resolve yet
      await Promise.resolve();
      await Promise.resolve();
      expect(resolved).toBe(false);

      // Release one — should unblock
      bp.release();
      await promise;
      expect(resolved).toBe(true);
      expect(bp.pendingCount).toBe(1);
    });

    it('waitForCapacity resolves immediately when below limit', async () => {
      const bp = new TTSBackpressure(3);

      bp.acquire();
      bp.acquire();
      // 2 < 3, should resolve immediately
      await bp.waitForCapacity();
    });

    it('LLM resumes when TTS processes a chunk (release unblocks waiter)', async () => {
      const bp = new TTSBackpressure(1);

      bp.acquire(); // pending = 1, at limit

      const order: string[] = [];

      // Simulate LLM trying to send another chunk
      const waitPromise = bp.waitForCapacity().then(() => {
        order.push('resumed');
      });

      // Simulate TTS emitting audio (releasing)
      await Promise.resolve(); // ensure waiter is registered
      order.push('tts-audio');
      bp.release();

      await waitPromise;

      expect(order).toEqual(['tts-audio', 'resumed']);
    });

    it('multiple acquire/release cycles work correctly', async () => {
      const bp = new TTSBackpressure(2);

      // Fill to capacity
      bp.acquire();
      bp.acquire();

      // Wait, release, send again — 3 cycles
      for (let i = 0; i < 3; i++) {
        let resolved = false;
        const promise = bp.waitForCapacity().then(() => {
          resolved = true;
        });
        await Promise.resolve();
        expect(resolved).toBe(false);

        bp.release();
        await promise;
        expect(resolved).toBe(true);

        bp.acquire();
        expect(bp.pendingCount).toBe(2);
      }
    });
  });

  describe('reset', () => {
    it('clears pending count to zero', () => {
      const bp = new TTSBackpressure(3);
      bp.acquire();
      bp.acquire();
      bp.acquire();
      expect(bp.pendingCount).toBe(3);

      bp.reset();
      expect(bp.pendingCount).toBe(0);
    });

    it('unblocks a waiting sender', async () => {
      const bp = new TTSBackpressure(1);
      bp.acquire();

      let resolved = false;
      const promise = bp.waitForCapacity().then(() => {
        resolved = true;
      });

      await Promise.resolve();
      expect(resolved).toBe(false);

      bp.reset();
      await promise;
      expect(resolved).toBe(true);
      expect(bp.pendingCount).toBe(0);
    });

    it('allows normal operation after reset', async () => {
      const bp = new TTSBackpressure(2);
      bp.acquire();
      bp.acquire();
      bp.reset();

      // Should be able to acquire again without blocking
      await bp.waitForCapacity();
      bp.acquire();
      expect(bp.pendingCount).toBe(1);
    });
  });

  describe('no backpressure when not configured (undefined behavior)', () => {
    it('backpressure is opt-in — default behavior has no TTSBackpressure instance', () => {
      // This test documents the design: TTSBackpressure is only created
      // when config.pipeline.maxPendingChunks is set. When it's not set,
      // the code uses optional chaining (this.ttsBackpressure?.waitForCapacity())
      // which is a no-op, preserving the original behavior.
      //
      // We verify this by confirming TTSBackpressure itself does nothing
      // problematic when maxPendingChunks is large (effectively unlimited).
      const bp = new TTSBackpressure(Number.MAX_SAFE_INTEGER);

      for (let i = 0; i < 10000; i++) {
        bp.acquire();
      }
      // Should never block because limit is effectively infinite
      expect(bp.pendingCount).toBe(10000);
    });
  });

  describe('edge cases', () => {
    it('maxPendingChunks of 1 allows only one pending chunk', async () => {
      const bp = new TTSBackpressure(1);

      // First acquire is fine
      await bp.waitForCapacity();
      bp.acquire();
      expect(bp.pendingCount).toBe(1);

      // Second should block
      let blocked = true;
      const promise = bp.waitForCapacity().then(() => {
        blocked = false;
      });
      await Promise.resolve();
      expect(blocked).toBe(true);

      bp.release();
      await promise;
      expect(blocked).toBe(false);
    });

    it('release called before any acquire does not cause issues', () => {
      const bp = new TTSBackpressure(5);
      // Should not throw or go negative
      bp.release();
      bp.release();
      bp.release();
      expect(bp.pendingCount).toBe(0);
    });

    it('reset when no waiter is pending does not throw', () => {
      const bp = new TTSBackpressure(5);
      bp.acquire();
      bp.acquire();
      // No one is waiting, reset should be safe
      expect(() => bp.reset()).not.toThrow();
      expect(bp.pendingCount).toBe(0);
    });
  });
});
