# Example 26 — OpenAI-Compatible LLM

Connect to any service that speaks the OpenAI chat completions format. Configure a custom endpoint URL, model name, and optional API key directly in the UI.

| Role | Provider | What it uses | Browser support |
|------|----------|--------------|-----------------|
| **Input + STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `OpenAICompatibleLLM` | Any OpenAI-compatible endpoint | All |
| **TTS + Output** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How to use OpenAICompatibleLLM with any custom endpoint
- Connecting to local servers: LM Studio, Ollama, vLLM, text-generation-webui, LocalAI
- Connecting to cloud providers with OpenAI-compatible APIs
- How the base class works without a Vite proxy (direct connection)

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome or Edge**
- An OpenAI-compatible server running (e.g., LM Studio on `http://localhost:1234/v1`)

---

## Setup

```bash
pnpm install && pnpm build
```

No proxy API keys needed -- provide your endpoint URL and optional API key directly in the UI.

---

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-26-openai-compatible dev
```

Open [http://localhost:3026](http://localhost:3026) in Chrome or Edge.

---

## Compatible services

| Service | Default endpoint |
|---------|-----------------|
| LM Studio | `http://localhost:1234/v1` |
| Ollama | `http://localhost:11434/v1` |
| vLLM | `http://localhost:8000/v1` |
| LocalAI | `http://localhost:8080/v1` |
| text-generation-webui | `http://localhost:5000/v1` |

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [25 — WebLLM](../25-webllm/) | Run models in-browser instead |
| [21 — OpenAI LLM](../21-openai-llm/) | Use the official OpenAI API |
| [22 — Groq LLM](../22-groq-llm/) | Ultra-fast cloud inference with Groq |
