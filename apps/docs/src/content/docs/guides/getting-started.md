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
npm install @lukeocodes/composite-voice
```

## Your first voice pipeline

The simplest pipeline uses browser-native speech recognition and synthesis -- zero extra API keys beyond Anthropic. NativeSTT wraps the Web Speech API. NativeTTS wraps SpeechSynthesis. Both work out of the box in Chrome, Edge, and Safari.

```typescript
import {
  CompositeVoice,
  NativeSTT,
  AnthropicLLM,
  NativeTTS,
} from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  stt: new NativeSTT(),
  llm: new AnthropicLLM({
    proxyUrl: '/api/proxy/anthropic',
    model: 'claude-haiku-4-5',
  }),
  tts: new NativeTTS(),
});
```

The `proxyUrl` keeps your Anthropic API key on the server. The browser never sees it. See [Secure your API key](#secure-your-api-key-with-the-server-proxy) below.

## Listen for events

CompositeVoice uses an event-driven architecture. Subscribe to the events you care about before calling `start()`.

```typescript
voice.on('agent:stateChange', ({ state }) => {
  console.log('State:', state);
  // idle -> ready -> listening -> thinking -> speaking
});

voice.on('transcription:speechFinal', ({ text }) => {
  console.log('User:', text);
});

voice.on('llm:complete', ({ text }) => {
  console.log('Assistant:', text);
});

voice.on('agent:error', ({ error }) => {
  console.error('Error:', error.message);
});
```

The state machine drives the UI. When the agent enters `listening`, show a recording indicator. When it enters `thinking`, show a loading spinner. When it enters `speaking`, animate the assistant avatar.

## Start and stop

```typescript
await voice.start();  // Requests microphone permission, opens connections
// ... user speaks, assistant responds ...
await voice.stop();   // Releases microphone, closes connections
```

`start()` returns a Promise that resolves once the microphone is active and all providers are connected. `stop()` tears everything down and releases all resources.

## Secure your API key with the server proxy

The `proxyUrl` pattern keeps API keys server-side. The browser sends requests to your proxy endpoint, and the proxy injects the real API key before forwarding to the upstream provider.

Create an Express server:

```typescript
import express from 'express';
import { createExpressProxy } from '@lukeocodes/composite-voice/proxy';

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

The browser sends requests to `/api/proxy/anthropic` and the proxy forwards them to `https://api.anthropic.com` with the real key attached. WebSocket providers (Deepgram, ElevenLabs, AssemblyAI, Cartesia) require the `attachWebSocket` call to handle upgrade requests.

## Upgrade to cloud providers

NativeSTT and NativeTTS work for prototyping. For production-quality speech recognition and synthesis, swap in cloud providers. DeepgramSTT and DeepgramTTS use low-latency WebSocket connections.

```typescript
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  stt: new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
  llm: new AnthropicLLM({
    proxyUrl: '/api/proxy/anthropic',
    model: 'claude-haiku-4-5',
  }),
  tts: new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
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

- [Configuration](/guides/configuration) -- pipeline options, turn-taking, and audio settings
- [Providers](/reference/providers) -- all available STT, LLM, and TTS providers
- [Events](/reference/events) -- the full event reference
- [Examples](https://github.com/lukeocodes/composite-voice/tree/main/examples) -- runnable demo apps
