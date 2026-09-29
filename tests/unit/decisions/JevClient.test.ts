/** @jest-environment node */

import { JevAPIError, JevClient } from '../../../src/decisions';
import type { JevRequest } from '../../../src/decisions';

const request = {
  state: 'Please refund the duplicate charge.',
  questions: {
    refund: { type: 'noul' as const, instructions: 'Is a refund requested?' },
    team: {
      type: 'choice' as const,
      criteria: { billing: 'Payment issue', technical: 'Technical issue' },
    },
    urgency: { type: 'score' as const, criteria: ['Low', 'Medium', 'High'] },
  },
};

function response() {
  return {
    model: 'jev-1.13',
    answers: {
      refund: { type: 'noul', noul: 0.9 },
      team: {
        type: 'choice',
        choice: 'billing',
        confidence: 0.95,
        probabilities: { billing: 0.95, technical: 0.05 },
      },
      urgency: {
        type: 'score',
        score: 1.7,
        confidence: 0.8,
        legend: { '0': 'Low', '1': 'Medium', '2': 'High' },
        probabilities: { '0': 0.1, '1': 0.1, '2': 0.8 },
      },
    },
    usage: { input_tokens: 120, output_tokens: 12 },
  };
}

describe('JevClient', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const client = () => new JevClient({ apiKey: 'server-key', fetch: fetchMock });

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(Response.json(response()));
  });

  afterEach(() => jest.useRealTimers());

  it('uses the native endpoint and returns all three answer types with inferred keys', async () => {
    const result = await client().evaluate(request);
    const team: 'billing' | 'technical' = result.answers.team.choice;
    expect(team).toBe('billing');
    expect(result.answers.refund.noul).toBe(0.9);
    expect(result.answers.urgency.score).toBe(1.7);
    expect(result).toEqual(response());
    expect(fetchMock).toHaveBeenCalledWith('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer server-key' },
      body: JSON.stringify({ model: 'jev-latest', ...request }),
      signal: expect.any(AbortSignal),
    });
  });

  it('supports structured state, descriptions, and nullable noul criteria', async () => {
    await client().evaluate({
      ...request,
      state: { text: request.state, account: { paid: true } },
      questions: {
        ...request.questions,
        refund: { type: 'noul', instructions: { task: 'Refund requested?' }, criteria: null },
      },
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string).state.account.paid).toBe(true);
  });

  it('uses a full application proxy URL without sending a TypeSafe key', async () => {
    await new JevClient({ proxyUrl: '/api/jev', apiKey: 'never-send', fetch: fetchMock }).evaluate(
      request
    );
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/jev');
    expect(fetchMock.mock.calls[0]![1]!.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('allows per-client and per-request model selection', async () => {
    const jev = new JevClient({ proxyUrl: '/api/jev', model: 'client-model', fetch: fetchMock });
    await jev.evaluate(request);
    fetchMock.mockResolvedValue(Response.json(response()));
    await jev.evaluate({ ...request, model: 'request-model' });
    const models = fetchMock.mock.calls.map(([, init]) => JSON.parse(init!.body as string).model);
    expect(models).toEqual(['client-model', 'request-model']);
  });

  it.each([401, 429, 529])(
    'reports HTTP %s without exposing the response body or retrying',
    async (status) => {
      fetchMock.mockResolvedValue(new Response('private content', { status }));
      const promise = client().evaluate(request);
      await expect(promise).rejects.toBeInstanceOf(JevAPIError);
      await expect(promise).rejects.toMatchObject({
        status,
        message: `Jev request failed (HTTP ${status})`,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    [
      'missing answer',
      (r: ReturnType<typeof response>) => {
        delete (r.answers as Partial<typeof r.answers>).refund;
      },
    ],
    [
      'wrong type',
      (r: ReturnType<typeof response>) => {
        r.answers.refund.type = 'choice';
      },
    ],
    [
      'probability outside range',
      (r: ReturnType<typeof response>) => {
        r.answers.refund.noul = 1.1;
      },
    ],
    [
      'unknown choice',
      (r: ReturnType<typeof response>) => {
        r.answers.team.choice = 'sales';
      },
    ],
    [
      'missing choice probability',
      (r: ReturnType<typeof response>) => {
        delete (r.answers.team.probabilities as Partial<typeof r.answers.team.probabilities>)
          .billing;
      },
    ],
    [
      'invalid confidence',
      (r: ReturnType<typeof response>) => {
        r.answers.team.confidence = -1;
      },
    ],
    [
      'invalid score',
      (r: ReturnType<typeof response>) => {
        r.answers.urgency.score = 3;
      },
    ],
    [
      'missing rubric level',
      (r: ReturnType<typeof response>) => {
        delete (r.answers.urgency.legend as Partial<typeof r.answers.urgency.legend>)['1'];
      },
    ],
    [
      'invalid token count',
      (r: ReturnType<typeof response>) => {
        r.usage.input_tokens = 0.5;
      },
    ],
    [
      'missing model',
      (r: ReturnType<typeof response>) => {
        r.model = '';
      },
    ],
  ])('rejects a malformed response: %s', async (_, mutate) => {
    const value = response();
    mutate(value);
    fetchMock.mockResolvedValue(Response.json(value));
    await expect(client().evaluate(request)).rejects.toThrow('Invalid Jev response');
  });

  it('rejects non-JSON responses', async () => {
    fetchMock.mockResolvedValue(new Response('<html>proxy failure</html>'));
    await expect(client().evaluate(request)).rejects.toThrow();
  });

  it.each([
    { questions: {} },
    { questions: { bad: { type: 'choice', criteria: {} } } },
    { questions: { bad: { type: 'score', criteria: [] } } },
    { questions: { bad: { type: 'text' } } },
    { model: ' ' },
  ])('rejects invalid configuration before fetching: %j', async (override) => {
    await expect(client().evaluate({ ...request, ...override } as JevRequest)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { apiKey: ' ' },
    { proxyUrl: '' },
    { apiKey: 'key', timeoutMs: -1 },
    { apiKey: 'key', timeoutMs: NaN },
    { apiKey: 'key', timeoutMs: Infinity },
    { apiKey: 'key', timeoutMs: 2147483648 },
    { apiKey: 'key', model: ' ' },
  ])('rejects invalid client options: %j', (options) => {
    expect(() => new JevClient(options)).toThrow();
  });

  it('uses the sent questions when callers mutate their request during a fetch', async () => {
    const mutable = structuredClone(request);
    fetchMock.mockImplementation(async () => {
      mutable.questions.team.criteria = { billing: 'Changed', technical: 'Changed' };
      (mutable.questions.team.criteria as Record<string, string>).sales = 'Sales';
      return Response.json(response());
    });
    await expect(client().evaluate(mutable)).resolves.toEqual(response());
  });

  it('does not fetch when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort(new Error('interrupted'));
    await expect(client().evaluate(request, { signal: controller.signal })).rejects.toThrow(
      'interrupted'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels a pending request and removes the parent listener', async () => {
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), {
            once: true,
          });
        })
    );
    const result = client().evaluate(request, { signal: controller.signal });
    controller.abort(new Error('barge-in'));
    await expect(result).rejects.toThrow('barge-in');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it('aborts the transport when its timeout expires and clears its timer', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init!.signal;
          signal!.addEventListener('abort', () => reject(signal!.reason), { once: true });
        })
    );
    const result = new JevClient({ apiKey: 'key', timeoutMs: 50, fetch: fetchMock }).evaluate(
      request
    );
    const rejected = expect(result).rejects.toMatchObject({ name: 'TimeoutError' });
    await jest.advanceTimersByTimeAsync(50);
    await rejected;
    expect(signal!.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears its timer on success and supports disabling timeouts', async () => {
    jest.useFakeTimers();
    await client().evaluate(request);
    expect(jest.getTimerCount()).toBe(0);
    fetchMock.mockResolvedValue(Response.json(response()));
    await new JevClient({ apiKey: 'key', timeoutMs: 0, fetch: fetchMock }).evaluate(request);
    expect(jest.getTimerCount()).toBe(0);
  });
});
