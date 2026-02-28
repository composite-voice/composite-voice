# Example 01 — Conversation History

Adds multi-turn memory so the AI remembers what was said earlier in the session. The full conversation history is included in every LLM call, enabling natural back-and-forth exchanges.

| | Provider | Transport | Browser support |
|-|----------|-----------|-----------------|
| **STT** | `NativeSTT` — Web Speech API | Browser built-in, free | Chrome, Edge |
| **LLM** | `AnthropicLLM` with `conversationHistory` | HTTP streaming | All |
| **TTS** | `NativeTTS` — SpeechSynthesis API | Browser built-in, free | All modern browsers |

---

## What you'll learn

- How to enable `conversationHistory` to give the agent persistent session memory
- What `maxTurns` controls and how to tune it for cost vs. context length
- How to use `agent.getHistory()` to inspect the conversation
- How `agent.clearHistory()` resets context without reinitializing
- How conversation history grows the LLM prompt — and how to manage cost

---

## What this adds over Example 00

By default, `CompositeVoice` is stateless — each utterance goes to the LLM with no memory of previous exchanges. One config option changes that:

```javascript
const agent = new CompositeVoice({
  providers: [stt, llm, tts],
  conversationHistory: {
    enabled: true,
    maxTurns: 10,   // keep the last 10 user + assistant pairs in context
  },
});
```

Each completed turn is automatically appended and included in the next LLM call:

```
You:  "My name is Sam."
AI:   "Nice to meet you, Sam!"
You:  "What's my name?"
AI:   "Your name is Sam."   ← the LLM remembered
```

The UI shows the full conversation as a chat thread. The **Clear History** button calls `agent.clearHistory()` to start fresh without reinitializing the agent.

---

## Prerequisites

- **Node.js** 18 or later and **pnpm** (`npm install -g pnpm`)
- **Chrome or Edge** — required for `NativeSTT`
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

Run all commands from the **repo root**:

```bash
# 1. Install dependencies and build the SDK
pnpm install && pnpm build

# 2. Copy the env template
cp examples/01-conversation-history/sample.env examples/01-conversation-history/.env
```

Open `.env` and fill in your key:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
pnpm example:01-conversation-history:dev
```

Open [http://localhost:3001](http://localhost:3001) in Chrome or Edge.

---

## How it works

```
Microphone
    ↓
NativeSTT
    ↓  transcription.speechFinal
AnthropicLLM ←── full conversationHistory[]
    ↓  llm.complete → { role: 'user' } and { role: 'assistant' } appended
NativeTTS
    ↓
Speakers
```

After each exchange, CompositeVoice appends both the user utterance and the assistant response to an internal history array. The full history is included as the `messages` array on every subsequent LLM call.

### History API

```typescript
// Read the current conversation
const history = agent.getHistory();
// Returns: Array<{ role: 'user' | 'assistant', content: string }>
// [
//   { role: 'user',      content: 'My name is Sam.' },
//   { role: 'assistant', content: 'Nice to meet you, Sam!' },
//   ...
// ]

// Reset the conversation without reinitializing
agent.clearHistory();
```

### Tuning `maxTurns`

`maxTurns: 10` keeps the last 10 user + assistant pairs (20 messages total). When the limit is reached, the oldest pair is dropped to make room for the newest. This controls cost while preserving recent context.

| Setting | Effect |
|---------|--------|
| `maxTurns: 0` | Keep the entire session — cost grows every turn |
| `maxTurns: 5` | Lightweight — remembers the last 5 exchanges |
| `maxTurns: 10` | Good default for most use cases |
| `maxTurns: 20+` | Long context for complex multi-step tasks |

---

## Troubleshooting

**The AI doesn't remember something from earlier**

The oldest messages are dropped once `maxTurns` is reached. Increase it, or set `maxTurns: 0` to keep the entire session in context (at higher cost).

**Costs are higher than expected**

History grows the prompt on every turn. To reduce cost, use a lower `maxTurns` and shorter responses:

```javascript
new AnthropicLLM({ model: 'claude-haiku-4-5-20251001', maxTokens: 100 })
```

**"ANTHROPIC_API_KEY is not set"**

```bash
cp examples/01-conversation-history/sample.env examples/01-conversation-history/.env
# Then open .env and add your key
```

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [21 — Eager Pipeline](../21-eager-pipeline/) | Lower latency with speculative LLM generation |
| [10 — Proxy Server](../10-proxy-server/) | Keep API keys completely out of the browser bundle |

---

## Browser support

NativeSTT and NativeTTS use the browser's Web Speech API. Microphone capture is handled directly by the browser — no AudioWorklet needed.

| Browser | Web Speech API (STT) | SpeechSynthesis (TTS) | Notes |
|---------|---------------------|----------------------|-------|
| Chrome / Edge | Full support | Full support | Recommended |
| Firefox | Not available | Limited | Use WebSocket providers (DeepgramSTT / DeepgramFlux) instead |
| Safari | Unreliable | Works | Behaviour varies by version — use WebSocket providers instead |
