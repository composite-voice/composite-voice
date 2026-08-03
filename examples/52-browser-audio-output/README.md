# Example 52 — Browser Audio Output Deep-Dive

Deep-dive into `BrowserAudioOutput` configuration. Explore all `AudioOutputConfig` options with interactive sliders.

| | Provider | Role |
|-|----------|------|
| **STT** | `NativeSTT` | Web Speech API |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `DeepgramTTS` | WebSocket TTS |
| **Output** | `BrowserAudioOutput` | Explicit audio output with full config |

## What you'll learn

- All `AudioOutputConfig` options: `bufferSize`, `minBufferDuration`, `sampleRate`, `enableSmoothing`
- How buffer settings affect playback latency and smoothness
- How `BrowserAudioOutput` wraps the internal `AudioPlayer`
- Real-time playback state and chunk tracking

## Setup

```bash
pnpm install && pnpm build
cp examples/52-browser-audio-output/sample.env examples/52-browser-audio-output/.env
# Edit .env with DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter composite-voice-example-52-browser-audio-output dev
```

Open [http://localhost:3052](http://localhost:3052) in Chrome or Edge.
