/**
 * Agent state machine
 */

import type { AgentState } from '../events/types';
import { Logger } from '../../utils/logger';
import { InvalidStateError } from '../../utils/errors';

/**
 * State transition callback
 */
export type StateTransitionCallback = (newState: AgentState, oldState: AgentState) => void;

/**
 * Valid state transitions
 */
const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ['ready', 'error'],
  ready: ['listening', 'error'],
  listening: ['thinking', 'ready', 'error'],
  thinking: ['speaking', 'ready', 'error'],
  speaking: ['ready', 'listening', 'error'],
  error: ['ready', 'idle'],
};

/**
 * Agent state manager
 */
export class AgentStateMachine {
  private currentState: AgentState = 'idle';
  private previousState: AgentState = 'idle';
  private stateHistory: Array<{ state: AgentState; timestamp: number }> = [];
  private callbacks: Set<StateTransitionCallback> = new Set();
  private logger: Logger | undefined;
  private maxHistorySize = 100;

  constructor(logger?: Logger) {
    this.logger = logger ? logger.child('StateMachine') : undefined;
    this.recordState('idle');
  }

  /**
   * Get current state
   */
  getState(): AgentState {
    return this.currentState;
  }

  /**
   * Get previous state
   */
  getPreviousState(): AgentState {
    return this.previousState;
  }

  /**
   * Get state history
   */
  getHistory(): Array<{ state: AgentState; timestamp: number }> {
    return [...this.stateHistory];
  }

  /**
   * Check if a state transition is valid
   */
  canTransitionTo(newState: AgentState): boolean {
    const validStates = VALID_TRANSITIONS[this.currentState];
    return validStates?.includes(newState) ?? false;
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState: AgentState, force = false): void {
    if (this.currentState === newState) {
      this.logger?.debug(`Already in state: ${newState}`);
      return;
    }

    if (!force && !this.canTransitionTo(newState)) {
      const error = new InvalidStateError(this.currentState, `transition to ${newState}`);
      this.logger?.error(error.message);
      throw error;
    }

    const oldState = this.currentState;
    this.previousState = oldState;
    this.currentState = newState;

    this.logger?.info(`State transition: ${oldState} -> ${newState}`);
    this.recordState(newState);
    this.notifyCallbacks(newState, oldState);
  }

  /**
   * Set to ready state (can be called from any state)
   */
  setReady(): void {
    this.transitionTo('ready', true);
  }

  /**
   * Set to listening state
   */
  setListening(): void {
    this.transitionTo('listening');
  }

  /**
   * Set to thinking state
   */
  setThinking(): void {
    this.transitionTo('thinking');
  }

  /**
   * Set to speaking state
   */
  setSpeaking(): void {
    this.transitionTo('speaking');
  }

  /**
   * Set to error state
   */
  setError(): void {
    this.transitionTo('error', true);
  }

  /**
   * Set to idle state
   */
  setIdle(): void {
    this.transitionTo('idle', true);
  }

  /**
   * Record state in history
   */
  private recordState(state: AgentState): void {
    this.stateHistory.push({
      state,
      timestamp: Date.now(),
    });

    // Limit history size
    if (this.stateHistory.length > this.maxHistorySize) {
      this.stateHistory.shift();
    }
  }

  /**
   * Register a state transition callback
   */
  onTransition(callback: StateTransitionCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Notify all callbacks of state transition
   */
  private notifyCallbacks(newState: AgentState, oldState: AgentState): void {
    for (const callback of this.callbacks) {
      try {
        callback(newState, oldState);
      } catch (error) {
        this.logger?.error('Error in state transition callback', error);
      }
    }
  }

  /**
   * Clear state history
   */
  clearHistory(): void {
    this.stateHistory = [
      {
        state: this.currentState,
        timestamp: Date.now(),
      },
    ];
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.logger?.info('Resetting state machine');
    this.previousState = this.currentState;
    this.currentState = 'idle';
    this.stateHistory = [
      {
        state: 'idle',
        timestamp: Date.now(),
      },
    ];
    this.notifyCallbacks('idle', this.previousState);
  }

  /**
   * Check if in a specific state
   */
  is(state: AgentState): boolean {
    return this.currentState === state;
  }

  /**
   * Check if in any of the specified states
   */
  isAnyOf(...states: AgentState[]): boolean {
    return states.includes(this.currentState);
  }

  /**
   * Get time spent in current state (ms)
   */
  getTimeInCurrentState(): number {
    const currentEntry = this.stateHistory[this.stateHistory.length - 1];
    if (!currentEntry) return 0;
    return Date.now() - currentEntry.timestamp;
  }

  /**
   * Get statistics about state durations
   */
  getStateStatistics(): Record<
    AgentState,
    { count: number; totalDuration: number; averageDuration: number }
  > {
    const stats: Record<string, { count: number; totalDuration: number; averageDuration: number }> =
      {};

    for (let i = 0; i < this.stateHistory.length - 1; i++) {
      const current = this.stateHistory[i]!;
      const next = this.stateHistory[i + 1]!;
      const duration = next.timestamp - current.timestamp;

      if (!stats[current.state]) {
        stats[current.state] = { count: 0, totalDuration: 0, averageDuration: 0 };
      }

      stats[current.state]!.count++;
      stats[current.state]!.totalDuration += duration;
    }

    // Calculate averages
    for (const state in stats) {
      const statEntry = stats[state]!;
      statEntry.averageDuration = statEntry.totalDuration / statEntry.count;
    }

    return stats as Record<
      AgentState,
      { count: number; totalDuration: number; averageDuration: number }
    >;
  }
}
