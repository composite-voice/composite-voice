/**
 * Simple Processing State Machine
 * Tracks LLM processing state only - does NOT manage providers
 */

import type { Logger } from '../../utils/logger';

export type ProcessingState = 'idle' | 'processing' | 'streaming' | 'complete' | 'error';
export type ProcessingStateCallback = (
  newState: ProcessingState,
  oldState: ProcessingState
) => void;

const PROCESSING_TRANSITIONS: Record<ProcessingState, ProcessingState[]> = {
  idle: ['processing', 'error'],
  processing: ['streaming', 'complete', 'error'],
  streaming: ['complete', 'error'],
  complete: ['idle'],
  error: ['idle'],
};

export class SimpleProcessingStateMachine {
  private currentState: ProcessingState = 'idle';
  private callbacks = new Set<ProcessingStateCallback>();

  constructor(private logger?: Logger) {}

  // State setters
  setIdle(): void {
    this.transitionTo('idle');
  }

  setProcessing(): void {
    this.transitionTo('processing');
  }

  setStreaming(): void {
    this.transitionTo('streaming');
  }

  setComplete(): void {
    this.transitionTo('complete');
  }

  setError(): void {
    this.transitionTo('error');
  }

  // State getters
  getState(): ProcessingState {
    return this.currentState;
  }

  isProcessing(): boolean {
    return this.currentState === 'processing' || this.currentState === 'streaming';
  }

  isComplete(): boolean {
    return this.currentState === 'complete';
  }

  // State change subscription
  onStateChange(callback: ProcessingStateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  // Internal
  private transitionTo(newState: ProcessingState): void {
    if (!this.canTransitionTo(newState)) {
      throw new Error(`Invalid processing state transition: ${this.currentState} -> ${newState}`);
    }
    const oldState = this.currentState;
    this.currentState = newState;
    this.logger?.debug(`Processing state: ${oldState} -> ${newState}`);
    this.notifyCallbacks(newState, oldState);
  }

  private canTransitionTo(newState: ProcessingState): boolean {
    const validTransitions = PROCESSING_TRANSITIONS[this.currentState];
    return validTransitions?.includes(newState) ?? false;
  }

  private notifyCallbacks(newState: ProcessingState, oldState: ProcessingState): void {
    for (const callback of this.callbacks) {
      try {
        callback(newState, oldState);
      } catch (error) {
        this.logger?.error('Error in processing state change callback', error);
      }
    }
  }

  dispose(): void {
    this.callbacks.clear();
    this.logger?.debug('SimpleProcessingStateMachine disposed');
  }
}
