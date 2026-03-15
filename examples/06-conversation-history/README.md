# Example 06 — Conversation History

Demonstrates `maxTurns`, `maxTokens`, and `preserveSystemMessages` configuration. Adjust settings with sliders and inputs, then view the live conversation history array as you speak with the agent.

| | Provider |
|-|----------|
| **STT** | NativeSTT (Web Speech API) |
| **LLM** | AnthropicLLM |
| **TTS** | NativeTTS (SpeechSynthesis) |

## Setup

```bash
cp examples/06-conversation-history/sample.env .env
# Add your ANTHROPIC_API_KEY
pnpm example:06-conversation-history:dev
```

Open [http://localhost:3006](http://localhost:3006) in Chrome or Edge.
