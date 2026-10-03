/** @jest-environment node */

import { JevClient } from '../../../src/decisions';
import { createJevGuardrail } from '../../../src/guardrails';
import { GuardrailPipeline } from '../../../src/core/pipeline/GuardrailPipeline';
import type { GuardrailContext } from '../../../src/core/types/guardrails';

const context: GuardrailContext = { stage: 'final', accumulated: '', messages: [] };

describe('createJevGuardrail', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const client = new JevClient({ proxyUrl: '/api/jev', fetch: fetchMock });
  const policy = 'Do not disclose account numbers.';
  function answer(noul: number) {
    fetchMock.mockResolvedValue(
      Response.json({
        model: 'jev-latest',
        answers: { violation: { type: 'noul', noul } },
        usage: { input_tokens: 25, output_tokens: 0 },
      })
    );
  }

  beforeEach(() => {
    fetchMock.mockReset();
    answer(0.1);
  });

  it('evaluates only supplied text and puts policy in the question', async () => {
    const guardrail = createJevGuardrail({ client, policy });
    expect(guardrail.name).toBe('jev');
    expect(guardrail.stages).toEqual(['final']);
    await expect(
      guardrail.check('Hello.', {
        ...context,
        messages: [{ role: 'user', content: 'private history' }],
        accumulated: 'raw output',
      })
    ).resolves.toBeUndefined();
    const body = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(body.state).toEqual({ text: 'Hello.' });
    expect(body.questions.violation.type).toBe('noul');
    expect(body.questions.violation.instructions.policy).toBe(policy);
    expect(JSON.stringify(body)).not.toContain('private history');
    expect(JSON.stringify(body)).not.toContain('raw output');
  });

  it('blocks at the threshold and reports the probability', async () => {
    answer(0.5);
    await expect(
      createJevGuardrail({ client, policy }).check('12345678', context)
    ).resolves.toEqual({
      block: true,
      reason: 'flagged: policy-violation',
      metadata: { score: 0.5, categories: ['policy-violation'] },
    });
  });

  it('supports a custom threshold and spoken replacement', async () => {
    answer(0.75);
    const guardrail = createJevGuardrail({ client, policy, threshold: 0.8 });
    await expect(guardrail.check('Hello', context)).resolves.toBeUndefined();
    answer(0.85);
    const replacement = createJevGuardrail({ client, policy, replacement: 'I cannot share that.' });
    await expect(replacement.check('12345678', context)).resolves.toMatchObject({
      text: 'I cannot share that.',
    });
  });

  it('skips empty text without a request', async () => {
    await createJevGuardrail({ client, policy }).check('  ', context);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([-1, 1.1, NaN, Infinity])('rejects invalid threshold %s', (threshold) => {
    expect(() => createJevGuardrail({ client, policy, threshold })).toThrow('threshold');
  });

  it('requires a non-empty policy', () => {
    expect(() => createJevGuardrail({ client, policy: ' ' })).toThrow('policy');
  });

  it('forwards generation cancellation to the client', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled turn'));
    await expect(
      createJevGuardrail({ client, policy }).check('Hello', {
        ...context,
        signal: controller.signal,
      })
    ).rejects.toThrow('cancelled turn');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** A fetch that never answers, rejecting only when its signal aborts. */
  function stall() {
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init!.signal!;
          signal.addEventListener('abort', () => reject(signal.reason));
        })
    );
  }

  it('aborts a slow request before the default pipeline timeout', async () => {
    jest.useFakeTimers();
    try {
      stall();
      const onError = jest.fn();
      // All defaults: pipeline 1000 ms, guardrail 900 ms, client 10000 ms.
      const pipeline = new GuardrailPipeline(
        { filters: [createJevGuardrail({ client, policy })] },
        { observer: { onError } }
      );
      const pending = pipeline.run('Hello', context);
      await jest.advanceTimersByTimeAsync(899);
      const signal = fetchMock.mock.calls[0]![1]!.signal!;
      expect(signal.aborted).toBe(false);
      await jest.advanceTimersByTimeAsync(1);
      expect(signal.aborted).toBe(true);
      await expect(pending).resolves.toEqual({ text: 'Hello', blocked: false, applications: [] });
      expect(onError.mock.calls[0][0].error.message).toMatch(/timed out after 900ms/);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it('applies a custom timeout shorter than a slow client response', async () => {
    stall();
    const slowClient = new JevClient({ proxyUrl: '/api/jev', fetch: fetchMock, timeoutMs: 0 });
    const pipeline = new GuardrailPipeline({
      filters: [createJevGuardrail({ client: slowClient, policy, timeoutMs: 20 })],
      timeoutMs: 5000,
      onError: 'block',
    });
    const result = await pipeline.run('Hello', context);
    expect(result.blocked).toBe(true);
    expect(result.applications[0]!.reason).toMatch(/timed out after 20ms/);
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  });

  it('can disable its own timeout', async () => {
    jest.useFakeTimers();
    try {
      await createJevGuardrail({ client, policy, timeoutMs: 0 }).check('Hello', context);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([-1, NaN, Infinity, 2147483648])('rejects invalid timeoutMs %s', (timeoutMs) => {
    expect(() => createJevGuardrail({ client, policy, timeoutMs })).toThrow('timeoutMs');
  });

  it('cancels the request on barge-in without reporting a guardrail error', async () => {
    stall();
    const controller = new AbortController();
    const observer = { onError: jest.fn(), onBlocked: jest.fn() };
    const pipeline = new GuardrailPipeline(
      { filters: [createJevGuardrail({ client, policy })], onError: 'block' },
      { observer }
    );
    const pending = pipeline.run('Hello', { ...context, signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort(new Error('barge-in'));
    await expect(pending).resolves.toEqual({ text: '', blocked: true, applications: [] });
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true);
    expect(observer.onError).not.toHaveBeenCalled();
    expect(observer.onBlocked).not.toHaveBeenCalled();
  });

  it.each(['block', 'passthrough'] as const)(
    'honors pipeline onError=%s for malformed API responses',
    async (onError) => {
      fetchMock.mockResolvedValue(Response.json({ answers: {} }));
      const pipeline = new GuardrailPipeline({
        filters: [createJevGuardrail({ client, policy })],
        onError,
      });
      const result = await pipeline.run('Hello', context);
      expect(result.blocked).toBe(onError === 'block');
      expect(result.text).toBe(onError === 'block' ? '' : 'Hello');
    }
  );

  it('holds buffered Live TTS text until evaluation and suppresses a blocked utterance', async () => {
    answer(0.9);
    const onText = jest.fn();
    const pipeline = new GuardrailPipeline({
      mode: 'buffered',
      filters: [createJevGuardrail({ client, policy })],
    });
    const stream = pipeline.createStream({ onText });
    await stream.push('The account ');
    await stream.push('number is 12345678.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
    await stream.flush();
    expect(stream.isBlocked).toBe(true);
    expect(onText).not.toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).state.text).toBe(
      'The account number is 12345678.'
    );
  });

  it('can opt into streaming chunk checks', async () => {
    answer(0.9);
    const onText = jest.fn();
    const pipeline = new GuardrailPipeline({
      filters: [
        createJevGuardrail({ client, policy, stages: ['chunk', 'final'], name: 'speech-policy' }),
      ],
    });
    const stream = pipeline.createStream({ onText });
    await stream.push('The account number is 12345678. ');
    expect(stream.isBlocked).toBe(true);
    expect(onText).not.toHaveBeenCalled();
  });
});
