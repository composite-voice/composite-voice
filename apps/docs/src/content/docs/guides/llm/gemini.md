---
title: Google Gemini
description: Use Google Gemini models as the LLM provider in a CompositeVoice pipeline.
order: 5
---

Use `GeminiLLM` when you want Google's Gemini models with their strong multimodal capabilities and competitive performance.

## Prerequisites

- A [Google AI Studio API key](https://aistudio.google.com/apikey) or a CompositeVoice proxy server
- No additional dependencies required. GeminiLLM uses native `fetch` internally.

## Basic setup

```typescript
import { CompositeVoice, GeminiLLM, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({ language: 'en-US' }),
    new GeminiLLM({
      proxyUrl: '/api/proxy/gemini',
      model: 'gemini-2.0-flash',
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
| `model` | `string` | `'gemini-2.0-flash'` | Model identifier. See model variants below. |
| `systemPrompt` | `string` | -- | System-level instructions for the assistant. |
| `temperature` | `number` | -- | Randomness (0 = deterministic, 2 = creative). |
| `maxTokens` | `number` | -- | Maximum tokens per response. |
| `topP` | `number` | -- | Nucleus sampling threshold (0--1). |
| `stream` | `boolean` | `true` | Stream tokens incrementally. |
| `proxyUrl` | `string` | -- | CompositeVoice proxy endpoint. Recommended for browsers. |
| `geminiApiKey` | `string` | -- | Gemini API key. Convenience alias for `apiKey`. |
| `apiKey` | `string` | -- | Direct API key. `geminiApiKey` takes precedence if both are set. |

### Model variants

| Model | Speed | Notes |
|---|---|---|
| `gemini-2.0-flash` | Fast | Default. Best for low-latency voice applications. |
| `gemini-1.5-flash` | Fast | Previous generation flash model. |
| `gemini-1.5-pro` | Slower | Larger context, higher capability. |

## Complete example

```typescript
import {
  CompositeVoice,
  MicrophoneInput,
  GeminiLLM,
  DeepgramSTT,
  DeepgramTTS,
  BrowserAudioOutput,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({
      proxyUrl: '/api/proxy/deepgram',
      language: 'en',
      options: { model: 'nova-3', smartFormat: true },
    }),
    new GeminiLLM({
      proxyUrl: '/api/proxy/gemini',
      model: 'gemini-2.0-flash',
      temperature: 0.7,
      maxTokens: 256,
      systemPrompt: 'You are a friendly voice assistant. Answer briefly.',
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

- **Gemini uses Google's OpenAI-compatible endpoint.** The base URL defaults to `https://generativelanguage.googleapis.com/v1beta/openai`. You do not need to set this manually.
- **`gemini-2.0-flash` is ideal for voice.** It delivers fast inference with good quality for conversational tasks.
- **GeminiLLM uses native `fetch` -- no Gemini-specific SDK or `openai` package needed.**
- **Google AI Studio keys are free-tier.** They work for development and testing. For production, use Vertex AI credentials through a proxy.

## Related

- [Providers reference](/reference/providers) -- all LLM providers at a glance
- [API reference](/api/classes/geminillm) -- full class documentation
- [OpenAI Compatible guide](/guides/llm/openai-compatible) -- connect custom OpenAI-compatible endpoints
