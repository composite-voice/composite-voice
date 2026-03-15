/**
 * Tests for EagerLLMController — speculative LLM generation collaborator.
 */

import { EagerLLMController } from '../../../../src/core/collaborators/EagerLLMController';
import type { EagerLLMConfig } from '../../../../src/core/types/config';

describe('EagerLLMController', () => {
  describe('constructor', () => {
    it('creates an instance with config', () => {
      const config: EagerLLMConfig = { enabled: true };
      const controller = new EagerLLMController(config);
      expect(controller).toBeInstanceOf(EagerLLMController);
    });
  });

  describe('enabled getter', () => {
    it('returns true when config.enabled is true', () => {
      const controller = new EagerLLMController({ enabled: true });
      expect(controller.enabled).toBe(true);
    });

    it('returns false when config.enabled is false', () => {
      const controller = new EagerLLMController({ enabled: false });
      expect(controller.enabled).toBe(false);
    });
  });

  describe('startSpeculative', () => {
    it('returns an AbortSignal', () => {
      const controller = new EagerLLMController({ enabled: true });
      const signal = controller.startSpeculative('hello world');

      expect(signal).toBeInstanceOf(AbortSignal);
      expect(signal.aborted).toBe(false);
    });

    it('stores the preflight text', () => {
      const controller = new EagerLLMController({ enabled: true });
      controller.startSpeculative('hello world');

      expect(controller.currentPreflightText).toBe('hello world');
    });

    it('marks the controller as active', () => {
      const controller = new EagerLLMController({ enabled: true });
      expect(controller.isActive).toBe(false);

      controller.startSpeculative('hello');
      expect(controller.isActive).toBe(true);
    });

    it('aborts the previous signal when called again', () => {
      const controller = new EagerLLMController({ enabled: true });

      const signal1 = controller.startSpeculative('first');
      expect(signal1.aborted).toBe(false);

      const signal2 = controller.startSpeculative('second');
      expect(signal1.aborted).toBe(true);
      expect(signal2.aborted).toBe(false);
      expect(controller.currentPreflightText).toBe('second');
    });
  });

  describe('reconcile', () => {
    it('returns "keep" when texts are similar (above threshold)', () => {
      const controller = new EagerLLMController({
        enabled: true,
        cancelOnTextChange: true,
        similarityThreshold: 0.8,
      });

      controller.startSpeculative('hello world');
      // "hello world" vs "hello world how are you" — the eager text is a
      // prefix of the confirmed text → similarity 1.0
      const decision = controller.reconcile('hello world how are you');

      expect(decision).toBe('keep');
      expect(controller.isActive).toBe(false);
    });

    it('returns "restart" when texts differ and cancelOnTextChange is true', () => {
      const controller = new EagerLLMController({
        enabled: true,
        cancelOnTextChange: true,
        similarityThreshold: 0.8,
      });

      const signal = controller.startSpeculative('tell me a joke');
      const decision = controller.reconcile('what is the weather');

      expect(decision).toBe('restart');
      expect(signal.aborted).toBe(true);
      expect(controller.isActive).toBe(false);
    });

    it('returns "accept-anyway" when texts differ and cancelOnTextChange is false', () => {
      const controller = new EagerLLMController({
        enabled: true,
        cancelOnTextChange: false,
        similarityThreshold: 0.8,
      });

      const signal = controller.startSpeculative('tell me a joke');
      const decision = controller.reconcile('what is the weather');

      expect(decision).toBe('accept-anyway');
      expect(signal.aborted).toBe(false); // not aborted since we accept anyway
      expect(controller.isActive).toBe(false);
    });

    it('returns "restart" when no speculative generation is active', () => {
      const controller = new EagerLLMController({ enabled: true });

      const decision = controller.reconcile('hello world');
      expect(decision).toBe('restart');
    });

    it('uses default threshold of 0.8 when not specified', () => {
      const controller = new EagerLLMController({
        enabled: true,
        cancelOnTextChange: true,
        // No similarityThreshold — defaults to 0.8
      });

      // "hello" vs "hello" → similarity 1.0 → above 0.8 → keep
      controller.startSpeculative('hello');
      expect(controller.reconcile('hello')).toBe('keep');
    });

    it('uses default cancelOnTextChange of true when not specified', () => {
      const controller = new EagerLLMController({
        enabled: true,
        // No cancelOnTextChange — defaults to true
        similarityThreshold: 0.8,
      });

      controller.startSpeculative('tell me a joke');
      const decision = controller.reconcile('what is the weather');

      expect(decision).toBe('restart');
    });
  });

  describe('cancel', () => {
    it('aborts the current signal', () => {
      const controller = new EagerLLMController({ enabled: true });
      const signal = controller.startSpeculative('hello');

      controller.cancel();

      expect(signal.aborted).toBe(true);
      expect(controller.isActive).toBe(false);
      expect(controller.currentPreflightText).toBeNull();
    });

    it('is a no-op when no speculative generation is active', () => {
      const controller = new EagerLLMController({ enabled: true });
      expect(() => controller.cancel()).not.toThrow();
      expect(controller.isActive).toBe(false);
    });
  });

  describe('reset', () => {
    it('clears state without aborting', () => {
      const controller = new EagerLLMController({ enabled: true });
      controller.startSpeculative('hello');

      controller.reset();

      // Unlike cancel(), reset does not call abort on the controller
      // (the controller reference is just nulled out)
      expect(controller.isActive).toBe(false);
      expect(controller.currentPreflightText).toBeNull();
    });

    it('is a no-op when no speculative generation is active', () => {
      const controller = new EagerLLMController({ enabled: true });
      expect(() => controller.reset()).not.toThrow();
    });
  });
});
