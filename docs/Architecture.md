# Architecture

## Overview

`composite-voice` is an extensible, lightweight browser SDK for building AI voice agents. It provides a unified interface for Speech-to-Text (STT), Large Language Models (LLM), and Text-to-Speech (TTS) providers, supporting both REST and WebSocket communication patterns.

## Design Principles

1. **Lightweight**: Minimal dependencies, tree-shakeable exports
2. **Extensible**: Plugin-based architecture for adding new providers
3. **Strict Typing**: Full TypeScript support with comprehensive type definitions
4. **Provider Agnostic**: Normalize different provider APIs into a consistent interface
5. **Event-Driven**: Event emitter/pub-sub pattern for consistent client experience

## Core Architecture

### Provider Types

The SDK supports three main provider categories:

1. **STT Providers**: Convert audio to text
   - REST: Send complete audio, receive complete transcription
   - WebSocket: Stream audio chunks, receive incremental/final transcriptions

2. **LLM Providers**: Process text and generate responses
   - REST: Send text, receive complete response
   - Streaming: Send text, receive chunked response

3. **TTS Providers**: Convert text to audio
   - REST: Send text, receive complete audio or octet-stream
   - WebSocket: Send text chunks, receive audio chunks with metadata

4. **All-in-One Providers**: Handle STT → LLM → TTS in a single integration
   - Primarily WebSocket-based for real-time conversation

### Communication Patterns

#### REST Pattern

- Single request/response cycle
- Suitable for non-real-time interactions
- Lower complexity, higher latency

#### WebSocket Pattern

- Bidirectional streaming
- Real-time, low-latency interactions
- Support for incremental updates and early audio playback

### Event System

The SDK uses an event emitter to normalize provider differences:

**Core Events:**

- `transcription.start`: Transcription begins
- `transcription.interim`: Partial transcription (streaming only)
- `transcription.final`: Complete transcription
- `transcription.error`: Transcription error

- `llm.start`: LLM processing begins
- `llm.chunk`: Text chunk received (streaming only)
- `llm.complete`: LLM response complete
- `llm.error`: LLM processing error

- `tts.start`: TTS generation begins
- `tts.audio`: Audio chunk ready for playback
- `tts.metadata`: Audio metadata (sample rate, encoding)
- `tts.complete`: TTS generation complete
- `tts.error`: TTS error

- `agent.ready`: System ready for interaction
- `agent.listening`: Actively capturing audio
- `agent.thinking`: Processing user input
- `agent.speaking`: Playing back response
- `agent.idle`: Waiting for user input
- `agent.error`: System-level error

### Audio Handling

#### Input (Microphone)

- **Streaming Mode**: Capture audio chunks and send to WebSocket STT providers
- **Recording Mode**: Capture complete audio and send to REST STT providers
- Browser MediaRecorder API with configurable sample rates and formats

#### Output (Playback)

- **Single Audio**: Play complete audio file with known MIME type
- **Octet-Stream**: Buffer until sufficient audio available, then play
- **WebSocket Chunks**: Stitch audio chunks into continuous playback stream
- Use Web Audio API for low-latency playback and audio manipulation

### Provider Interface Design

Each provider type implements a standardized interface:

```typescript
interface BaseProvider {
  type: 'rest' | 'websocket';
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

interface STTProvider extends BaseProvider {
  // REST: process complete audio
  transcribe?(audio: Blob): Promise<string>;

  // WebSocket: stream audio chunks
  connect?(): Promise<void>;
  sendAudio?(chunk: ArrayBuffer): void;
  disconnect?(): Promise<void>;
}

interface LLMProvider extends BaseProvider {
  generate(prompt: string, options?: LLMOptions): Promise<AsyncIterable<string>>;
}

interface TTSProvider extends BaseProvider {
  // REST: generate complete audio
  synthesize?(text: string): Promise<AudioBuffer>;

  // WebSocket: stream text and receive audio chunks
  connect?(): Promise<void>;
  sendText?(chunk: string): void;
  finalize?(): Promise<void>;
  disconnect?(): Promise<void>;
}

interface AllInOneProvider extends BaseProvider {
  connect(): Promise<void>;
  sendAudio(chunk: ArrayBuffer): void;
  sendText(text: string): void;
  disconnect(): Promise<void>;
}
```

### Extensibility

New providers can be added by:

1. Implementing the appropriate provider interface
2. Registering with the SDK's provider registry
3. Optionally using official provider SDKs under the hood

The SDK provides base classes and utilities to simplify provider implementation.

## Module Structure

```
src/
├── core/
│   ├── events/           # Event emitter and event types
│   ├── audio/            # Audio capture and playback utilities
│   ├── state/            # Agent state management
│   └── types/            # Core type definitions
├── providers/
│   ├── base/             # Base provider classes and interfaces
│   ├── stt/              # STT provider implementations
│   ├── llm/              # LLM provider implementations
│   ├── tts/              # TTS provider implementations
│   └── all-in-one/       # All-in-one provider implementations
├── utils/                # Shared utilities
└── index.ts              # Main SDK export
```

## Built-in Providers

### Currently Implemented

#### STT Providers

- **NativeSTT**: Browser Web Speech API (no API key required)
  - Type: Browser API
  - Connection: Event-based
  - Status: ✅ Implemented

#### TTS Providers

- **NativeTTS**: Browser Speech Synthesis API (no API key required)
  - Type: Browser API
  - Connection: Synchronous
  - Status: ✅ Implemented

### Planned Providers

#### STT Providers

- **Deepgram**: WebSocket streaming with official SDK
- **OpenAI Whisper**: REST API

#### LLM Providers

- **OpenAI**: REST and streaming with official SDK
- **Anthropic**: REST and streaming with official SDK

#### TTS Providers

- **Deepgram**: WebSocket streaming with official SDK
- **ElevenLabs**: REST and WebSocket with official SDK

#### All-in-One Providers

- **Deepgram Aura**: Complete voice agent in one WebSocket connection

## Configuration

The SDK supports flexible configuration:

```typescript
const agent = new CompositeVoice({
  stt: new DeepgramSTT({ apiKey: 'xxx', model: 'nova-2' }),
  llm: new OpenAILLM({ apiKey: 'yyy', model: 'gpt-4' }),
  tts: new ElevenLabsTTS({ apiKey: 'zzz', voice: 'adam' }),

  // OR use all-in-one
  // provider: new DeepgramAura({ apiKey: 'xxx' })

  audio: {
    input: { sampleRate: 16000, format: 'pcm' },
    output: { bufferSize: 4096 },
  },
});
```

## Error Handling

- All providers implement consistent error handling
- Errors propagated through event system
- Graceful degradation where possible
- Automatic reconnection for WebSocket providers (configurable)

## Testing Strategy

CompositeVoice uses a comprehensive testing approach:

- **Unit tests** for core utilities and base classes
- **Integration tests** for provider implementations and workflows
- **Snapshot tests** for complex object structures
- **Mock providers** for testing consumer applications
- Browser environment testing with **Jest** and **jsdom**

Focus on testing behavior and logic rather than browser API interactions. See [Testing.md](./Testing.md) for detailed testing guidelines.

## Related Documentation

- **[Getting Started](./Getting%20Started.md)** - Quick start guide and basic usage
- **[Provider Implementation Guide](./Provider%20Implementation%20Guide.md)** - Creating custom providers
- **[Testing](./Testing.md)** - Testing strategies and best practices
- **[Examples](./Examples.md)** - Guide to example applications
- **[Folder Structure](./Folder%20Structure.md)** - Project organization

## Future Considerations

### Additional Providers

- Azure Cognitive Services (STT, TTS)
- Google Cloud Speech (STT, TTS)
- AWS Transcribe/Polly (STT, TTS)
- Cohere, AI21 Labs (LLM)

### Advanced Features

- Advanced audio processing (noise cancellation, echo suppression, VAD)
- Multi-language support and real-time translation
- Conversation history and context management
- Recording and playback of conversations
- Analytics and performance monitoring
- Custom audio effects and voice modulation

### Developer Experience

- Visual debugging tools
- Performance profiling
- Provider testing framework
- Documentation generation from code
