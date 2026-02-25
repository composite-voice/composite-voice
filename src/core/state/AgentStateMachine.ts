/**
 * Agent State Machine
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the top-level {@link AgentStateMachine} that orchestrates
 * and derives a high-level {@link AgentState} from three underlying sub-machines:
 *
 * - {@link SimpleAudioCaptureStateMachine} (microphone capture)
 * - {@link SimpleAudioPlaybackStateMachine} (TTS audio playback)
 * - {@link SimpleProcessingStateMachine} (LLM processing)
 *
 * Rather than maintaining its own independent state transitions, the
 * `AgentStateMachine` subscribes to change events from each sub-machine and
 * recomputes its derived state whenever any sub-machine changes. This ensures
 * the agent state is always a consistent reflection of the overall system.
 */

import type { AgentState } from '../events/types';
import type { SimpleAudioCaptureStateMachine } from './SimpleAudioCaptureStateMachine';
import type { AudioCaptureState } from './SimpleAudioCaptureStateMachine';
import type { SimpleAudioPlaybackStateMachine } from './SimpleAudioPlaybackStateMachine';
import type { PlaybackState } from './SimpleAudioPlaybackStateMachine';
import type { SimpleProcessingStateMachine } from './SimpleProcessingStateMachine';
import type { ProcessingState } from './SimpleProcessingStateMachine';
import { Logger } from '../../utils/logger';

/**
 * Callback invoked whenever the derived agent state changes.
 *
 * @remarks
 * The callback receives both the new state and the previous state, enabling
 * consumers to implement transition-specific logic (e.g. "was listening, now
 * thinking").
 *
 * @param newState - The agent state after the transition.
 * @param oldState - The agent state before the transition.
 *
 * @example
 * ```ts
 * const onTransition: StateTransitionCallback = (newState, oldState) => {
 *   console.log(`Agent transitioned from ${oldState} to ${newState}`);
 * };
 * ```
 */
export type StateTransitionCallback = (newState: AgentState, oldState: AgentState) => void;

/**
 * Orchestrator state machine that derives a high-level {@link AgentState} from
 * three underlying sub-machines: capture, playback, and processing.
 *
 * @remarks
 * The `AgentStateMachine` does not define its own explicit state transition
 * graph. Instead, it subscribes to the three sub-machines provided via
 * {@link AgentStateMachine.initialize | initialize()} and re-derives its state
 * every time any sub-machine emits a change. The derivation follows a strict
 * priority order (see {@link AgentStateMachine.calculateAgentState | calculateAgentState}):
 *
 * 1. **error** -- If any sub-machine is in an error state, the agent is in error.
 * 2. **speaking** -- If playback is `playing` or `buffering`, the agent is speaking.
 * 3. **thinking** -- If processing is `processing` or `streaming`, the agent is thinking.
 * 4. **listening** -- If capture is `active`, the agent is listening.
 * 5. **ready** -- If all sub-machines are idle or capture is stopped/paused.
 * 6. **idle** -- Initial state before {@link AgentStateMachine.initialize | initialize()} is called, or after {@link AgentStateMachine.reset | reset()}.
 *
 * @example
 * ```ts
 * import { AgentStateMachine } from './AgentStateMachine';
 *
 * const agentSM = new AgentStateMachine(logger);
 *
 * // Observe state changes
 * const unsubscribe = agentSM.onStateChange((newState, oldState) => {
 *   console.log(`Agent: ${oldState} -> ${newState}`);
 * });
 *
 * // Initialize with the three sub-machines
 * agentSM.initialize(captureSM, playbackSM, processingSM);
 *
 * // Query state at any time
 * console.log(agentSM.getState()); // e.g. 'ready'
 * console.log(agentSM.is('listening')); // false
 *
 * // Clean up
 * unsubscribe();
 * agentSM.dispose();
 * ```
 */
export class AgentStateMachine {
  private currentState: AgentState = 'idle';
  private previousState: AgentState = 'idle';
  private callbacks: Set<StateTransitionCallback> = new Set();
  private logger: Logger | undefined;

  // References to the 3 state machines
  private captureStateMachine?: SimpleAudioCaptureStateMachine;
  private playbackStateMachine?: SimpleAudioPlaybackStateMachine;
  private processingStateMachine?: SimpleProcessingStateMachine;

  // Unsubscribe functions
  private unsubscribeFns: Array<() => void> = [];

  /**
   * Creates a new `AgentStateMachine`.
   *
   * @remarks
   * The machine starts in the `'idle'` state. Call {@link AgentStateMachine.initialize | initialize()}
   * with the three sub-machines to begin deriving state.
   *
   * @param logger - Optional {@link Logger} instance for diagnostic output.
   *   A child logger named `'AgentStateMachine'` is created if provided.
   */
  constructor(logger?: Logger) {
    this.logger = logger?.child('AgentStateMachine');
  }

  /**
   * Subscribe to the three sub-machines and begin deriving agent state.
   *
   * @remarks
   * This method stores references to the sub-machines, subscribes to their
   * `onStateChange` events, and performs an initial state derivation. It should
   * be called exactly once after construction. Calling it again without first
   * calling {@link AgentStateMachine.dispose | dispose()} will add duplicate
   * subscriptions.
   *
   * @param captureStateMachine - The audio capture sub-machine tracking microphone state.
   * @param playbackStateMachine - The audio playback sub-machine tracking TTS output state.
   * @param processingStateMachine - The processing sub-machine tracking LLM state.
   */
  initialize(
    captureStateMachine: SimpleAudioCaptureStateMachine,
    playbackStateMachine: SimpleAudioPlaybackStateMachine,
    processingStateMachine: SimpleProcessingStateMachine
  ): void {
    this.captureStateMachine = captureStateMachine;
    this.playbackStateMachine = playbackStateMachine;
    this.processingStateMachine = processingStateMachine;

    // Subscribe to all state changes
    this.unsubscribeFns.push(
      captureStateMachine.onStateChange(() => this.deriveAgentState()),
      playbackStateMachine.onStateChange(() => this.deriveAgentState()),
      processingStateMachine.onStateChange(() => this.deriveAgentState())
    );

    this.logger?.info('AgentStateMachine initialized and subscribed to sub-machines');

    // Derive initial state
    this.deriveAgentState();
  }

  /**
   * Re-derive the high-level agent state from the current sub-machine states.
   *
   * @remarks
   * This method is called automatically whenever any sub-machine emits a state
   * change. It reads the current state from all three sub-machines, calculates
   * the new agent state via {@link AgentStateMachine.calculateAgentState | calculateAgentState},
   * and emits a notification if the derived state has changed.
   *
   * If the sub-machines have not been set (i.e. {@link AgentStateMachine.initialize | initialize()}
   * has not been called), this method is a no-op.
   */
  private deriveAgentState(): void {
    if (!this.captureStateMachine || !this.playbackStateMachine || !this.processingStateMachine) {
      return;
    }

    const captureState = this.captureStateMachine.getState();
    const playbackState = this.playbackStateMachine.getState();
    const processingState = this.processingStateMachine.getState();

    const newState = this.calculateAgentState(captureState, playbackState, processingState);

    if (newState !== this.currentState) {
      const oldState = this.currentState;
      this.previousState = oldState;
      this.currentState = newState;

      this.logger?.info(
        `Agent state: ${oldState} -> ${newState} ` +
          `(capture: ${captureState}, playback: ${playbackState}, processing: ${processingState})`
      );

      this.notifyCallbacks(newState, oldState);
    }
  }

  /**
   * Calculate the agent state from the three sub-machine states using priority rules.
   *
   * @remarks
   * The derivation follows a strict priority order to resolve conflicts when
   * multiple sub-machines are active simultaneously:
   *
   * | Priority | Condition | Agent State |
   * |----------|-----------|-------------|
   * | 1 (highest) | Any sub-machine is `'error'` | `'error'` |
   * | 2 | Playback is `'playing'` or `'buffering'` | `'speaking'` |
   * | 3 | Processing is `'processing'` or `'streaming'` | `'thinking'` |
   * | 4 | Capture is `'active'` | `'listening'` |
   * | 5 (lowest) | All sub-machines are `'idle'`, or capture is `'stopped'`/`'paused'` | `'ready'` |
   *
   * This means that if the LLM is streaming while audio is also playing back,
   * the agent will report `'speaking'` (playback wins over processing). Similarly,
   * if the user is speaking while the LLM is processing, the agent reports
   * `'thinking'` (processing wins over capture).
   *
   * @param captureState - Current state of the audio capture sub-machine.
   * @param playbackState - Current state of the audio playback sub-machine.
   * @param processingState - Current state of the LLM processing sub-machine.
   * @returns The derived {@link AgentState}.
   */
  private calculateAgentState(
    captureState: AudioCaptureState,
    playbackState: PlaybackState,
    processingState: ProcessingState
  ): AgentState {
    // Error state takes precedence
    if (captureState === 'error' || playbackState === 'error' || processingState === 'error') {
      return 'error';
    }

    // Speaking: When playback is active
    if (playbackState === 'playing' || playbackState === 'buffering') {
      return 'speaking';
    }

    // Thinking: When LLM is processing
    if (processingState === 'processing' || processingState === 'streaming') {
      return 'thinking';
    }

    // Listening: When capture is active
    if (captureState === 'active') {
      return 'listening';
    }

    // Idle: Before initialization (all undefined/not set)
    // Ready: When all machines are idle (initialized and ready to start)
    if (captureState === 'idle' && playbackState === 'idle' && processingState === 'idle') {
      return 'ready';
    }

    // Default to ready if capture is stopped/paused
    return 'ready';
  }

  /**
   * Returns the current derived agent state.
   *
   * @returns The current {@link AgentState} value.
   */
  getState(): AgentState {
    return this.currentState;
  }

  /**
   * Returns the agent state that was active immediately before the most recent transition.
   *
   * @remarks
   * Before any transition has occurred, this returns `'idle'` (the initial state).
   *
   * @returns The previous {@link AgentState} value.
   */
  getPreviousState(): AgentState {
    return this.previousState;
  }

  /**
   * Checks whether the agent is currently in the specified state.
   *
   * @param state - The {@link AgentState} to compare against.
   * @returns `true` if the current state matches, `false` otherwise.
   *
   * @example
   * ```ts
   * if (agentSM.is('speaking')) {
   *   muteIndicator.show();
   * }
   * ```
   */
  is(state: AgentState): boolean {
    return this.currentState === state;
  }

  /**
   * Checks whether the agent is currently in any of the specified states.
   *
   * @param states - One or more {@link AgentState} values to check.
   * @returns `true` if the current state matches any of the provided values.
   *
   * @example
   * ```ts
   * if (agentSM.isIn('thinking', 'speaking')) {
   *   interruptButton.enable();
   * }
   * ```
   */
  isIn(...states: AgentState[]): boolean {
    return states.includes(this.currentState);
  }

  /**
   * Registers a callback that is invoked whenever the derived agent state changes.
   *
   * @remarks
   * Multiple callbacks can be registered. Each callback receives the new and old
   * state values. Callbacks are invoked synchronously in registration order.
   * Errors thrown by individual callbacks are caught and logged but do not
   * prevent other callbacks from executing.
   *
   * @param callback - The {@link StateTransitionCallback} to invoke on state changes.
   * @returns An unsubscribe function. Call it to remove the callback.
   *
   * @example
   * ```ts
   * const unsubscribe = agentSM.onStateChange((newState, oldState) => {
   *   updateUI(newState);
   * });
   *
   * // Later, when no longer needed:
   * unsubscribe();
   * ```
   */
  onStateChange(callback: StateTransitionCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Resets the agent state to `'idle'` regardless of the current sub-machine states.
   *
   * @remarks
   * This forces a state change notification with `'idle'` as the new state. It
   * does **not** reset or modify the underlying sub-machines. Typically used
   * when tearing down a session before calling {@link AgentStateMachine.dispose | dispose()}.
   */
  reset(): void {
    const oldState = this.currentState;
    this.currentState = 'idle';
    this.previousState = oldState;
    this.logger?.info('Agent state reset to idle');
    this.notifyCallbacks('idle', oldState);
  }

  /**
   * Forces the agent state to `'error'`.
   *
   * @remarks
   * This is intended for external error conditions that are not captured by any
   * of the sub-machines (e.g. a network failure detected at a higher level).
   * If the agent is already in the `'error'` state, this method is a no-op.
   */
  setError(): void {
    if (this.currentState !== 'error') {
      const oldState = this.currentState;
      this.previousState = oldState;
      this.currentState = 'error';
      this.logger?.error('Agent state forced to error');
      this.notifyCallbacks('error', oldState);
    }
  }

  /**
   * Disposes of the agent state machine by unsubscribing from all sub-machines
   * and clearing all registered callbacks.
   *
   * @remarks
   * After disposal, references to the sub-machines are released and no further
   * state derivations will occur. This method is safe to call multiple times.
   */
  dispose(): void {
    // Unsubscribe from all state machines
    this.unsubscribeFns.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeFns = [];

    this.callbacks.clear();

    // Clear references
    delete this.captureStateMachine;
    delete this.playbackStateMachine;
    delete this.processingStateMachine;

    this.logger?.info('AgentStateMachine disposed');
  }

  /**
   * Notify all registered callbacks of a state change.
   *
   * @remarks
   * Errors thrown by individual callbacks are caught and logged to prevent one
   * misbehaving callback from blocking others.
   *
   * @param newState - The agent state after the transition.
   * @param oldState - The agent state before the transition.
   */
  private notifyCallbacks(newState: AgentState, oldState: AgentState): void {
    for (const callback of this.callbacks) {
      try {
        callback(newState, oldState);
      } catch (error) {
        this.logger?.error('Error in state change callback', error);
      }
    }
  }

  /**
   * Returns diagnostic information about the current agent state and the states
   * of all three sub-machines.
   *
   * @remarks
   * Useful for debugging and logging. If a sub-machine has not been set (i.e.
   * {@link AgentStateMachine.initialize | initialize()} was not called), its
   * state is reported as `null`.
   *
   * @returns An object containing the current agent state and the states of
   *   the capture, playback, and processing sub-machines.
   *
   * @example
   * ```ts
   * const diag = agentSM.getDiagnostics();
   * console.log(diag);
   * // {
   * //   agentState: 'listening',
   * //   captureState: 'active',
   * //   playbackState: 'idle',
   * //   processingState: 'idle'
   * // }
   * ```
   */
  getDiagnostics(): {
    agentState: AgentState;
    captureState: AudioCaptureState | null;
    playbackState: PlaybackState | null;
    processingState: ProcessingState | null;
  } {
    return {
      agentState: this.currentState,
      captureState: this.captureStateMachine?.getState() ?? null,
      playbackState: this.playbackStateMachine?.getState() ?? null,
      processingState: this.processingStateMachine?.getState() ?? null,
    };
  }
}
