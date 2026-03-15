# Example 07 — Eager Pipeline

Demonstrates the eager LLM pipeline with `eagerLLM: { enabled: true }`. The LLM starts generating speculatively on Deepgram preflight signals before `speechFinal` is confirmed, reducing perceived latency by 100-300ms. The UI shows when preflight fires vs speechFinal and displays timing comparisons.

| | Provider |
|-|----------|
| **STT** | DeepgramSTT |
| **LLM** | AnthropicLLM |
| **TTS** | DeepgramTTS |

## Setup

```bash
cp examples/07-eager-pipeline/sample.env .env
# Add your DEEPGRAM_API_KEY and ANTHROPIC_API_KEY
pnpm example:07-eager-pipeline:dev
```

Open [http://localhost:3007](http://localhost:3007).
