/**
 * AgentStateMachine tests
 */

import { AgentStateMachine } from '../../../../src/core/state/AgentState';
import { InvalidStateError } from '../../../../src/utils/errors';

describe('AgentStateMachine', () => {
  let stateMachine: AgentStateMachine;

  beforeEach(() => {
    stateMachine = new AgentStateMachine();
  });

  describe('initialization', () => {
    it('should start in idle state', () => {
      expect(stateMachine.getState()).toBe('idle');
    });

    it('should record initial state in history', () => {
      const history = stateMachine.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        state: 'idle',
        timestamp: expect.any(Number),
      });
    });
  });

  describe('state transitions', () => {
    it('should transition from idle to ready', () => {
      stateMachine.transitionTo('ready');

      expect(stateMachine.getState()).toBe('ready');
      expect(stateMachine.getPreviousState()).toBe('idle');
    });

    it('should transition from ready to listening', () => {
      stateMachine.setReady();
      stateMachine.transitionTo('listening');

      expect(stateMachine.getState()).toBe('listening');
      expect(stateMachine.getPreviousState()).toBe('ready');
    });

    it('should transition from listening to thinking', () => {
      stateMachine.setReady();
      stateMachine.setListening();
      stateMachine.setThinking();

      expect(stateMachine.getState()).toBe('thinking');
    });

    it('should transition from thinking to speaking', () => {
      stateMachine.setReady();
      stateMachine.setListening();
      stateMachine.setThinking();
      stateMachine.setSpeaking();

      expect(stateMachine.getState()).toBe('speaking');
    });

    it('should transition back to ready from speaking', () => {
      stateMachine.setReady();
      stateMachine.setListening();
      stateMachine.setThinking();
      stateMachine.setSpeaking();
      stateMachine.setReady();

      expect(stateMachine.getState()).toBe('ready');
    });
  });

  describe('invalid transitions', () => {
    it('should throw error for invalid transition', () => {
      expect(() => {
        stateMachine.transitionTo('speaking');
      }).toThrow(InvalidStateError);
    });

    it('should not change state on invalid transition', () => {
      const initialState = stateMachine.getState();

      try {
        stateMachine.transitionTo('speaking');
      } catch {
        // Expected
      }

      expect(stateMachine.getState()).toBe(initialState);
    });

    it('should allow error transition from any state', () => {
      stateMachine.setReady();
      stateMachine.setListening();

      stateMachine.setError();

      expect(stateMachine.getState()).toBe('error');
    });
  });

  describe('force transitions', () => {
    it('should allow forced transition to any state', () => {
      stateMachine.transitionTo('speaking', true);

      expect(stateMachine.getState()).toBe('speaking');
    });

    it('should not validate forced transitions', () => {
      expect(() => {
        stateMachine.transitionTo('thinking', true);
      }).not.toThrow();

      expect(stateMachine.getState()).toBe('thinking');
    });
  });

  describe('helper methods', () => {
    it('setReady should transition to ready from any state', () => {
      stateMachine.transitionTo('listening', true);
      stateMachine.setReady();

      expect(stateMachine.getState()).toBe('ready');
    });

    it('setListening should transition to listening', () => {
      stateMachine.setReady();
      stateMachine.setListening();

      expect(stateMachine.getState()).toBe('listening');
    });

    it('setThinking should transition to thinking', () => {
      stateMachine.setReady();
      stateMachine.setListening();
      stateMachine.setThinking();

      expect(stateMachine.getState()).toBe('thinking');
    });

    it('setSpeaking should transition to speaking', () => {
      stateMachine.setReady();
      stateMachine.setListening();
      stateMachine.setThinking();
      stateMachine.setSpeaking();

      expect(stateMachine.getState()).toBe('speaking');
    });

    it('setError should transition to error', () => {
      stateMachine.setError();

      expect(stateMachine.getState()).toBe('error');
    });

    it('setIdle should transition to idle', () => {
      stateMachine.setReady();
      stateMachine.setIdle();

      expect(stateMachine.getState()).toBe('idle');
    });
  });

  describe('state validation', () => {
    it('canTransitionTo should return true for valid transitions', () => {
      expect(stateMachine.canTransitionTo('ready')).toBe(true);
      expect(stateMachine.canTransitionTo('error')).toBe(true);
    });

    it('canTransitionTo should return false for invalid transitions', () => {
      expect(stateMachine.canTransitionTo('speaking')).toBe(false);
      expect(stateMachine.canTransitionTo('thinking')).toBe(false);
    });

    it('should not transition to same state', () => {
      const consoleDebug = jest.spyOn(console, 'debug').mockImplementation();

      stateMachine.transitionTo('idle');

      expect(stateMachine.getState()).toBe('idle');
      consoleDebug.mockRestore();
    });
  });

  describe('state history', () => {
    it('should record all state transitions', () => {
      stateMachine.setReady();
      stateMachine.setListening();
      stateMachine.setThinking();

      const history = stateMachine.getHistory();

      expect(history).toHaveLength(4); // idle + 3 transitions
      expect(history.map((h) => h.state)).toEqual(['idle', 'ready', 'listening', 'thinking']);
    });

    it('should include timestamps in history', () => {
      stateMachine.setReady();

      const history = stateMachine.getHistory();

      expect(history[0]?.timestamp).toBeGreaterThan(0);
      expect(history[1]?.timestamp).toBeGreaterThan(0);
      expect(history[1]!.timestamp).toBeGreaterThanOrEqual(history[0]!.timestamp);
    });

    it('should limit history size', () => {
      // Trigger many transitions
      for (let i = 0; i < 200; i++) {
        stateMachine.setReady();
        stateMachine.setListening();
      }

      const history = stateMachine.getHistory();

      expect(history.length).toBeLessThanOrEqual(100);
    });

    it('clearHistory should reset history but keep current state', () => {
      stateMachine.setReady();
      stateMachine.setListening();

      stateMachine.clearHistory();

      const history = stateMachine.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0]?.state).toBe('listening');
    });
  });

  describe('transition callbacks', () => {
    it('should call callbacks on transition', () => {
      const callback = jest.fn();

      stateMachine.onTransition(callback);
      stateMachine.setReady();

      expect(callback).toHaveBeenCalledWith('ready', 'idle');
    });

    it('should call multiple callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      stateMachine.onTransition(callback1);
      stateMachine.onTransition(callback2);
      stateMachine.setReady();

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
    });

    it('should unsubscribe callback', () => {
      const callback = jest.fn();

      const unsubscribe = stateMachine.onTransition(callback);
      unsubscribe();
      stateMachine.setReady();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should handle callback errors gracefully', () => {
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const goodCallback = jest.fn();

      stateMachine.onTransition(errorCallback);
      stateMachine.onTransition(goodCallback);
      stateMachine.setReady();

      expect(errorCallback).toHaveBeenCalled();
      expect(goodCallback).toHaveBeenCalled();
      // Error is caught and logged internally, other callbacks still execute
    });
  });

  describe('state checking', () => {
    it('is should check current state', () => {
      expect(stateMachine.is('idle')).toBe(true);
      expect(stateMachine.is('ready')).toBe(false);

      stateMachine.setReady();

      expect(stateMachine.is('ready')).toBe(true);
      expect(stateMachine.is('idle')).toBe(false);
    });

    it('isAnyOf should check if in any of provided states', () => {
      expect(stateMachine.isAnyOf('idle', 'ready')).toBe(true);
      expect(stateMachine.isAnyOf('ready', 'listening')).toBe(false);

      stateMachine.setReady();

      expect(stateMachine.isAnyOf('ready', 'listening')).toBe(true);
      expect(stateMachine.isAnyOf('idle', 'listening')).toBe(false);
    });
  });

  describe('time tracking', () => {
    it('getTimeInCurrentState should return time in milliseconds', async () => {
      stateMachine.setReady();

      await new Promise((resolve) => setTimeout(resolve, 100));

      const time = stateMachine.getTimeInCurrentState();

      expect(time).toBeGreaterThanOrEqual(100);
      expect(time).toBeLessThan(200);
    });

    it('should reset time when transitioning', async () => {
      stateMachine.setReady();
      await new Promise((resolve) => setTimeout(resolve, 50));

      stateMachine.setListening();
      const time = stateMachine.getTimeInCurrentState();

      expect(time).toBeLessThan(50);
    });
  });

  describe('statistics', () => {
    it('should track state durations', async () => {
      stateMachine.setReady();
      await new Promise((resolve) => setTimeout(resolve, 50));

      stateMachine.setListening();
      await new Promise((resolve) => setTimeout(resolve, 50));

      stateMachine.setReady();

      const stats = stateMachine.getStateStatistics();

      expect(stats.ready?.count).toBe(1);
      expect(stats.ready?.totalDuration).toBeGreaterThanOrEqual(50);
      expect(stats.listening?.count).toBe(1);
      expect(stats.listening?.totalDuration).toBeGreaterThanOrEqual(50);
    });

    it('should calculate average durations', async () => {
      stateMachine.setReady();
      await new Promise((resolve) => setTimeout(resolve, 50));
      stateMachine.setListening();
      await new Promise((resolve) => setTimeout(resolve, 30));
      stateMachine.setReady();
      await new Promise((resolve) => setTimeout(resolve, 50));
      stateMachine.setListening();

      const stats = stateMachine.getStateStatistics();

      expect(stats.ready?.count).toBe(2);
      expect(stats.ready?.averageDuration).toBeGreaterThan(0);
      expect(stats.ready?.averageDuration).toBe(stats.ready.totalDuration / stats.ready.count);
    });
  });

  describe('reset', () => {
    it('should reset to idle state', () => {
      stateMachine.setReady();
      stateMachine.setListening();

      stateMachine.reset();

      expect(stateMachine.getState()).toBe('idle');
    });

    it('should clear history on reset', () => {
      stateMachine.setReady();
      stateMachine.setListening();

      stateMachine.reset();

      const history = stateMachine.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0]?.state).toBe('idle');
    });

    it('should notify callbacks on reset', () => {
      const callback = jest.fn();

      stateMachine.setReady();
      stateMachine.onTransition(callback);
      stateMachine.reset();

      expect(callback).toHaveBeenCalledWith('idle', 'ready');
    });
  });
});
