/**
 * Tests for GuardrailPipeline / GuardrailStream — the pluggable async filter
 * chain between LLM output and TTS.
 */

import {
  GuardrailPipeline,
  type GuardrailObserver,
} from '../../../../src/core/pipeline/GuardrailPipeline';
import type { Guardrail, GuardrailContext } from '../../../../src/core/types/guardrails';

/** Minimal context for a `final`-stage run. */
function finalContext(text: string): GuardrailContext {
  return { stage: 'final', accumulated: text, messages: [] };
}

/** A guardrail that uppercases everything it sees. */
const upper: Guardrail = {
  name: 'upper',
  check: (text) => ({ text: text.toUpperCase() }),
};

/** A guardrail that never touches the text. */
const noop: Guardrail = {
  name: 'noop',
  check: () => undefined,
};

describe('GuardrailPipeline', () => {
  describe('enabled', () => {
    it('is false with no filters', () => {
      expect(new GuardrailPipeline({ filters: [] }).enabled).toBe(false);
    });

    it('is false when explicitly disabled', () => {
      expect(new GuardrailPipeline({ filters: [upper], enabled: false }).enabled).toBe(false);
    });

    it('is true with at least one filter', () => {
      expect(new GuardrailPipeline({ filters: [upper] }).enabled).toBe(true);
    });

    it('passes text through untouched when disabled', async () => {
      const pipeline = new GuardrailPipeline({ filters: [upper], enabled: false });
      const outcome = await pipeline.run('hello', finalContext('hello'));
      expect(outcome).toEqual({ text: 'hello', blocked: false, applications: [] });
    });
  });

  describe('chain semantics', () => {
    it('feeds each guardrail the previous one’s output', async () => {
      const seen: string[] = [];
      const record = (name: string, transform: (t: string) => string): Guardrail => ({
        name,
        check: (text) => {
          seen.push(text);
          return { text: transform(text) };
        },
      });

      const pipeline = new GuardrailPipeline({
        filters: [record('a', (t) => `${t}-a`), record('b', (t) => `${t}-b`)],
      });

      const outcome = await pipeline.run('x', finalContext('x'));
      expect(seen).toEqual(['x', 'x-a']);
      expect(outcome.text).toBe('x-a-b');
    });

    it('awaits async guardrails', async () => {
      const slow: Guardrail = {
        name: 'slow',
        check: async (text) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { text: `${text}!` };
        },
      };
      const pipeline = new GuardrailPipeline({ filters: [slow] });
      expect((await pipeline.run('hi', finalContext('hi'))).text).toBe('hi!');
    });

    it('records only guardrails that changed the text', async () => {
      const pipeline = new GuardrailPipeline({ filters: [noop, upper, noop] });
      const outcome = await pipeline.run('hi', finalContext('hi'));
      expect(outcome.text).toBe('HI');
      expect(outcome.applications.map((a) => a.guardrail)).toEqual(['upper']);
    });

    it('treats a guardrail returning the same text as a no-op', async () => {
      const identity: Guardrail = { name: 'identity', check: (text) => ({ text }) };
      const pipeline = new GuardrailPipeline({ filters: [identity] });
      expect((await pipeline.run('hi', finalContext('hi'))).applications).toEqual([]);
    });

    it('skips the chain for empty text', async () => {
      const check = jest.fn();
      const pipeline = new GuardrailPipeline({ filters: [{ name: 'spy', check }] });
      await pipeline.run('', finalContext(''));
      expect(check).not.toHaveBeenCalled();
    });
  });

  describe('stages', () => {
    it('runs a guardrail at both stages by default', async () => {
      const stages: string[] = [];
      const pipeline = new GuardrailPipeline({
        filters: [{ name: 'spy', check: (_t, ctx) => void stages.push(ctx.stage) }],
      });

      await pipeline.run('a', { stage: 'chunk', accumulated: 'a', messages: [] });
      await pipeline.run('a', finalContext('a'));
      expect(stages).toEqual(['chunk', 'final']);
    });

    it('skips a guardrail outside its declared stages', async () => {
      const check = jest.fn();
      const pipeline = new GuardrailPipeline({
        filters: [{ name: 'final-only', stages: ['final'], check }],
      });

      await pipeline.run('a', { stage: 'chunk', accumulated: 'a', messages: [] });
      expect(check).not.toHaveBeenCalled();

      await pipeline.run('a', finalContext('a'));
      expect(check).toHaveBeenCalledTimes(1);
    });
  });

  describe('blocking', () => {
    const blocker: Guardrail = {
      name: 'blocker',
      check: () => ({ block: true, reason: 'nope' }),
    };

    it('returns empty text and stops the chain', async () => {
      const after = jest.fn();
      const pipeline = new GuardrailPipeline({
        filters: [blocker, { name: 'after', check: after }],
      });

      const outcome = await pipeline.run('secret', finalContext('secret'));
      expect(outcome.blocked).toBe(true);
      expect(outcome.text).toBe('');
      expect(after).not.toHaveBeenCalled();
    });

    it('reports the blocked text and reason to the observer', async () => {
      const onBlocked = jest.fn();
      const pipeline = new GuardrailPipeline(
        { filters: [blocker] },
        { observer: { onBlocked } as GuardrailObserver }
      );

      await pipeline.run('secret', finalContext('secret'));
      expect(onBlocked).toHaveBeenCalledWith(
        expect.objectContaining({
          guardrail: 'blocker',
          stage: 'final',
          original: 'secret',
          reason: 'nope',
        })
      );
    });
  });

  describe('error policy', () => {
    const thrower: Guardrail = {
      name: 'thrower',
      check: () => {
        throw new Error('boom');
      },
    };

    it('fails open by default — skips the guardrail, keeps the text', async () => {
      const pipeline = new GuardrailPipeline({ filters: [thrower, upper] });
      const outcome = await pipeline.run('hi', finalContext('hi'));
      expect(outcome.blocked).toBe(false);
      expect(outcome.text).toBe('HI');
    });

    it('fails closed when onError is "block"', async () => {
      const pipeline = new GuardrailPipeline({ filters: [thrower], onError: 'block' });
      const outcome = await pipeline.run('hi', finalContext('hi'));
      expect(outcome.blocked).toBe(true);
      expect(outcome.text).toBe('');
    });

    it('reports the failure and the policy applied', async () => {
      const onError = jest.fn();
      const pipeline = new GuardrailPipeline({ filters: [thrower] }, { observer: { onError } });

      await pipeline.run('hi', finalContext('hi'));
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ guardrail: 'thrower', stage: 'final', policy: 'passthrough' })
      );
      expect(onError.mock.calls[0][0].error.message).toBe('boom');
    });

    it('handles a rejected promise the same as a throw', async () => {
      const rejecter: Guardrail = { name: 'rejecter', check: () => Promise.reject(new Error('x')) };
      const pipeline = new GuardrailPipeline({ filters: [rejecter], onError: 'block' });
      expect((await pipeline.run('hi', finalContext('hi'))).blocked).toBe(true);
    });
  });

  describe('timeout', () => {
    const hang: Guardrail = {
      name: 'hang',
      check: () => new Promise<never>(() => {}),
    };

    it('applies the error policy when a guardrail exceeds timeoutMs', async () => {
      const onError = jest.fn();
      const pipeline = new GuardrailPipeline(
        { filters: [hang], timeoutMs: 10 },
        { observer: { onError } }
      );

      const outcome = await pipeline.run('hi', finalContext('hi'));
      expect(outcome.text).toBe('hi');
      expect(onError.mock.calls[0][0].error.message).toMatch(/timed out after 10ms/);
    });

    it('blocks on timeout when configured to fail closed', async () => {
      const pipeline = new GuardrailPipeline({
        filters: [hang],
        timeoutMs: 10,
        onError: 'block',
      });
      expect((await pipeline.run('hi', finalContext('hi'))).blocked).toBe(true);
    });

    it('waits indefinitely when timeoutMs is 0', async () => {
      const slow: Guardrail = {
        name: 'slow',
        check: async (text) => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { text: `${text}?` };
        },
      };
      const pipeline = new GuardrailPipeline({ filters: [slow], timeoutMs: 0 });
      expect((await pipeline.run('hi', finalContext('hi'))).text).toBe('hi?');
    });

    it('does not leave a pending timer behind after a fast guardrail', async () => {
      jest.useFakeTimers();
      try {
        const pipeline = new GuardrailPipeline({ filters: [upper], timeoutMs: 1000 });
        await pipeline.run('hi', finalContext('hi'));
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});

describe('GuardrailStream', () => {
  /** Collect everything a stream forwards to its sink. */
  function sink() {
    const spoken: string[] = [];
    return { spoken, onText: (text: string) => void spoken.push(text) };
  }

  describe('sentence segmentation (default)', () => {
    it('buffers until a sentence boundary before filtering', async () => {
      const { spoken, onText } = sink();
      const stream = new GuardrailPipeline({ filters: [upper] }).createStream({ onText });

      await stream.push('Hello ');
      expect(spoken).toEqual([]);

      await stream.push('there. ');
      expect(spoken).toEqual(['HELLO THERE.']);
    });

    it('keeps a pattern intact across chunk boundaries', async () => {
      const { spoken, onText } = sink();
      const redact: Guardrail = {
        name: 'redact',
        check: (text) => ({ text: text.replace(/\S+@\S+\.\w+/g, '[email]') }),
      };
      const stream = new GuardrailPipeline({ filters: [redact] }).createStream({ onText });

      // An address split three ways would defeat a per-chunk filter.
      await stream.push('Email ada');
      await stream.push('@example');
      await stream.push('.com now. ');

      expect(spoken.join('')).toBe('Email [email] now.');
    });

    it('filters the largest complete run in one call', async () => {
      const { spoken, onText } = sink();
      const stream = new GuardrailPipeline({ filters: [upper] }).createStream({ onText });

      // Both finished sentences go to the guardrail together — more context
      // per call and fewer calls than splitting at every boundary.
      await stream.push('One. Two. Three ');
      expect(spoken).toEqual(['ONE. TWO.']);

      await stream.flush();
      expect(spoken).toEqual(['ONE. TWO.', ' THREE ']);
    });

    it('flushes the trailing partial sentence', async () => {
      const { spoken, onText } = sink();
      const stream = new GuardrailPipeline({ filters: [upper] }).createStream({ onText });

      await stream.push('No punctuation here');
      expect(spoken).toEqual([]);

      expect(await stream.flush()).toBe('NO PUNCTUATION HERE');
      expect(spoken).toEqual(['NO PUNCTUATION HERE']);
    });

    it('cuts at a word break once maxSegmentChars is exceeded', async () => {
      const { spoken, onText } = sink();
      const stream = new GuardrailPipeline({
        filters: [noop],
        maxSegmentChars: 20,
      }).createStream({ onText });

      await stream.push('aaaa bbbb cccc dddd eeee ffff');
      // Cut at the last word break within the first 20 characters.
      expect(spoken).toEqual(['aaaa bbbb cccc dddd ']);

      await stream.flush();
      expect(spoken.join('')).toBe('aaaa bbbb cccc dddd eeee ffff');
    });

    it('preserves the original text when no guardrail rewrites it', async () => {
      const { spoken, onText } = sink();
      const stream = new GuardrailPipeline({ filters: [noop] }).createStream({ onText });

      await stream.push('Keep this. Exactly as-is.');
      await stream.flush();
      expect(spoken.join('')).toBe('Keep this. Exactly as-is.');
    });
  });

  describe('chunk segmentation', () => {
    it('filters every chunk as it arrives', async () => {
      const { spoken, onText } = sink();
      const stream = new GuardrailPipeline({
        filters: [upper],
        segmentation: 'chunk',
      }).createStream({ onText });

      await stream.push('a ');
      await stream.push('b ');
      expect(spoken).toEqual(['A ', 'B ']);
    });
  });

  describe('buffered mode', () => {
    it('emits nothing until flush', async () => {
      const { spoken, onText } = sink();
      const stream = new GuardrailPipeline({ filters: [upper], mode: 'buffered' }).createStream({
        onText,
      });

      await stream.push('Hello there. ');
      await stream.push('How are you? ');
      expect(spoken).toEqual([]);

      await stream.flush();
      expect(spoken).toEqual(['HELLO THERE. HOW ARE YOU? ']);
    });

    it('filters the whole response at the final stage', async () => {
      const stages: string[] = [];
      const stream = new GuardrailPipeline({
        filters: [{ name: 'spy', check: (_t, ctx) => void stages.push(ctx.stage) }],
        mode: 'buffered',
      }).createStream({ onText: () => {} });

      await stream.push('One. Two. ');
      await stream.flush();
      expect(stages).toEqual(['final']);
    });

    it('suppresses the entire utterance when a guardrail blocks', async () => {
      const { spoken, onText } = sink();
      const stream = new GuardrailPipeline({
        filters: [{ name: 'blocker', check: () => ({ block: true }) }],
        mode: 'buffered',
      }).createStream({ onText });

      await stream.push('Something forbidden. ');
      await stream.flush();
      expect(spoken).toEqual([]);
      expect(stream.isBlocked).toBe(true);
    });
  });

  describe('blocking mid-stream', () => {
    /** Blocks once the accumulated text mentions the trigger word. */
    const blockOnSecret: Guardrail = {
      name: 'secret',
      check: (text) => (text.includes('secret') ? { block: true, reason: 'secret' } : undefined),
    };

    it('suppresses the offending segment and everything after it', async () => {
      const { spoken, onText } = sink();
      const stream = new GuardrailPipeline({ filters: [blockOnSecret] }).createStream({ onText });

      await stream.push('This part is fine. ');
      await stream.push('This part is secret. ');
      await stream.push('And so is this. ');
      await stream.flush();

      expect(spoken).toEqual(['This part is fine.']);
      expect(stream.isBlocked).toBe(true);
    });

    it('reports what actually reached the sink', async () => {
      const stream = new GuardrailPipeline({ filters: [blockOnSecret] }).createStream({
        onText: () => {},
      });

      await stream.push('Fine. ');
      await stream.push('secret. ');
      expect(stream.spokenText).toBe('Fine.');
    });
  });

  describe('sink ordering and backpressure', () => {
    it('awaits an async sink before filtering the next segment', async () => {
      const order: string[] = [];
      const stream = new GuardrailPipeline({ filters: [noop] }).createStream({
        onText: async (text) => {
          order.push(`start:${text.trim()}`);
          await new Promise((resolve) => setTimeout(resolve, 5));
          order.push(`end:${text.trim()}`);
        },
      });

      await stream.push('One. ');
      await stream.push('Two. ');
      expect(order).toEqual(['start:One.', 'end:One.', 'start:Two.', 'end:Two.']);
    });

    it('never calls the sink with empty text', async () => {
      const onText = jest.fn();
      const stream = new GuardrailPipeline({
        filters: [{ name: 'eraser', check: () => ({ text: '' }) }],
      }).createStream({ onText });

      await stream.push('Gone. ');
      await stream.flush();
      expect(onText).not.toHaveBeenCalled();
    });
  });

  describe('context', () => {
    it('exposes accumulated text, history, and the abort signal', async () => {
      const seen: Array<{ accumulated: string; aborted: boolean; messages: number }> = [];
      const controller = new AbortController();
      const stream = new GuardrailPipeline({
        filters: [
          {
            name: 'spy',
            check: (_t, ctx) =>
              void seen.push({
                accumulated: ctx.accumulated,
                aborted: ctx.signal?.aborted ?? false,
                messages: ctx.messages.length,
              }),
          },
        ],
      }).createStream({
        onText: () => {},
        messages: [{ role: 'user', content: 'hi' }],
        signal: controller.signal,
      });

      await stream.push('One. ');
      controller.abort();
      await stream.push('Two. ');

      expect(seen).toEqual([
        { accumulated: 'One. ', aborted: false, messages: 1 },
        { accumulated: 'One. Two. ', aborted: true, messages: 1 },
      ]);
    });
  });

  describe('reset', () => {
    it('drops buffered text and clears the blocked flag', async () => {
      const { spoken, onText } = sink();
      const stream = new GuardrailPipeline({
        filters: [{ name: 'blocker', check: () => ({ block: true }) }],
      }).createStream({ onText });

      await stream.push('Blocked. ');
      expect(stream.isBlocked).toBe(true);

      stream.reset();
      expect(stream.isBlocked).toBe(false);
      expect(stream.spokenText).toBe('');
      expect(spoken).toEqual([]);
    });
  });
});
