# Example 14 — DeepgramFlux (V2 STT) — Disabled

A reference example for Deepgram's next-generation STT pipeline (V2 / Flux). This provider is currently disabled because it requires the Deepgram SDK V5 (`listen.v2` API), which is not yet stable.

This example displays what the configuration would look like and explains the eager pipeline concept.

| | Provider | Status |
|-|----------|--------|
| **STT** | `DeepgramFlux` | DISABLED — requires `@deepgram/sdk` V5 |
| **LLM** | `AnthropicLLM` | Reference only |
| **TTS** | `NativeTTS` | Reference only |

## What you'll learn

- What DeepgramFlux V2 configuration looks like
- The eager pipeline concept: `StartOfTurn` -> `Update` -> `EagerEndOfTurn` -> `EndOfTurn`
- How speculative LLM generation reduces perceived latency
- Why `DeepgramSTT` with Nova models is the recommended alternative

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

**Note:** This example is informational only. The voice agent is not functional because DeepgramFlux throws at construction time.

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

## Re-enabling DeepgramFlux

To re-enable when the V5 SDK stabilizes:

1. Upgrade `@deepgram/sdk` to `>=5.x`
2. Uncomment the class body in `src/providers/stt/deepgram-flux/DeepgramFlux.ts`
3. Uncomment exports in `./index.ts` and `src/index.ts`

## Current Alternative

Use **DeepgramSTT** with Nova models and V1 features (`interimResults`, `endpointing`, `vadEvents`). See [Example 11](../11-deepgram-stt/).
