# Example 03 — Event Inspector

A developer debugging tool that displays every SDK event in a filterable timeline. Essential for understanding the event flow and debugging provider issues.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- The complete event lifecycle: which events fire, in what order, and with what data
- How to filter events by category for focused debugging
- The timing relationship between STT, LLM, and TTS events
- How to diagnose provider issues using event data

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge**
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/03-event-inspector/sample.env examples/03-event-inspector/.env
```

---

## Run

```bash
pnpm example:03-event-inspector:dev
```

Open [http://localhost:3003](http://localhost:3003) in Chrome or Edge.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [04 — Error Recovery](../04-error-recovery/) | See error events in action |
| [05 — Turn Taking](../05-turn-taking/) | Visualize turn-taking strategy |
| [21 — Eager Pipeline](../21-eager-pipeline/) | See preflight events |
