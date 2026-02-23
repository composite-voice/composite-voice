# Example 02 — Conversation History

Demonstrates multi-turn conversation memory: the LLM receives the full history of the current session so it can answer follow-up questions and remember what was said earlier.

| | Provider | Cost |
|-|----------|------|
| **STT** | `NativeSTT` — Web Speech API | Free |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 with `conversationHistory` | Pay per token |
| **TTS** | `NativeTTS` — SpeechSynthesis API | Free |

---

## What's different from Example 00

By default, the agent is stateless — each utterance is sent to the LLM in isolation. This example enables `conversationHistory`:

```js
agent = new CompositeVoice({
  stt, llm, tts,
  conversationHistory: {
    enabled: true,
    maxTurns: 10,   // keep the last 10 user+assistant pairs
  },
});
```

Each response is appended to an internal history array, and the full history is included in every subsequent LLM call. This enables natural back-and-forth exchanges:

> **You:** "My name is Sam."
> **AI:** "Nice to meet you, Sam!"
> **You:** "What's my name?"
> **AI:** "Your name is Sam."

The UI shows the full conversation as a chat thread. The **Clear History** button calls `agent.clearHistory()` and starts a fresh session.

---

## Prerequisites

- Node.js 18+
- pnpm
- Chrome or Edge
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

All commands run from the **repo root**:

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Build the SDK
pnpm build

# 3. Create your env file
cp examples/02-conversation-history/sample.env examples/02-conversation-history/.env
```

Edit `examples/02-conversation-history/.env`:

```env
VITE_ANTHROPIC_API_KEY=your-anthropic-api-key-here
```

---

## Run

```bash
pnpm example:02-conversation-history:dev
```

Open [http://localhost:3002](http://localhost:3002) in Chrome or Edge.

---

## How it works

```
Microphone → NativeSTT → AnthropicLLM (with history[]) → NativeTTS → Speakers
                                  ↑
                          conversationHistory[]
```

`maxTurns: 10` keeps the last 10 user + assistant pairs (20 messages total). Older messages are dropped from the front of the array when the limit is reached. Set `maxTurns: 0` to keep the entire session.

**Key API:**

```typescript
// Read the current history
const history = agent.getHistory(); // LLMMessage[]

// Reset the conversation
agent.clearHistory();
```

---

## Troubleshooting

**The AI doesn't remember something I said earlier**

Check `maxTurns` — if it's set too low, older messages may have been dropped. Increase it or set to `0`.

**Costs are high**

Conversation history grows the prompt on every turn. Use `maxTurns` to limit context size, or use a more cost-efficient model.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| **[03 — Eager pipeline](../03-eager-pipeline/)** | Lower latency with speculative LLM start |
| **[04 — Server-side proxy](../04-proxy-server/)** | API keys server-side only |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support (recommended) |
| Firefox | Not supported — Web Speech API unavailable |
| Safari | Partial — Web Speech API implementation is limited |
