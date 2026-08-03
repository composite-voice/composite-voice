# Example 60 — Error Recovery

Demonstrates the `RecoveryOrchestrator` with configurable recovery strategy, exponential backoff visualization, and recovery event tracking.

| | Provider | Role |
|-|----------|------|
| **STT** | `NativeSTT` | Web Speech API |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `NativeTTS` | SpeechSynthesis API |

## What you'll learn

- How to configure `RecoveryStrategy`: `maxAttempts`, `initialDelay`, `backoffMultiplier`, `maxDelay`
- How exponential backoff calculates delays between recovery attempts
- How `autoRecover: true` enables automatic error recovery
- How to monitor `RecoveryEvent` objects during recovery

## Setup

```bash
pnpm install && pnpm build
cp examples/60-error-recovery/sample.env examples/60-error-recovery/.env
# Edit .env with your ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter composite-voice-example-60-error-recovery dev
```

Open [http://localhost:3060](http://localhost:3060) in Chrome or Edge.
