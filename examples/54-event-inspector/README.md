# Example 54 — Advanced Event Inspector

Advanced event usage with a real-time timeline, payload inspection, category filtering, and event counts. Uses the full 5-provider pipeline for maximum event coverage.

| | Provider | Role |
|-|----------|------|
| **Input** | `MicrophoneInput` | Explicit audio input |
| **STT** | `DeepgramSTT` | WebSocket STT |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `DeepgramTTS` | WebSocket TTS |
| **Output** | `BrowserAudioOutput` | Web Audio playback |

## What you'll learn

- How to subscribe to ALL SDK events for debugging
- Event categories: transcription, llm, tts, agent, audio, queue
- How to inspect event payloads in real-time
- Event timing and performance profiling
- Category-based filtering for focused debugging

## Setup

```bash
pnpm install && pnpm build
cp examples/54-event-inspector/sample.env examples/54-event-inspector/.env
# Edit .env with DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-54-event-inspector dev
```

Open [http://localhost:3054](http://localhost:3054) in Chrome or Edge.
