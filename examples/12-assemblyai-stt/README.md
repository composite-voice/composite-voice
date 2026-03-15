# Example 12 — AssemblyAISTT Configuration

Explore AssemblyAI's real-time transcription options with interactive controls. Configure sample rate, language, and word boost terms to improve recognition accuracy for domain-specific vocabulary.

| | Provider | Notes |
|-|----------|-------|
| **STT** | `AssemblyAISTT` | AssemblyAI real-time via WebSocket proxy |
| **LLM** | `AnthropicLLM` | Claude Haiku via proxy |
| **TTS** | `NativeTTS` | SpeechSynthesis API (free) |

## What you'll learn

- How to configure `AssemblyAISTT` options: `sampleRate`, `language`, `wordBoost`
- How word boost improves recognition of domain-specific terms
- How to display word-level confidence scores from AssemblyAI transcription results
- The difference between partial and final transcript events

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Copy env template
cp examples/12-assemblyai-stt/sample.env .env
# Edit .env and add your ASSEMBLYAI_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm example:12-assemblyai-stt:dev
```

Open [http://localhost:3012](http://localhost:3012) in any modern browser.

## Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `sampleRate` | `16000` | Audio sample rate in Hz |
| `language` | `'en'` | Transcription language code |
| `wordBoost` | `[]` | Words to prioritize during transcription |

## Browser Support

AssemblyAISTT uses WebSockets, so it works in all modern browsers including Firefox and Safari.
