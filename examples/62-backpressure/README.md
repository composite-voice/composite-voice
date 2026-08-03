# Example 62 — Backpressure

Pipeline backpressure demo. Adjust `maxPendingChunks` and observe how it throttles the LLM-to-TTS flow in real-time.

| | Provider | Role |
|-|----------|------|
| **Input** | `MicrophoneInput` | Explicit audio input |
| **STT** | `SpeechmaticsSTT` | WebSocket STT |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming |
| **TTS** | `DeepgramTTS` | WebSocket TTS — backpressure only throttles a streaming provider, so this stage stays on Deepgram |
| **Output** | `BrowserAudioOutput` | Web Audio playback |

## What you'll learn

- How `pipeline.maxPendingChunks` throttles LLM generation when TTS cannot keep up
- Real-time visualization of pending chunk count between LLM and TTS
- Queue statistics: input queue size, output queue size, overflow events
- How `queue.input.maxSize` and `queue.output.maxSize` control buffer bounds

## Setup

```bash
pnpm install && pnpm build
cp examples/62-backpressure/sample.env examples/62-backpressure/.env
# Edit .env with SPEECHMATICS_API_KEY, DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-62-backpressure dev
```

Open [http://localhost:3062](http://localhost:3062) in Chrome or Edge.
