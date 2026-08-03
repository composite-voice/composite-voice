# Example 50 — Microphone Input Deep-Dive

Deep-dive into `MicrophoneInput` configuration. Explore all `AudioInputConfig` options with interactive controls and a real-time audio level meter.

| | Provider | Role |
|-|----------|------|
| **Input** | `MicrophoneInput` | Explicit audio input with full config |
| **STT** | `NativeSTT` | Web Speech API |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `NativeTTS` | SpeechSynthesis API |

## What you'll learn

- All `AudioInputConfig` options: `sampleRate`, `format`, `channels`, `chunkDuration`, `echoCancellation`, `noiseSuppression`, `autoGainControl`
- How to use `MicrophoneInput` as an explicit input provider in the 5-provider pipeline
- Real-time audio level visualization using the Web Audio API `AnalyserNode`
- How browser audio processing constraints affect capture quality

## Setup

```bash
pnpm install && pnpm build
cp examples/50-microphone-input/sample.env examples/50-microphone-input/.env
# Edit .env with your ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter composite-voice-example-50-microphone-input dev
```

Open [http://localhost:3050](http://localhost:3050) in Chrome or Edge.
