# Example 65 — Multi-Language

Language switching demo. Change the SpeechmaticsSTT language at runtime with a selector. The LLM is instructed to respond in the selected language.

| | Provider | Role |
|-|----------|------|
| **Input** | `MicrophoneInput` | Explicit audio input |
| **STT** | `SpeechmaticsSTT` | WebSocket STT with `language` and `outputLocale` options |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `NativeTTS` | SpeechSynthesis API |

## What you'll learn

- How to configure `SpeechmaticsSTT` with a specific language via `language`, and transcript spelling via `outputLocale`
- How to switch languages at runtime by recreating the agent
- How to instruct the LLM to respond in a specific language via `systemPrompt`
- Supported languages in Speechmatics (50+ language packs)

## Setup

```bash
pnpm install && pnpm build
cp examples/65-multi-language/sample.env examples/65-multi-language/.env
# Edit .env with SPEECHMATICS_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter composite-voice-example-65-multi-language dev
```

Open [http://localhost:3065](http://localhost:3065) in Chrome or Edge.
