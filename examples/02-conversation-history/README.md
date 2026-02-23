# Example 02 — Conversation History

Demonstrates multi-turn conversation memory: the LLM receives the full history of the current session so it can answer follow-up questions and remember what was said earlier.

| | Provider | Cost |
|-|----------|------|
| **STT** | `NativeSTT` — Web Speech API | Free |
| **LLM** | `AnthropicLLM` — claude-haiku-4-5 with `conversationHistory` | Pay per token |
| **TTS** | `NativeTTS` — SpeechSynthesis API | Free |

---

## What's different from Example 00

By default, `CompositeVoice` is stateless — each utterance is sent to the LLM in isolation, with no memory of previous exchanges. This example enables `conversationHistory`:

```javascript
const agent = new CompositeVoice({
  stt, llm, tts,
  conversationHistory: {
    enabled: true,
    maxTurns: 10,   // keep the last 10 user+assistant pairs in context
  },
});
```

Each completed turn is appended to an internal history array, and the full history is included in every subsequent LLM call. This enables natural back-and-forth exchanges:

```
You:  "My name is Sam."
AI:   "Nice to meet you, Sam!"
You:  "What's my name?"
AI:   "Your name is Sam."
```

The UI in this example shows the full conversation as a chat thread. The **Clear History** button calls `agent.clearHistory()` to start a fresh session without reinitializing the whole agent.

---

## Prerequisites

- Node.js 18+
- pnpm
- Chrome or Edge — required for `NativeSTT` (Web Speech API)
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

All commands run from the **repo root**:

```bash
# 1. Install workspace dependencies
pnpm install

# 2. Build the SDK
pnpm build

# 3. Copy the sample env file
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
    ↓  llm.chunk + appends to history
NativeTTS
    ↓
Speakers
```

After each exchange, `CompositeVoice` automatically appends a `{ role: 'user', content: '...' }` and `{ role: 'assistant', content: '...' }` pair to the internal history. The history is passed as the `messages` array on every subsequent LLM call.

`maxTurns: 10` keeps the last 10 user + assistant pairs (20 messages total). When the limit is reached, the oldest pair is dropped from the front of the array to make room. This keeps costs under control while preserving recent context.

### Key API

```typescript
// Read the current conversation history
const history = agent.getHistory(); // LLMMessage[]
// Returns: [{ role: 'user', content: '...' }, { role: 'assistant', content: '...' }, ...]

// Reset the conversation without reinitializing
agent.clearHistory();
```

### Tuning `maxTurns`

| Setting | Effect |
|---------|--------|
| `maxTurns: 0` | Keep the entire session (costs grow unbounded) |
| `maxTurns: 5` | Lightweight, remembers the last 5 exchanges |
| `maxTurns: 10` | Good default for most use cases |
| `maxTurns: 20+` | Long context for complex multi-step tasks |

---

## Troubleshooting

**The AI doesn't remember something I said earlier**

If `maxTurns` is set too low, older messages may have been dropped from the context window. Increase it or set it to `0` to keep the entire session.

**Costs seem higher than expected**

Conversation history grows the prompt on every turn. Use `maxTurns` to cap the context size. Alternatively, try a more efficient model for long conversations:

```javascript
new AnthropicLLM({
  model: 'claude-haiku-4-5',   // fast and cost-efficient
  maxTokens: 150,              // shorter responses = lower cost per turn
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
| **[03 — Eager pipeline](../03-eager-pipeline/)** | Lower latency with speculative LLM generation |
| **[04 — Server-side proxy](../04-proxy-server/)** | Keep API keys out of the browser entirely |

---

## Browser support

| Browser | Status |
|---------|--------|
| Chrome / Edge | Full support — recommended |
| Firefox | Not supported — Web Speech API unavailable |
| Safari | Partial — Web Speech API support is limited and inconsistent |
