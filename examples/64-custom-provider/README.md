# Example 64 — Custom Provider

Build a custom LLM provider from scratch. `MockLLM` returns canned responses with simulated streaming. No API keys required.

| | Provider | Role |
|-|----------|------|
| **STT** | `NativeSTT` | Web Speech API |
| **LLM** | `MockLLM` (custom) | Canned responses |
| **TTS** | `NativeTTS` | SpeechSynthesis API |

## What you'll learn

- How to implement the `LLMProvider` interface from scratch
- Required properties: `type`, `roles`
- Required lifecycle methods: `initialize()`, `dispose()`, `isReady()`
- The `generate()` method with `LLMStreamCallbacks` for streaming output
- How `AbortSignal` enables cancellation of in-flight generation

## Setup

```bash
pnpm install && pnpm build
```

No API keys needed for this example.

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-64-custom-provider dev
```

Open [http://localhost:3064](http://localhost:3064) in Chrome or Edge.
