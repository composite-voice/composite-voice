/**
 * Agent State Machine
 * Orchestrates and derives high-level agent state from the 3 underlying state machines
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
 * State transition callback
 */
export type StateTransitionCallback = (newState: AgentState, oldState: AgentState) => void;

/**
 * Agent State Machine
 * Subscribes to capture, playback, and processing state machines
 * Derives high-level agent state from their combined states
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

  constructor(logger?: Logger) {
    this.logger = logger?.child('AgentStateMachine');
  }

  /**
   * Initialize by subscribing to the 3 state machines
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
   * Derive high-level agent state from the 3 state machines
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
   * Calculate agent state from sub-machine states
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
   * Get current agent state
   */
  getState(): AgentState {
    return this.currentState;
  }

  /**
   * Get previous agent state
   */
  getPreviousState(): AgentState {
    return this.previousState;
  }

  /**
   * Check if in a specific state
   */
  is(state: AgentState): boolean {
    return this.currentState === state;
  }

  /**
   * Check if in any of the provided states
   */
  isIn(...states: AgentState[]): boolean {
    return states.includes(this.currentState);
  }

  /**
   * Register state change callback
   */
  onStateChange(callback: StateTransitionCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Reset to idle state
   */
  reset(): void {
    const oldState = this.currentState;
    this.currentState = 'idle';
    this.previousState = oldState;
    this.logger?.info('Agent state reset to idle');
    this.notifyCallbacks('idle', oldState);
  }

  /**
   * Force set to error state (e.g., from external error)
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
   * Dispose and clean up
   */
  dispose(): void {
    // Unsubscribe from all state machines
    this.unsubscribeFns.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeFns = [];

    this.callbacks.clear();

    // Clear references (using delete to avoid undefined assignment issues)
    delete (this as any).captureStateMachine;
    delete (this as any).playbackStateMachine;
    delete (this as any).processingStateMachine;

    this.logger?.info('AgentStateMachine disposed');
  }

  /**
   * Notify all callbacks of state change
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
   * Get diagnostic info about current state
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
