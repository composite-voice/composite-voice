# Example 51 — Buffer Input

Demonstrates `BufferInput` for feeding file or programmatic audio through the pipeline. Upload a WAV file and watch it get transcribed.

| | Provider | Role |
|-|----------|------|
| **Input** | `BufferInput` | Programmatic audio input |
| **STT** | `NativeSTT` | Web Speech API |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `NativeTTS` | SpeechSynthesis API |

## What you'll learn

- How `BufferInput` accepts pushed `ArrayBuffer` audio data
- Simulated streaming by chunking a file into 100ms segments
- The `AudioMetadata` interface for declaring audio format
- How `BufferInput` differs from `MicrophoneInput` (no browser APIs required)

## Setup

```bash
pnpm install && pnpm build
cp examples/51-buffer-input/sample.env examples/51-buffer-input/.env
# Edit .env with your ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter composite-voice-example-51-buffer-input dev
```

Open [http://localhost:3051](http://localhost:3051) in Chrome or Edge.
