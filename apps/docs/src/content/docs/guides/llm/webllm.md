---
title: WebLLM (In-Browser)
description: Run LLMs entirely in the browser via WebGPU with the WebLLM provider.
order: 6
---

Use `WebLLMLLM` when you need full privacy, offline capability, or zero server costs. WebLLM runs language models directly in the browser using WebGPU acceleration -- no API key, no proxy, no network connection after the initial model download.

## Prerequisites

- A browser with WebGPU support (Chrome 113+, Edge 113+)
- Sufficient GPU memory for the selected model
- Install the peer dependency:

```bash
pnpm add @mlc-ai/web-llm
```

## Basic setup

```typescript
import { CompositeVoice, WebLLMLLM, NativeSTT, NativeTTS } from 'composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({ language: 'en-US' }),
    new WebLLMLLM({
      model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      systemPrompt: 'You are a concise voice assistant. Keep answers under two sentences.',
      onLoadProgress: ({ progress, text }) => {
        console.log(`Loading: ${Math.round(progress * 100)}% - ${text}`);
      },
    }),
    new NativeTTS(),
  ],
});

await agent.initialize();
await agent.startListening();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | (required) | WebLLM model identifier. Must match a supported MLC model ID. |
| `systemPrompt` | `string` | -- | System-level instructions for the assistant. |
| `temperature` | `number` | -- | Randomness (0 = deterministic, 2 = creative). |
| `maxTokens` | `number` | -- | Maximum tokens per response. |
| `topP` | `number` | -- | Nucleus sampling threshold (0--1). |
| `stream` | `boolean` | `true` | Stream tokens incrementally. |
| `onLoadProgress` | `function` | -- | Callback for model download and shader compilation progress. |
| `chatOpts` | `object` | -- | Override MLC engine parameters (e.g., `context_window_size`). |

### Model examples

| Model | Size | Notes |
|---|---|---|
| `Llama-3.2-1B-Instruct-q4f16_1-MLC` | ~600 MB | Small, fast. Good for basic voice tasks. |
| `Llama-3.2-3B-Instruct-q4f16_1-MLC` | ~1.8 GB | Better quality, needs more GPU memory. |
| `Phi-3.5-mini-instruct-q4f16_1-MLC` | ~2 GB | Microsoft Phi, good instruction following. |
| `Mistral-7B-Instruct-v0.3-q4f16_1-MLC` | ~4 GB | Larger, higher quality. |

See [WebLLM's model list](https://github.com/mlc-ai/web-llm#available-models) for all supported models.

## Complete example

```typescript
import { CompositeVoice, WebLLMLLM, NativeSTT, NativeTTS } from 'composite-voice';

const statusEl = document.getElementById('status')!;

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({ language: 'en-US' }),
    new WebLLMLLM({
      model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
      systemPrompt: 'You are a helpful local assistant. Answer briefly.',
      onLoadProgress: ({ progress, text }) => {
        statusEl.textContent = `Loading model: ${Math.round(progress * 100)}% - ${text}`;
      },
      chatOpts: {
        context_window_size: 2048,
      },
    }),
    new NativeTTS(),
  ],
});

statusEl.textContent = 'Initializing...';
await agent.initialize();
await agent.startListening();
statusEl.textContent = 'Ready - speak now';
```

## Tips

- **First load downloads the model.** Model weights are 100 MB or more. The browser caches them for subsequent loads, but the first visit takes significant time. Always wire `onLoadProgress` to a loading indicator.
- **Show a progress bar.** The `onLoadProgress` callback provides `progress` (0--1), `timeElapsed` (seconds), and a human-readable `text` description.
- **WebGPU is required.** If the user's browser lacks WebGPU support, initialization fails. Check for `navigator.gpu` before creating the provider.
- **`dispose()` frees GPU memory.** Call `await agent.dispose()` when the user leaves to release VRAM via `engine.unload()`.
- **Abort uses `engine.interruptGenerate()`.** Unlike server-side providers that cancel HTTP requests, WebLLM interrupts the local inference loop directly.
- **No API key or proxy needed.** WebLLMLLM is the only LLM provider that runs without any server infrastructure.

## Related

- [Providers reference](/reference/providers) -- all LLM providers at a glance
- [API reference](/api/classes/webllmllm) -- full class documentation
