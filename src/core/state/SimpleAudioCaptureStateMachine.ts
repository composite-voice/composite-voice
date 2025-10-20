/**
 * Simple Audio Capture State Machine
 * Tracks state only - does NOT manage providers
 */

import type { Logger } from '../../utils/logger';

export type AudioCaptureState = 'idle' | 'starting' | 'active' | 'paused' | 'stopped' | 'error';
export type AudioCaptureStateCallback = (
  newState: AudioCaptureState,
  oldState: AudioCaptureState
) => void;

const CAPTURE_TRANSITIONS: Record<AudioCaptureState, AudioCaptureState[]> = {
  idle: ['starting', 'error'],
  starting: ['active', 'error'],
  active: ['paused', 'stopped', 'error'],
  paused: ['active', 'stopped', 'error'],
  stopped: ['idle'],
  error: ['idle'],
};

export class SimpleAudioCaptureStateMachine {
  private currentState: AudioCaptureState = 'idle';
  private callbacks = new Set<AudioCaptureStateCallback>();

  constructor(private logger?: Logger) {}

  // State setters
  setIdle(): void {
    this.transitionTo('idle');
  }

  setStarting(): void {
    this.transitionTo('starting');
  }

  setActive(): void {
    this.transitionTo('active');
  }

  setPaused(): void {
    this.transitionTo('paused');
  }

  setStopped(): void {
    this.transitionTo('stopped');
  }

  setError(): void {
    this.transitionTo('error');
  }

  // State getters
  getState(): AudioCaptureState {
    return this.currentState;
  }

  isCapturing(): boolean {
    return this.currentState === 'active';
  }

  isPaused(): boolean {
    return this.currentState === 'paused';
  }

  // State change subscription
  onStateChange(callback: AudioCaptureStateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  // Internal
  private transitionTo(newState: AudioCaptureState): void {
    if (!this.canTransitionTo(newState)) {
      throw new Error(`Invalid capture state transition: ${this.currentState} -> ${newState}`);
    }
    const oldState = this.currentState;
    this.currentState = newState;
    this.logger?.debug(`Capture state: ${oldState} -> ${newState}`);
    this.notifyCallbacks(newState, oldState);
  }

  private canTransitionTo(newState: AudioCaptureState): boolean {
    const validTransitions = CAPTURE_TRANSITIONS[this.currentState];
    return validTransitions?.includes(newState) ?? false;
  }

  private notifyCallbacks(newState: AudioCaptureState, oldState: AudioCaptureState): void {
    for (const callback of this.callbacks) {
      try {
        callback(newState, oldState);
      } catch (error) {
        this.logger?.error('Error in capture state change callback', error);
      }
    }
  }

  dispose(): void {
    this.callbacks.clear();
    this.logger?.debug('SimpleAudioCaptureStateMachine disposed');
  }
}
