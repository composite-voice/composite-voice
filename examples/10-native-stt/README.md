# Example 10 — NativeSTT Configuration

Explore the Web Speech API's NativeSTT provider with interactive configuration controls. Adjust language, continuous mode, interim results, and max alternatives before initializing the agent.

| | Provider | Notes |
|-|----------|-------|
| **STT** | `NativeSTT` | Web Speech API (free, Chrome/Edge only) |
| **LLM** | `AnthropicLLM` | Claude Haiku via proxy |
| **TTS** | `NativeTTS` | SpeechSynthesis API (free, all browsers) |

## What you'll learn

- How to configure `NativeSTT` options: `language`, `continuous`, `interimResults`, `maxAlternatives`
- How each option affects transcription behavior
- How to display real-time transcription results with confidence scores
- The difference between interim and final transcription events

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Copy env template
cp examples/10-native-stt/sample.env .env
# Edit .env and add your ANTHROPIC_API_KEY
```

## Run

```bash
pnpm example:10-native-stt:dev
```

Open [http://localhost:3010](http://localhost:3010) in Chrome or Edge.

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `language` | `'en-US'` | BCP-47 language tag for recognition |
| `continuous` | `true` | Keep listening between pauses |
| `interimResults` | `true` | Emit partial transcripts while speaking |
| `maxAlternatives` | `1` | Number of alternative transcriptions (1-5) |

## Browser Support

NativeSTT requires Chrome or Edge. Firefox and Safari do not support the Web Speech API.
