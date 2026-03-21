---
title: Anthropic (Claude)
description: Use Anthropic's Claude models as the LLM provider in a CompositeVoice pipeline.
order: 1
---

Use `AnthropicLLM` when you want Claude's strong instruction-following and reasoning for your voice assistant.

## Prerequisites

- An [Anthropic API key](https://console.anthropic.com/) or a CompositeVoice proxy server
- No additional dependencies required. AnthropicLLM uses native `fetch` internally.

## Basic setup

```typescript
import { CompositeVoice, AnthropicLLM, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new NativeSTT({ language: 'en-US' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      maxTokens: 512,
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
| `model` | `string` | `'claude-haiku-4-5'` | Model identifier. See model variants below. |
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
| `claude-haiku-4-5` | Fastest | Best for low-latency voice |
| `claude-sonnet-4-6` | Balanced | Good reasoning + speed |
| `claude-opus-4-6` | Slowest | Most capable |

## Complete example

```typescript
import {
  CompositeVoice,
  MicrophoneInput,
  AnthropicLLM,
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
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      maxTokens: 256,
      temperature: 0.7,
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

## Tool use / function calling

AnthropicLLM implements the `ToolAwareLLMProvider` interface, enabling the LLM to call functions during generation. Text output streams to TTS as usual, while tool calls are handled via an async callback. After tool execution, the SDK automatically re-calls the LLM with the tool result so it can generate a natural language follow-up.

Configure tools on the top-level `CompositeVoice` config:

```typescript
const voice = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-sonnet-4-6' }),
    new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
    new BrowserAudioOutput(),
  ],
  tools: {
    definitions: [
      {
        name: 'get_weather',
        description: 'Get the current weather for a location',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
          },
          required: ['location'],
        },
      },
    ],
    onToolCall: async (toolCall) => {
      if (toolCall.name === 'get_weather') {
        const weather = await fetchWeather(toolCall.arguments.location);
        return { toolCallId: toolCall.id, content: JSON.stringify(weather) };
      }
      return { toolCallId: toolCall.id, content: 'Unknown tool' };
    },
  },
});
```

Tool calls are transparent to the event stream -- you still receive the same `llm.chunk` and `llm.complete` events. The tool execution loop runs internally: when the LLM emits a `tool_use` stop reason, the SDK calls your `onToolCall` handler, appends the result to the conversation, and re-invokes the LLM.

> **Note:** Tool use is supported by AnthropicLLM and all OpenAI-compatible providers (OpenAILLM, GroqLLM, GeminiLLM, MistralLLM, OpenAICompatibleLLM). WebLLMLLM does not support tools.

## Tips

- **`maxTokens` is required.** Anthropic's API rejects requests without it. The provider defaults to `1024`, but for voice applications, lower values (128--512) produce faster responses.
- **System prompts are handled automatically.** AnthropicLLM extracts system messages and passes them as the top-level `system` parameter, which is what the Anthropic API expects.
- **Use a proxy in browsers.** The proxy server injects your API key server-side so it never reaches the client.
- **Streaming is on by default.** Set `stream: false` only if you need the complete response before TTS begins.

## Related

- [Providers reference](/reference/providers) -- all LLM providers at a glance
- [API reference](/api/classes/anthropicllm) -- full class documentation
- [Configuration guide](/guides/configuration) -- global CompositeVoice settings
