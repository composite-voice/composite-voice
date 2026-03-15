# Example 13 — ElevenLabsSTT Configuration

Explore ElevenLabs Scribe V2 real-time transcription options with interactive controls. Configure the model, commit strategy (VAD vs manual), and audio format.

| | Provider | Notes |
|-|----------|-------|
| **STT** | `ElevenLabsSTT` | ElevenLabs Scribe V2 via WebSocket proxy |
| **LLM** | `AnthropicLLM` | Claude Haiku via proxy |
| **TTS** | `NativeTTS` | SpeechSynthesis API (free) |

## What you'll learn

- How to configure `ElevenLabsSTT` options: `model`, `commitStrategy`, `audioFormat`
- The difference between VAD and manual commit strategies
- How audio format affects transcription quality and latency
- How ElevenLabs handles partial vs committed transcription segments

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Copy env template
cp examples/13-elevenlabs-stt/sample.env .env
# Edit .env and add your ELEVENLABS_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm example:13-elevenlabs-stt:dev
```

Open [http://localhost:3013](http://localhost:3013) in any modern browser.

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `model` | `'scribe_v2_realtime'` | ElevenLabs STT model |
| `commitStrategy` | `'vad'` | How segments are finalized (`'vad'` or `'manual'`) |
| `audioFormat` | `'pcm_16000'` | Audio encoding format sent to the API |

## Commit Strategies

- **VAD** — Voice Activity Detection automatically commits when silence is detected. Best for conversational use cases.
- **Manual** — Application controls when to commit. Best for dictation or controlled input scenarios.

## Browser Support

ElevenLabsSTT uses WebSockets, so it works in all modern browsers including Firefox and Safari.
