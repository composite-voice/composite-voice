/**
 * EventEmitter tests
 */

import { EventEmitter } from '../../../src/core/events/EventEmitter';
import type { AgentReadyEvent } from '../../../src/core/events/types';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe('on', () => {
    it('should register event listener', () => {
      const listener = jest.fn();
      emitter.on('agent.ready', listener);

      expect(emitter.listenerCount('agent.ready')).toBe(1);
    });

    it('should return unsubscribe function', () => {
      const listener = jest.fn();
      const unsubscribe = emitter.on('agent.ready', listener);

      expect(emitter.listenerCount('agent.ready')).toBe(1);
      unsubscribe();
      expect(emitter.listenerCount('agent.ready')).toBe(0);
    });
  });

  describe('once', () => {
    it('should register one-time listener', async () => {
      const listener = jest.fn();
      emitter.once('agent.ready', listener);

      const event: AgentReadyEvent = {
        type: 'agent.ready',
        timestamp: Date.now(),
      };

      await emitter.emit(event);
      await emitter.emit(event);

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    it('should remove event listener', () => {
      const listener = jest.fn();
      emitter.on('agent.ready', listener);

      expect(emitter.listenerCount('agent.ready')).toBe(1);
      emitter.off('agent.ready', listener);
      expect(emitter.listenerCount('agent.ready')).toBe(0);
    });
  });

  describe('emit', () => {
    it('should call registered listeners', async () => {
      const listener = jest.fn();
      emitter.on('agent.ready', listener);

      const event: AgentReadyEvent = {
        type: 'agent.ready',
        timestamp: Date.now(),
      };

      await emitter.emit(event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should call wildcard listeners', async () => {
      const listener = jest.fn();
      emitter.on('*', listener);

      const event: AgentReadyEvent = {
        type: 'agent.ready',
        timestamp: Date.now(),
      };

      await emitter.emit(event);

      expect(listener).toHaveBeenCalledWith(event);
    });

    it('should handle listener errors gracefully', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      const errorListener = jest.fn(() => {
        throw new Error('Test error');
      });
      const goodListener = jest.fn();

      emitter.on('agent.ready', errorListener);
      emitter.on('agent.ready', goodListener);

      const event: AgentReadyEvent = {
        type: 'agent.ready',
        timestamp: Date.now(),
      };

      await emitter.emit(event);

      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for an event', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      emitter.on('agent.ready', listener1);
      emitter.on('agent.ready', listener2);

      expect(emitter.listenerCount('agent.ready')).toBe(2);

      emitter.removeAllListeners('agent.ready');

      expect(emitter.listenerCount('agent.ready')).toBe(0);
    });

    it('should remove all listeners when no event specified', () => {
      emitter.on('agent.ready', jest.fn());
      emitter.on('transcription.final', jest.fn());

      expect(emitter.eventNames().length).toBe(2);

      emitter.removeAllListeners();

      expect(emitter.eventNames().length).toBe(0);
    });
  });

  describe('eventNames', () => {
    it('should return list of events with listeners', () => {
      emitter.on('agent.ready', jest.fn());
      emitter.on('transcription.final', jest.fn());

      const names = emitter.eventNames();

      expect(names).toContain('agent.ready');
      expect(names).toContain('transcription.final');
      expect(names.length).toBe(2);
    });
  });

  describe('maxListeners', () => {
    it('should warn when exceeding max listeners', () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      const emitterSmall = new EventEmitter(2);

      emitterSmall.on('agent.ready', jest.fn());
      emitterSmall.on('agent.ready', jest.fn());
      emitterSmall.on('agent.ready', jest.fn());

      expect(consoleWarn).toHaveBeenCalled();

      consoleWarn.mockRestore();
    });

    it('should allow changing max listeners', () => {
      expect(emitter.getMaxListeners()).toBe(100);
      emitter.setMaxListeners(50);
      expect(emitter.getMaxListeners()).toBe(50);
    });
  });
});
