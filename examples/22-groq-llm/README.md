# Example 22 — Groq LLM

Focused demonstration of the GroqLLM provider with NativeSTT and NativeTTS. Experience ultra-fast inference powered by Groq's custom LPU hardware.

| Role | Provider | What it uses | Browser support |
|------|----------|--------------|-----------------|
| **Input + STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `GroqLLM` | LLaMA/Mixtral via Groq LPU | All |
| **TTS + Output** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How to configure GroqLLM for ultra-fast voice agent responses
- Groq's LPU hardware advantage (often 500+ tokens/second)
- Model selection: LLaMA 3.3 70B, LLaMA 3.1 8B, Mixtral, Gemma
- How the Vite proxy secures your Groq API key

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge**
- A [Groq API key](https://console.groq.com/)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/22-groq-llm/sample.env .env
# Edit .env and add your GROQ_API_KEY
```

---

## Run

```bash
pnpm --filter composite-voice-example-22-groq-llm dev
```

Open [http://localhost:3022](http://localhost:3022) in Chrome or Edge.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [20 — Anthropic LLM](../20-anthropic-llm/) | Compare with Claude models |
| [23 — Gemini LLM](../23-gemini-llm/) | Compare with Google Gemini |
| [25 — WebLLM](../25-webllm/) | Run models locally in the browser |
