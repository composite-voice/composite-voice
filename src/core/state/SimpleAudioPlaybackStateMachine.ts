/**
 * Simple Audio Playback State Machine
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides a lightweight finite state machine for tracking audio
 * playback (TTS output) state. It is a pure state tracker -- it does **not**
 * manage audio players or output hardware. State transitions are validated
 * against an explicit transition graph defined by {@link PLAYBACK_TRANSITIONS}.
 *
 * The valid states are:
 *
 * - `'idle'` -- No audio is playing and no data is buffered.
 * - `'buffering'` -- Audio chunks are being queued before playback begins.
 * - `'playing'` -- Audio is actively being played through the output device.
 * - `'paused'` -- Playback is temporarily suspended.
 * - `'stopped'` -- Playback has been explicitly stopped; can transition back to `'idle'`.
 * - `'error'` -- A playback error occurred; can transition back to `'idle'`.
 *
 * @see {@link SimpleAudioCaptureStateMachine} for the analogous capture state machine.
 * @see {@link SimpleProcessingStateMachine} for the LLM processing state machine.
 */

import type { Logger } from '../../utils/logger';

/**
 * All valid states for the audio playback state machine.
 *
 * @remarks
 * The playback lifecycle flows as:
 *
 * ```
 * idle -> buffering -> playing -> paused -> playing  (pause/resume cycle)
 *            |            |         |
 *            v            v         v
 *          stopped     stopped   stopped -> idle  (reset)
 *
 * Any state -> error -> idle  (error recovery)
 * ```
 */
export type PlaybackState = 'idle' | 'buffering' | 'playing' | 'paused' | 'stopped' | 'error';

/**
 * Callback invoked when the audio playback state changes.
 *
 * @param newState - The playback state after the transition.
 * @param oldState - The playback state before the transition.
 *
 * @example
 * ```ts
 * const callback: PlaybackStateCallback = (newState, oldState) => {
 *   console.log(`Playback: ${oldState} -> ${newState}`);
 * };
 * ```
 */
export type PlaybackStateCallback = (newState: PlaybackState, oldState: PlaybackState) => void;

/**
 * Defines the valid state transitions for the audio playback state machine.
 *
 * @remarks
 * Each key is a source state and the corresponding array lists the states it
 * may transition to. Attempting any transition not listed here will throw an
 * `Error`.
 *
 * The transition graph:
 *
 * | From        | Allowed Targets                |
 * |-------------|--------------------------------|
 * | `idle`      | `buffering`, `error`           |
 * | `buffering` | `playing`, `stopped`, `error`  |
 * | `playing`   | `paused`, `stopped`, `error`   |
 * | `paused`    | `playing`, `stopped`, `error`  |
 * | `stopped`   | `idle`                         |
 * | `error`     | `idle`                         |
 *
 * Both `stopped` and `error` are terminal-like states that can only cycle back
 * to `idle`, enabling a clean restart.
 */
const PLAYBACK_TRANSITIONS: Record<PlaybackState, PlaybackState[]> = {
  idle: ['buffering', 'error'],
  buffering: ['playing', 'stopped', 'error'],
  playing: ['paused', 'stopped', 'error'],
  paused: ['playing', 'stopped', 'error'],
  stopped: ['idle'],
  error: ['idle'],
};

/**
 * A simple finite state machine for tracking audio playback state.
 *
 * @remarks
 * This class is a pure state tracker. It validates transitions against the
 * {@link PLAYBACK_TRANSITIONS} graph and notifies registered callbacks on every
 * successful transition. It does **not** interact with audio hardware or
 * player instances.
 *
 * Use the state setter methods ({@link SimpleAudioPlaybackStateMachine.setIdle | setIdle},
 * {@link SimpleAudioPlaybackStateMachine.setBuffering | setBuffering}, etc.) to drive
 * transitions. Invalid transitions throw an `Error`.
 *
 * @example
 * ```ts
 * import { SimpleAudioPlaybackStateMachine } from './SimpleAudioPlaybackStateMachine';
 *
 * const sm = new SimpleAudioPlaybackStateMachine(logger);
 *
 * sm.onStateChange((newState, oldState) => {
 *   console.log(`Playback: ${oldState} -> ${newState}`);
 * });
 *
 * sm.setBuffering(); // idle -> buffering
 * sm.setPlaying();   // buffering -> playing
 * sm.setPaused();    // playing -> paused
 * sm.setPlaying();   // paused -> playing
 * sm.setStopped();   // playing -> stopped
 * sm.setIdle();      // stopped -> idle
 * ```
 *
 * @see {@link PLAYBACK_TRANSITIONS} for the full transition graph.
 */
export class SimpleAudioPlaybackStateMachine {
  private currentState: PlaybackState = 'idle';
  private callbacks = new Set<PlaybackStateCallback>();

  /**
   * Creates a new `SimpleAudioPlaybackStateMachine` in the `'idle'` state.
   *
   * @param logger - Optional {@link Logger} instance for debug-level transition logs.
   */
  constructor(private logger?: Logger) {}

  /**
   * Transitions to the `'idle'` state.
   *
   * @remarks
   * Valid from `'stopped'` or `'error'` only. Used to reset the machine for a
   * new playback session.
   *
   * @throws Error if the current state does not allow transitioning to `'idle'`.
   */
  setIdle(): void {
    this.transitionTo('idle');
  }

  /**
   * Transitions to the `'buffering'` state.
   *
   * @remarks
   * Valid from `'idle'` only. Indicates that audio chunks are being queued in
   * preparation for playback, waiting for the minimum buffer duration to be met.
   *
   * @throws Error if the current state does not allow transitioning to `'buffering'`.
   */
  setBuffering(): void {
    this.transitionTo('buffering');
  }

  /**
   * Transitions to the `'playing'` state.
   *
   * @remarks
   * Valid from `'buffering'` or `'paused'`. Indicates audio is actively being
   * played through the output device.
   *
   * @throws Error if the current state does not allow transitioning to `'playing'`.
   */
  setPlaying(): void {
    this.transitionTo('playing');
  }

  /**
   * Transitions to the `'paused'` state.
   *
   * @remarks
   * Valid from `'playing'` only. Indicates playback is temporarily suspended.
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
   * Valid from `'buffering'`, `'playing'`, or `'paused'`. Indicates playback
   * has been explicitly stopped. From `'stopped'`, only
   * {@link SimpleAudioPlaybackStateMachine.setIdle | setIdle()} is allowed.
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
   * playback failure. From `'error'`, only
   * {@link SimpleAudioPlaybackStateMachine.setIdle | setIdle()} is allowed.
   *
   * @throws Error if the current state does not allow transitioning to `'error'`.
   */
  setError(): void {
    this.transitionTo('error');
  }

  /**
   * Returns the current playback state.
   *
   * @returns The current {@link PlaybackState}.
   */
  getState(): PlaybackState {
    return this.currentState;
  }

  /**
   * Checks whether the machine is actively playing audio.
   *
   * @remarks
   * Returns `true` for both `'playing'` and `'buffering'` states, since
   * buffering is considered part of an active playback session.
   *
   * @returns `true` if the current state is `'playing'` or `'buffering'`.
   */
  isPlaying(): boolean {
    return this.currentState === 'playing' || this.currentState === 'buffering';
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
   * Registers a callback that fires whenever the playback state changes.
   *
   * @remarks
   * The callback is invoked synchronously after each successful transition.
   * Errors thrown by the callback are caught and logged, preventing one
   * callback from blocking others.
   *
   * @param callback - The {@link PlaybackStateCallback} to invoke on state changes.
   * @returns An unsubscribe function. Call it to remove the callback.
   *
   * @example
   * ```ts
   * const unsubscribe = sm.onStateChange((newState, oldState) => {
   *   updateSpeakerIcon(newState);
   * });
   *
   * // Later:
   * unsubscribe();
   * ```
   */
  onStateChange(callback: PlaybackStateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Attempts to transition to the given state, validating against
   * {@link PLAYBACK_TRANSITIONS}.
   *
   * @param newState - The target state.
   *
   * @throws Error if the transition from the current state to `newState` is not
   *   listed in {@link PLAYBACK_TRANSITIONS}.
   */
  private transitionTo(newState: PlaybackState): void {
    if (!this.canTransitionTo(newState)) {
      throw new Error(`Invalid playback state transition: ${this.currentState} -> ${newState}`);
    }
    const oldState = this.currentState;
    this.currentState = newState;
    this.logger?.debug(`Playback state: ${oldState} -> ${newState}`);
    this.notifyCallbacks(newState, oldState);
  }

  /**
   * Checks whether a transition to the given state is valid from the current state.
   *
   * @param newState - The target state to check.
   * @returns `true` if the transition is allowed.
   */
  private canTransitionTo(newState: PlaybackState): boolean {
    const validTransitions = PLAYBACK_TRANSITIONS[this.currentState];
    return validTransitions?.includes(newState) ?? false;
  }

  /**
   * Notifies all registered callbacks of a state change.
   *
   * @param newState - The state after the transition.
   * @param oldState - The state before the transition.
   */
  private notifyCallbacks(newState: PlaybackState, oldState: PlaybackState): void {
    for (const callback of this.callbacks) {
      try {
        callback(newState, oldState);
      } catch (error) {
        this.logger?.error('Error in playback state change callback', error);
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
    this.logger?.debug('SimpleAudioPlaybackStateMachine disposed');
  }
}
