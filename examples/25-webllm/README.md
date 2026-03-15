# Example 25 — WebLLM (In-Browser)

Run an LLM entirely in the browser using WebGPU. No API key, no server, no network connection after the initial model download.

| Role | Provider | What it uses | Browser support |
|------|----------|--------------|-----------------|
| **Input + STT** | `NativeSTT` | Web Speech API | Chrome, Edge |
| **LLM** | `WebLLMLLM` | WebGPU in-browser inference | Chrome 113+, Edge 113+ |
| **TTS + Output** | `NativeTTS` | SpeechSynthesis API | All modern browsers |

---

## What you'll learn

- How to use WebLLMLLM for fully offline voice agents
- Displaying a model loading progress bar via `onLoadProgress`
- Choosing between different quantized models (LLaMA, Phi, Mistral, Gemma)
- Trade-offs of in-browser inference vs cloud APIs

---

## Prerequisites

- **Node.js** 18 or later and **pnpm**
- **Chrome 113+ or Edge 113+** (WebGPU required)
- A GPU with sufficient VRAM for the selected model

---

## Setup

```bash
pnpm install && pnpm build
```

No API keys needed.

---

## Run

```bash
pnpm --filter @lukeocodes/composite-voice-example-25-webllm dev
```

Open [http://localhost:3025](http://localhost:3025) in Chrome or Edge.

---

## Notes

- The first model load downloads weights (100 MB+) and compiles WebGPU shaders
- Subsequent loads use the browser cache and are much faster
- Smaller models (1B, 2B) load faster and use less GPU memory
- Performance depends on your GPU capabilities

---

## What to try next

| Example | What it adds |
|---------|-------------|
| [20 — Anthropic LLM](../20-anthropic-llm/) | Compare with cloud-based Claude |
| [22 — Groq LLM](../22-groq-llm/) | Compare with cloud ultra-fast Groq |
| [26 — OpenAI-Compatible](../26-openai-compatible/) | Connect to local servers like LM Studio |
