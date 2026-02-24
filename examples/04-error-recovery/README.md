# Example 04 — Error Recovery

Demonstrates error simulation and auto-recovery. Shows how CompositeVoice handles errors gracefully, how error events propagate through the system, and how `autoRecover` restores the agent after failures.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `AnthropicLLM` | Claude via HTTP streaming | All |
| **TTS** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How `autoRecover: true` lets the agent self-heal after transient errors
- The error event lifecycle: `agent.error`, `llm.error`, `tts.error`, `transcription.error`
- How to simulate errors by breaking and restoring the proxy URL
- How to build a resilient UI that shows error state and recovery status

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge** — required for NativeSTT
- An [Anthropic API key](https://console.anthropic.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/04-error-recovery/sample.env examples/04-error-recovery/.env
```

Open `.env` and add your key:

```env
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Run

```bash
pnpm example:04-error-recovery:dev
```

Open [http://localhost:3004](http://localhost:3004) in Chrome or Edge.

1. Click **Initialize** then **Start**
2. Use the error simulation buttons to break the proxy URL
3. Speak to trigger an LLM request — watch the error appear
4. Click **Fix Proxy** to restore — the agent recovers automatically
5. Watch the error log panel for the full event trail

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [03 — Event Inspector](../03-event-inspector/) | See all events in a timeline |
| [05 — Turn Taking](../05-turn-taking/) | Visualize turn-taking strategies |
| [10 — Proxy Server](../10-proxy-server/) | Production proxy setup |
