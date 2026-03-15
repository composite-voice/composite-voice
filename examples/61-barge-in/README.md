# Example 61 — Barge-In

Full-duplex barge-in demo. Interrupt the agent mid-speech by speaking or clicking Stop Speaking.

| | Provider | Role |
|-|----------|------|
| **Input** | `MicrophoneInput` | Explicit audio input |
| **STT** | `DeepgramSTT` | WebSocket STT |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `DeepgramTTS` | WebSocket TTS |
| **Output** | `BrowserAudioOutput` | Web Audio playback |

## What you'll learn

- How `turnTaking.pauseCaptureOnPlayback: false` enables full-duplex mode
- How barge-in works: the microphone stays active while the agent speaks
- How to use `agent.stopSpeaking()` for manual interruption
- Tracking interruption events in a barge-in log

## Setup

```bash
pnpm install && pnpm build
cp examples/61-barge-in/sample.env examples/61-barge-in/.env
# Edit .env with DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-61-barge-in dev
```

Open [http://localhost:3061](http://localhost:3061) in Chrome or Edge.
