# Example 53 — Null Output

Demonstrates `NullOutput` for headless and testing scenarios. TTS events fire normally but no audio is played.

| | Provider | Role |
|-|----------|------|
| **STT** | `NativeSTT` | Web Speech API |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `DeepgramTTS` | WebSocket TTS |
| **Output** | `NullOutput` | Discards all audio |

## What you'll learn

- How `NullOutput` implements the Null Object pattern for `AudioOutputProvider`
- That TTS events (`tts.start`, `tts.audio`, `tts.complete`) fire even without playback
- How to track discarded audio chunks and bytes
- When to use `NullOutput` (server-side pipelines, testing, headless environments)

## Setup

```bash
pnpm install && pnpm build
cp examples/53-null-output/sample.env examples/53-null-output/.env
# Edit .env with DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-53-null-output dev
```

Open [http://localhost:3053](http://localhost:3053) in Chrome or Edge.
