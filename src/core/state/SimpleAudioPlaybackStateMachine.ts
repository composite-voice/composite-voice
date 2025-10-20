/**
 * Simple Audio Playback State Machine
 * Tracks state only - does NOT manage players
 */

import type { Logger } from '../../utils/logger';

export type PlaybackState = 'idle' | 'buffering' | 'playing' | 'paused' | 'stopped' | 'error';
export type PlaybackStateCallback = (newState: PlaybackState, oldState: PlaybackState) => void;

const PLAYBACK_TRANSITIONS: Record<PlaybackState, PlaybackState[]> = {
  idle: ['buffering', 'error'],
  buffering: ['playing', 'stopped', 'error'],
  playing: ['paused', 'stopped', 'error'],
  paused: ['playing', 'stopped', 'error'],
  stopped: ['idle'],
  error: ['idle'],
};

export class SimpleAudioPlaybackStateMachine {
  private currentState: PlaybackState = 'idle';
  private callbacks = new Set<PlaybackStateCallback>();

  constructor(private logger?: Logger) {}

  // State setters
  setIdle(): void {
    this.transitionTo('idle');
  }

  setBuffering(): void {
    this.transitionTo('buffering');
  }

  setPlaying(): void {
    this.transitionTo('playing');
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
  getState(): PlaybackState {
    return this.currentState;
  }

  isPlaying(): boolean {
    return this.currentState === 'playing' || this.currentState === 'buffering';
  }

  isPaused(): boolean {
    return this.currentState === 'paused';
  }

  // State change subscription
  onStateChange(callback: PlaybackStateCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  // Internal
  private transitionTo(newState: PlaybackState): void {
    if (!this.canTransitionTo(newState)) {
      throw new Error(`Invalid playback state transition: ${this.currentState} -> ${newState}`);
    }
    const oldState = this.currentState;
    this.currentState = newState;
    this.logger?.debug(`Playback state: ${oldState} -> ${newState}`);
    this.notifyCallbacks(newState, oldState);
  }

  private canTransitionTo(newState: PlaybackState): boolean {
    const validTransitions = PLAYBACK_TRANSITIONS[this.currentState];
    return validTransitions?.includes(newState) ?? false;
  }

  private notifyCallbacks(newState: PlaybackState, oldState: PlaybackState): void {
    for (const callback of this.callbacks) {
      try {
        callback(newState, oldState);
      } catch (error) {
        this.logger?.error('Error in playback state change callback', error);
      }
    }
  }

  dispose(): void {
    this.callbacks.clear();
    this.logger?.debug('SimpleAudioPlaybackStateMachine disposed');
  }
}
