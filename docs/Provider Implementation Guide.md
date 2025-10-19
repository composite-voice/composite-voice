# Provider Implementation Guide

This guide shows you how to create custom providers for CompositeVoice.

## Overview

CompositeVoice supports four types of providers:

1. **STT Providers**: Speech-to-Text
2. **LLM Providers**: Large Language Models
3. **TTS Providers**: Text-to-Speech
4. **All-in-One Providers**: Complete voice agent pipeline

Each provider type has a base class you can extend with your custom implementation.

## Creating a Custom STT Provider

### Basic Structure

```typescript
import { BaseSTTProvider } from '@lukeocodes/composite-voice';
import type { STTProviderConfig, TranscriptionResult } from '@lukeocodes/composite-voice';

export interface MySTTConfig extends STTProviderConfig {
  // Add custom config options
  customOption?: string;
}

export class MySTTProvider extends BaseSTTProvider {
  declare public config: MySTTConfig;

  constructor(config: MySTTConfig, logger?: Logger) {
    super(config, logger);
    // Set type based on your implementation
    this.type = 'websocket'; // or 'rest'
  }

  protected async onInitialize(): Promise<void> {
    // Initialize your provider
    // Set up connections, validate API keys, etc.
  }

  protected async onDispose(): Promise<void> {
    // Clean up resources
    // Close connections, cancel ongoing requests, etc.
  }
}
```

### REST STT Provider

For REST-based STT providers, implement the `transcribe` method:

```typescript
export class MyRESTSTT extends BaseSTTProvider {
  constructor(config: MySTTConfig) {
    super(config);
    this.type = 'rest';
  }

  async transcribe(audio: Blob): Promise<string> {
    // Send audio to your API
    const formData = new FormData();
    formData.append('audio', audio);

    const response = await fetch('https://api.example.com/transcribe', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: formData,
    });

    const result = await response.json();
    return result.text;
  }
}
```

### WebSocket STT Provider

For WebSocket-based STT providers, implement `connect`, `sendAudio`, and `disconnect`:

```typescript
import { WebSocketManager } from '@lukeocodes/composite-voice';

export class MyWebSocketSTT extends BaseSTTProvider {
  private ws: WebSocketManager | null = null;

  constructor(config: MySTTConfig) {
    super(config);
    this.type = 'websocket';
  }

  async connect(): Promise<void> {
    this.assertReady();

    this.ws = new WebSocketManager({
      url: `wss://api.example.com/stream?key=${this.config.apiKey}`,
      logger: this.logger,
    });

    this.ws.setHandlers({
      onMessage: (event) => this.handleMessage(event),
      onError: (error) => this.logger.error('WebSocket error', error),
      onClose: () => this.logger.info('WebSocket closed'),
    });

    await this.ws.connect();
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.ws?.isConnected()) {
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    this.ws.send(chunk);
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      await this.ws.disconnect();
      this.ws = null;
    }
  }

  private handleMessage(event: MessageEvent): void {
    const data = JSON.parse(event.data);

    const result: TranscriptionResult = {
      text: data.transcript,
      isFinal: data.is_final,
      confidence: data.confidence,
    };

    // Emit to SDK
    this.emitTranscription(result);
  }
}
```

## Creating a Custom LLM Provider

```typescript
import { BaseLLMProvider } from '@lukeocodes/composite-voice';
import type {
  LLMProviderConfig,
  LLMGenerationOptions,
  LLMMessage,
} from '@lukeocodes/composite-voice';

export class MyLLMProvider extends BaseLLMProvider {
  async generate(prompt: string, options?: LLMGenerationOptions): Promise<AsyncIterable<string>> {
    const messages = this.promptToMessages(prompt);
    return this.generateFromMessages(messages, options);
  }

  async generateFromMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    this.assertReady();
    const mergedOptions = this.mergeOptions(options);

    // For streaming responses
    return {
      async *[Symbol.asyncIterator]() {
        const response = await fetch('https://api.example.com/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify({
            messages,
            model: this.config.model,
            temperature: mergedOptions.temperature,
            max_tokens: mergedOptions.maxTokens,
            stream: true,
          }),
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE or your API format
          const lines = chunk.split('\n').filter((line) => line.trim());

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                yield data.text;
              }
            }
          }
        }
      },
    };
  }
}
```

## Creating a Custom TTS Provider

### REST TTS Provider

```typescript
import { BaseTTSProvider } from '@lukeocodes/composite-voice';

export class MyTTSProvider extends BaseTTSProvider {
  constructor(config: TTSProviderConfig) {
    super(config);
    this.type = 'rest';
  }

  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    const response = await fetch('https://api.example.com/synthesize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        text,
        voice: this.config.voice,
        rate: this.config.rate,
      }),
    });

    return await response.blob();
  }
}
```

### WebSocket TTS Provider

```typescript
import { WebSocketManager } from '@lukeocodes/composite-voice';
import type { AudioChunk, AudioMetadata } from '@lukeocodes/composite-voice';

export class MyWebSocketTTS extends BaseTTSProvider {
  private ws: WebSocketManager | null = null;

  constructor(config: TTSProviderConfig) {
    super(config);
    this.type = 'websocket';
  }

  async connect(): Promise<void> {
    this.assertReady();

    this.ws = new WebSocketManager({
      url: `wss://api.example.com/tts?key=${this.config.apiKey}`,
      logger: this.logger,
    });

    this.ws.setHandlers({
      onMessage: (event) => this.handleMessage(event),
    });

    await this.ws.connect();

    // Send initial configuration
    this.ws.send(
      JSON.stringify({
        type: 'config',
        voice: this.config.voice,
        sampleRate: this.config.sampleRate,
      })
    );
  }

  sendText(chunk: string): void {
    if (!this.ws?.isConnected()) {
      this.logger.warn('Cannot send text: not connected');
      return;
    }

    this.ws.send(
      JSON.stringify({
        type: 'text',
        text: chunk,
      })
    );
  }

  async finalize(): Promise<void> {
    if (this.ws?.isConnected()) {
      this.ws.send(JSON.stringify({ type: 'finalize' }));
    }
  }

  async disconnect(): Promise<void> {
    if (this.ws) {
      await this.ws.disconnect();
      this.ws = null;
    }
  }

  private handleMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      // Audio data
      const chunk: AudioChunk = {
        data: event.data,
        timestamp: Date.now(),
      };
      this.emitAudio(chunk);
    } else {
      // Metadata
      const data = JSON.parse(event.data);
      if (data.type === 'metadata') {
        const metadata: AudioMetadata = {
          sampleRate: data.sampleRate,
          encoding: data.encoding,
          channels: data.channels,
          mimeType: data.mimeType,
        };
        this.emitMetadata(metadata);
      }
    }
  }
}
```

## Best Practices

1. **Error Handling**: Always wrap API calls in try-catch blocks and emit appropriate error events
2. **Logging**: Use the provided logger for debugging and monitoring
3. **Resource Cleanup**: Always clean up resources (connections, timers, etc.) in `onDispose`
4. **State Management**: Use `assertReady()` to ensure the provider is initialized before operations
5. **Type Safety**: Leverage TypeScript's type system for provider configurations
6. **Testing**: Write unit tests for your provider implementations
7. **Documentation**: Document configuration options and behavior

## Testing Your Provider

```typescript
import { MySTTProvider } from './MySTTProvider';

describe('MySTTProvider', () => {
  let provider: MySTTProvider;

  beforeEach(() => {
    provider = new MySTTProvider({
      apiKey: 'test-key',
      model: 'test-model',
    });
  });

  afterEach(async () => {
    await provider.dispose();
  });

  it('should initialize successfully', async () => {
    await provider.initialize();
    expect(provider.isReady()).toBe(true);
  });

  it('should transcribe audio', async () => {
    await provider.initialize();

    const audioBlob = new Blob([new ArrayBuffer(1024)], {
      type: 'audio/wav',
    });

    const result = await provider.transcribe?.(audioBlob);
    expect(result).toBeDefined();
  });
});
```

## Publishing Your Provider

If you create a useful provider, consider publishing it as a separate package:

```
@your-org/composite-voice-provider-xyz
```

Make sure to:

1. List `@lukeocodes/composite-voice` as a peer dependency
2. Export your provider class
3. Include TypeScript definitions
4. Document configuration options
5. Provide usage examples

## Related Documentation

- **[Getting Started](./Getting%20Started.md)** - Learn the basics of CompositeVoice
- **[Architecture](./Architecture.md)** - Understand provider interfaces and design
- **[Testing](./Testing.md)** - Learn how to test your providers
- **[Examples](./Examples.md)** - See examples of providers in action

## Need Help?

- 🐛 [Report Issues](https://github.com/lukeocodes/composite-voice/issues)
- 💬 [Join Discussions](https://github.com/lukeocodes/composite-voice/discussions)
- 📖 [View Source](https://github.com/lukeocodes/composite-voice)
