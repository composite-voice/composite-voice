# Example 65 — Multi-Language

Language switching demo. Change the DeepgramSTT language at runtime with a selector. The LLM is instructed to respond in the selected language.

| | Provider | Role |
|-|----------|------|
| **Input** | `MicrophoneInput` | Explicit audio input |
| **STT** | `DeepgramSTT` | WebSocket STT with language option |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `NativeTTS` | SpeechSynthesis API |

## What you'll learn

- How to configure `DeepgramSTT` with a specific language via `options.language`
- How to switch languages at runtime by recreating the agent
- How to instruct the LLM to respond in a specific language via `systemPrompt`
- Supported languages in Deepgram Nova-3 (20+ languages)

## Setup

```bash
pnpm install && pnpm build
cp examples/65-multi-language/sample.env examples/65-multi-language/.env
# Edit .env with DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-65-multi-language dev
```

Open [http://localhost:3065](http://localhost:3065) in Chrome or Edge.
