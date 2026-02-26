---
title: OpenAI Compatible
description: Connect any OpenAI-compatible LLM endpoint to a CompositeVoice pipeline.
order: 7
---

Use `OpenAICompatibleLLM` when you need to connect a custom, self-hosted, or third-party LLM that speaks the OpenAI chat completions format. This includes services like Ollama, vLLM, LiteLLM, Together AI, Perplexity, DeepSeek, and any other `/v1/chat/completions` endpoint.

## Prerequisites

- An accessible OpenAI-compatible API endpoint
- Install the peer dependency:

```bash
npm install openai
```

## Basic setup

```typescript
import { CompositeVoice, OpenAICompatibleLLM, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new OpenAICompatibleLLM({
    baseURL: 'https://my-model-server.example.com/v1',
    apiKey: 'my-api-key',
    model: 'my-custom-model',
    systemPrompt: 'You are a concise voice assistant. Keep answers under two sentences.',
  }),
  tts: new NativeTTS(),
});

await agent.start();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | (required) | Model identifier recognized by the target endpoint. |
| `baseURL` | `string` | -- | Base URL for the API (e.g., `http://localhost:11434/v1`). |
| `systemPrompt` | `string` | -- | System-level instructions for the assistant. |
| `temperature` | `number` | -- | Randomness (0 = deterministic, 2 = creative). |
| `maxTokens` | `number` | -- | Maximum tokens per response. |
| `topP` | `number` | -- | Nucleus sampling threshold (0--1). |
| `stream` | `boolean` | `true` | Stream tokens incrementally. |
| `proxyUrl` | `string` | -- | CompositeVoice proxy endpoint. Takes precedence over `baseURL`. |
| `apiKey` | `string` | -- | API key for the target endpoint. |
| `maxRetries` | `number` | `3` | Retry count for failed requests. |

## Common endpoints

### Ollama (local models)

```typescript
const llm = new OpenAICompatibleLLM({
  baseURL: 'http://localhost:11434/v1',
  apiKey: 'ollama',  // Ollama ignores the key but the SDK requires one
  model: 'llama3.2',
  systemPrompt: 'You are a helpful voice assistant.',
});
```

### Together AI

```typescript
const llm = new OpenAICompatibleLLM({
  baseURL: 'https://api.together.xyz/v1',
  apiKey: 'your-together-api-key',
  model: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
});
```

### DeepSeek

```typescript
const llm = new OpenAICompatibleLLM({
  baseURL: 'https://api.deepseek.com/v1',
  apiKey: 'your-deepseek-api-key',
  model: 'deepseek-chat',
});
```

## Complete example

```typescript
import {
  CompositeVoice,
  OpenAICompatibleLLM,
  DeepgramSTT,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    proxyUrl: '/api/proxy/deepgram',
    language: 'en',
    options: { model: 'nova-3', smart_format: true },
  }),
  llm: new OpenAICompatibleLLM({
    baseURL: 'http://localhost:11434/v1',
    apiKey: 'ollama',
    model: 'llama3.2',
    temperature: 0.7,
    maxTokens: 256,
    systemPrompt: 'You are a friendly voice assistant. Answer briefly.',
  }),
  tts: new DeepgramTTS({
    proxyUrl: '/api/proxy/deepgram',
    voice: 'aura-2-thalia-en',
  }),
  conversationHistory: { enabled: true, maxTurns: 10 },
});

await agent.start();
```

## Tips

- **Provide either `apiKey` or `proxyUrl`.** At least one is required. If both are set, `proxyUrl` takes precedence and the SDK sends a dummy key.
- **Verify your endpoint supports streaming.** Some self-hosted setups disable SSE streaming. Set `stream: false` if your endpoint does not support it.
- **This is the base class for OpenAI, Groq, Mistral, and Gemini.** If you use one of those services, prefer their dedicated provider classes -- they set correct defaults for `baseURL` and `model`.
- **Extend this class for custom providers.** Override `providerName` and `buildClientOptions()` to add provider-specific behavior. See the source of `GroqLLM` or `GeminiLLM` for examples.

## Related

- [Providers reference](/reference/providers) -- all LLM providers at a glance
- [API reference](/api/classes/openaicompatiblellm) -- full class documentation
- [OpenAI guide](/guides/llm/openai) -- dedicated OpenAI provider
- [Groq guide](/guides/llm/groq) -- dedicated Groq provider
