/**
 * RecoveryOrchestrator unit tests.
 *
 * Tests the pipeline-level error recovery orchestrator that coordinates
 * recovery across providers with exponential backoff.
 */

import { RecoveryOrchestrator } from '../../../src/core/RecoveryOrchestrator';
import type { RecoveryStrategy, RecoveryEvent } from '../../../src/core/RecoveryOrchestrator';
import { ProviderConnectionError, ConfigurationError } from '../../../src/utils/errors';

describe('RecoveryOrchestrator', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Helper to advance timers and flush microtasks. */
  async function advanceTimersAndFlush(ms: number): Promise<void> {
    jest.advanceTimersByTime(ms);
    // Flush microtask queue (resolved promises)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  const fastStrategy: RecoveryStrategy = {
    maxAttempts: 3,
    initialDelay: 100,
    backoffMultiplier: 2,
    maxDelay: 1000,
  };

  describe('default strategy values', () => {
    it('should use sensible defaults when no strategy is provided', () => {
      const orchestrator = new RecoveryOrchestrator();
      // The orchestrator should be constructable with no args
      expect(orchestrator).toBeInstanceOf(RecoveryOrchestrator);
      expect(orchestrator.isRecovering('test')).toBe(false);
    });
  });

  describe('recovery succeeds on first attempt', () => {
    it('should call recoverFn and return true', async () => {
      const orchestrator = new RecoveryOrchestrator(fastStrategy);
      const recoverFn = jest.fn().mockResolvedValue(undefined);
      const error = new ProviderConnectionError('TestSTT');

      const resultPromise = orchestrator.attemptRecovery('stt', error, recoverFn);

      // Advance past the initial delay (100ms for first attempt)
      await advanceTimersAndFlush(100);

      const result = await resultPromise;

      expect(result).toBe(true);
      expect(recoverFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('recovery retries with backoff', () => {
    it('should increase delay with each attempt', async () => {
      const events: RecoveryEvent[] = [];
      const orchestrator = new RecoveryOrchestrator(
        fastStrategy,
        undefined,
        (event) => events.push({ ...event }),
      );
      const error = new ProviderConnectionError('TestSTT');

      // First attempt - fails
      const recoverFn1 = jest.fn().mockRejectedValue(new Error('fail'));
      const result1Promise = orchestrator.attemptRecovery('stt', error, recoverFn1);
      await advanceTimersAndFlush(100); // initialDelay = 100ms
      const result1 = await result1Promise;
      expect(result1).toBe(false);

      // Second attempt - fails
      const recoverFn2 = jest.fn().mockRejectedValue(new Error('fail'));
      const result2Promise = orchestrator.attemptRecovery('stt', error, recoverFn2);
      await advanceTimersAndFlush(200); // 100 * 2^1 = 200ms
      const result2 = await result2Promise;
      expect(result2).toBe(false);

      // Third attempt - succeeds
      const recoverFn3 = jest.fn().mockResolvedValue(undefined);
      const result3Promise = orchestrator.attemptRecovery('stt', error, recoverFn3);
      await advanceTimersAndFlush(400); // 100 * 2^2 = 400ms
      const result3 = await result3Promise;
      expect(result3).toBe(true);

      // Verify the recovering events were emitted
      const recoveringEvents = events.filter(e => e.recovering);
      expect(recoveringEvents.length).toBe(3);
      expect(recoveringEvents[0]!.attempt).toBe(1);
      expect(recoveringEvents[1]!.attempt).toBe(2);
      expect(recoveringEvents[2]!.attempt).toBe(3);
    });
  });

  describe('recovery gives up after maxAttempts', () => {
    it('should return false and emit non-recovering event after exceeding maxAttempts', async () => {
      const events: RecoveryEvent[] = [];
      const orchestrator = new RecoveryOrchestrator(
        { ...fastStrategy, maxAttempts: 2 },
        undefined,
        (event) => events.push({ ...event }),
      );
      const error = new ProviderConnectionError('TestSTT');

      // First attempt - fails
      const fn1 = jest.fn().mockRejectedValue(new Error('fail'));
      const r1Promise = orchestrator.attemptRecovery('stt', error, fn1);
      await advanceTimersAndFlush(100);
      expect(await r1Promise).toBe(false);

      // Second attempt - fails
      const fn2 = jest.fn().mockRejectedValue(new Error('fail'));
      const r2Promise = orchestrator.attemptRecovery('stt', error, fn2);
      await advanceTimersAndFlush(200);
      expect(await r2Promise).toBe(false);

      // Third attempt - should be rejected (exceeds maxAttempts=2)
      const fn3 = jest.fn().mockResolvedValue(undefined);
      const r3 = await orchestrator.attemptRecovery('stt', error, fn3);
      expect(r3).toBe(false);
      expect(fn3).not.toHaveBeenCalled(); // Should not even try

      // Verify the final event
      const lastEvent = events[events.length - 1]!;
      expect(lastEvent.recovering).toBe(false);
      expect(lastEvent.recovered).toBe(false);
      expect(lastEvent.attempt).toBe(3); // attempt 3 > maxAttempts 2
    });
  });

  describe('non-recoverable errors are not retried', () => {
    it('should return false immediately for non-recoverable errors', async () => {
      const events: RecoveryEvent[] = [];
      const orchestrator = new RecoveryOrchestrator(
        fastStrategy,
        undefined,
        (event) => events.push({ ...event }),
      );
      const error = new ConfigurationError('missing API key');
      const recoverFn = jest.fn().mockResolvedValue(undefined);

      const result = await orchestrator.attemptRecovery('stt', error, recoverFn);

      expect(result).toBe(false);
      expect(recoverFn).not.toHaveBeenCalled();
      expect(events).toHaveLength(1);
      expect(events[0]!.recovering).toBe(false);
      expect(events[0]!.recovered).toBe(false);
      expect(events[0]!.attempt).toBe(0);
    });
  });

  describe('concurrent recovery for same provider is prevented', () => {
    it('should return false if recovery is already in progress for the same provider', async () => {
      const orchestrator = new RecoveryOrchestrator(fastStrategy);
      const error = new ProviderConnectionError('TestSTT');

      // Start a recovery that will take time (the delay + the recoverFn)
      const slowRecoverFn = jest.fn().mockImplementation(() => new Promise(resolve => {
        setTimeout(resolve, 500);
      }));

      const firstPromise = orchestrator.attemptRecovery('stt', error, slowRecoverFn);

      // Before the first recovery completes, try another
      // Advance past initial delay so the first recovery is actively running
      await advanceTimersAndFlush(100);
      expect(orchestrator.isRecovering('stt')).toBe(true);

      // Second attempt should be rejected immediately
      const secondResult = await orchestrator.attemptRecovery('stt', error, jest.fn());
      expect(secondResult).toBe(false);

      // Complete the first recovery
      await advanceTimersAndFlush(500);
      const firstResult = await firstPromise;
      expect(firstResult).toBe(true);
      expect(orchestrator.isRecovering('stt')).toBe(false);
    });

    it('should allow concurrent recovery for different providers', async () => {
      const orchestrator = new RecoveryOrchestrator(fastStrategy);
      const error = new ProviderConnectionError('TestProvider');

      const recoverFn1 = jest.fn().mockResolvedValue(undefined);
      const recoverFn2 = jest.fn().mockResolvedValue(undefined);

      const promise1 = orchestrator.attemptRecovery('stt', error, recoverFn1);
      const promise2 = orchestrator.attemptRecovery('tts', error, recoverFn2);

      // Both should be recovering
      expect(orchestrator.isRecovering('stt')).toBe(true);
      expect(orchestrator.isRecovering('tts')).toBe(true);

      // Advance timers to complete both
      await advanceTimersAndFlush(100);

      const [result1, result2] = await Promise.all([promise1, promise2]);
      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });

  describe('reset clears attempt counters', () => {
    it('resetProvider should clear attempts for a single provider', async () => {
      const orchestrator = new RecoveryOrchestrator({ ...fastStrategy, maxAttempts: 1 });
      const error = new ProviderConnectionError('TestSTT');

      // First attempt fails
      const fn1 = jest.fn().mockRejectedValue(new Error('fail'));
      const r1Promise = orchestrator.attemptRecovery('stt', error, fn1);
      await advanceTimersAndFlush(100);
      expect(await r1Promise).toBe(false);

      // Second attempt should exceed maxAttempts
      const fn2 = jest.fn().mockResolvedValue(undefined);
      const r2 = await orchestrator.attemptRecovery('stt', error, fn2);
      expect(r2).toBe(false);
      expect(fn2).not.toHaveBeenCalled();

      // Reset the provider
      orchestrator.resetProvider('stt');

      // Now recovery should work again
      const fn3 = jest.fn().mockResolvedValue(undefined);
      const r3Promise = orchestrator.attemptRecovery('stt', error, fn3);
      await advanceTimersAndFlush(100);
      expect(await r3Promise).toBe(true);
    });

    it('reset should clear all provider state', async () => {
      const orchestrator = new RecoveryOrchestrator({ ...fastStrategy, maxAttempts: 1 });
      const error = new ProviderConnectionError('TestProvider');

      // Exhaust attempts for both providers
      const fn1 = jest.fn().mockRejectedValue(new Error('fail'));
      const r1Promise = orchestrator.attemptRecovery('stt', error, fn1);
      await advanceTimersAndFlush(100);
      await r1Promise;

      const fn2 = jest.fn().mockRejectedValue(new Error('fail'));
      const r2Promise = orchestrator.attemptRecovery('tts', error, fn2);
      await advanceTimersAndFlush(100);
      await r2Promise;

      // Both should be exhausted
      expect(await orchestrator.attemptRecovery('stt', error, jest.fn())).toBe(false);
      expect(await orchestrator.attemptRecovery('tts', error, jest.fn())).toBe(false);

      // Reset all
      orchestrator.reset();

      // Both should work now
      const fn3 = jest.fn().mockResolvedValue(undefined);
      const r3Promise = orchestrator.attemptRecovery('stt', error, fn3);
      await advanceTimersAndFlush(100);
      expect(await r3Promise).toBe(true);

      const fn4 = jest.fn().mockResolvedValue(undefined);
      const r4Promise = orchestrator.attemptRecovery('tts', error, fn4);
      await advanceTimersAndFlush(100);
      expect(await r4Promise).toBe(true);
    });
  });

  describe('recovery events are emitted correctly', () => {
    it('should emit recovering=true when starting, recovered=true on success', async () => {
      const events: RecoveryEvent[] = [];
      const orchestrator = new RecoveryOrchestrator(
        fastStrategy,
        undefined,
        (event) => events.push({ ...event }),
      );
      const error = new ProviderConnectionError('TestSTT');
      const recoverFn = jest.fn().mockResolvedValue(undefined);

      const resultPromise = orchestrator.attemptRecovery('stt', error, recoverFn);
      await advanceTimersAndFlush(100);
      await resultPromise;

      expect(events).toHaveLength(2);

      // First event: recovery starting
      expect(events[0]).toEqual(expect.objectContaining({
        provider: 'stt',
        attempt: 1,
        maxAttempts: 3,
        recovering: true,
        recovered: false,
      }));

      // Second event: recovery succeeded
      expect(events[1]).toEqual(expect.objectContaining({
        provider: 'stt',
        attempt: 1,
        maxAttempts: 3,
        recovering: false,
        recovered: true,
      }));
    });

    it('should emit recovering=true then no recovered event on failure', async () => {
      const events: RecoveryEvent[] = [];
      const orchestrator = new RecoveryOrchestrator(
        fastStrategy,
        undefined,
        (event) => events.push({ ...event }),
      );
      const error = new ProviderConnectionError('TestSTT');
      const recoverFn = jest.fn().mockRejectedValue(new Error('fail'));

      const resultPromise = orchestrator.attemptRecovery('stt', error, recoverFn);
      await advanceTimersAndFlush(100);
      await resultPromise;

      // Only the "recovering" event is emitted (no success event)
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual(expect.objectContaining({
        provider: 'stt',
        attempt: 1,
        recovering: true,
        recovered: false,
      }));
    });

    it('should include the error in all events', async () => {
      const events: RecoveryEvent[] = [];
      const orchestrator = new RecoveryOrchestrator(
        fastStrategy,
        undefined,
        (event) => events.push({ ...event }),
      );
      const error = new ProviderConnectionError('TestSTT');
      const recoverFn = jest.fn().mockResolvedValue(undefined);

      const resultPromise = orchestrator.attemptRecovery('stt', error, recoverFn);
      await advanceTimersAndFlush(100);
      await resultPromise;

      for (const event of events) {
        expect(event.error).toBe(error);
      }
    });
  });

  describe('backoff delay calculation', () => {
    it('should cap delay at maxDelay', async () => {
      const strategy: RecoveryStrategy = {
        maxAttempts: 5,
        initialDelay: 100,
        backoffMultiplier: 10, // Very aggressive multiplier
        maxDelay: 500,
      };
      const orchestrator = new RecoveryOrchestrator(strategy);
      const error = new ProviderConnectionError('TestSTT');

      // First attempt: delay = min(100 * 10^0, 500) = 100
      const fn1 = jest.fn().mockRejectedValue(new Error('fail'));
      const r1Promise = orchestrator.attemptRecovery('stt', error, fn1);
      await advanceTimersAndFlush(100);
      await r1Promise;

      // Second attempt: delay = min(100 * 10^1, 500) = 500 (capped)
      const fn2 = jest.fn().mockRejectedValue(new Error('fail'));
      const r2Promise = orchestrator.attemptRecovery('stt', error, fn2);
      // At 400ms the timer hasn't fired yet since delay is 500
      jest.advanceTimersByTime(400);
      await Promise.resolve();
      expect(fn2).not.toHaveBeenCalled();
      // At 500ms it should fire
      await advanceTimersAndFlush(100);
      await r2Promise;
      expect(fn2).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRecovering', () => {
    it('should return false for providers not in recovery', () => {
      const orchestrator = new RecoveryOrchestrator(fastStrategy);
      expect(orchestrator.isRecovering('stt')).toBe(false);
      expect(orchestrator.isRecovering('tts')).toBe(false);
      expect(orchestrator.isRecovering('llm')).toBe(false);
    });

    it('should return true while recovery is in progress', async () => {
      const orchestrator = new RecoveryOrchestrator(fastStrategy);
      const error = new ProviderConnectionError('TestSTT');
      const recoverFn = jest.fn().mockResolvedValue(undefined);

      const promise = orchestrator.attemptRecovery('stt', error, recoverFn);

      // Before timer fires, should still be recovering (in delay phase)
      expect(orchestrator.isRecovering('stt')).toBe(true);

      await advanceTimersAndFlush(100);
      await promise;

      expect(orchestrator.isRecovering('stt')).toBe(false);
    });
  });

  describe('attempt counter resets on success', () => {
    it('should reset to 0 after a successful recovery', async () => {
      const events: RecoveryEvent[] = [];
      const orchestrator = new RecoveryOrchestrator(
        { ...fastStrategy, maxAttempts: 2 },
        undefined,
        (event) => events.push({ ...event }),
      );
      const error = new ProviderConnectionError('TestSTT');

      // First attempt fails
      const fn1 = jest.fn().mockRejectedValue(new Error('fail'));
      const r1Promise = orchestrator.attemptRecovery('stt', error, fn1);
      await advanceTimersAndFlush(100);
      await r1Promise;

      // Second attempt succeeds
      const fn2 = jest.fn().mockResolvedValue(undefined);
      const r2Promise = orchestrator.attemptRecovery('stt', error, fn2);
      await advanceTimersAndFlush(200);
      expect(await r2Promise).toBe(true);

      // After success, counter should be reset -- so next failure counts from 1 again
      const fn3 = jest.fn().mockRejectedValue(new Error('fail'));
      const r3Promise = orchestrator.attemptRecovery('stt', error, fn3);
      await advanceTimersAndFlush(100);
      await r3Promise;

      // The attempt counter should show 1 (reset after success)
      const lastRecoveringEvent = events.filter(e => e.recovering).pop();
      expect(lastRecoveringEvent?.attempt).toBe(1);
    });
  });
});
