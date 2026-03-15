# Example 63 — Audio Config Internals

Deep-dive into `AudioCapture` internals. Detect AudioWorklet vs ScriptProcessor, display AudioContext properties, and track audio chunk statistics.

| | Provider | Role |
|-|----------|------|
| **Input** | `MicrophoneInput` | Explicit audio input |
| **STT** | `DeepgramSTT` | WebSocket STT |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `NativeTTS` | SpeechSynthesis API |

## What you'll learn

- AudioWorklet vs ScriptProcessor detection and which path the browser uses
- AudioContext properties: `sampleRate`, `baseLatency`, `outputLatency`
- How audio chunks flow from microphone to STT provider
- The internal data flow: `getUserMedia` -> `AudioCapture` -> `MicrophoneInput` -> `InputQueue` -> `STT`

## Setup

```bash
pnpm install && pnpm build
cp examples/63-audio-config/sample.env examples/63-audio-config/.env
# Edit .env with DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-63-audio-config dev
```

Open [http://localhost:3063](http://localhost:3063) in Chrome or Edge.
