# Example 11 — DeepgramSTT Configuration

Explore Deepgram's real-time transcription options with interactive controls. Adjust the Nova model, endpointing sensitivity, smart formatting, and more before starting the agent.

| | Provider | Notes |
|-|----------|-------|
| **STT** | `DeepgramSTT` | Nova models via WebSocket proxy |
| **LLM** | `AnthropicLLM` | Claude Haiku via proxy |
| **TTS** | `NativeTTS` | SpeechSynthesis API (free) |

## What you'll learn

- How to configure `DeepgramSTT` options: `model`, `endpointing`, `interimResults`, `smartFormat`, `punctuation`
- How endpointing affects end-of-speech detection latency
- The difference between smart formatting and basic punctuation
- How to display confidence scores from Deepgram's transcription results

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Copy env template
cp examples/11-deepgram-stt/sample.env .env
# Edit .env and add your DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm example:11-deepgram-stt:dev
```

Open [http://localhost:3011](http://localhost:3011) in any modern browser.

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `model` | `'nova-3'` | Deepgram transcription model |
| `endpointing` | `300` | Silence duration (ms) before end-of-speech |
| `utteranceEndMs` | `1000` | Gap before UtteranceEnd event |
| `interimResults` | `true` | Stream partial transcripts |
| `smartFormat` | `true` | Auto-punctuation and readability |
| `punctuation` | `true` | Basic punctuation |

## Browser Support

DeepgramSTT uses WebSockets, so it works in all modern browsers including Firefox and Safari.
