# CompositeVoice

[![npm version](https://badge.fury.io/js/%40lukeocodes%2Fcomposite-voice.svg)](https://www.npmjs.com/package/@lukeocodes/composite-voice)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

An extensible, lightweight browser SDK for building AI voice agents. CompositeVoice provides a unified interface for Speech-to-Text (STT), Large Language Models (LLM), and Text-to-Speech (TTS) providers with support for both REST and WebSocket communication patterns.

## Installation

```bash
npm install @lukeocodes/composite-voice
# or
pnpm add @lukeocodes/composite-voice
# or
yarn add @lukeocodes/composite-voice
```

### Optional Peer Dependencies

Install provider SDKs as needed:

```bash
# For OpenAI providers
pnpm add openai

# For Anthropic LLM
pnpm add @anthropic-ai/sdk

# For Deepgram providers
pnpm add @deepgram/sdk
```

## Quick Start

### Deepgram + Anthropic (Recommended)

Best-in-class real-time STT + fastest LLM + streaming TTS:

```typescript
import {
  CompositeVoice,
  DeepgramSTT,
  AnthropicLLM,
  DeepgramTTS,
} from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    apiKey: process.env.DEEPGRAM_API_KEY,
    options: { model: 'nova-3', smartFormat: true, interimResults: true },
  }),
  llm: new AnthropicLLM({
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-haiku-4-6', // fastest Claude 4.6 model
    systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
    maxTokens: 200,
  }),
  tts: new DeepgramTTS({
    apiKey: process.env.DEEPGRAM_API_KEY,
    options: { model: 'aura-2-thalia-en', encoding: 'linear16', sampleRate: 24000 },
  }),
});

await agent.initialize();

agent.on('transcription.final', (e) => console.log('You said:', e.text));
agent.on('llm.chunk', (e) => process.stdout.write(e.chunk));
agent.on('agent.stateChange', (e) => console.log('State:', e.state));

await agent.startListening();
```

### Using Native Browser APIs (no API keys required)

```typescript
import { CompositeVoice, NativeSTT, NativeTTS, OpenAILLM } from '@lukeocodes/composite-voice';

const agent = new CompositeVoice({
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new OpenAILLM({ apiKey: 'your-openai-key', model: 'gpt-4o-mini' }),
  tts: new NativeTTS(),
});

await agent.initialize();
await agent.startListening();
```

## Architecture

CompositeVoice orchestrates three pluggable providers:

```
User Speech → STT Provider → LLM Provider → TTS Provider → Audio Output
```

Providers implement a strict, typed interface. For STT and TTS, both REST and WebSocket (live/streaming) variants are supported. Any provider that sets `managedAudio = true` (like `NativeSTT` and `NativeTTS`) bypasses the SDK's built-in audio capture/playback and manages its own audio pipeline directly.

## Event System

The SDK uses a type-safe event system to communicate with your application:

### Agent Events

- `agent.ready`: SDK is initialized and ready
- `agent.stateChange`: Agent state changed
- `agent.error`: System-level error occurred

### Transcription Events

- `transcription.start`: Transcription started
- `transcription.interim`: Partial transcription (streaming only)
- `transcription.final`: Complete transcription
- `transcription.error`: Transcription error

### LLM Events

- `llm.start`: LLM processing started
- `llm.chunk`: Text chunk received (streaming)
- `llm.complete`: LLM response complete
- `llm.error`: LLM error

### TTS Events

- `tts.start`: TTS generation started
- `tts.audio`: Audio chunk ready
- `tts.metadata`: Audio metadata received
- `tts.complete`: TTS generation complete
- `tts.error`: TTS error

### Audio Events

- `audio.capture.start`: Microphone capture started
- `audio.capture.stop`: Microphone capture stopped
- `audio.capture.error`: Audio capture error
- `audio.playback.start`: Audio playback started
- `audio.playback.end`: Audio playback ended
- `audio.playback.error`: Audio playback error

## Agent States

The agent transitions through these states:

- `idle`: Not initialized
- `ready`: Initialized and ready for interaction
- `listening`: Actively capturing audio
- `thinking`: Processing input with LLM
- `speaking`: Playing back audio response
- `error`: Error state (can recover)

## Conversation History

Enable multi-turn conversation context so the LLM remembers previous exchanges:

```typescript
const agent = new CompositeVoice({
  stt: new DeepgramSTT({ apiKey: process.env.DEEPGRAM_API_KEY }),
  llm: new AnthropicLLM({ apiKey: process.env.ANTHROPIC_API_KEY }),
  tts: new DeepgramTTS({ apiKey: process.env.DEEPGRAM_API_KEY }),
  conversationHistory: {
    enabled: true,
    maxTurns: 10, // keep last 10 user+assistant pairs (0 = unlimited)
  },
});

// After a session, inspect or clear history
const history = agent.getHistory(); // LLMMessage[]
agent.clearHistory();
```

Without `conversationHistory.enabled: true`, each user utterance is processed independently (stateless).

## Built-in Providers

### STT Providers

| Provider | Type | Notes |
|----------|------|-------|
| `NativeSTT` | WebSocket | Browser Web Speech API — no API key, `managedAudio=true` |
| `DeepgramSTT` | WebSocket | Deepgram nova-3 real-time STT — requires `@deepgram/sdk` |

### LLM Providers

| Provider | Notes |
|----------|-------|
| `AnthropicLLM` | Claude models — requires `@anthropic-ai/sdk`. Default: `claude-haiku-4-6` |
| `OpenAILLM` | GPT models — requires `openai`. |

### TTS Providers

| Provider | Type | Notes |
|----------|------|-------|
| `NativeTTS` | REST | Browser Speech Synthesis API — no API key, `managedAudio=true` |
| `DeepgramTTS` | WebSocket | Deepgram aura-2 streaming TTS — requires `@deepgram/sdk`. Default: `aura-2-thalia-en` at 24 kHz |

## Creating Custom Providers

You can create custom providers by extending the base classes:

```typescript
import { BaseSTTProvider } from '@lukeocodes/composite-voice';

class MyCustomSTT extends BaseSTTProvider {
  protected async onInitialize(): Promise<void> {
    // Initialize your provider
  }

  protected async onDispose(): Promise<void> {
    // Clean up resources
  }

  async transcribe(audio: Blob): Promise<string> {
    // Implement transcription logic
    return 'transcribed text';
  }
}
```

## Examples

Check the [examples](./examples) directory for complete, standalone example applications:

- **[Basic Browser](./examples/basic-browser/)** - Simple HTML/JS with native browser APIs (NativeSTT + OpenAI + NativeTTS)
- **[Deepgram + Anthropic + Deepgram](./examples/01-deepgram-anthropic-deepgram/)** - Deepgram nova-3 STT + Anthropic claude-haiku-4-6 + Deepgram aura-2 TTS

Each example has its own README with detailed setup instructions.

## Browser Support

- Chrome/Edge: Full support
- Firefox: Full support (with limitations on Web Speech API)
- Safari: Partial support (Web Speech API limited)

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.

## License

MIT © Luke Oliff

## Notes

Warts and all experiment into complex architecture development almost entirely through AI-prompting a code editor. Cursor using `claude-4.5-sonnet`. See my [prompt log](./prompt-log/) for exported prompts.
