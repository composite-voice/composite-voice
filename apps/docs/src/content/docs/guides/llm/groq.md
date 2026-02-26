---
title: Groq
description: Use Groq's ultra-fast LPU inference as the LLM provider in a CompositeVoice pipeline.
order: 3
---

Use `GroqLLM` when you need the lowest possible LLM latency. Groq's custom LPU hardware delivers token generation speeds that often exceed 500 tokens per second.

## Prerequisites

- A [Groq API key](https://console.groq.com/) or a CompositeVoice proxy server
- Install the peer dependency:

```bash
npm install openai
```

Groq's API is OpenAI-compatible, so the `openai` package handles all communication.

## Basic setup

```typescript
import { CompositeVoice, GroqLLM, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new GroqLLM({
    proxyUrl: '/api/proxy/groq',
    model: 'llama-3.3-70b-versatile',
    systemPrompt: 'You are a concise voice assistant. Keep answers under two sentences.',
  }),
  tts: new NativeTTS(),
});

await agent.start();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | `'llama-3.3-70b-versatile'` | Model identifier. See model variants below. |
| `systemPrompt` | `string` | -- | System-level instructions for the assistant. |
| `temperature` | `number` | -- | Randomness (0 = deterministic, 2 = creative). |
| `maxTokens` | `number` | -- | Maximum tokens per response. |
| `topP` | `number` | -- | Nucleus sampling threshold (0--1). |
| `stream` | `boolean` | `true` | Stream tokens incrementally. |
| `proxyUrl` | `string` | -- | CompositeVoice proxy endpoint. Recommended for browsers. |
| `groqApiKey` | `string` | -- | Groq API key. Convenience alias for `apiKey`. |
| `apiKey` | `string` | -- | Direct API key. `groqApiKey` takes precedence if both are set. |

### Model variants

| Model | Parameters | Notes |
|---|---|---|
| `llama-3.3-70b-versatile` | 70B | Default. Strong general-purpose model. |
| `mixtral-8x7b-32768` | 8x7B MoE | 32k context window. Good for longer conversations. |
| `gemma2-9b-it` | 9B | Smaller, faster model from Google. |
| `llama-3.1-8b-instant` | 8B | Fastest option. Good for simple tasks. |

Check the [Groq console](https://console.groq.com/docs/models) for the current model list.

## Complete example

```typescript
import {
  CompositeVoice,
  GroqLLM,
  DeepgramSTT,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    proxyUrl: '/api/proxy/deepgram',
    language: 'en',
    options: { model: 'nova-3', smart_format: true },
  }),
  llm: new GroqLLM({
    proxyUrl: '/api/proxy/groq',
    model: 'llama-3.3-70b-versatile',
    temperature: 0.7,
    maxTokens: 256,
    systemPrompt: 'You are a friendly voice assistant. Answer briefly.',
  }),
  tts: new DeepgramTTS({
    proxyUrl: '/api/proxy/deepgram',
    voice: 'aura-2-thalia-en',
  }),
  conversationHistory: { enabled: true, maxTurns: 10 },
  eagerLLM: { enabled: true },
});

await agent.start();
```

## Tips

- **Use Groq model names exactly as listed.** Groq model identifiers differ from the upstream model names (e.g., `llama-3.3-70b-versatile`, not `meta-llama/Llama-3.3-70B`).
- **Pair with eager LLM for minimum latency.** Groq's fast inference combined with DeepgramSTT's preflight signals produces the lowest speech-to-first-token latency.
- **Groq uses the `openai` peer dependency.** You do not need to install `groq-sdk`.
- **Rate limits apply.** Free-tier Groq accounts have token-per-minute limits. Check the [Groq docs](https://console.groq.com/docs/rate-limits) for current limits.

## Related

- [Providers reference](/reference/providers) -- all LLM providers at a glance
- [API reference](/api/classes/groqllm) -- full class documentation
- [OpenAI Compatible guide](/guides/llm/openai-compatible) -- connect custom OpenAI-compatible endpoints
