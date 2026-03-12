---
title: Conversation History
description: Multi-turn conversation memory — how the SDK maintains context across exchanges.
order: 3
---

### Overview

CompositeVoice maintains a conversation history that gives the LLM context from previous exchanges. Each user utterance and assistant response form a turn. The SDK sends the full history with each LLM request via `generateFromMessages()`.

### Configuration

```typescript
const voice = new CompositeVoice({
  providers: [stt, llm, tts],
  conversationHistory: {
    enabled: true,   // default: false
    maxTurns: 10,    // default: 0 (unlimited)
  },
});
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | `boolean` | `false` | Accumulate turns and send them as context |
| `maxTurns` | `number` | `0` | Maximum turns to retain; `0` means unlimited |

### How turns work

Each turn consists of one user message (from STT) and one assistant message (from LLM):

```
Turn 1: { role: 'user', content: 'What is TypeScript?' }
        { role: 'assistant', content: 'TypeScript is a typed superset of JavaScript...' }

Turn 2: { role: 'user', content: 'How does it compare to Flow?' }
        { role: 'assistant', content: 'Both add static types, but TypeScript...' }
```

Internally the SDK stores turns as a flat array of `LLMMessage` objects. One turn equals two messages (user + assistant). When `maxTurns` is exceeded, the oldest turn (both messages) is dropped.

### System prompts

Pass a system prompt through the LLM provider's configuration. The system prompt persists across all turns and is not part of the conversation history array:

```typescript
const llm = new AnthropicLLM({
  proxyUrl: '/api/proxy/anthropic',
  model: 'claude-haiku-4-5',
  systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
});
```

When conversation history is enabled, the SDK calls `generateFromMessages()` with the accumulated messages. The LLM provider prepends the system prompt automatically. The message order sent to the model is:

```
[system prompt] + [conversation history] + [latest user message]
```

### Message format

The SDK uses the `LLMMessage` interface:

```typescript
interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
```

The conversation history array contains only `user` and `assistant` messages. The LLM provider handles `system` messages separately.

### Reading history

```typescript
const history = voice.getHistory();
// Returns a copy — modifications do not affect the internal array
console.log(`${history.length} messages in history`);
for (const msg of history) {
  console.log(`[${msg.role}]: ${msg.content}`);
}
```

### Clearing history

```typescript
voice.clearHistory();  // removes all stored messages
```

Use this when switching topics or resetting a conversation without disposing the agent.

### Disabling history

```typescript
const voice = new CompositeVoice({
  providers: [stt, llm, tts],
  conversationHistory: {
    enabled: false,  // each utterance is independent (default)
  },
});
```

Without history, the SDK calls `generate()` (single prompt) instead of `generateFromMessages()`. Each user utterance is treated as a standalone prompt. The LLM has no memory of previous exchanges.

### Token management

Conversation history grows with each turn. Long conversations may approach the LLM's context window limit. Set `maxTurns` to cap memory usage:

| `maxTurns` | Messages retained | Use case |
|------------|-------------------|----------|
| 5 | 10 | Quick Q&A interactions |
| 10 | 20 | Moderate conversations |
| 20+ | 40+ | Extended sessions (watch token costs) |
| 0 (unlimited) | all | You manage context yourself |

The SDK trims history before each LLM request. When the message count exceeds `maxTurns * 2`, it keeps only the most recent messages.
