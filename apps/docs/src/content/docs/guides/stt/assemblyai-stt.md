---
title: AssemblyAISTT
description: Add real-time speech recognition with word boosting to your voice pipeline using AssemblyAI's WebSocket API.
order: 3
---

Use AssemblyAISTT when you need real-time transcription with word boosting for domain-specific vocabulary and automatic WebSocket reconnection.

## Prerequisites

- An [AssemblyAI](https://www.assemblyai.com) API key

No peer dependencies are required. AssemblyAISTT connects through a raw WebSocket managed by the SDK's built-in `WebSocketManager`.

For production, set up a [proxy server](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) so your API key stays server-side.

## Basic setup

```typescript
import { CompositeVoice, MicrophoneInput, AssemblyAISTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new AssemblyAISTT({
      proxyUrl: '/api/proxy/assemblyai',
      sampleRate: 16000,
    }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
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
| `proxyUrl` | `string` | -- | URL of your CompositeVoice proxy endpoint (recommended) |
| `apiKey` | `string` | -- | AssemblyAI API key (development only) |
| `sampleRate` | `number` | `16000` | Audio sample rate in Hz |
| `language` | `string` | `'en'` | Language code for transcription |
| `wordBoost` | `string[]` | -- | Words to prioritize during recognition |
| `interimResults` | `boolean` | `true` | Emit partial transcripts while the user speaks |
| `timeout` | `number` | `10000` | Connection timeout in milliseconds |

See the [API reference](/api/classes/assemblyaistt) for the full list.

## Complete example

```typescript
import { CompositeVoice, MicrophoneInput, AssemblyAISTT, AnthropicLLM, NativeTTS } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  providers: [
    new MicrophoneInput(),
    new AssemblyAISTT({
      proxyUrl: '/api/proxy/assemblyai',
      sampleRate: 16000,
      language: 'en',
      wordBoost: ['CompositeVoice', 'Deepgram', 'AssemblyAI'],
    }),
    new AnthropicLLM({
      proxyUrl: '/api/proxy/anthropic',
      model: 'claude-haiku-4-5',
      maxTokens: 256,
      systemPrompt: 'You are a helpful voice assistant. Keep responses under two sentences.',
    }),
    new NativeTTS({ voiceLang: 'en-US' }),
  ],
  conversationHistory: { enabled: true, maxTurns: 10 },
  logging: { enabled: true, level: 'info' },
});

agent.on('transcription.final', (event) => {
  console.log('User said:', event.text);
});

agent.on('response.text', (event) => {
  console.log('Assistant:', event.text);
});

await agent.initialize();
await agent.startListening();
```

## Utterance completion

AssemblyAISTT sets `utteranceComplete: true` on `FinalTranscript` messages from the AssemblyAI WebSocket. This is the flag CompositeVoice checks to trigger LLM processing -- interim/partial transcripts do not trigger the pipeline.

## Tips and gotchas

- **Always use a proxy in production.** Pass `proxyUrl` instead of `apiKey` so your AssemblyAI key never reaches the browser. The SDK converts `http(s)` to `ws(s)` automatically.
- **No peer dependencies.** Unlike [DeepgramSTT](/guides/stt/deepgram-stt), AssemblyAISTT uses the SDK's built-in `WebSocketManager` -- no extra packages to install.
- **Word boosting improves accuracy.** Pass product names, technical terms, or proper nouns in `wordBoost` so AssemblyAI prioritizes them during recognition.
- **Audio is base64-encoded.** The provider converts raw `ArrayBuffer` audio into base64 JSON messages (`{ audio_data: "..." }`) before sending. This is handled automatically.
- **Automatic reconnection.** The `WebSocketManager` reconnects with exponential backoff (up to 5 attempts, 1s initial delay, 30s max delay) if the connection drops.
- **No preflight signals.** AssemblyAISTT does not emit preflight/eager end-of-turn events. If you need the eager LLM pipeline, use [DeepgramSTT](/guides/stt/deepgram-stt) instead.
- **Graceful disconnect.** When you call `disconnect()`, the provider sends a `terminate_session` message to AssemblyAI before closing the WebSocket.

## Related resources

- [Proxy server example](https://github.com/lukeocodes/composite-voice/tree/main/examples/10-proxy-server) -- secure your API key server-side
- [API reference: AssemblyAISTT](/api/classes/assemblyaistt)
- [Providers reference](/reference/providers)
