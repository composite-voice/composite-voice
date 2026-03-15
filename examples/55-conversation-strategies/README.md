# Example 55 — Conversation History Strategies

Side-by-side comparison of conversation history with different `maxTurns` settings. Watch how history grows and trims differently.

| | Provider | Role |
|-|----------|------|
| **STT** | `NativeSTT` | Web Speech API |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `NativeTTS` | SpeechSynthesis API |

## What you'll learn

- How `conversationHistory.maxTurns` controls memory retention
- Visual comparison of short-memory (3 turns) vs long-memory (10 turns) agents
- How conversation trimming works (oldest turns dropped first)
- How `preserveSystemMessages` keeps system instructions during trimming

## Setup

```bash
pnpm install && pnpm build
cp examples/55-conversation-strategies/sample.env examples/55-conversation-strategies/.env
# Edit .env with your ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-55-conversation-strategies dev
```

Open [http://localhost:3055](http://localhost:3055) in Chrome or Edge.
