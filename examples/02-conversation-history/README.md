# Example 02 — Conversation History

Demonstrates multi-turn conversation memory: the LLM receives the full history of the current session so it can answer follow-up questions and recall what was said earlier.

| | Provider | Cost |
|-|----------|------|
| **STT** | `NativeSTT` — Web Speech API | Free |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 with `conversationHistory` | Pay per token |
| **TTS** | `NativeTTS` — SpeechSynthesis API | Free |

---

## What you'll learn

- How to enable `conversationHistory` so the agent remembers earlier exchanges
- What `maxTurns` does and how to tune it for your use case
- How to use `agent.getHistory()` and `agent.clearHistory()`
- How prompt size grows with conversation history and how to manage the cost

---

## What's different from Example 00

By default, `CompositeVoice` is stateless — each utterance is sent to the LLM in isolation with no memory of previous exchanges. This example enables `conversationHistory`:

```javascript
const agent = new CompositeVoice({
  stt, llm, tts,
  conversationHistory: {
    enabled: true,
    maxTurns: 10,   // keep the last 10 user+assistant pairs in context
  },
});
```

Each completed turn is appended to an internal history array, and the full history is included in every subsequent LLM call. This enables natural back-and-forth conversations:

```
You:  "My name is Sam."
AI:   "Nice to meet you, Sam!"
You:  "What's my name?"
AI:   "Your name is Sam."   ← the LLM remembered
```

The UI in this example shows the full conversation as a chat thread. The **Clear History** button calls `agent.clearHistory()` to start fresh without reinitializing the whole agent.

---

## Prerequisites

- Node.js 18+
- pnpm
- **Chrome or Edge** — required for `NativeSTT` (Web Speech API)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

All commands run from the **repo root**:

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Build the SDK
pnpm build

# 3. Copy the sample env file and fill in your key
cp examples/02-conversation-history/sample.env examples/02-conversation-history/.env
```

Edit `examples/02-conversation-history/.env`:

```env
VITE_ANTHROPIC_API_KEY=sk-ant-...your-key-here...
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
Microphone
    ↓
NativeSTT
    ↓  transcription.final
AnthropicLLM ←── conversationHistory[]
    ↓  llm.chunk  (response appended to history after completion)
NativeTTS
    ↓
Speakers
```

After each exchange, `CompositeVoice` automatically appends `{ role: 'user', content: '...' }` and `{ role: 'assistant', content: '...' }` pairs to the internal history array. The full history is passed as the `messages` array on every subsequent LLM call.

`maxTurns: 10` keeps the last 10 user + assistant pairs (20 messages total). When the limit is reached, the oldest pair is dropped from the front to make room for the newest. This keeps costs under control while preserving recent context.

### History API

```typescript
// Read the current conversation history
const history = agent.getHistory();
// Returns: [
//   { role: 'user', content: 'My name is Sam.' },
//   { role: 'assistant', content: 'Nice to meet you, Sam!' },
//   ...
// ]

// Reset the conversation without reinitializing the agent
agent.clearHistory();
```

### Tuning `maxTurns`

| Setting | Effect |
|---------|--------|
| `maxTurns: 0` | Keep the entire session (costs grow with every turn) |
| `maxTurns: 5` | Lightweight — remembers the last 5 exchanges |
| `maxTurns: 10` | Good default for most use cases |
| `maxTurns: 20+` | Long context for complex multi-step tasks |

---

## Troubleshooting

**The AI doesn't remember something I said a few turns ago**

Older messages are dropped once `maxTurns` is reached. Increase it — or set it to `0` to keep the entire session in memory.

**Costs are higher than expected**

Conversation history grows the prompt on every turn, increasing token usage. Use `maxTurns` to cap the context size. Shorter responses also help:

```javascript
new AnthropicLLM({
  model: 'claude-haiku-4-6',
  maxTokens: 150,   // shorter responses = lower cost per turn
})
```

**"VITE_ANTHROPIC_API_KEY is not set"**

```bash
cp examples/02-conversation-history/sample.env examples/02-conversation-history/.env
# Then add your key
```

**"Cannot find module '@lukeocodes/composite-voice'"**

```bash
pnpm build
```

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [03 — Eager pipeline](../03-eager-pipeline/) | Lower latency with speculative LLM generation |
| [04 — Server-side proxy](../04-proxy-server/) | Keep API keys out of the browser entirely |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Not supported — Web Speech API unavailable |
| Safari | Partial — Web Speech API support is limited and inconsistent |
