/**
 * Simple Audio Capture State Machine
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides a lightweight finite state machine for tracking audio
 * capture (microphone) state. It is a pure state tracker -- it does **not**
 * manage audio providers or hardware resources. State transitions are validated
 * against an explicit transition graph defined by {@link CAPTURE_TRANSITIONS}.
 *
 * The valid states are:
 *
 * - `'idle'` -- Initial/reset state, ready to begin capture.
 * - `'starting'` -- Microphone access has been requested, awaiting activation.
 * - `'active'` -- Actively capturing audio from the microphone.
 * - `'paused'` -- Capture is temporarily suspended.
 * - `'stopped'` -- Capture has ended; can transition back to `'idle'`.
 * - `'error'` -- An error occurred; can transition back to `'idle'`.
 *
 * @see {@link SimpleAudioPlaybackStateMachine} for the analogous playback state machine.
 * @see {@link SimpleProcessingStateMachine} for the LLM processing state machine.
 */

import type { Logger } from '../../utils/logger';

/**
 * All valid states for the audio capture state machine.
 *
 * @remarks
 * The capture lifecycle flows as:
 *
 * ```
 * idle -> starting -> active -> paused -> active  (pause/resume cycle)
 *                        |         |
 *                        v         v
 *                      stopped   stopped -> idle  (reset)
 *
 * Any state -> error -> idle  (error recovery)
 * ```
 */
export type AudioCaptureState = 'idle' | 'starting' | 'active' | 'paused' | 'stopped' | 'error';

/**
 * Callback invoked when the audio capture state changes.
 *
 * @param newState - The capture state after the transition.
 * @param oldState - The capture state before the transition.
 *
 * @example
 * ```ts
 * const callback: AudioCaptureStateCallback = (newState, oldState) => {
 *   console.log(`Capture: ${oldState} -> ${newState}`);
 * };
 * ```
 */
export type AudioCaptureStateCallback = (
  newState: AudioCaptureState,
  oldState: AudioCaptureState
) => void;

/**
 * Defines the valid state transitions for the audio capture state machine.
 *
 * @remarks
 * Each key is a source state and the corresponding array lists the states it
 * may transition to. Attempting any transition not listed here will throw an
 * `Error`.
 *
 * The transition graph:
 *
 * | From       | Allowed Targets             |
 * |------------|-----------------------------|
 * | `idle`     | `starting`, `error`         |
 * | `starting` | `active`, `error`           |
 * | `active`   | `paused`, `stopped`, `error`|
 * | `paused`   | `active`, `stopped`, `error`|
 * | `stopped`  | `idle`                      |
 * | `error`    | `idle`                      |
 *
 * Both `stopped` and `error` are terminal-like states that can only cycle back
 * to `idle`, enabling a clean restart.
 */
const CAPTURE_TRANSITIONS: Record<AudioCaptureState, AudioCaptureState[]> = {
  idle: ['starting', 'error'],
  starting: ['active', 'error'],
  active: ['paused', 'stopped', 'error'],
  paused: ['active', 'stopped', 'error'],
  stopped: ['idle'],
  error: ['idle'],
};

/**
 * A simple finite state machine for tracking audio capture state.
 *
 * @remarks
 * This class is a pure state tracker. It validates transitions against the
 * {@link CAPTURE_TRANSITIONS} graph and notifies registered callbacks on every
 * successful transition. It does **not** interact with audio hardware or
 * providers.
 *
 * Use the state setter methods ({@link SimpleAudioCaptureStateMachine.setIdle | setIdle},
 * {@link SimpleAudioCaptureStateMachine.setStarting | setStarting}, etc.) to drive
 * transitions. Invalid transitions throw an `Error`.
 *
 * @example
 * ```ts
 * import { SimpleAudioCaptureStateMachine } from './SimpleAudioCaptureStateMachine';
 *
 * const sm = new SimpleAudioCaptureStateMachine(logger);
 *
 * sm.onStateChange((newState, oldState) => {
 *   console.log(`Capture: ${oldState} -> ${newState}`);
 * });
 *
 * sm.setStarting(); // idle -> starting
 * sm.setActive();   // starting -> active
 * sm.setPaused();   // active -> paused
 * sm.setActive();   // paused -> active
 * sm.setStopped();  // active -> stopped
 * sm.setIdle();     // stopped -> idle
 * ```
 *
 * @see {@link CAPTURE_TRANSITIONS} for the full transition graph.
 */
export class SimpleAudioCaptureStateMachine {
  private currentState: AudioCaptureState = 'idle';
  private callbacks = new Set<AudioCaptureStateCallback>();

  /**
   * Creates a new `SimpleAudioCaptureStateMachine` in the `'idle'` state.
   *
   * @param logger - Optional {@link Logger} instance for debug-level transition logs.
   */
  constructor(private logger?: Logger) {}

  /**
   * Transitions to the `'idle'` state.
   *
   * @remarks
   * Valid from `'stopped'` or `'error'` only. Used to reset the machine for a
   * new capture session.
   *
   * @throws Error if the current state does not allow transitioning to `'idle'`.
   */
  setIdle(): void {
    this.transitionTo('idle');
  }

  /**
   * Transitions to the `'starting'` state.
   *
   * @remarks
   * Valid from `'idle'` only. Indicates that microphone access has been
   * requested and the system is waiting for the stream to become active.
   *
   * @throws Error if the current state does not allow transitioning to `'starting'`.
   */
  setStarting(): void {
    this.transitionTo('starting');
  }

  /**
   * Transitions to the `'active'` state.
   *
   * @remarks
   * Valid from `'starting'` or `'paused'`. Indicates the microphone is
   * actively capturing audio data.
   *
   * @throws Error if the current state does not allow transitioning to `'active'`.
   */
  setActive(): void {
    this.transitionTo('active');
  }

  /**
   * Transitions to the `'paused'` state.
   *
   * @remarks
   * Valid from `'active'` only. Indicates that capture is temporarily
   * suspended (e.g. during TTS playback to avoid echo).
   *
   * @throws Error if the current state does not allow transitioning to `'paused'`.
   */
  setPaused(): void {
    this.transitionTo('paused');
  }

  /**
   * Transitions to the `'stopped'` state.
   *
   * @remarks
   * Valid from `'active'` or `'paused'`. Indicates that capture has ended.
   * From `'stopped'`, only {@link SimpleAudioCaptureStateMachine.setIdle | setIdle()}
   * is allowed.
   *
   * @throws Error if the current state does not allow transitioning to `'stopped'`.
   */
  setStopped(): void {
    this.transitionTo('stopped');
  }

  /**
   * Transitions to the `'error'` state.
   *
   * @remarks
   * Valid from any state except `'stopped'` and `'error'` itself. Indicates a
   * capture failure. From `'error'`, only
   * {@link SimpleAudioCaptureStateMachine.setIdle | setIdle()} is allowed.
   *
   * @throws Error if the current state does not allow transitioning to `'error'`.
   */
  setError(): void {
    this.transitionTo('error');
  }

  /**
   * Returns the current capture state.
   *
   * @returns The current {@link AudioCaptureState}.
   */
  getState(): AudioCaptureState {
    return this.currentState;
  }

  /**
   * Checks whether the machine is in the `'active'` state (actively capturing audio).
   *
   * @returns `true` if the current state is `'active'`.
   */
  isCapturing(): boolean {
    return this.currentState === 'active';
  }

  /**
   * Checks whether the machine is in the `'paused'` state.
   *
   * @returns `true` if the current state is `'paused'`.
   */
  isPaused(): boolean {
    return this.currentState === 'paused';
  }

  /**
   * Registers a callback that fires whenever the capture state changes.
   *
   * @remarks
   * The callback is invoked synchronously after each successful transition.
   * Errors thrown by the callback are caught and logged, preventing one
   * callback from blocking others.
   *
   * @param callback - The {@link AudioCaptureStateCallback} to invoke on state changes.
   * @returns An unsubscribe function. Call it to remove the callback.
   *
   * @example
   * ```ts
   * const unsubscribe = sm.onStateChange((newState, oldState) => {
   *   updateMicIcon(newState);
   * });
   *
   * // Later:
   * unsubscribe();
   * ```
   */
  onStateChange(callback: AudioCaptureStateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Attempts to transition to the given state, validating against
   * {@link CAPTURE_TRANSITIONS}.
   *
   * @param newState - The target state.
   *
   * @throws Error if the transition from the current state to `newState` is not
   *   listed in {@link CAPTURE_TRANSITIONS}.
   */
  private transitionTo(newState: AudioCaptureState): void {
    if (!this.canTransitionTo(newState)) {
      throw new Error(`Invalid capture state transition: ${this.currentState} -> ${newState}`);
    }
    const oldState = this.currentState;
    this.currentState = newState;
    this.logger?.debug(`Capture state: ${oldState} -> ${newState}`);
    this.notifyCallbacks(newState, oldState);
  }

  /**
   * Checks whether a transition to the given state is valid from the current state.
   *
   * @param newState - The target state to check.
   * @returns `true` if the transition is allowed.
   */
  private canTransitionTo(newState: AudioCaptureState): boolean {
    const validTransitions = CAPTURE_TRANSITIONS[this.currentState];
    return validTransitions?.includes(newState) ?? false;
  }

  /**
   * Notifies all registered callbacks of a state change.
   *
   * @param newState - The state after the transition.
   * @param oldState - The state before the transition.
   */
  private notifyCallbacks(newState: AudioCaptureState, oldState: AudioCaptureState): void {
    for (const callback of this.callbacks) {
      try {
        callback(newState, oldState);
      } catch (error) {
        this.logger?.error('Error in capture state change callback', error);
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
    this.logger?.debug('SimpleAudioCaptureStateMachine disposed');
  }
}
