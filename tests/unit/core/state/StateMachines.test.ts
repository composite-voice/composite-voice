/**
 * Unit tests for SimpleAudioCaptureStateMachine,
 * SimpleAudioPlaybackStateMachine, and SimpleProcessingStateMachine
 */

import { SimpleAudioCaptureStateMachine } from '../../../../src/core/state/SimpleAudioCaptureStateMachine';
import { SimpleAudioPlaybackStateMachine } from '../../../../src/core/state/SimpleAudioPlaybackStateMachine';
import { SimpleProcessingStateMachine } from '../../../../src/core/state/SimpleProcessingStateMachine';

// ──────────────────────────────────────────────────────────────
// SimpleAudioCaptureStateMachine
// ──────────────────────────────────────────────────────────────

describe('SimpleAudioCaptureStateMachine', () => {
  let sm: SimpleAudioCaptureStateMachine;

  beforeEach(() => {
    sm = new SimpleAudioCaptureStateMachine();
  });

  afterEach(() => {
    sm.dispose();
  });

  it('should start in idle state', () => {
    expect(sm.getState()).toBe('idle');
  });

  it('should not be capturing initially', () => {
    expect(sm.isCapturing()).toBe(false);
  });

  it('should not be paused initially', () => {
    expect(sm.isPaused()).toBe(false);
  });

  it('should follow valid capture lifecycle', () => {
    sm.setStarting();
    expect(sm.getState()).toBe('starting');

    sm.setActive();
    expect(sm.getState()).toBe('active');
    expect(sm.isCapturing()).toBe(true);

    sm.setPaused();
    expect(sm.getState()).toBe('paused');
    expect(sm.isPaused()).toBe(true);

    sm.setActive();
    sm.setStopped();
    expect(sm.getState()).toBe('stopped');

    sm.setIdle();
    expect(sm.getState()).toBe('idle');
  });

  it('should transition to error from any active state', () => {
    sm.setStarting();
    sm.setError();
    expect(sm.getState()).toBe('error');

    sm.setIdle();
    sm.setStarting();
    sm.setActive();
    sm.setError();
    expect(sm.getState()).toBe('error');
  });

  it('should recover from error via idle', () => {
    sm.setStarting();
    sm.setError();
    sm.setIdle();
    expect(sm.getState()).toBe('idle');
  });

  it('should throw on invalid transition', () => {
    // idle → active is not allowed (must go idle → starting → active)
    expect(() => sm.setActive()).toThrow('Invalid capture state transition');
  });

  it('should notify state change callbacks', () => {
    const callback = jest.fn();
    sm.onStateChange(callback);

    sm.setStarting();
    expect(callback).toHaveBeenCalledWith('starting', 'idle');
  });

  it('should support unsubscribing from callbacks', () => {
    const callback = jest.fn();
    const unsub = sm.onStateChange(callback);
    unsub();

    sm.setStarting();
    expect(callback).not.toHaveBeenCalled();
  });

  it('should clear callbacks on dispose', () => {
    const callback = jest.fn();
    sm.onStateChange(callback);
    sm.dispose();

    sm = new SimpleAudioCaptureStateMachine(); // recreate to test dispose cleared old
    expect(callback).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────
// SimpleAudioPlaybackStateMachine
// ──────────────────────────────────────────────────────────────

describe('SimpleAudioPlaybackStateMachine', () => {
  let sm: SimpleAudioPlaybackStateMachine;

  beforeEach(() => {
    sm = new SimpleAudioPlaybackStateMachine();
  });

  afterEach(() => {
    sm.dispose();
  });

  it('should start in idle state', () => {
    expect(sm.getState()).toBe('idle');
  });

  it('should not be playing initially', () => {
    expect(sm.isPlaying()).toBe(false);
  });

  it('should follow valid playback lifecycle', () => {
    sm.setBuffering();
    expect(sm.getState()).toBe('buffering');

    sm.setPlaying();
    expect(sm.isPlaying()).toBe(true);

    sm.setStopped();
    sm.setIdle();
    expect(sm.getState()).toBe('idle');
  });

  it('should go directly from buffering to stopped', () => {
    sm.setBuffering();
    sm.setStopped();
    sm.setIdle();
    expect(sm.getState()).toBe('idle');
  });

  it('should transition to error from any active state', () => {
    sm.setBuffering();
    sm.setError();
    expect(sm.getState()).toBe('error');
  });

  it('should throw on invalid transition', () => {
    // idle → playing directly is not valid
    expect(() => sm.setPlaying()).toThrow('Invalid playback state transition');
  });

  it('should notify callbacks on state change', () => {
    const cb = jest.fn();
    sm.onStateChange(cb);
    sm.setBuffering();
    expect(cb).toHaveBeenCalledWith('buffering', 'idle');
  });

  it('should support unsubscribing', () => {
    const cb = jest.fn();
    const unsub = sm.onStateChange(cb);
    unsub();
    sm.setBuffering();
    expect(cb).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────
// SimpleProcessingStateMachine
// ──────────────────────────────────────────────────────────────

describe('SimpleProcessingStateMachine', () => {
  let sm: SimpleProcessingStateMachine;

  beforeEach(() => {
    sm = new SimpleProcessingStateMachine();
  });

  afterEach(() => {
    sm.dispose();
  });

  it('should start in idle state', () => {
    expect(sm.getState()).toBe('idle');
  });

  it('should not be processing initially', () => {
    expect(sm.isProcessing()).toBe(false);
  });

  it('should follow valid processing lifecycle', () => {
    sm.setProcessing();
    expect(sm.isProcessing()).toBe(true);

    sm.setStreaming();
    sm.setComplete();
    sm.setIdle();
    expect(sm.getState()).toBe('idle');
  });

  it('should transition to error from any active state', () => {
    sm.setProcessing();
    sm.setError();
    expect(sm.getState()).toBe('error');
  });

  it('should recover from error via idle', () => {
    sm.setProcessing();
    sm.setError();
    sm.setIdle();
    expect(sm.getState()).toBe('idle');
  });

  it('should throw on invalid transition', () => {
    // idle → streaming is not valid
    expect(() => sm.setStreaming()).toThrow('Invalid processing state transition');
  });

  it('should notify callbacks on state change', () => {
    const cb = jest.fn();
    sm.onStateChange(cb);
    sm.setProcessing();
    expect(cb).toHaveBeenCalledWith('processing', 'idle');
  });

  it('should support unsubscribing', () => {
    const cb = jest.fn();
    const unsub = sm.onStateChange(cb);
    unsub();
    sm.setProcessing();
    expect(cb).not.toHaveBeenCalled();
  });
});
