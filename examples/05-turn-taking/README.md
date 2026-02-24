# Example 05 — Turn Taking

Demonstrates turn-taking strategy visualization. Switch between strategies to see how the SDK manages microphone capture during TTS playback — essential for building natural voice conversations without echo.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- The four turn-taking strategies: `auto`, `conservative`, `aggressive`, and `detect`
- How `pauseCaptureOnPlayback` controls microphone behavior during TTS output
- How the SDK decides whether to pause capture based on provider combinations
- How to pick the right strategy for your use case

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge** — required for NativeSTT
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/05-turn-taking/sample.env examples/05-turn-taking/.env
```

Open `.env` and add your key:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
pnpm example:05-turn-taking:dev
```

Open [http://localhost:3005](http://localhost:3005) in Chrome or Edge.

1. Select a turn-taking strategy from the cards
2. Click **Initialize** — the agent configures with that strategy
3. Click **Start** and speak — watch the microphone status indicator
4. When the AI speaks, observe whether the microphone pauses or stays active
5. Switch strategies to compare behavior

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [04 — Error Recovery](../04-error-recovery/) | Error handling patterns |
| [20 — Deepgram Pipeline](../20-deepgram-pipeline/) | Different providers change turn-taking |
| [03 — Event Inspector](../03-event-inspector/) | See capture/playback events |
