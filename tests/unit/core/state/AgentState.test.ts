/**
 * AgentStateMachine tests - New Architecture
 * Tests the orchestrator that derives state from 3 sub-machines
 */

import { AgentStateMachine } from '../../../../src/core/state/AgentStateMachine';
import { SimpleAudioCaptureStateMachine } from '../../../../src/core/state/SimpleAudioCaptureStateMachine';
import { SimpleAudioPlaybackStateMachine } from '../../../../src/core/state/SimpleAudioPlaybackStateMachine';
import { SimpleProcessingStateMachine } from '../../../../src/core/state/SimpleProcessingStateMachine';

describe('AgentStateMachine (Orchestrator)', () => {
  let agentStateMachine: AgentStateMachine;
  let captureStateMachine: SimpleAudioCaptureStateMachine;
  let playbackStateMachine: SimpleAudioPlaybackStateMachine;
  let processingStateMachine: SimpleProcessingStateMachine;

  beforeEach(() => {
    captureStateMachine = new SimpleAudioCaptureStateMachine();
    playbackStateMachine = new SimpleAudioPlaybackStateMachine();
    processingStateMachine = new SimpleProcessingStateMachine();
    agentStateMachine = new AgentStateMachine();
  });

  describe('initialization', () => {
    it('should start in idle state', () => {
      expect(agentStateMachine.getState()).toBe('idle');
    });

    it('should transition to ready when initialized with idle sub-machines', () => {
      const stateChanges: string[] = [];
      agentStateMachine.onStateChange((newState) => {
        stateChanges.push(newState);
      });

      agentStateMachine.initialize(
        captureStateMachine,
        playbackStateMachine,
        processingStateMachine
      );

      expect(agentStateMachine.getState()).toBe('ready');
      expect(stateChanges).toEqual(['ready']);
    });
  });

  describe('state derivation', () => {
    beforeEach(() => {
      agentStateMachine.initialize(
        captureStateMachine,
        playbackStateMachine,
        processingStateMachine
      );
    });

    it('should derive "listening" when capture is active', () => {
      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      expect(agentStateMachine.getState()).toBe('listening');
    });

    it('should derive "thinking" when processing', () => {
      processingStateMachine.setProcessing();
      expect(agentStateMachine.getState()).toBe('thinking');
    });

    it('should derive "thinking" when streaming', () => {
      processingStateMachine.setProcessing();
      processingStateMachine.setStreaming();
      expect(agentStateMachine.getState()).toBe('thinking');
    });

    it('should derive "speaking" when playback is playing', () => {
      playbackStateMachine.setBuffering();
      playbackStateMachine.setPlaying();
      expect(agentStateMachine.getState()).toBe('speaking');
    });

    it('should derive "speaking" when playback is buffering', () => {
      playbackStateMachine.setBuffering();
      expect(agentStateMachine.getState()).toBe('speaking');
    });

    it('should derive "error" when any sub-machine is in error', () => {
      captureStateMachine.setError();
      expect(agentStateMachine.getState()).toBe('error');
    });

    it('should prioritize error over other states', () => {
      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      playbackStateMachine.setBuffering();
      playbackStateMachine.setPlaying();
      processingStateMachine.setProcessing();

      captureStateMachine.setError();

      expect(agentStateMachine.getState()).toBe('error');
    });

    it('should prioritize speaking over thinking', () => {
      processingStateMachine.setProcessing();
      expect(agentStateMachine.getState()).toBe('thinking');

      playbackStateMachine.setBuffering();
      playbackStateMachine.setPlaying();
      expect(agentStateMachine.getState()).toBe('speaking');
    });

    it('should prioritize thinking over listening', () => {
      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      expect(agentStateMachine.getState()).toBe('listening');

      processingStateMachine.setProcessing();
      expect(agentStateMachine.getState()).toBe('thinking');
    });

    it('should return to ready when all sub-machines are idle', () => {
      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      expect(agentStateMachine.getState()).toBe('listening');

      captureStateMachine.setStopped();
      captureStateMachine.setIdle();
      expect(agentStateMachine.getState()).toBe('ready');
    });
  });

  describe('state change notifications', () => {
    beforeEach(() => {
      agentStateMachine.initialize(
        captureStateMachine,
        playbackStateMachine,
        processingStateMachine
      );
    });

    it('should notify listeners of state changes', () => {
      const stateChanges: Array<{ new: string; old: string }> = [];

      agentStateMachine.onStateChange((newState, oldState) => {
        stateChanges.push({ new: newState, old: oldState });
      });

      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      processingStateMachine.setProcessing();
      playbackStateMachine.setBuffering();
      playbackStateMachine.setPlaying();

      expect(stateChanges).toEqual([
        { new: 'listening', old: 'ready' },
        { new: 'thinking', old: 'listening' },
        { new: 'speaking', old: 'thinking' },
      ]);
    });

    it('should allow unsubscribing from state changes', () => {
      const stateChanges: string[] = [];

      const unsubscribe = agentStateMachine.onStateChange((newState) => {
        stateChanges.push(newState);
      });

      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      unsubscribe();
      processingStateMachine.setProcessing();

      expect(stateChanges).toEqual(['listening']);
    });
  });

  describe('helper methods', () => {
    beforeEach(() => {
      agentStateMachine.initialize(
        captureStateMachine,
        playbackStateMachine,
        processingStateMachine
      );
    });

    it('should check if in specific state', () => {
      expect(agentStateMachine.is('ready')).toBe(true);

      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      expect(agentStateMachine.is('listening')).toBe(true);
      expect(agentStateMachine.is('ready')).toBe(false);
    });

    it('should check if in any of multiple states', () => {
      expect(agentStateMachine.isIn('ready', 'idle')).toBe(true);

      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      expect(agentStateMachine.isIn('listening', 'thinking')).toBe(true);
      expect(agentStateMachine.isIn('ready', 'idle')).toBe(false);
    });

    it('should get previous state', () => {
      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      expect(agentStateMachine.getPreviousState()).toBe('ready');

      processingStateMachine.setProcessing();
      expect(agentStateMachine.getPreviousState()).toBe('listening');
    });
  });

  describe('special state methods', () => {
    beforeEach(() => {
      agentStateMachine.initialize(
        captureStateMachine,
        playbackStateMachine,
        processingStateMachine
      );
    });

    it('should reset to idle state', () => {
      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      processingStateMachine.setProcessing();

      agentStateMachine.reset();

      expect(agentStateMachine.getState()).toBe('idle');
    });

    it('should force set to error state', () => {
      captureStateMachine.setStarting();
      captureStateMachine.setActive();

      agentStateMachine.setError();

      expect(agentStateMachine.getState()).toBe('error');
    });

    it('should not set error if already in error', () => {
      const stateChanges: string[] = [];

      agentStateMachine.onStateChange((newState) => {
        stateChanges.push(newState);
      });

      agentStateMachine.setError();
      agentStateMachine.setError();

      expect(stateChanges).toEqual(['error']);
    });
  });

  describe('diagnostics', () => {
    beforeEach(() => {
      agentStateMachine.initialize(
        captureStateMachine,
        playbackStateMachine,
        processingStateMachine
      );
    });

    it('should provide diagnostic info', () => {
      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      processingStateMachine.setProcessing();

      const diagnostics = agentStateMachine.getDiagnostics();

      expect(diagnostics).toEqual({
        agentState: 'thinking',
        captureState: 'active',
        playbackState: 'idle',
        processingState: 'processing',
      });
    });
  });

  describe('disposal', () => {
    beforeEach(() => {
      agentStateMachine.initialize(
        captureStateMachine,
        playbackStateMachine,
        processingStateMachine
      );
    });

    it('should unsubscribe from sub-machines on dispose', () => {
      const stateChanges: string[] = [];

      agentStateMachine.onStateChange((newState) => {
        stateChanges.push(newState);
      });

      captureStateMachine.setStarting();
      captureStateMachine.setActive();
      expect(stateChanges).toEqual(['listening']);

      agentStateMachine.dispose();

      // After disposal, should not receive more state changes
      processingStateMachine.setProcessing();
      expect(stateChanges).toEqual(['listening']); // No new changes
    });

    it('should clear callbacks on dispose', () => {
      let callbackCalled = false;

      agentStateMachine.onStateChange(() => {
        callbackCalled = true;
      });

      agentStateMachine.dispose();
      agentStateMachine.reset(); // This would normally trigger a callback

      expect(callbackCalled).toBe(false);
    });
  });
});
