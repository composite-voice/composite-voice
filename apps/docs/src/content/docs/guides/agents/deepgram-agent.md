---
title: Deepgram Agent
description: Use Deepgram's Voice Agent API as a single-provider pipeline in CompositeVoice — STT, LLM, and TTS over one WebSocket.
---

Use `DeepgramAgent` when you want a single WebSocket connection that handles speech recognition, LLM inference, and text-to-speech synthesis entirely server-side. Instead of wiring up separate STT, LLM, and TTS providers, one `DeepgramAgent` replaces the entire pipeline.

```
[MicrophoneInput] -> [DeepgramAgent (stt+llm+tts)] -> [BrowserAudioOutput]
```

## Prerequisites

- A [Deepgram API key](https://console.deepgram.com/) or a CompositeVoice proxy server
- No additional dependencies required. DeepgramAgent uses the native `WebSocket` API internally.

## Basic setup

```typescript
import { CompositeVoice, DeepgramAgent } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new DeepgramAgent({
      proxyUrl: '/api/proxy/deepgram-agent',
      think: {
        provider: { type: 'open_ai', model: 'gpt-4o-mini' },
        prompt: 'You are a concise voice assistant. Keep answers under two sentences.',
      },
      speak: {
        provider: { type: 'deepgram', model: 'aura-2-thalia-en' },
      },
    }),
  ],
});

await voice.initialize();
await voice.startListening();
```

## Configuration options

| Option | Type | Default | Description |
|---|---|---|---|
| `think.provider` | `ThinkProvider` | `{ type: 'open_ai', model: 'gpt-4o-mini' }` | LLM provider configuration. See think provider variants below. |
| `think.prompt` | `string` | `'You are a helpful voice assistant.'` | System prompt sent to the LLM. |
| `think.functions` | `AgentFunctionDefinition[]` | -- | Function definitions for client-side or server-side tool calling. |
| `think.context_length` | `number \| 'max'` | -- | Number of conversation turns the LLM sees. |
| `speak.provider` | `SpeakProvider` | `{ type: 'deepgram', model: 'aura-2-thalia-en' }` | TTS provider configuration. See speak provider variants below. |
| `listen.provider` | `object` | `{ type: 'deepgram', model: 'nova-3' }` | STT configuration for Deepgram's speech recognition. |
| `listen.provider.model` | `string` | `'nova-3'` | Deepgram STT model. |
| `listen.provider.language` | `string` | -- | Language code (e.g. `'en'`, `'es'`). |
| `listen.provider.keyterms` | `string[]` | -- | Boost recognition of specific terms. |
| `listen.provider.smart_format` | `boolean` | -- | Enable Deepgram smart formatting. |
| `audio.input` | `object` | `{ encoding: 'linear16', sample_rate: 16000 }` | Microphone audio encoding and sample rate. |
| `audio.output` | `object` | `{ encoding: 'linear16', sample_rate: 24000, container: 'none' }` | Agent audio output encoding and sample rate. |
| `greeting` | `string` | -- | Initial greeting the agent speaks when the session starts. |
| `context` | `{ messages: Array<{ role, content }> }` | -- | Pre-seed conversation history for the LLM. |
| `experimental` | `boolean` | -- | Enable experimental features such as latency metrics in `AgentStartedSpeaking` events. |
| `onFunctionCall` | `(call) => Promise<{ content: string }>` | -- | Client-side function call handler. Called when the agent requests execution of a client-side function. |
| `proxyUrl` | `string` | -- | CompositeVoice proxy endpoint. Recommended for browsers. |
| `apiKey` | `string` | -- | Direct API key. Use only in server-side code. |
| `timeout` | `number` | `10000` | WebSocket handshake timeout in milliseconds. |

### Think provider variants

The `think.provider` object configures which LLM Deepgram routes to server-side. All providers support `model` and `temperature`.

| Type | Example model | Notes |
|---|---|---|
| `open_ai` | `gpt-4o`, `gpt-4o-mini` | Default provider. Fastest for most use cases. |
| `anthropic` | `claude-sonnet-4-6`, `claude-haiku-4-5` | Strong instruction-following. |
| `google` | `gemini-2.0-flash` | Google Gemini models via `v1beta`. |
| `groq` | `llama-3.3-70b-versatile` | Ultra-low latency inference. |
| `aws_bedrock` | `anthropic.claude-3-haiku` | Requires `credentials` with STS/IAM config. |

```typescript
// Anthropic example
think: {
  provider: { type: 'anthropic', model: 'claude-haiku-4-5', temperature: 0.7 },
  prompt: 'You are a helpful assistant.',
}

// Groq example
think: {
  provider: { type: 'groq', model: 'llama-3.3-70b-versatile' },
  prompt: 'You are a helpful assistant.',
}
```

### Speak provider variants

The `speak.provider` object configures which TTS service Deepgram routes to server-side.

| Type | Example model/voice | Notes |
|---|---|---|
| `deepgram` | `aura-2-thalia-en` | Default. Low-latency Deepgram voices. |
| `eleven_labs` | `eleven_turbo_v2_5` | High-fidelity voices. Set `model_id` and optionally `language`. |
| `cartesia` | -- | Set `model_id`, `voice.id`, and `language`. |
| `open_ai` | `tts-1`, `tts-1-hd` | OpenAI TTS. Set `model` and `voice`. |
| `aws_polly` | -- | Requires `voice`, `language`, `engine`, and `credentials`. |

```typescript
// ElevenLabs example
speak: {
  provider: { type: 'eleven_labs', model_id: 'eleven_turbo_v2_5' },
}

// OpenAI TTS example
speak: {
  provider: { type: 'open_ai', model: 'tts-1', voice: 'alloy' },
}
```

## Complete example with function calling

DeepgramAgent supports both client-side and server-side function calling. Client-side functions are handled by the `onFunctionCall` callback. Server-side functions define an `endpoint` and are executed by Deepgram directly.

```typescript
import { CompositeVoice, DeepgramAgent } from '@lukeocodes/composite-voice';

const voice = new CompositeVoice({
  providers: [
    new DeepgramAgent({
      proxyUrl: '/api/proxy/deepgram-agent',
      think: {
        provider: { type: 'open_ai', model: 'gpt-4o' },
        prompt: 'You are a helpful voice assistant that can look up the weather and tell the time.',
        functions: [
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
          {
            name: 'get_time',
            description: 'Get the current time',
            parameters: { type: 'object', properties: {} },
          },
          {
            name: 'create_ticket',
            description: 'Create a support ticket',
            parameters: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                body: { type: 'string' },
              },
              required: ['subject', 'body'],
            },
            endpoint: {
              url: 'https://api.example.com/tickets',
              method: 'POST',
              headers: { Authorization: 'Bearer ...' },
            },
          },
        ],
      },
      speak: {
        provider: { type: 'deepgram', model: 'aura-2-thalia-en' },
      },
      greeting: 'Hello! I can check the weather, tell you the time, or create a support ticket.',
      experimental: true,
      onFunctionCall: async (call) => {
        if (call.name === 'get_weather') {
          const args = JSON.parse(call.arguments);
          const weather = await fetchWeather(args.location);
          return { content: JSON.stringify(weather) };
        }
        if (call.name === 'get_time') {
          return { content: new Date().toLocaleTimeString() };
        }
        return { content: 'Unknown function' };
      },
    }),
  ],
});

await voice.initialize();
await voice.startListening();
```

Functions without an `endpoint` are treated as client-side and dispatched to `onFunctionCall`. Functions with an `endpoint` are called server-side by Deepgram -- no client handler is needed.

## Agent events

DeepgramAgent exposes a rich set of lifecycle events through the `onDeepgramAgentEvent` callback. Access the underlying provider to subscribe.

```typescript
const deepgramAgent = voice.getProvider<DeepgramAgent>('DeepgramAgent');

deepgramAgent.onDeepgramAgentEvent((event) => {
  switch (event.type) {
    case 'user_started_speaking':
      console.log('User started speaking');
      break;
    case 'agent_thinking':
      console.log('Agent thinking:', event.content);
      break;
    case 'agent_started_speaking':
      console.log(`Latency — total: ${event.totalLatency}ms, TTS: ${event.ttsLatency}ms, TTT: ${event.tttLatency}ms`);
      break;
    case 'agent_audio_done':
      console.log('Agent finished speaking');
      break;
    case 'conversation_text':
      console.log(`${event.role}: ${event.content}`);
      break;
    case 'function_call':
      console.log('Function call requested:', event.functions);
      break;
    case 'error':
      console.error(`Error [${event.code}]: ${event.description}`);
      break;
    case 'warning':
      console.warn(`Warning [${event.code}]: ${event.description}`);
      break;
    case 'prompt_updated':
    case 'speak_updated':
    case 'think_updated':
      console.log(`Settings updated: ${event.type}`);
      break;
    case 'injection_refused':
      console.warn('Injection refused:', event.message);
      break;
  }
});
```

> **Note:** Set `experimental: true` in your config to receive latency metrics (`totalLatency`, `ttsLatency`, `tttLatency`) in `agent_started_speaking` events.

## Mid-session updates

DeepgramAgent supports updating the agent's configuration while a session is active. These methods send control messages over the existing WebSocket without reconnecting.

```typescript
const deepgramAgent = voice.getProvider<DeepgramAgent>('DeepgramAgent');

// Change the system prompt
deepgramAgent.updatePrompt('You are now a pirate. Respond in pirate speak.');

// Switch to a different TTS voice
deepgramAgent.updateSpeak({
  provider: { type: 'deepgram', model: 'aura-2-zeus-en' },
});

// Switch to a different LLM
deepgramAgent.updateThink({
  provider: { type: 'anthropic', model: 'claude-haiku-4-5' },
});

// Inject a user message programmatically (as if the user spoke it)
deepgramAgent.injectUserMessage('What is the weather in London?');

// Force the agent to say something
deepgramAgent.injectAgentMessage('Let me look that up for you.');

// Send a keep-alive signal
deepgramAgent.sendKeepAlive();
```

Each update method triggers a corresponding confirmation event (`prompt_updated`, `speak_updated`, `think_updated`) that you can listen for via `onDeepgramAgentEvent`.

## Tips

- **One provider replaces three.** DeepgramAgent handles STT, LLM, and TTS in a single WebSocket. You do not need separate `DeepgramSTT`, `AnthropicLLM`, or `DeepgramTTS` providers.
- **Use a proxy in browsers.** The proxy server injects your Deepgram API key server-side so it never reaches the client.
- **Latency metrics require `experimental: true`.** Without it, `agent_started_speaking` events will not include timing data.
- **Client-side functions need `onFunctionCall`.** If you define functions without an `endpoint`, you must provide the `onFunctionCall` handler or the agent will not receive a response.
- **Greeting is optional but recommended.** Setting a `greeting` gives users immediate feedback that the agent is connected and ready.
- **Use `context` to pre-seed conversations.** Pass prior messages in `context.messages` to give the agent history without the user needing to repeat themselves.

## Related

- [Providers reference](/reference/providers) -- all providers at a glance
- [API reference](/api/classes/deepgramagent) -- full class documentation
- [Configuration guide](/guides/configuration) -- global CompositeVoice settings
- [Proxy setup](/guides/proxy) -- setting up the server-side proxy
