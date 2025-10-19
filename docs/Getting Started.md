# Getting Started

Welcome to CompositeVoice! This guide will help you build your first AI voice agent in minutes.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Understanding the Architecture](#understanding-the-architecture)
- [Event System](#event-system)
- [Agent States](#agent-states)
- [Configuration Options](#configuration-options)
- [Common Patterns](#common-patterns)
- [Error Handling](#error-handling)
- [Next Steps](#next-steps)

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
npm install openai

# For Anthropic LLM
npm install @anthropic-ai/sdk

# For Deepgram providers
npm install @deepgram/sdk
```

## Quick Start

### 1. Create a Simple Voice Agent

Let's create a voice agent that uses native browser APIs (no API keys required):

```typescript
import { CompositeVoice, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';

// Create the voice agent
const agent = new CompositeVoice({
  mode: 'composite',
  stt: new NativeSTT({ language: 'en-US' }),
  llm: /* We'll add this next */,
  tts: new NativeTTS(),
});
```

### 2. Add an LLM Provider

For the LLM, you'll need an API key. This example uses OpenAI:

```typescript
import { CompositeVoice, NativeSTT, NativeTTS } from '@lukeocodes/composite-voice';
// Import OpenAI LLM (requires 'openai' package)
import { OpenAILLM } from '@lukeocodes/composite-voice/providers/llm/openai';

const agent = new CompositeVoice({
  mode: 'composite',
  stt: new NativeSTT({ language: 'en-US' }),
  llm: new OpenAILLM({
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4-turbo',
    systemPrompt: 'You are a helpful voice assistant.',
  }),
  tts: new NativeTTS(),
});
```

> **Note:** Make sure to set your `OPENAI_API_KEY` environment variable or replace it with your actual API key.

### 3. Initialize and Start Listening

```typescript
// Initialize the agent
await agent.initialize();

// Listen for events
agent.on('transcription.final', (event) => {
  console.log('User said:', event.text);
});

agent.on('llm.complete', (event) => {
  console.log('AI responded:', event.text);
});

agent.on('agent.stateChange', (event) => {
  console.log('State:', event.state);
});

// Start listening
await agent.startListening();

// Later, when done
await agent.stopListening();
await agent.dispose();
```

## Understanding the Architecture

CompositeVoice supports two operational modes to balance flexibility and performance:

### Composite Mode (Maximum Flexibility)

Use separate providers for each component (STT, LLM, TTS):

```
User Speech → STT Provider → LLM Provider → TTS Provider → Audio Output
```

**When to use:**

- You want to mix providers from different services
- You need fine-grained control over each component
- You want to easily swap individual components
- Latency is not the primary concern

**Example:**

```typescript
const agent = new CompositeVoice({
  mode: 'composite',
  stt: new DeepgramSTT({ apiKey: '...' }),
  llm: new OpenAILLM({ apiKey: '...' }),
  tts: new ElevenLabsTTS({ apiKey: '...' }),
});
```

### All-in-One Mode (Maximum Performance)

Use a single provider that handles the entire pipeline:

```
User Speech → All-in-One Provider → Audio Output
```

**When to use:**

- You need the lowest possible latency
- You want simpler configuration
- You're using a provider that offers an integrated solution (e.g., Deepgram Aura)

**Example:**

```typescript
const agent = new CompositeVoice({
  mode: 'all-in-one',
  provider: new DeepgramAura({ apiKey: '...' }),
});
```

For more architectural details, see [Architecture.md](./Architecture.md).

## Event System

CompositeVoice uses events to communicate:

```typescript
// Listen for specific events
agent.on('transcription.final', (event) => {
  // Final transcription received
  console.log(event.text);
});

// Listen for all events
agent.on('*', (event) => {
  console.log('Event:', event.type);
});

// One-time listener
agent.once('agent.ready', () => {
  console.log('Ready!');
});

// Remove listener
const unsubscribe = agent.on('llm.chunk', handleChunk);
unsubscribe(); // Stop listening
```

## Agent States

The agent goes through these states:

1. **idle**: Not initialized
2. **ready**: Ready for interaction
3. **listening**: Capturing audio from microphone
4. **thinking**: Processing with LLM
5. **speaking**: Playing audio response
6. **error**: Error occurred (can recover)

Track state changes:

```typescript
agent.on('agent.stateChange', (event) => {
  if (event.state === 'listening') {
    // Show microphone animation
  } else if (event.state === 'speaking') {
    // Show speaker animation
  }
});
```

## Configuration Options

### Audio Configuration

```typescript
const agent = new CompositeVoice({
  // ... providers ...
  audio: {
    input: {
      sampleRate: 16000, // 16kHz recommended
      format: 'pcm', // Raw PCM audio
      channels: 1, // Mono
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    output: {
      bufferSize: 4096,
      minBufferDuration: 200, // ms before playback
      enableSmoothing: true,
    },
  },
});
```

### Logging

```typescript
const agent = new CompositeVoice({
  // ... providers ...
  logging: {
    enabled: true,
    level: 'debug', // 'debug' | 'info' | 'warn' | 'error'
  },
});
```

### Auto-Reconnect

```typescript
const agent = new CompositeVoice({
  // ... providers ...
  reconnection: {
    enabled: true,
    maxAttempts: 5,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
});
```

## Common Patterns

### Push-to-Talk

```typescript
let listening = false;

button.addEventListener('mousedown', async () => {
  if (!listening) {
    await agent.startListening();
    listening = true;
  }
});

button.addEventListener('mouseup', async () => {
  if (listening) {
    await agent.stopListening();
    listening = false;
  }
});
```

### Voice Activity Detection

```typescript
import { calculateRMS, isSilent } from '@lukeocodes/composite-voice';

const audioCapture = agent.getAudioCapture();

// Monitor audio levels
audioCapture.start((audioData) => {
  const samples = new Float32Array(audioData);
  const volume = calculateRMS(samples);

  if (isSilent(samples)) {
    console.log('Silent');
  } else {
    console.log('Speaking, volume:', volume);
  }

  // Send to provider...
});
```

### Conversation History

```typescript
const conversationHistory: LLMMessage[] = [
  {
    role: 'system',
    content: 'You are a helpful assistant.',
  },
];

agent.on('transcription.final', (event) => {
  conversationHistory.push({
    role: 'user',
    content: event.text,
  });
});

agent.on('llm.complete', (event) => {
  conversationHistory.push({
    role: 'assistant',
    content: event.text,
  });

  // Use history in next LLM call
  // llm.generateFromMessages(conversationHistory);
});
```

## Error Handling

```typescript
agent.on('agent.error', (event) => {
  console.error('Agent error:', event.error);

  if (event.recoverable) {
    // Try to recover
    console.log('Attempting recovery...');
  } else {
    // Fatal error, reinitialize
    console.log('Fatal error, disposing...');
    agent.dispose();
  }
});

agent.on('transcription.error', (event) => {
  console.error('Transcription error:', event.error);
});

agent.on('llm.error', (event) => {
  console.error('LLM error:', event.error);
});

agent.on('tts.error', (event) => {
  console.error('TTS error:', event.error);
});
```

## Next Steps

Now that you understand the basics, explore more:

### Documentation

- **[Architecture](./Architecture.md)** - Deep dive into system design and architecture
- **[Provider Implementation Guide](./Provider%20Implementation%20Guide.md)** - Create custom providers
- **[Testing](./Testing.md)** - Testing strategies and best practices
- **[Examples](./Examples.md)** - Guide to example applications

### Examples

Check the [examples directory](../examples) for complete, working applications:

- **[Basic Browser](../examples/basic-browser/)** - Pure HTML/JS with native APIs (no build step)
- **[Vite + TypeScript](../examples/vite-typescript/)** - Modern setup with real providers

### Provider Documentation

Learn about integrating specific providers:

- OpenAI (GPT models, Whisper) - Coming soon
- Anthropic (Claude) - Coming soon
- Deepgram (STT, TTS, Aura) - Coming soon
- ElevenLabs (TTS) - Coming soon

## Need Help?

- 🐛 [Report Issues](https://github.com/lukeocodes/composite-voice/issues)
- 💬 [Join Discussions](https://github.com/lukeocodes/composite-voice/discussions)
- 📖 [View Source](https://github.com/lukeocodes/composite-voice)

## Browser Compatibility

- **Chrome/Edge**: Full support ✅
- **Firefox**: Full support (Web Speech API limited) ⚠️
- **Safari**: Partial support (Web Speech API limited) ⚠️

For production applications, consider using cloud-based STT/TTS providers for better cross-browser support.
