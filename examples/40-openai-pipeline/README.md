# Example 40 — OpenAI Pipeline

Proves one-line LLM swap: replace `AnthropicLLM` with `OpenAILLM` and everything else stays the same. Same SDK, same events, same lifecycle — different LLM provider.

| | Provider | What it uses | Browser support |
|-|----------|--------------|-----------------|
| **STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `OpenAILLM` | GPT-4o-mini via HTTP streaming | All |
| **TTS** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How to swap LLM providers with zero changes to the rest of the pipeline
- How `OpenAILLM` uses the same `proxyUrl` pattern as `AnthropicLLM`
- The difference in streaming behavior between OpenAI and Anthropic
- How the same events (`llm.start`, `llm.chunk`, `llm.complete`) work across providers

---

## What this adds over Example 00

The only change is the LLM provider:

```javascript
// Example 00 (Anthropic)
llm: new AnthropicLLM({ proxyUrl: '...', model: 'claude-haiku-4-5-20251001' })

// Example 40 (OpenAI)
llm: new OpenAILLM({ proxyUrl: '...', model: 'gpt-4o-mini' })
```

Everything else — STT, TTS, events, state machine, UI — is identical.

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge** — required for NativeSTT
- An [OpenAI API key](https://platform.openai.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/40-openai-pipeline/sample.env examples/40-openai-pipeline/.env
```

Open `.env` and add your key:

```env
OPENAI_API_KEY=sk-...
```

---

## Run

```bash
pnpm example:40-openai-pipeline:dev
```

Open [http://localhost:3040](http://localhost:3040) in Chrome or Edge.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [41 — OpenAI + Deepgram](../41-openai-deepgram/) | Full production stack with OpenAI |
| [00 — Minimal Voice Agent](../00-minimal-voice-agent/) | Same example with Anthropic Claude |
| [20 — Deepgram Pipeline](../20-deepgram-pipeline/) | Production STT/TTS with Deepgram |
