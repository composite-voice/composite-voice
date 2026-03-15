---
title: Conversation History
description: Multi-turn memory — configure how the SDK accumulates and manages conversation context across turns.
order: 4
---

### What conversation history does

By default, the SDK sends each user utterance to the LLM in isolation. The agent has no memory of what was said before -- every turn starts fresh.

When conversation history is enabled, the SDK accumulates user and assistant messages across turns and sends them to the LLM as context. This gives the agent multi-turn memory within a session:

```
You:  "My name is Sam."
AI:   "Nice to meet you, Sam!"
You:  "What's my name?"
AI:   "Your name is Sam."   // the LLM remembers the earlier exchange
```

Without conversation history, the second exchange would fail -- the LLM would have no context about the user's name.

### Enabling conversation history

Pass the `conversationHistory` option when creating the agent:

```typescript
import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({ language: 'en-US' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 'You are a helpful voice assistant. Remember everything the user tells you.',
      maxTokens: 300,
    }),
    new NativeTTS(),
  ],
  conversationHistory: {
    enabled: true,
    maxTurns: 10,
  },
});
```

### Configuration options

The `ConversationHistoryConfig` interface has four properties:

| Property                  | Type      | Default     | Description                                                                                 |
| ------------------------- | --------- | ----------- | ------------------------------------------------------------------------------------------- |
| `enabled`                 | `boolean` | `false`     | Whether conversation history is active.                                                     |
| `maxTurns`                | `number`  | `0`         | Maximum number of turns to retain. `0` means unlimited.                                     |
| `maxTokens`               | `number`  | `undefined` | Approximate token budget for history (uses a `ceil(text.length / 4)` heuristic). When both `maxTurns` and `maxTokens` are set, the more restrictive limit wins. |
| `preserveSystemMessages`  | `boolean` | `true`      | When `true`, system messages are never removed by trimming. They are separated before trimming and prepended back afterward. |

### How turns are counted

A "turn" is one user message plus one assistant message -- a single exchange. Internally, each turn produces two `LLMMessage` entries in the history array:

```
Turn 1:  { role: 'user', content: 'Hello' }
         { role: 'assistant', content: 'Hi there!' }
Turn 2:  { role: 'user', content: 'What is 2 + 2?' }
         { role: 'assistant', content: 'That equals 4.' }
```

With `maxTurns: 10`, the history array holds up to 20 messages (10 user + 10 assistant). The SDK adds the user message to the history before sending the LLM request, so the LLM always sees the current utterance in context.

### How trimming works

When the history exceeds the configured limits, the SDK drops the oldest turns to make room. Trimming happens right after the new user message is appended, before the LLM request is sent. The SDK applies two trimming passes in order:

1. **Turn-based trimming** (`maxTurns`): If `maxTurns > 0` and the non-system message count exceeds `maxTurns * 2`, the oldest messages are sliced off.
2. **Token-based trimming** (`maxTokens`): If `maxTokens` is set, the SDK estimates token counts using a `ceil(text.length / 4)` heuristic and removes the oldest non-system messages until the total fits within the budget.

When `preserveSystemMessages` is `true` (the default), system messages are separated before trimming and prepended back afterward -- they are never dropped.

```typescript
// Internal logic (simplified):
history.push({ role: 'user', content: text });

// Separate system messages when preserveSystemMessages is true
const systemMessages = history.filter(m => m.role === 'system');
let nonSystemMessages = history.filter(m => m.role !== 'system');

// Apply maxTurns trimming
if (maxTurns > 0 && nonSystemMessages.length > maxTurns * 2) {
  nonSystemMessages = nonSystemMessages.slice(-(maxTurns * 2));
}

// Apply maxTokens trimming (removes oldest non-system messages until within budget)

// Reassemble: system messages + remaining non-system messages
```

The trimming preserves the most recent turns, which are the most relevant for conversational context. With `maxTurns: 5`, the flow looks like this:

```
Turn 1:  history = [user1, assistant1]                              → 1 turn
Turn 2:  history = [user1, assistant1, user2, assistant2]           → 2 turns
...
Turn 5:  history = [u1, a1, u2, a2, u3, a3, u4, a4, u5, a5]       → 5 turns
Turn 6:  history = [u2, a2, u3, a3, u4, a4, u5, a5, u6, a6]       → 5 turns (u1/a1 dropped)
```

Setting `maxTurns: 0` disables trimming entirely. The history grows without limit until you call `clearHistory()` or dispose the agent -- long histories increase LLM token usage and latency.

### System prompts and history

You configure the system prompt on the LLM provider, not in the conversation history. When conversation history is enabled, the SDK sends the accumulated `user` and `assistant` messages to the LLM's `generateFromMessages()` method, and the LLM provider prepends the system prompt automatically.

For example, `AnthropicLLM` extracts the system prompt from the message array and passes it as Anthropic's top-level `system` parameter. OpenAI-compatible providers include it as the first message with `role: 'system'`.

Because the system prompt lives outside the conversation history array, it does not count toward `maxTurns`, is never trimmed, and appears in every LLM request regardless of history length.

```typescript
const llm = new AnthropicLLM({
  proxyUrl: '/api/proxy/anthropic',
  model: 'claude-haiku-4-5-20251001',
  systemPrompt: 'You are a helpful voice assistant. Keep responses to two sentences.',
  maxTokens: 200,
});

const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  conversationHistory: { enabled: true, maxTurns: 10 },
});

// Every LLM call receives:
// 1. The system prompt (always present, managed by the LLM provider)
// 2. The conversation history (user/assistant pairs, managed by the SDK)
// 3. The current user utterance (appended to history before sending)
```

### The `getHistory()` and `clearHistory()` API

The agent exposes two methods for programmatic access to the conversation history:

**`getHistory()`** returns a shallow copy of the current history as an array of `LLMMessage` objects. Each message has a `role` (`'user'` or `'assistant'`) and a `content` string. Since it is a copy, modifying the returned array does not affect the internal state.

```typescript
const history = agent.getHistory();
console.log(`${history.length} messages in history`);

for (const msg of history) {
  console.log(`[${msg.role}]: ${msg.content}`);
}
```

If conversation history is disabled or no turns have occurred, `getHistory()` returns an empty array.

**`clearHistory()`** wipes all accumulated history without disposing or reinitializing the agent. The next LLM request starts with a clean slate. This is useful for "new topic" or "reset conversation" features:

```typescript
document.getElementById('reset-btn').addEventListener('click', () => {
  agent.clearHistory();
  console.log(agent.getHistory().length); // 0
});
```

After clearing, the agent continues to accumulate new turns if `conversationHistory.enabled` is still `true`. You do not need to reinitialize.

### Configuration examples

**Basic multi-turn agent with NativeSTT:**
```typescript
const agent = new CompositeVoice({
  providers: [
    new NativeSTT({ language: 'en-US', continuous: true, interimResults: true }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 'You are a friendly voice assistant. Remember everything discussed.',
      maxTokens: 300,
      temperature: 0.7,
    }),
    new NativeTTS({ rate: 1.0 }),
  ],
  conversationHistory: {
    enabled: true,
    maxTurns: 10,
  },
});
```

**Production Deepgram pipeline with conversation history:**
```typescript
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new DeepgramSTT({
      proxyUrl: `${window.location.origin}/proxy/deepgram`,
      language: 'en-US',
      interimResults: true,
      options: {
        model: 'nova-3',
        smartFormat: true,
        endpointing: 300,
        vadEvents: true,
      },
    }),
    new AnthropicLLM({
      proxyUrl: `${window.location.origin}/proxy/anthropic`,
      model: 'claude-haiku-4-5-20251001',
      systemPrompt: 'You are a concise voice assistant. Keep responses to two sentences.',
      maxTokens: 300,
      temperature: 0.7,
    }),
    new DeepgramTTS({
      proxyUrl: `${window.location.origin}/proxy/deepgram`,
      options: { model: 'aura-2-thalia-en', encoding: 'linear16', sampleRate: 24000 },
    }),
  ],
  conversationHistory: {
    enabled: true,
    maxTurns: 10,
  },
});
```

**Short memory for quick Q&A (3 turns):**
```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  conversationHistory: {
    enabled: true,
    maxTurns: 3,  // only remember the last 3 exchanges
  },
});
```

This is useful for voice agents that handle transactional queries where deep context is unnecessary. A small `maxTurns` value keeps token usage low and latency fast.

**Unlimited history for long-form conversations:**
```typescript
const agent = new CompositeVoice({
  providers: [/* ...your providers */],
  conversationHistory: {
    enabled: true,
    maxTurns: 0,  // no limit -- history grows until cleared or disposed
  },
});
```

Use this when the full conversation context matters (e.g., tutoring, interviews, or therapy bots). Be aware that LLM token costs and latency scale with history length. Consider calling `clearHistory()` at natural breakpoints to manage costs.

### Token usage considerations

Every message in the conversation history consumes LLM input tokens. With `maxTurns: 10` and average responses of 50 tokens each, a full history adds roughly 1,000 tokens per request. For longer conversations or verbose responses, this can grow significantly.

To manage token usage:
- Set a reasonable `maxTurns` value (5-15 covers most conversational needs)
- Keep the `systemPrompt` concise
- Use `clearHistory()` when the topic changes
- Monitor LLM costs during development with debug logging enabled

### Related

- [Pipeline Architecture](/advanced/pipeline) for how conversation history fits into the LLM request flow
- [Getting Started](/guides/getting-started) for basic agent configuration
- [Anthropic LLM guide](/guides/llm/anthropic) for system prompt configuration with Claude
- [Events reference](/reference/events) for the `transcription.speechFinal`, `llm.start`, and `llm.complete` events that drive turn accumulation
