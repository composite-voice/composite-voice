---
title: Getting Started
description: Install CompositeVoice and build your first voice pipeline in under five minutes.
order: 1
---

## Prerequisites

- Node.js 18 or later
- A package manager: npm, pnpm, or yarn
- An Anthropic API key (for the LLM provider)

## Install

```bash
pnpm add composite-voice
```

## Your first voice pipeline

The simplest pipeline is an LLM-only text agent. When no providers are supplied (or only an LLM), the SDK auto-fills `NullInput` (text-only, no microphone) and `NullOutput` (text-only, no speakers). No extra API keys beyond Anthropic are needed.

```typescript
import {
  CompositeVoice,
  AnthropicLLM,
} from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
  ],
});
```

When no input or STT provider is supplied, the SDK defaults to `NullInput` (text-only, no microphone) — covering both the `input` and `stt` pipeline roles. When no TTS or output provider is supplied, it defaults to `NullOutput` (text-only, no speakers) — covering `tts` and `output`. When no LLM is supplied, it defaults to `AnthropicLLM` with `claude-haiku-4-5`. For a voice-enabled pipeline, add [NativeSTT](/guides/stt/native-stt) and [NativeTTS](/guides/tts/native-tts) explicitly, or use cloud providers like [DeepgramSTT](/guides/stt/deepgram-stt) and [DeepgramTTS](/guides/tts/deepgram-tts) — when an STT is provided without an input, `MicrophoneInput` is auto-filled; when a TTS is provided without an output, `BrowserAudioOutput` is auto-filled.

The `proxyUrl` keeps your Anthropic API key on the server. The browser never sees it. See [Secure your API key](#secure-your-api-key-with-the-server-proxy) below.

## Listen for events

Subscribe to events before calling `initialize()`.

```typescript
voice.on('agent.stateChange', ({ state }) => {
  console.log('State:', state);
  // idle -> ready -> listening -> thinking -> speaking
});

voice.on('transcription.speechFinal', ({ text }) => {
  console.log('User:', text);
});

voice.on('llm.complete', ({ text }) => {
  console.log('Assistant:', text);
});

voice.on('agent.error', ({ error }) => {
  console.error('Error:', error.message);
});
```

The state machine drives the UI. When the agent enters `listening`, show a recording indicator. When it enters `thinking`, show a loading spinner. When it enters `speaking`, animate the assistant avatar.

## Initialize and start listening

```typescript
await voice.initialize();      // Initializes all providers
await voice.startListening();  // Requests microphone, opens connections
// ... user speaks, assistant responds ...
await voice.stopListening();   // Releases microphone, closes connections
await voice.dispose();         // Tears down all providers and releases resources
```

`initialize()` resolves once all providers are ready. `startListening()` resolves once the microphone is active and streaming. `dispose()` releases all resources.

## Secure your API key with the server proxy

The `proxyUrl` pattern keeps API keys server-side. The browser sends requests to your proxy endpoint, and the proxy injects the real API key before forwarding to the upstream provider.

Create an Express server:

```typescript
import express from 'express';
import { createExpressProxy } from 'composite-voice/proxy';

const app = express();
const proxy = createExpressProxy({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  pathPrefix: '/api/proxy',
});

app.use(proxy.middleware);

const server = app.listen(3000, () => {
  proxy.attachWebSocket(server);
  console.log('Proxy listening on port 3000');
});
```

The browser sends requests to `/api/proxy/anthropic` and the proxy forwards them to `https://api.anthropic.com` with the real key attached. WebSocket providers ([Deepgram](/guides/stt/deepgram-stt), [ElevenLabs](/guides/tts/elevenlabs-tts), [AssemblyAI](/guides/stt/assemblyai-stt), [Cartesia](/guides/tts/cartesia-tts)) require the `attachWebSocket` call to handle upgrade requests.

## Agent providers — the simplest setup

If you want production-quality voice with minimal configuration, **agent providers** are the fastest path. A single agent provider like [DeepgramAgent](/guides/agents/deepgram-agent) handles STT, LLM, and TTS in one server-side WebSocket — you only need one provider and one API key.

```typescript
import {
  CompositeVoice,
  DeepgramAgent,
} from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new DeepgramAgent({ proxyUrl: '/api/proxy/deepgram-agent' }),
  ],
});
```

This replaces three separate providers with a single connection. See the [Agent Providers guide](/guides/agents) and the [70-deepgram-agent example](https://github.com/composite-voice/composite-voice/tree/main/examples/70-deepgram-agent) for a full walkthrough.

## Upgrade to cloud providers

[NativeSTT](/guides/stt/native-stt) and [NativeTTS](/guides/tts/native-tts) work for prototyping. For production-quality speech recognition and synthesis, swap in cloud providers. [DeepgramSTT](/guides/stt/deepgram-stt) and [DeepgramTTS](/guides/tts/deepgram-tts) use low-latency WebSocket connections.

```typescript
import {
  CompositeVoice,
  MicrophoneInput,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
  BrowserAudioOutput,
} from 'composite-voice';

const voice = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
    }),
    new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
    new BrowserAudioOutput(),
  ],
});
```

Update the proxy to include the Deepgram API key:

```typescript
const proxy = createExpressProxy({
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  deepgramApiKey: process.env.DEEPGRAM_API_KEY,
  pathPrefix: '/api/proxy',
});
```

Every provider you configure in the proxy gets its own route. Add keys for only the providers you use.

## Next steps

- [Agent Providers](/guides/agents) -- the simplest setup: one provider, one API key
- [Configuration](/guides/configuration) -- pipeline options, turn-taking, and audio settings
- [Providers](/reference/providers) -- all available STT, LLM, and TTS providers
- [Events](/reference/events) -- the full event reference
- [Examples](https://github.com/composite-voice/composite-voice/tree/main/examples) -- runnable demo apps
