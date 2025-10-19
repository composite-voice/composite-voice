# Deepgram TTS Provider

The Deepgram TTS (Text-to-Speech) provider enables real-time streaming text-to-speech synthesis using the [Deepgram SDK](https://github.com/deepgram/deepgram-js-sdk). This provider operates exclusively in **WebSocket mode** for low-latency, streaming audio generation.

## Overview

- **Provider Type**: WebSocket (streaming only)
- **SDK Required**: `@deepgram/sdk` (peer dependency)
- **Best For**: Real-time conversational AI, live streaming applications
- **Audio Output**: Raw audio chunks suitable for immediate playback

## Installation

The Deepgram SDK is a peer dependency and must be installed separately:

```bash
npm install @deepgram/sdk
# or
pnpm add @deepgram/sdk
# or
yarn add @deepgram/sdk
```

## Basic Usage

```typescript
import { DeepgramTTS } from '@lukeocodes/composite-voice/providers/tts/deepgram';

// Create provider instance
const tts = new DeepgramTTS({
  apiKey: 'your-deepgram-api-key',
  voice: 'aura-asteria-en', // Voice model to use
  sampleRate: 24000,
  outputFormat: 'linear16',
});

// Initialize the provider
await tts.initialize();

// Connect to WebSocket
await tts.connect();

// Register audio callback
tts.onAudio((chunk) => {
  console.log('Received audio chunk:', chunk.data.byteLength, 'bytes');
  // Play audio chunk immediately
  audioPlayer.play(chunk);
});

// Send text for synthesis
tts.sendText('Hello, this is a streaming text-to-speech example.');
tts.sendText(' It works in real-time!');

// Finalize synthesis (flush remaining audio)
await tts.finalize();

// Disconnect when done
await tts.disconnect();
await tts.dispose();
```

## Configuration

### Basic Configuration

```typescript
interface DeepgramTTSConfig {
  apiKey: string; // Required: Your Deepgram API key
  voice?: string; // Voice model (default: 'aura-asteria-en')
  sampleRate?: number; // Audio sample rate (default: 16000)
  outputFormat?: string; // Audio encoding (default: 'linear16')
  timeout?: number; // Connection timeout in ms (default: 10000)
  debug?: boolean; // Enable debug logging (default: false)
  options?: DeepgramTTSOptions; // Additional Deepgram-specific options
}
```

### Deepgram-Specific Options

```typescript
interface DeepgramTTSOptions {
  model?: string; // Voice model (overrides voice)
  encoding?: string; // Audio encoding ('linear16', 'mulaw', 'alaw')
  sampleRate?: number; // Sample rate (8000, 16000, 24000, 48000)
  container?: string; // Container format ('none', 'wav')
  bitRate?: number; // Bit rate for encoded output
}
```

## Available Voice Models

Deepgram offers a variety of high-quality voice models:

| Voice ID          | Description               | Gender | Language     |
| ----------------- | ------------------------- | ------ | ------------ |
| `aura-asteria-en` | Default female voice      | Female | English (US) |
| `aura-luna-en`    | Warm female voice         | Female | English (US) |
| `aura-stella-en`  | Professional female voice | Female | English (US) |
| `aura-athena-en`  | Confident female voice    | Female | English (US) |
| `aura-hera-en`    | Expressive female voice   | Female | English (US) |
| `aura-orion-en`   | Versatile male voice      | Male   | English (US) |
| `aura-arcas-en`   | Calm male voice           | Male   | English (US) |
| `aura-perseus-en` | Strong male voice         | Male   | English (US) |
| `aura-angus-en`   | Warm male voice           | Male   | English (US) |
| `aura-orpheus-en` | Deep male voice           | Male   | English (US) |
| `aura-helios-en`  | Energetic male voice      | Male   | English (US) |
| `aura-zeus-en`    | Authoritative male voice  | Male   | English (US) |

## Advanced Usage

### Custom Audio Configuration

```typescript
const tts = new DeepgramTTS({
  apiKey: 'your-api-key',
  voice: 'aura-zeus-en',
  options: {
    encoding: 'linear16',
    sampleRate: 48000, // High-quality audio
    container: 'none', // Raw audio stream
    bitRate: 128000, // Higher bit rate
  },
});
```

### Handling Audio Chunks

```typescript
await tts.initialize();
await tts.connect();

// Register audio callback
tts.onAudio((chunk) => {
  // Chunk structure:
  // {
  //   data: ArrayBuffer,      // Raw audio data
  //   timestamp: number,      // When chunk was received
  //   metadata: {
  //     sampleRate: 48000,
  //     encoding: 'linear16',
  //     channels: 1,
  //     bitDepth: 16,
  //   }
  // }

  // Process or play audio immediately
  processAudioChunk(chunk);
});

// Optionally handle metadata
tts.onMetadata((metadata) => {
  console.log('Audio metadata:', metadata);
});
```

### Streaming Long Text

```typescript
// Split text into chunks for progressive synthesis
const longText = 'This is a very long text that we want to synthesize...';
const sentences = longText.match(/[^.!?]+[.!?]+/g) || [];

for (const sentence of sentences) {
  tts.sendText(sentence);
}

// Flush remaining audio
await tts.finalize();
```

### Error Handling

```typescript
import {
  ProviderInitializationError,
  ProviderConnectionError,
} from '@lukeocodes/composite-voice/utils/errors';

try {
  const tts = new DeepgramTTS({ apiKey: 'invalid-key' });
  await tts.initialize();
  await tts.connect();
} catch (error) {
  if (error instanceof ProviderInitializationError) {
    console.error('Failed to initialize:', error.message);
    // Check if SDK is installed
  } else if (error instanceof ProviderConnectionError) {
    console.error('Failed to connect:', error.message);
    // Check API key and network
  }
}
```

## WebSocket Lifecycle

### Connection Flow

1. **Initialize**: Load and configure the Deepgram SDK
2. **Connect**: Establish WebSocket connection
3. **Send Text**: Stream text chunks for synthesis
4. **Receive Audio**: Process audio chunks as they arrive
5. **Finalize**: Flush any remaining audio
6. **Disconnect**: Close WebSocket connection
7. **Dispose**: Clean up resources

### Connection States

```typescript
// Check connection state
if (tts.isWebSocketConnected()) {
  console.log('Connected and ready to synthesize');
}

// Safe reconnection
if (!tts.isWebSocketConnected()) {
  await tts.connect();
}
```

## Integration with CompositeVoice

The Deepgram TTS provider can be used as a standalone TTS provider in the CompositeVoice SDK:

```typescript
import { CompositeVoice } from '@lukeocodes/composite-voice';
import { DeepgramSTT } from '@lukeocodes/composite-voice/providers/stt/deepgram';
import { OpenAILLM } from '@lukeocodes/composite-voice/providers/llm/openai';
import { DeepgramTTS } from '@lukeocodes/composite-voice/providers/tts/deepgram';

const agent = new CompositeVoice({
  sttProvider: new DeepgramSTT({
    apiKey: 'deepgram-stt-key',
    language: 'en-US',
  }),
  llmProvider: new OpenAILLM({
    apiKey: 'openai-key',
    model: 'gpt-4',
  }),
  ttsProvider: new DeepgramTTS({
    apiKey: 'deepgram-tts-key',
    voice: 'aura-asteria-en',
    sampleRate: 24000,
  }),
});

await agent.initialize();
await agent.start();
```

## Performance Considerations

### Latency Optimization

- **Use appropriate sample rates**: Lower sample rates (16000) reduce latency
- **Stream text incrementally**: Send text as it's generated for faster response
- **Minimize chunk size**: Smaller text chunks result in faster audio generation

### Quality Optimization

- **Higher sample rates**: Use 24000 or 48000 Hz for better audio quality
- **Choose appropriate voices**: Different voices have different characteristics
- **Container format**: Use 'none' for streaming, 'wav' for complete files

### Network Considerations

- **Connection stability**: WebSocket requires stable network connection
- **Timeout configuration**: Adjust timeout based on network conditions
- **Reconnection logic**: Implement retry logic for production applications

## API Reference

### Methods

#### `initialize(): Promise<void>`

Initialize the provider and load the Deepgram SDK.

#### `connect(): Promise<void>`

Establish WebSocket connection for streaming synthesis.

#### `sendText(text: string): void`

Send text chunk for immediate synthesis.

#### `finalize(): Promise<void>`

Flush any remaining audio and complete synthesis.

#### `disconnect(): Promise<void>`

Close WebSocket connection.

#### `dispose(): Promise<void>`

Clean up all resources.

#### `onAudio(callback: (chunk: AudioChunk) => void): void`

Register callback for audio chunks.

#### `onMetadata(callback: (metadata: AudioMetadata) => void): void`

Register callback for audio metadata.

#### `isWebSocketConnected(): boolean`

Check if WebSocket is currently connected.

#### `isReady(): boolean`

Check if provider is initialized and ready.

#### `getConfig(): DeepgramTTSConfig`

Get current provider configuration.

## Troubleshooting

### SDK Not Found

**Error**: `Cannot find module '@deepgram/sdk'`

**Solution**: Install the peer dependency:

```bash
npm install @deepgram/sdk
```

### Connection Timeout

**Error**: `Connection timeout`

**Solution**:

- Check network connectivity
- Verify API key is valid
- Increase timeout in configuration
- Check Deepgram service status

### No Audio Output

**Symptoms**: Connected but no audio chunks received

**Solutions**:

- Verify audio callback is registered before sending text
- Check that text is being sent correctly
- Ensure proper encoding/sample rate configuration
- Check for errors in console logs

### Audio Quality Issues

**Solutions**:

- Increase sample rate (24000 or 48000)
- Try different voice models
- Verify audio playback implementation
- Check network bandwidth

## Best Practices

1. **Always initialize before connecting**: Call `initialize()` before `connect()`
2. **Register callbacks early**: Set up audio and metadata callbacks before connecting
3. **Handle errors gracefully**: Wrap operations in try-catch blocks
4. **Clean up resources**: Always call `disconnect()` and `dispose()` when done
5. **Stream progressively**: Send text as it's available for lower latency
6. **Use appropriate sample rates**: Balance quality and latency based on use case
7. **Implement reconnection logic**: Handle connection drops in production
8. **Monitor chunk sizes**: Ensure audio chunks are being processed efficiently

## Examples

See the [Examples documentation](./Examples.md) for complete integration examples, including:

- Standalone TTS usage
- Integration with STT and LLM providers
- Real-time conversational AI
- Error handling patterns
- Audio playback implementation

## Resources

- [Deepgram TTS Documentation](https://developers.deepgram.com/docs/tts)
- [Deepgram JavaScript SDK](https://github.com/deepgram/deepgram-js-sdk)
- [Voice Models Guide](https://developers.deepgram.com/docs/tts-models)
- [API Reference](https://developers.deepgram.com/reference/text-to-speech-api)
