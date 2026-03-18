/**
 * Pipeline-level error recovery orchestrator.
 *
 * @remarks
 * This module provides the {@link RecoveryOrchestrator} class, which coordinates
 * error recovery across pipeline providers. Rather than each provider independently
 * handling its own errors, the orchestrator applies a consistent recovery strategy
 * with exponential backoff, attempt tracking, and event notification.
 *
 * The orchestrator is provider-agnostic -- it accepts a recovery function from the
 * caller rather than knowing about provider internals. This keeps the recovery logic
 * decoupled from specific provider implementations.
 *
 * @example
 * ```typescript
 * import { RecoveryOrchestrator } from 'composite-voice';
 *
 * const recovery = new RecoveryOrchestrator(
 *   { maxAttempts: 3, initialDelay: 1000, backoffMultiplier: 2, maxDelay: 10000 },
 *   logger,
 *   (event) => console.log('Recovery event:', event),
 * );
 *
 * const recovered = await recovery.attemptRecovery(
 *   'DeepgramSTT',
 *   error,
 *   async () => { await stt.connect(); },
 * );
 * ```
 *
 * @packageDocumentation
 */

import { Logger } from '../utils/logger';
import { CompositeVoiceError } from '../utils/errors';

/**
 * Configuration for the recovery strategy applied by {@link RecoveryOrchestrator}.
 *
 * @remarks
 * Controls how many recovery attempts are made, the delay between attempts,
 * and the exponential backoff behavior. The delay formula is:
 *
 * `delay = min(initialDelay * backoffMultiplier^(attempt-1), maxDelay)`
 *
 * @example
 * ```typescript
 * const strategy: RecoveryStrategy = {
 *   maxAttempts: 3,
 *   initialDelay: 1000,
 *   backoffMultiplier: 2,
 *   maxDelay: 10000,
 * };
 * ```
 */
export interface RecoveryStrategy {
  /** Maximum recovery attempts before giving up. */
  maxAttempts: number;
  /** Delay in ms before first recovery attempt. */
  initialDelay: number;
  /** Backoff multiplier for subsequent attempts. */
  backoffMultiplier: number;
  /** Maximum delay in ms. */
  maxDelay: number;
}

/**
 * Event payload emitted by the {@link RecoveryOrchestrator} during recovery attempts.
 *
 * @remarks
 * Consumers can use these events to update UI, log diagnostics, or trigger
 * additional recovery logic at the application level.
 */
export interface RecoveryEvent {
  /** Name of the provider being recovered. */
  provider: string;
  /** The error that triggered recovery. */
  error: CompositeVoiceError;
  /** Current attempt number (0 if not attempting recovery). */
  attempt: number;
  /** Maximum attempts allowed by the strategy. */
  maxAttempts: number;
  /** Whether recovery is currently in progress. */
  recovering: boolean;
  /** Whether recovery succeeded. */
  recovered: boolean;
}

/**
 * Default recovery strategy values.
 *
 * @remarks
 * Provides 3 attempts with exponential backoff starting at 1 second, doubling
 * each time, capped at 10 seconds. The sequence is: 1s, 2s, 4s (capped at 10s).
 */
const DEFAULT_RECOVERY_STRATEGY: RecoveryStrategy = {
  maxAttempts: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 10000,
};

/**
 * Pipeline-level error recovery orchestrator that coordinates recovery across
 * providers with exponential backoff.
 *
 * @remarks
 * The `RecoveryOrchestrator` is a standalone utility that does not know about
 * provider internals. Instead, callers pass a recovery function that encapsulates
 * the provider-specific reconnection or retry logic. The orchestrator handles:
 *
 * - **Attempt tracking**: Counts recovery attempts per provider and gives up
 *   after {@link RecoveryStrategy.maxAttempts | maxAttempts}.
 * - **Exponential backoff**: Delays between attempts grow exponentially,
 *   capped at {@link RecoveryStrategy.maxDelay | maxDelay}.
 * - **Concurrency guard**: Prevents multiple simultaneous recovery attempts
 *   for the same provider.
 * - **Non-recoverable filtering**: Errors with `recoverable: false` are
 *   rejected immediately without attempting recovery.
 * - **Event notification**: Emits {@link RecoveryEvent} objects at each stage
 *   of the recovery process.
 *
 * @example
 * ```typescript
 * const recovery = new RecoveryOrchestrator();
 *
 * // In a catch block for STT connection errors:
 * const recovered = await recovery.attemptRecovery(
 *   'DeepgramSTT',
 *   error,
 *   async () => { await sttProvider.connect(); },
 * );
 *
 * if (recovered) {
 *   console.log('STT reconnected successfully');
 * } else {
 *   console.error('STT recovery failed');
 * }
 *
 * // After successful operation, reset the counter:
 * recovery.resetProvider('DeepgramSTT');
 * ```
 */
export class RecoveryOrchestrator {
  private attempts = new Map<string, number>();
  private recovering = new Set<string>();

  /**
   * Creates a new RecoveryOrchestrator.
   *
   * @param strategy - Recovery strategy configuration. Defaults to
   *   {@link DEFAULT_RECOVERY_STRATEGY} if not provided.
   * @param logger - Optional logger for diagnostic output.
   * @param onRecoveryEvent - Optional callback invoked at each stage of recovery.
   */
  constructor(
    private strategy: RecoveryStrategy = DEFAULT_RECOVERY_STRATEGY,
    private logger?: Logger,
    private onRecoveryEvent?: (event: RecoveryEvent) => void
  ) {}

  /**
   * Attempt to recover a failed provider.
   *
   * @remarks
   * The recovery process follows these steps:
   *
   * 1. Check if the error is recoverable. If not, emit a non-recovering event
   *    and return `false`.
   * 2. Check if recovery is already in progress for this provider. If so,
   *    return `false` to prevent concurrent recovery.
   * 3. Increment the attempt counter. If it exceeds `maxAttempts`, emit a
   *    failure event and return `false`.
   * 4. Wait for the calculated backoff delay.
   * 5. Execute the provided recovery function.
   * 6. On success, reset the attempt counter and return `true`.
   * 7. On failure, log the error and return `false`.
   *
   * @param providerName - Identifier for the provider being recovered.
   * @param error - The error that triggered recovery. Must be a
   *   {@link CompositeVoiceError} with a `recoverable` flag.
   * @param recoverFn - Async function that performs the actual recovery
   *   (e.g., reconnecting a WebSocket, retrying an API call).
   * @returns `true` if recovery succeeded, `false` if it failed or was skipped.
   */
  async attemptRecovery(
    providerName: string,
    error: CompositeVoiceError,
    recoverFn: () => Promise<void>
  ): Promise<boolean> {
    // Don't recover non-recoverable errors
    if (!error.recoverable) {
      this.onRecoveryEvent?.({
        provider: providerName,
        error,
        attempt: 0,
        maxAttempts: this.strategy.maxAttempts,
        recovering: false,
        recovered: false,
      });
      return false;
    }

    // Don't attempt if already recovering this provider
    if (this.recovering.has(providerName)) {
      return false;
    }

    const currentAttempts = (this.attempts.get(providerName) ?? 0) + 1;
    this.attempts.set(providerName, currentAttempts);

    if (currentAttempts > this.strategy.maxAttempts) {
      this.onRecoveryEvent?.({
        provider: providerName,
        error,
        attempt: currentAttempts,
        maxAttempts: this.strategy.maxAttempts,
        recovering: false,
        recovered: false,
      });
      return false;
    }

    this.recovering.add(providerName);
    this.onRecoveryEvent?.({
      provider: providerName,
      error,
      attempt: currentAttempts,
      maxAttempts: this.strategy.maxAttempts,
      recovering: true,
      recovered: false,
    });

    // Calculate delay with exponential backoff
    const delay = Math.min(
      this.strategy.initialDelay * Math.pow(this.strategy.backoffMultiplier, currentAttempts - 1),
      this.strategy.maxDelay
    );

    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      await recoverFn();
      this.recovering.delete(providerName);
      this.attempts.set(providerName, 0); // Reset on success
      this.onRecoveryEvent?.({
        provider: providerName,
        error,
        attempt: currentAttempts,
        maxAttempts: this.strategy.maxAttempts,
        recovering: false,
        recovered: true,
      });
      return true;
    } catch (retryError) {
      this.recovering.delete(providerName);
      this.logger?.warn(
        `Recovery attempt ${currentAttempts} failed for ${providerName}`,
        retryError
      );
      return false;
    }
  }

  /**
   * Reset recovery state for a provider.
   *
   * @remarks
   * Call this after a successful operation to clear the attempt counter
   * and allow fresh recovery attempts if a future error occurs.
   *
   * @param providerName - The provider whose recovery state should be reset.
   */
  resetProvider(providerName: string): void {
    this.attempts.delete(providerName);
    this.recovering.delete(providerName);
  }

  /**
   * Reset all recovery state for all providers.
   *
   * @remarks
   * Useful when tearing down or reinitializing the pipeline.
   */
  reset(): void {
    this.attempts.clear();
    this.recovering.clear();
  }

  /**
   * Check if a provider is currently in recovery.
   *
   * @param providerName - The provider to check.
   * @returns `true` if recovery is currently in progress for this provider.
   */
  isRecovering(providerName: string): boolean {
    return this.recovering.has(providerName);
  }
}
