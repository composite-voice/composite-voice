# Example 04 — Base Provider Options

Demonstrates `endpoint`, `authType`, and `proxyUrl` configuration on provider instances. Toggle between `authType: 'token'` and `authType: 'bearer'` at runtime and see the resolved connection info for each provider.

| | Provider |
|-|----------|
| **STT** | DeepgramSTT |
| **LLM** | AnthropicLLM |
| **TTS** | DeepgramTTS |

## Setup

```bash
cp examples/04-base-provider-options/sample.env .env
# Add your DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
pnpm example:04-base-provider-options:dev
```

Open [http://localhost:3004](http://localhost:3004).
