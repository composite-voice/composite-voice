# Deepgram STT Provider

The Deepgram STT provider integrates Deepgram's speech-to-text API with CompositeVoice, offering real-time WebSocket transcription with industry-leading accuracy and speed.

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
import { DeepgramSTT } from '@lukeocodes/composite-voice/providers/stt';

const stt = new DeepgramSTT({
  apiKey: 'your-deepgram-api-key',
  language: 'en-US',
  interimResults: true,
  options: {
    model: 'nova-2',
    smartFormat: true,
    punctuation: true,
  },
});

// Initialize the provider
await stt.initialize();

// Set up transcription callback
stt.onTranscription((result) => {
  console.log(`[${result.isFinal ? 'FINAL' : 'INTERIM'}] ${result.text}`);
  console.log(`Confidence: ${result.confidence}`);
});

// Connect to Deepgram WebSocket
await stt.connect();

// Send audio chunks (e.g., from microphone)
stt.sendAudio(audioChunk); // audioChunk is ArrayBuffer

// When done
await stt.disconnect();
await stt.dispose();
```

## Configuration Options

### Required Options

- **`apiKey`** (string): Your Deepgram API key

### General Options

- **`language`** (string): Language code (e.g., `'en-US'`, `'es'`, `'fr'`). Default: `'en-US'`
- **`interimResults`** (boolean): Enable interim results. Default: `true`
- **`timeout`** (number): Connection timeout in milliseconds. Default: `10000`
- **`debug`** (boolean): Enable debug logging. Default: `false`

### Deepgram-Specific Options (`options` object)

#### Model Selection

- **`model`** (string): Deepgram model to use
  - `'nova-2'`: Latest and most accurate model (recommended)
  - `'nova'`: Previous generation model
  - `'enhanced'`: Enhanced model for better accuracy
  - `'base'`: Base model for speed
  - Default: `'nova-2'`

#### Formatting & Punctuation

- **`punctuation`** (boolean): Add punctuation to transcripts. Default: `true`
- **`smartFormat`** (boolean): Apply smart formatting (numbers, dates, etc.). Default: `true`
- **`profanityFilter`** (boolean): Filter profanity from transcripts. Default: `false`

#### Advanced Features

- **`diarize`** (boolean): Enable speaker diarization. Default: `false`
- **`utterances`** (boolean): Segment transcripts into utterances. Default: `false`
- **`alternatives`** (number): Number of alternative transcriptions to return. Default: `1`
- **`keywords`** (string[]): Custom keywords to boost recognition
- **`redact`** (string[]): Redact sensitive information. Options: `['pci', 'ssn', 'numbers']`

#### Audio Configuration

- **`encoding`** (string): Audio encoding format
  - `'linear16'`: Raw PCM 16-bit
  - `'opus'`: Opus codec
  - `'mulaw'`: μ-law encoding
  - `'alaw'`: A-law encoding
- **`sampleRate`** (number): Audio sample rate in Hz (e.g., `16000`, `48000`)
- **`channels`** (number): Number of audio channels. Default: `1`
- **`endpointing`** (boolean | number): Enable automatic endpointing. Can be boolean or milliseconds
- **`vadEvents`** (boolean): Enable Voice Activity Detection events. Default: `false`

## Advanced Usage

### Speaker Diarization

Identify different speakers in the audio:

```typescript
const stt = new DeepgramSTT({
  apiKey: 'your-api-key',
  mode: 'rest',
  options: {
    model: 'nova-2',
    diarize: true,
    utterances: true,
  },
});

await stt.initialize();
const transcript = await stt.transcribe(audioBlob);
```

### Custom Vocabulary

Boost recognition of specific terms:

```typescript
const stt = new DeepgramSTT({
  apiKey: 'your-api-key',
  options: {
    model: 'nova-2',
    keywords: ['CompositeVoice', 'Deepgram', 'WebSocket:2'], // :2 is boost intensity
  },
});
```

### Redacting Sensitive Information

Automatically redact PCI, SSN, or other sensitive data:

```typescript
const stt = new DeepgramSTT({
  apiKey: 'your-api-key',
  options: {
    model: 'nova-2',
    redact: ['pci', 'ssn', 'numbers'],
  },
});
```

### Voice Activity Detection

Get notified when speech starts and stops:

```typescript
const stt = new DeepgramSTT({
  apiKey: 'your-api-key',
  options: {
    model: 'nova-2',
    vadEvents: true,
  },
});

await stt.initialize();

stt.onTranscription((result) => {
  if (result.metadata?.event === 'speech_started') {
    console.log('🎤 Speech started');
  } else if (result.metadata?.event === 'utterance_end') {
    console.log('🔇 Utterance ended');
  } else if (result.text) {
    console.log(`📝 ${result.text}`);
  }
});

await stt.connect();
```

### Automatic Endpointing

Automatically detect when a speaker has finished:

```typescript
const stt = new DeepgramSTT({
  apiKey: 'your-api-key',
  options: {
    model: 'nova-2',
    endpointing: 500, // 500ms of silence ends utterance
  },
});
```

### Multiple Alternatives

Get multiple transcription alternatives:

```typescript
const stt = new DeepgramSTT({
  apiKey: 'your-api-key',
  options: {
    model: 'nova-2',
    alternatives: 3, // Get top 3 alternatives
  },
});
```

### Integration with CompositeVoice

```typescript
import { CompositeVoice } from '@lukeocodes/composite-voice';
import { DeepgramSTT } from '@lukeocodes/composite-voice/providers/stt';
import { OpenAILLM } from '@lukeocodes/composite-voice/providers/llm';
import { NativeTTS } from '@lukeocodes/composite-voice/providers/tts';

const agent = new CompositeVoice({
  stt: new DeepgramSTT({
    apiKey: process.env.DEEPGRAM_API_KEY!,
    options: {
      model: 'nova-2',
      smartFormat: true,
    },
  }),
  llm: new OpenAILLM({
    apiKey: process.env.OPENAI_API_KEY!,
    model: 'gpt-4',
  }),
  tts: new NativeTTS(),
});

await agent.initialize();
```

## Supported Languages

Deepgram supports 30+ languages. Some examples:

- **English**: `en`, `en-US`, `en-GB`, `en-AU`, `en-NZ`, `en-IN`
- **Spanish**: `es`, `es-419` (Latin America)
- **French**: `fr`, `fr-CA`
- **German**: `de`
- **Italian**: `it`
- **Portuguese**: `pt`, `pt-BR`
- **Dutch**: `nl`
- **Japanese**: `ja`
- **Korean**: `ko`
- **Chinese**: `zh`, `zh-CN`, `zh-TW`
- **Russian**: `ru`
- **Turkish**: `tr`
- **Swedish**: `sv`
- **Polish**: `pl`
- **Ukrainian**: `uk`
- **Hindi**: `hi`

> See [Deepgram's language documentation](https://developers.deepgram.com/docs/languages-overview) for the complete list.

## Models

### Nova-2 (Recommended)

Latest model with industry-leading accuracy and speed. Best for most use cases.

```typescript
options: {
  model: 'nova-2';
}
```

### Nova

Previous generation model, still highly accurate.

```typescript
options: {
  model: 'nova';
}
```

### Enhanced

Optimized for higher accuracy at the cost of some speed.

```typescript
options: {
  model: 'enhanced';
}
```

### Base

Optimized for speed with good accuracy.

```typescript
options: {
  model: 'base';
}
```

## Audio Format Requirements

The Deepgram WebSocket provider accepts:

- **Encoding**: Raw PCM, Opus, μ-law, or A-law
- **Sample Rate**: 8000-48000 Hz (16000 Hz recommended)
- **Bit Depth**: 16-bit (for PCM)
- **Channels**: 1 (mono) or 2 (stereo)

```typescript
const stt = new DeepgramSTT({
  apiKey: 'your-api-key',
  options: {
    encoding: 'linear16',
    sampleRate: 16000,
    channels: 1,
  },
});
```

## Error Handling

```typescript
import { ProviderInitializationError, ProviderConnectionError } from '@lukeocodes/composite-voice';

try {
  await stt.initialize();
} catch (error) {
  if (error instanceof ProviderInitializationError) {
    console.error('Failed to initialize Deepgram:', error.message);
  }
}

try {
  await stt.connect();
} catch (error) {
  if (error instanceof ProviderConnectionError) {
    console.error('Failed to connect to Deepgram:', error.message);
  }
}

// Handle transcription errors
stt.onTranscription((result) => {
  if (result.metadata?.error) {
    console.error('Transcription error:', result.metadata.error);
  } else {
    console.log(result.text);
  }
});
```

## Best Practices

### 1. Environment Variables

Store API keys securely:

```typescript
const stt = new DeepgramSTT({
  apiKey: process.env.DEEPGRAM_API_KEY!,
  mode: 'websocket',
});
```

### 2. Optimize for Your Use Case

**For conversational AI:**

```typescript
options: {
  model: 'nova-2';
  smartFormat: true;
  endpointing: 500;
}
```

**For transcription accuracy:**

```typescript
options: {
  model: 'nova-2';
  smartFormat: true;
  diarize: true;
  utterances: true;
  punctuation: true;
}
```

**For speed:**

```typescript
options: {
  model: 'base';
  punctuation: false;
}
```

### 3. Handle Interim Results

Interim results provide real-time feedback but should be replaced by final results:

```typescript
let currentTranscript = '';

stt.onTranscription((result) => {
  if (result.isFinal) {
    currentTranscript += result.text + ' ';
    console.log('Final:', currentTranscript);
  } else {
    console.log('Interim:', result.text);
  }
});
```

### 4. Proper Cleanup

Always clean up resources:

```typescript
try {
  // Use the provider
  await stt.connect();
  // ...
} finally {
  await stt.disconnect();
  await stt.dispose();
}
```

## Performance Tips

1. **Use Nova-2**: Latest model offers best accuracy/speed balance
2. **Enable Smart Formatting**: Improves readability with minimal overhead
3. **Set Appropriate Sample Rate**: 16kHz is sufficient for speech (saves bandwidth)
4. **Use Opus Encoding**: Better compression than raw PCM for WebSocket
5. **Enable Endpointing**: Reduces latency by detecting speech boundaries
6. **Batch REST Requests**: Process multiple files in parallel when possible

## Troubleshooting

### SDK Not Found Error

```
Error: Cannot find module '@deepgram/sdk'
```

**Solution:** Install the Deepgram SDK:

```bash
npm install @deepgram/sdk
```

### API Key Errors

```
Error: 401 Unauthorized
```

**Solution:** Verify your API key is correct. Get your key from [Deepgram Console](https://console.deepgram.com/).

### Connection Timeout

**Solution:** Increase the timeout value:

```typescript
const stt = new DeepgramSTT({
  apiKey: 'your-api-key',
  timeout: 30000, // 30 seconds
});
```

### No Transcription Results

**Possible causes:**

1. Incorrect audio format/encoding
2. Sample rate mismatch
3. Silent audio

**Solution:** Enable debug logging and check audio settings:

```typescript
const stt = new DeepgramSTT({
  apiKey: 'your-api-key',
  debug: true,
  options: {
    encoding: 'linear16',
    sampleRate: 16000,
  },
});
```

### WebSocket Disconnects

**Solution:** Implement reconnection logic:

```typescript
async function connectWithRetry(maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await stt.connect();
      return;
    } catch (error) {
      console.error(`Connection attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) throw error;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

## Pricing Considerations

Deepgram charges based on audio duration:

- **Nova-2**: Higher accuracy, slightly higher cost
- **Base/Enhanced**: Lower cost options
- **Diarization**: Additional cost
- **Features**: Most features included in base pricing

Check [Deepgram's pricing page](https://deepgram.com/pricing) for current rates.

## Related Documentation

- **[Getting Started](./Getting%20Started.md)** - Learn the basics of CompositeVoice
- **[Architecture](./Architecture.md)** - Understand the provider system
- **[Provider Implementation Guide](./Provider%20Implementation%20Guide.md)** - Create custom providers
- **[Examples](./Examples.md)** - See working examples
- **[Deepgram API Documentation](https://developers.deepgram.com/)** - Official Deepgram docs

## Example: Complete Voice Assistant

```typescript
import { CompositeVoice } from '@lukeocodes/composite-voice';
import { DeepgramSTT } from '@lukeocodes/composite-voice/providers/stt';
import { OpenAILLM } from '@lukeocodes/composite-voice/providers/llm';
import { NativeTTS } from '@lukeocodes/composite-voice/providers/tts';

// Create providers
const stt = new DeepgramSTT({
  apiKey: process.env.DEEPGRAM_API_KEY!,
  language: 'en-US',
  interimResults: true,
  options: {
    model: 'nova-2',
    smartFormat: true,
    endpointing: 500,
    vadEvents: true,
  },
});

const llm = new OpenAILLM({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4',
  systemPrompt: 'You are a helpful voice assistant. Keep responses concise.',
});

const tts = new NativeTTS();

// Create agent
const agent = new CompositeVoice({ stt, llm, tts });

// Initialize
await agent.initialize();

// Listen for events
agent.on('transcription', (result) => {
  console.log('User said:', result.text);
});

agent.on('llm:chunk', (chunk) => {
  process.stdout.write(chunk);
});

agent.on('audio:play', () => {
  console.log('Playing response...');
});

// Start the agent
await agent.start();

// Stop when done
// await agent.stop();
```

## Next Steps

- 📖 Check out the [Examples](./Examples.md) for more use cases
- 🔧 Read the [Provider Implementation Guide](./Provider%20Implementation%20Guide.md) to understand the architecture
- 🧪 Explore the [Testing](./Testing.md) documentation
- 🌐 Visit [Deepgram's docs](https://developers.deepgram.com/) for API details
