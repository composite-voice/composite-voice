---
title: Mistral
description: Use Mistral models as the LLM provider in a CompositeVoice pipeline.
order: 4
---

Use `MistralLLM` when you need strong multilingual support, especially for European languages, or want a cost-effective alternative to larger models.

## Prerequisites

- A [Mistral API key](https://console.mistral.ai/) or a CompositeVoice proxy server
- No additional dependencies required. MistralLLM uses native `fetch` internally.

## Basic setup

```typescript
import { CompositeVoice, MistralLLM, NativeSTT, NativeTTS } from 'composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({ language: 'en-US' }),
    new MistralLLM({
      proxyUrl: '/api/proxy/mistral',
      model: 'mistral-small-latest',
      systemPrompt: 'You are a concise voice assistant. Keep answers under two sentences.',
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
| `model` | `string` | `'mistral-small-latest'` | Model identifier. See model variants below. |
| `systemPrompt` | `string` | -- | System-level instructions for the assistant. |
| `temperature` | `number` | -- | Randomness (0 = deterministic, 2 = creative). |
| `maxTokens` | `number` | -- | Maximum tokens per response. |
| `topP` | `number` | -- | Nucleus sampling threshold (0--1). |
| `stream` | `boolean` | `true` | Stream tokens incrementally. |
| `proxyUrl` | `string` | -- | CompositeVoice proxy endpoint. Recommended for browsers. |
| `mistralApiKey` | `string` | -- | Mistral API key. Convenience alias for `apiKey`. |
| `apiKey` | `string` | -- | Direct API key. `mistralApiKey` takes precedence if both are set. |

### Model variants

| Model | Speed | Notes |
|---|---|---|
| `mistral-small-latest` | Fast | Default. Good speed-to-quality ratio for voice. |
| `mistral-medium-latest` | Moderate | Balanced capability. |
| `mistral-large-latest` | Slower | Most capable Mistral model. |

## Complete example

```typescript
import {
  CompositeVoice,
  MicrophoneInput,
  MistralLLM,
  DeepgramSTT,
  DeepgramTTS,
  BrowserAudioOutput,
} from 'composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({
      proxyUrl: '/api/proxy/deepgram',
      language: 'en',
      options: { model: 'nova-3', smartFormat: true },
    }),
    new MistralLLM({
      proxyUrl: '/api/proxy/mistral',
      model: 'mistral-small-latest',
      temperature: 0.7,
      maxTokens: 256,
      systemPrompt: 'Tu es un assistant vocal amical. Reponds brievement.',
    }),
    new DeepgramTTS({
      proxyUrl: '/api/proxy/deepgram',
      voice: 'aura-2-thalia-en',
    }),
    new BrowserAudioOutput(),
  ],
  conversationHistory: { enabled: true, maxTurns: 10 },
});

await agent.initialize();
await agent.startListening();
```

## Tips

- **Mistral excels at multilingual tasks.** French and other European languages produce especially good results.
- **`mistral-small-latest` is best for voice.** It provides the fastest responses while maintaining quality for conversational use cases.
- **MistralLLM uses native `fetch` -- no `@mistralai/mistralai` or `openai` package needed.**
- **Model names use the `-latest` suffix.** This always points to the most recent version of that model tier.

## Related

- [Providers reference](/reference/providers) -- all LLM providers at a glance
- [API reference](/api/classes/mistralllm) -- full class documentation
- [OpenAI Compatible guide](/guides/llm/openai-compatible) -- connect custom OpenAI-compatible endpoints
