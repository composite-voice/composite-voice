---
title: Decision Models
description: Use TypeSafe Jev for typed decisions and speech guardrails.
order: 9
---

### Jev

`JevClient` calls TypeSafe's native System One API. Jev evaluates state and returns
probabilities, choices, or scores. It does not generate conversational text, so
use it alongside your voice pipeline rather than in the `providers` array.

The implementation follows the [official TypeSafe API schema](https://api.typesafe.ai/openapi.json),
checked September 29, 2026. It sends `POST https://api.typesafe.ai/v1/systemone`
with Bearer authentication. The default model is `jev-latest`; set `model` to a
name returned by TypeSafe's authenticated `GET /v1/models` endpoint to pin it.

```typescript
import { JevClient } from 'composite-voice';

// Server-side: keep this key out of browser bundles.
const jev = new JevClient({ apiKey: process.env.TYPESAFE_API_KEY! });
const result = await jev.evaluate({
  state: 'Please refund the duplicate charge. I need help today.',
  questions: {
    refund: { type: 'noul', instructions: 'Is a refund requested?' },
    team: {
      type: 'choice',
      instructions: 'Which team should handle this request?',
      criteria: { billing: 'Payment issues', technical: 'Technical issues' },
    },
    urgency: {
      type: 'score',
      instructions: 'How urgent is the request?',
      criteria: ['Can wait', 'This week', 'Today'],
    },
  },
});

console.log(result.answers.refund.noul); // Probability of true, 0–1
console.log(result.answers.team.choice); // Typed as 'billing' | 'technical'
console.log(result.answers.team.probabilities);
console.log(result.answers.urgency.score); // Expected rubric index, 0–2
console.log(result.usage.input_tokens);
```

The score is a probability-weighted average, so it may be fractional. Each choice
and score includes `confidence` and a probability distribution. A `noul` answer
contains the probability of true itself; it has no separate confidence field.
Choose thresholds using evaluations on your own data.

### Guard text before it is spoken

`createJevGuardrail` asks whether the supplied text violates your policy. It blocks
when that probability is at least `threshold` (default `0.5`). Set `replacement`
to speak a fixed response instead. Events include the violation probability in
`metadata.score`.

```typescript
import { CompositeVoice, JevClient, createJevGuardrail } from 'composite-voice';

const voice = new CompositeVoice({
  // Add your normal STT, LLM, and TTS providers here.
  guardrails: {
    mode: 'buffered',
    onError: 'block',
    timeoutMs: 2000,
    filters: [
      createJevGuardrail({
        client: new JevClient({ proxyUrl: '/api/jev', timeoutMs: 1500 }),
        policy: 'Do not disclose customer account numbers or access credentials.',
        threshold: 0.5,
        replacement: 'I cannot share that information.',
      }),
    ],
  },
});
```

The guardrail defaults to `stages: ['final']`. For Live TTS, set `mode: 'buffered'`
to evaluate the entire utterance before synthesis. To evaluate streamed segments,
set `stages: ['chunk', 'final']`; text already sent to TTS cannot be recalled.
The check receives only the current text, after earlier filters. It does not send
conversation history automatically. Raw `llm.chunk` and `llm.complete` events are
unchanged. This operates on the separate LLM-to-TTS path; it cannot filter audio
generated inside an all-in-one agent provider.

For custom decisions, call `jev.evaluate()` from your own `Guardrail.check` and
pass `{ signal: context.signal }` as its second argument. That lets you use
multiple questions, choice probabilities, or conversation state when needed.

### Transport and failure handling

- A browser client uses `proxyUrl`, the full URL of an application endpoint you
  implement. That endpoint authenticates the user, validates the request, adds
  the server-side TypeSafe key, and returns the native Jev JSON response. The SDK's
  generic voice proxy does not currently supply a Jev route. A proxy client never
  sends `apiKey`, even if one is configured.
- `fetch` can be overridden to add your application's authentication or use a
  custom transport. `timeoutMs` defaults to 10 seconds; `0` disables it. Set a
  shorter client timeout than the guardrail pipeline timeout to abort stalled
  network requests before the pipeline moves on.
- `evaluate(request, { signal })` supports cancellation. The client aborts fetch
  on timeout or cancellation, validates answers against the questions sent, and
  throws on HTTP errors or malformed responses. It does not automatically retry.
- `JevAPIError.status` exposes HTTP status codes without including the upstream
  response body. Within a guardrail, errors follow `guardrails.onError`. Its
  default is `passthrough`; use `block` when failures must suppress speech.

### OpenAI Decisions API research status

As of September 29, 2026, this SDK does not implement the newly announced OpenAI
Decisions preview. We checked the official [API changelog](https://developers.openai.com/api/docs/changelog),
[Node SDK](https://github.com/openai/openai-node/tree/02f4ef94e8b3b02b43af6516c71a74c3c7a80b5d/src/resources), and
[Python SDK](https://github.com/openai/openai-python/tree/49e4366847516621801ce3d82d7e47b7319c0873/src/openai/resources), including the published
`openai` npm package 7.25.0 and Python package 3.22.0. These sources did not expose
a Decisions request/response contract. Implementation is tracked in beads issue
`composite-voice-3`, pending the official preview schema. Ordinary Responses API
structured outputs are a different integration and are not substituted here.
