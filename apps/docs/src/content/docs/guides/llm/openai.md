---
title: OpenAI (GPT)
description: Use OpenAI's GPT models as the LLM provider in a CompositeVoice pipeline.
order: 2
---

Use `OpenAILLM` when you want GPT models for your voice assistant.

## Prerequisites

- An [OpenAI API key](https://platform.openai.com/api-keys) or a CompositeVoice proxy server
- Install the peer dependency:

```bash
npm install openai
```

## Basic setup

```typescript
import { CompositeVoice, OpenAILLM, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({ language: 'en-US' }),
    new OpenAILLM({
      proxyUrl: '/api/proxy/openai',
      model: 'gpt-4o-mini',
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
| `model` | `string` | (required) | Model identifier. See model variants below. |
| `systemPrompt` | `string` | -- | System-level instructions for the assistant. |
| `temperature` | `number` | -- | Randomness (0 = deterministic, 2 = creative). |
| `maxTokens` | `number` | -- | Maximum tokens per response. |
| `topP` | `number` | -- | Nucleus sampling threshold (0--1). |
| `stream` | `boolean` | `true` | Stream tokens incrementally. |
| `proxyUrl` | `string` | -- | CompositeVoice proxy endpoint. Recommended for browsers. |
| `apiKey` | `string` | -- | Direct API key. Use only in server-side code. |
| `organizationId` | `string` | -- | OpenAI organization ID for multi-org accounts. |
| `maxRetries` | `number` | `3` | Retry count for failed requests. |

### Model variants

| Model | Speed | Notes |
|---|---|---|
| `gpt-4o-mini` | Fast | Good balance of speed and quality for voice |
| `gpt-4o` | Moderate | High capability, multimodal |
| `gpt-4-turbo` | Moderate | Large context window |
| `gpt-3.5-turbo` | Fast | Lower cost, lower capability |

## Complete example

```typescript
import {
  CompositeVoice,
  OpenAILLM,
  DeepgramSTT,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new DeepgramSTT({
      proxyUrl: '/api/proxy/deepgram',
      language: 'en',
      options: { model: 'nova-3', smartFormat: true },
    }),
    new OpenAILLM({
      proxyUrl: '/api/proxy/openai',
      model: 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 256,
      systemPrompt: 'You are a friendly voice assistant. Answer briefly.',
    }),
    new DeepgramTTS({
      proxyUrl: '/api/proxy/deepgram',
      voice: 'aura-2-thalia-en',
    }),
  ],
  conversationHistory: { enabled: true, maxTurns: 10 },
});

await agent.initialize();
await agent.startListening();
```

## Tips

- **`model` is required.** OpenAILLM does not set a default model. You must specify one.
- **`gpt-4o-mini` is ideal for voice.** It offers low latency and good quality for conversational use cases.
- **Use `organizationId` for multi-org accounts.** If your API key belongs to multiple organizations, set this to route requests correctly.
- **OpenAILLM extends OpenAICompatibleLLM.** All streaming, abort, and proxy logic is inherited from the base class.

## Related

- [Providers reference](/reference/providers) -- all LLM providers at a glance
- [API reference](/api/classes/openaillm) -- full class documentation
- [OpenAI Compatible guide](/guides/llm/openai-compatible) -- connect custom OpenAI-compatible endpoints
