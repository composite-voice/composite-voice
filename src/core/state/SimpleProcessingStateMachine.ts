/**
 * Simple Processing State Machine
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides a lightweight finite state machine for tracking LLM
 * processing state. It is a pure state tracker -- it does **not** manage LLM
 * providers or network connections. State transitions are validated against an
 * explicit transition graph defined by {@link PROCESSING_TRANSITIONS}.
 *
 * The valid states are:
 *
 * - `'idle'` -- No processing is active; ready for a new request.
 * - `'processing'` -- A request has been sent to the LLM and a response is awaited.
 * - `'streaming'` -- The LLM is actively streaming tokens/chunks back.
 * - `'complete'` -- The LLM response is fully received; can transition back to `'idle'`.
 * - `'error'` -- A processing error occurred; can transition back to `'idle'`.
 *
 * @see {@link SimpleAudioCaptureStateMachine} for the audio capture state machine.
 * @see {@link SimpleAudioPlaybackStateMachine} for the audio playback state machine.
 */

import type { Logger } from '../../utils/logger';

/**
 * All valid states for the LLM processing state machine.
 *
 * @remarks
 * The processing lifecycle flows as:
 *
 * ```
 * idle -> processing -> streaming -> complete -> idle  (normal flow)
 *            |                          ^
 *            +--------------------------+  (non-streaming: processing -> complete)
 *
 * Any state -> error -> idle  (error recovery)
 * ```
 */
export type ProcessingState = 'idle' | 'processing' | 'streaming' | 'complete' | 'error';

/**
 * Callback invoked when the LLM processing state changes.
 *
 * @param newState - The processing state after the transition.
 * @param oldState - The processing state before the transition.
 *
 * @example
 * ```ts
 * const callback: ProcessingStateCallback = (newState, oldState) => {
 *   console.log(`Processing: ${oldState} -> ${newState}`);
 * };
 * ```
 */
export type ProcessingStateCallback = (
  newState: ProcessingState,
  oldState: ProcessingState
) => void;

/**
 * Defines the valid state transitions for the LLM processing state machine.
 *
 * @remarks
 * Each key is a source state and the corresponding array lists the states it
 * may transition to. Attempting any transition not listed here will throw an
 * `Error`.
 *
 * The transition graph:
 *
 * | From         | Allowed Targets                   |
 * |--------------|-----------------------------------|
 * | `idle`       | `processing`, `error`             |
 * | `processing` | `streaming`, `complete`, `error`  |
 * | `streaming`  | `complete`, `error`               |
 * | `complete`   | `idle`                            |
 * | `error`      | `idle`                            |
 *
 * Note that `processing` can transition directly to `complete` for non-streaming
 * LLM providers (e.g. OpenAI non-streaming mode). Streaming providers will
 * typically go through `processing` -> `streaming` -> `complete`.
 *
 * Both `complete` and `error` are terminal-like states that can only cycle back
 * to `idle`, enabling a clean restart.
 */
const PROCESSING_TRANSITIONS: Record<ProcessingState, ProcessingState[]> = {
  idle: ['processing', 'streaming', 'error'],
  processing: ['streaming', 'complete', 'idle', 'error'],
  streaming: ['complete', 'idle', 'error'],
  complete: ['idle', 'processing'],
  error: ['idle'],
};

/**
 * A simple finite state machine for tracking LLM processing state.
 *
 * @remarks
 * This class is a pure state tracker. It validates transitions against the
 * {@link PROCESSING_TRANSITIONS} graph and notifies registered callbacks on
 * every successful transition. It does **not** interact with LLM providers or
 * network layers.
 *
 * Use the state setter methods ({@link SimpleProcessingStateMachine.setIdle | setIdle},
 * {@link SimpleProcessingStateMachine.setProcessing | setProcessing}, etc.) to drive
 * transitions. Invalid transitions throw an `Error`.
 *
 * @example
 * ```ts
 * import { SimpleProcessingStateMachine } from './SimpleProcessingStateMachine';
 *
 * const sm = new SimpleProcessingStateMachine(logger);
 *
 * sm.onStateChange((newState, oldState) => {
 *   console.log(`Processing: ${oldState} -> ${newState}`);
 * });
 *
 * // Streaming LLM flow
 * sm.setProcessing(); // idle -> processing
 * sm.setStreaming();   // processing -> streaming
 * sm.setComplete();    // streaming -> complete
 * sm.setIdle();        // complete -> idle
 *
 * // Non-streaming LLM flow
 * sm.setProcessing(); // idle -> processing
 * sm.setComplete();    // processing -> complete
 * sm.setIdle();        // complete -> idle
 * ```
 *
 * @see {@link PROCESSING_TRANSITIONS} for the full transition graph.
 */
export class SimpleProcessingStateMachine {
  private currentState: ProcessingState = 'idle';
  private callbacks = new Set<ProcessingStateCallback>();

  /**
   * Creates a new `SimpleProcessingStateMachine` in the `'idle'` state.
   *
   * @param logger - Optional {@link Logger} instance for debug-level transition logs.
   */
  constructor(private logger?: Logger) {}

  /**
   * Transitions to the `'idle'` state.
   *
   * @remarks
   * Valid from `'complete'` or `'error'` only. Used to reset the machine for a
   * new processing cycle.
   *
   * @throws Error if the current state does not allow transitioning to `'idle'`.
   */
  setIdle(): void {
    this.transitionTo('idle');
  }

  /**
   * Transitions to the `'processing'` state.
   *
   * @remarks
   * Valid from `'idle'` only. Indicates that a request has been sent to the LLM
   * and the system is awaiting a response.
   *
   * @throws Error if the current state does not allow transitioning to `'processing'`.
   */
  setProcessing(): void {
    this.transitionTo('processing');
  }

  /**
   * Transitions to the `'streaming'` state.
   *
   * @remarks
   * Valid from `'processing'` only. Indicates the LLM has begun streaming
   * response tokens or chunks. This state is skipped by non-streaming LLM
   * providers, which transition directly from `'processing'` to `'complete'`.
   *
   * @throws Error if the current state does not allow transitioning to `'streaming'`.
   */
  setStreaming(): void {
    this.transitionTo('streaming');
  }

  /**
   * Transitions to the `'complete'` state.
   *
   * @remarks
   * Valid from `'processing'` or `'streaming'`. Indicates the LLM response has
   * been fully received. From `'complete'`, only
   * {@link SimpleProcessingStateMachine.setIdle | setIdle()} is allowed.
   *
   * @throws Error if the current state does not allow transitioning to `'complete'`.
   */
  setComplete(): void {
    this.transitionTo('complete');
  }

  /**
   * Transitions to the `'error'` state.
   *
   * @remarks
   * Valid from any state except `'complete'` and `'error'` itself. Indicates a
   * processing failure. From `'error'`, only
   * {@link SimpleProcessingStateMachine.setIdle | setIdle()} is allowed.
   *
   * @throws Error if the current state does not allow transitioning to `'error'`.
   */
  setError(): void {
    this.transitionTo('error');
  }

  /**
   * Returns the current processing state.
   *
   * @returns The current {@link ProcessingState}.
   */
  getState(): ProcessingState {
    return this.currentState;
  }

  /**
   * Checks whether the machine is actively processing (request sent or streaming).
   *
   * @remarks
   * Returns `true` for both `'processing'` and `'streaming'` states, since
   * both represent an in-flight LLM request.
   *
   * @returns `true` if the current state is `'processing'` or `'streaming'`.
   */
  isProcessing(): boolean {
    return this.currentState === 'processing' || this.currentState === 'streaming';
  }

  /**
   * Checks whether the machine is in the `'complete'` state.
   *
   * @returns `true` if the current state is `'complete'`.
   */
  isComplete(): boolean {
    return this.currentState === 'complete';
  }

  /**
   * Registers a callback that fires whenever the processing state changes.
   *
   * @remarks
   * The callback is invoked synchronously after each successful transition.
   * Errors thrown by the callback are caught and logged, preventing one
   * callback from blocking others.
   *
   * @param callback - The {@link ProcessingStateCallback} to invoke on state changes.
   * @returns An unsubscribe function. Call it to remove the callback.
   *
   * @example
   * ```ts
   * const unsubscribe = sm.onStateChange((newState, oldState) => {
   *   updateThinkingIndicator(newState);
   * });
   *
   * // Later:
   * unsubscribe();
   * ```
   */
  onStateChange(callback: ProcessingStateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Attempts to transition to the given state, validating against
   * {@link PROCESSING_TRANSITIONS}.
   *
   * @param newState - The target state.
   *
   * @throws Error if the transition from the current state to `newState` is not
   *   listed in {@link PROCESSING_TRANSITIONS}.
   */
  private transitionTo(newState: ProcessingState): void {
    // No-op if already in the target state
    if (this.currentState === newState) return;

    if (!this.canTransitionTo(newState)) {
      throw new Error(`Invalid processing state transition: ${this.currentState} -> ${newState}`);
    }
    const oldState = this.currentState;
    this.currentState = newState;
    this.logger?.debug(`Processing state: ${oldState} -> ${newState}`);
    this.notifyCallbacks(newState, oldState);
  }

  /**
   * Checks whether a transition to the given state is valid from the current state.
   *
   * @param newState - The target state to check.
   * @returns `true` if the transition is allowed.
   */
  private canTransitionTo(newState: ProcessingState): boolean {
    const validTransitions = PROCESSING_TRANSITIONS[this.currentState];
    return validTransitions?.includes(newState) ?? false;
  }

  /**
   * Notifies all registered callbacks of a state change.
   *
   * @param newState - The state after the transition.
   * @param oldState - The state before the transition.
   */
  private notifyCallbacks(newState: ProcessingState, oldState: ProcessingState): void {
    for (const callback of this.callbacks) {
      try {
        callback(newState, oldState);
      } catch (error) {
        this.logger?.error('Error in processing state change callback', error);
      }
    }
  }

  /**
   * Disposes of the state machine by clearing all registered callbacks.
   *
   * @remarks
   * After disposal, no further state change notifications will be emitted. The
   * machine's current state is preserved but becomes effectively frozen. This
   * method is safe to call multiple times.
   */
  dispose(): void {
    this.callbacks.clear();
    this.logger?.debug('SimpleProcessingStateMachine disposed');
  }
}
