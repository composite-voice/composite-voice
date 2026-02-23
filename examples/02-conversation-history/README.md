# Example 02 — Conversation History

Enables multi-turn memory so the AI remembers what was said earlier in the session. The LLM receives the full conversation history on every turn, enabling natural back-and-forth exchanges.

| | Provider | Cost |
|-|----------|------|
| **STT** | `NativeSTT` — Web Speech API | Free |
| **LLM** | `AnthropicLLM` — claude-haiku-4-6 with `conversationHistory` | Pay per token |
| **TTS** | `NativeTTS` — SpeechSynthesis API | Free |

---

## What you'll learn

- How to enable `conversationHistory` so the agent remembers earlier exchanges
- What `maxTurns` does and how to tune it for cost vs. context length
- How to use `agent.getHistory()` and `agent.clearHistory()`
- How prompt size grows with conversation history — and how to manage it

---

## What's different from Example 00

By default, `CompositeVoice` is stateless — each utterance is sent to the LLM with no memory of previous exchanges. This example enables `conversationHistory`:

```javascript
const agent = new CompositeVoice({
  stt, llm, tts,
  conversationHistory: {
    enabled: true,
    maxTurns: 10,   // keep the last 10 user+assistant pairs in context
  },
});
```

Each completed turn is automatically appended to an internal history array and included in the next LLM call:

```
You:  "My name is Sam."
AI:   "Nice to meet you, Sam!"
You:  "What's my name?"
AI:   "Your name is Sam."   ← the LLM remembered
```

The UI shows the full conversation as a chat thread. The **Clear History** button calls `agent.clearHistory()` to start fresh without reinitializing the agent.

---

## Prerequisites

- Node.js 18+
- pnpm
- **Chrome or Edge** — required for `NativeSTT`
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

All commands from the **repo root**:

```bash
# 1. Install dependencies
pnpm install

# 2. Build the SDK
pnpm build

# 3. Copy the env template and add your key
cp examples/02-conversation-history/sample.env examples/02-conversation-history/.env
```

Edit `.env`:

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
    ↓  transcription.speechFinal
AnthropicLLM ←── conversationHistory[]
    ↓  llm.complete  (response appended to history automatically)
NativeTTS
    ↓
Speakers
```

After each exchange, `CompositeVoice` appends `{ role: 'user', content: '...' }` and `{ role: 'assistant', content: '...' }` pairs to the internal history. The full history is passed as the `messages` array on every subsequent LLM call.

### History API

```typescript
// Read the current conversation history
const history = agent.getHistory();
// [
//   { role: 'user', content: 'My name is Sam.' },
//   { role: 'assistant', content: 'Nice to meet you, Sam!' },
//   ...
// ]

// Reset without reinitializing the agent
agent.clearHistory();
```

### Tuning `maxTurns`

`maxTurns: 10` keeps the last 10 user + assistant pairs (20 messages total). When the limit is reached, the oldest pair is dropped to make room for the newest. This controls cost while preserving recent context.

| Setting | Effect |
|---------|--------|
| `maxTurns: 0` | Keep the entire session (cost grows every turn) |
| `maxTurns: 5` | Lightweight — remembers the last 5 exchanges |
| `maxTurns: 10` | Good default for most use cases |
| `maxTurns: 20+` | Long context for complex multi-step tasks |

---

## Troubleshooting

**The AI doesn't remember something from earlier**

Older messages are dropped once `maxTurns` is reached. Increase it — or set `maxTurns: 0` to keep the entire session.

**Costs are higher than expected**

History grows the prompt on every turn. Use `maxTurns` to cap the context size. Shorter responses also help:

```javascript
new AnthropicLLM({ model: 'claude-haiku-4-6', maxTokens: 150 })
```

**"VITE_ANTHROPIC_API_KEY is not set"**

```bash
cp examples/02-conversation-history/sample.env examples/02-conversation-history/.env
# Then edit .env and add your key
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
| [04 — Server-side proxy](../04-proxy-server/) | Keep API keys completely out of the browser |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Not supported — Web Speech API unavailable |
| Safari | Partial — Web Speech API support is limited and inconsistent |
