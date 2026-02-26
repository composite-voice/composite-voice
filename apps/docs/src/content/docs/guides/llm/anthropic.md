---
title: Anthropic (Claude)
description: Use Anthropic's Claude models as the LLM provider in a CompositeVoice pipeline.
order: 1
---

Use `AnthropicLLM` when you want Claude's strong instruction-following and reasoning for your voice assistant.

## Prerequisites

- An [Anthropic API key](https://console.anthropic.com/) or a CompositeVoice proxy server
- Install the peer dependency:

```bash
npm install @anthropic-ai/sdk
```

## Basic setup

```typescript
import { CompositeVoice, AnthropicLLM, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new AnthropicLLM({
    proxyUrl: '/api/proxy/anthropic',
    model: 'claude-haiku-4-6',
    maxTokens: 512,
    systemPrompt: 'You are a concise voice assistant. Keep answers under two sentences.',
  }),
  tts: new NativeTTS(),
});

await agent.start();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | `'claude-haiku-4-6'` | Model identifier. See model variants below. |
| `maxTokens` | `number` | `1024` | Maximum tokens per response. Anthropic requires this field. |
| `systemPrompt` | `string` | -- | System-level instructions for the assistant. |
| `temperature` | `number` | -- | Randomness (0 = deterministic, 2 = creative). |
| `topP` | `number` | -- | Nucleus sampling threshold (0--1). |
| `stream` | `boolean` | `true` | Stream tokens incrementally. |
| `proxyUrl` | `string` | -- | CompositeVoice proxy endpoint. Recommended for browsers. |
| `apiKey` | `string` | -- | Direct API key. Use only in server-side code. |
| `maxRetries` | `number` | `3` | Retry count for failed requests. |

### Model variants

| Model | Speed | Capability |
|---|---|---|
| `claude-haiku-4-6` | Fastest | Best for low-latency voice |
| `claude-sonnet-4-6` | Balanced | Good reasoning + speed |
| `claude-opus-4-6` | Slowest | Most capable |

## Complete example

```typescript
import {
  CompositeVoice,
  AnthropicLLM,
  DeepgramSTT,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    proxyUrl: '/api/proxy/deepgram',
    language: 'en',
    options: { model: 'nova-3', smartFormat: true },
  }),
  llm: new AnthropicLLM({
    proxyUrl: '/api/proxy/anthropic',
    model: 'claude-haiku-4-6',
    maxTokens: 256,
    temperature: 0.7,
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

- **`maxTokens` is required.** Anthropic's API rejects requests without it. The provider defaults to `1024`, but for voice applications, lower values (128--512) produce faster responses.
- **System prompts are handled automatically.** AnthropicLLM extracts system messages and passes them as the top-level `system` parameter, which is what the Anthropic API expects.
- **Use a proxy in browsers.** The proxy server injects your API key server-side so it never reaches the client.
- **Streaming is on by default.** Set `stream: false` only if you need the complete response before TTS begins.

## Related

- [Providers reference](/reference/providers) -- all LLM providers at a glance
- [API reference](/api/classes/anthropicllm) -- full class documentation
- [Configuration guide](/guides/configuration) -- global CompositeVoice settings
