# Example 23 — Gemini LLM

Focused demonstration of the GeminiLLM provider with NativeSTT and NativeTTS. Uses Google's Gemini models via their OpenAI-compatible endpoint.

| Role | Provider | What it uses | Browser support |
|------|----------|--------------|-----------------|
| **Input + STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `GeminiLLM` | Gemini models via proxy | All |
| **TTS + Output** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How to configure GeminiLLM with model and temperature
- Differences between Gemini 2.0 Flash, 1.5 Flash, and 1.5 Pro
- How Gemini's OpenAI-compatible endpoint works through the Vite proxy

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge**
- A [Google AI Studio API key](https://aistudio.google.com/apikey)

---

## Setup

```bash
pnpm install && pnpm build
cp examples/23-gemini-llm/sample.env .env
# Edit .env and add your GEMINI_API_KEY
```

---

## Run

```bash
pnpm --filter composite-voice-example-23-gemini-llm dev
```

Open [http://localhost:3023](http://localhost:3023) in Chrome or Edge.

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [22 — Groq LLM](../22-groq-llm/) | Compare with ultra-fast Groq |
| [24 — Mistral LLM](../24-mistral-llm/) | Compare with Mistral models |
| [26 — OpenAI-Compatible](../26-openai-compatible/) | Use any compatible endpoint |
