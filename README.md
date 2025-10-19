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

### Using Native Browser APIs

```typescript
import { CompositeVoice, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';

// Create a simple voice agent using browser APIs
const agent = new CompositeVoice({
  mode: 'composite',
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new OpenAILLM({
    apiKey: 'your-api-key',
    model: 'gpt-4',
  }),
  tts: new NativeTTS({ voice: 'Google US English' }),
  audio: {
    input: { sampleRate: 16000 },
    output: { bufferSize: 4096 },
  },
});

// Initialize the agent
await agent.initialize();

// Listen for events
agent.on('transcription.final', (event) => {
  console.log('You said:', event.text);
});

agent.on('llm.complete', (event) => {
  console.log('AI responded:', event.text);
});

agent.on('agent.stateChange', (event) => {
  console.log('State changed:', event.previousState, '->', event.state);
});

// Start listening for user input
await agent.startListening();

// When done, stop listening
await agent.stopListening();

// Clean up
await agent.dispose();
```

### Using Custom Providers

```typescript
import { CompositeVoice } from '@lukeocodes/composite-voice';
import { DeepgramSTT } from '@lukeocodes/composite-voice/providers/stt/deepgram';
import { OpenAILLM } from '@lukeocodes/composite-voice/providers/llm/openai';
import { ElevenLabsTTS } from '@lukeocodes/composite-voice/providers/tts/elevenlabs';

const agent = new CompositeVoice({
  mode: 'composite',
  stt: new DeepgramSTT({
    apiKey: process.env.DEEPGRAM_API_KEY,
    model: 'nova-2',
    language: 'en-US',
  }),
  llm: new OpenAILLM({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4-turbo',
    temperature: 0.7,
    systemPrompt: 'You are a helpful voice assistant.',
  }),
  tts: new ElevenLabsTTS({
    apiKey: process.env.ELEVENLABS_API_KEY,
    voice: 'adam',
  }),
});

await agent.initialize();
await agent.startListening();
```

### Using All-in-One Provider

```typescript
import { CompositeVoice } from '@lukeocodes/composite-voice';
import { DeepgramAura } from '@lukeocodes/composite-voice/providers/all-in-one/deepgram';

const agent = new CompositeVoice({
  mode: 'all-in-one',
  provider: new DeepgramAura({
    apiKey: process.env.DEEPGRAM_API_KEY,
    model: 'aura-asteria-en',
    systemPrompt: 'You are a helpful assistant.',
  }),
});

await agent.initialize();
await agent.startListening();
```

## Architecture

CompositeVoice supports two modes:

### Composite Mode

Uses separate providers for STT, LLM, and TTS. Provides maximum flexibility and allows mixing providers from different services.

```
User Speech → STT Provider → LLM Provider → TTS Provider → Audio Output
```

### All-in-One Mode

Uses a single provider that handles the entire pipeline (STT → LLM → TTS). Provides lower latency and simpler configuration.

```
User Speech → All-in-One Provider → Audio Output
```

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

## Built-in Providers

### STT Providers

- **NativeSTT**: Browser Web Speech API (no API key required)
- **DeepgramSTT**: Deepgram streaming STT (requires `@deepgram/sdk`)
- **OpenAISTT**: OpenAI Whisper (requires `openai`)

### LLM Providers

- **OpenAILLM**: OpenAI GPT models (requires `openai`)
- **AnthropicLLM**: Anthropic Claude models (requires `@anthropic-ai/sdk`)

### TTS Providers

- **NativeTTS**: Browser Speech Synthesis API (no API key required)
- **DeepgramTTS**: Deepgram streaming TTS (requires `@deepgram/sdk`)
- **ElevenLabsTTS**: ElevenLabs voices (requires SDK)

### All-in-One Providers

- **Deepgram**: Complete voice agent pipeline (requires `@deepgram/sdk`)

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

- **[Basic Browser](./examples/basic-browser/)** - Simple HTML/JS with native browser APIs
- **[Vite + TypeScript](./examples/vite-typescript/)** - Modern setup with real providers
- **Custom Provider** - Coming soon
- **All-in-One** - Coming soon

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
