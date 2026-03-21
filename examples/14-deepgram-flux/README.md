# Example 14 — DeepgramFlux (V2 STT)

Demonstrates Deepgram's next-generation STT pipeline (V2 / Flux) with eager end-of-turn detection for speculative LLM generation.

| | Provider |
|-|----------|
| **Input** | `MicrophoneInput` (auto-filled) |
| **STT** | `DeepgramFlux` |
| **LLM** | `AnthropicLLM` |
| **TTS** | `NativeTTS` (tts+output) |

## What you'll learn

- How to configure DeepgramFlux V2 for real-time transcription
- The eager pipeline concept: `StartOfTurn` -> `Update` -> `EagerEndOfTurn` -> `EndOfTurn`
- How speculative LLM generation reduces perceived latency

## Setup

```bash
# From the repo root
pnpm install && pnpm build

# Copy env template
cp examples/14-deepgram-flux/sample.env .env
# Edit .env and add your DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
```

## Run

```bash
pnpm example:14-deepgram-flux:dev
```

Open [http://localhost:3014](http://localhost:3014) in any modern browser.

## DeepgramFlux Options

| Option | Type | Description |
|--------|------|-------------|
| `model` | string | Deepgram model (e.g. `nova-3`) |
| `encoding` | string | Audio encoding format |
| `sampleRate` | number | Sample rate in Hz |
| `eotThreshold` | number | End-of-turn confidence threshold |
| `eagerEotThreshold` | number | Eager end-of-turn threshold |
| `eotTimeoutMs` | number | Timeout before forcing end-of-turn |
| `keyterms` | string[] | Terms to boost recognition |

## Eager Pipeline Flow

```
StartOfTurn -> Update (partial transcripts) -> EagerEndOfTurn (speculative LLM starts)
                                                     |
                                              TurnResumed (user keeps talking, discard speculation)
                                                     |
                                              EndOfTurn (confirmed, use speculative output if valid)
```

## See also

- [Example 11 — DeepgramSTT](../11-deepgram-stt/) for the V1/Nova alternative
- [Eager LLM Pipeline](/docs/advanced/pipeline#eager-llm-pipeline) in the docs
