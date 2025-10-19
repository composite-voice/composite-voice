/**
 * Mock provider implementations for testing
 */

import type {
  STTProvider,
  LLMProvider,
  TTSProvider,
  AllInOneProvider,
  STTProviderConfig,
  LLMProviderConfig,
  TTSProviderConfig,
  AllInOneProviderConfig,
  TranscriptionResult,
} from '../../src/core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../src/core/types/audio';

/**
 * Mock STT Provider
 */
export class MockSTTProvider implements STTProvider {
  type = 'rest' as const;
  config: STTProviderConfig = { model: 'mock' };
  private ready = false;
  private transcriptionCallback?: (result: TranscriptionResult) => void;

  async initialize() {
    this.ready = true;
  }

  async dispose() {
    this.ready = false;
  }

  isReady() {
    return this.ready;
  }

  async transcribe(audio: Blob): Promise<string> {
    return 'Mock transcription';
  }

  onTranscription(callback: (result: TranscriptionResult) => void) {
    this.transcriptionCallback = callback;
  }

  // Test helper
  emitTranscription(text: string, isFinal = true) {
    if (this.transcriptionCallback) {
      this.transcriptionCallback({
        text,
        isFinal,
        confidence: 0.95,
      });
    }
  }
}

/**
 * Mock LLM Provider
 */
export class MockLLMProvider implements LLMProvider {
  type = 'rest' as const;
  config: LLMProviderConfig = { model: 'mock' };
  private ready = false;
  public generateCalled = false;
  public lastPrompt = '';

  async initialize() {
    this.ready = true;
  }

  async dispose() {
    this.ready = false;
  }

  isReady() {
    return this.ready;
  }

  async generate(prompt: string) {
    this.generateCalled = true;
    this.lastPrompt = prompt;

    const response = `Mock response to: ${prompt}`;

    return {
      async *[Symbol.asyncIterator]() {
        // Split into words to simulate streaming
        for (const word of response.split(' ')) {
          yield word + ' ';
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      },
    };
  }

  async generateFromMessages() {
    return this.generate('test');
  }
}

/**
 * Mock TTS Provider
 */
export class MockTTSProvider implements TTSProvider {
  type = 'rest' as const;
  config: TTSProviderConfig = { model: 'mock' };
  private ready = false;
  private audioCallback?: (chunk: AudioChunk) => void;
  private metadataCallback?: (metadata: AudioMetadata) => void;

  async initialize() {
    this.ready = true;
  }

  async dispose() {
    this.ready = false;
  }

  isReady() {
    return this.ready;
  }

  async synthesize(text: string): Promise<Blob> {
    // Create a simple audio blob
    const buffer = new ArrayBuffer(1024);
    return new Blob([buffer], { type: 'audio/wav' });
  }

  onAudio(callback: (chunk: AudioChunk) => void) {
    this.audioCallback = callback;
  }

  onMetadata(callback: (metadata: AudioMetadata) => void) {
    this.metadataCallback = callback;
  }

  // Test helpers
  emitAudio(data: ArrayBuffer) {
    if (this.audioCallback) {
      this.audioCallback({
        data,
        timestamp: Date.now(),
      });
    }
  }

  emitMetadata(metadata: AudioMetadata) {
    if (this.metadataCallback) {
      this.metadataCallback(metadata);
    }
  }
}

/**
 * Mock All-in-One Provider
 */
export class MockAllInOneProvider implements AllInOneProvider {
  type = 'websocket' as const;
  config: AllInOneProviderConfig = { model: 'mock' };
  private ready = false;
  private connected = false;
  private transcriptionCallback?: (result: TranscriptionResult) => void;
  private llmChunkCallback?: (text: string) => void;
  private audioCallback?: (chunk: AudioChunk) => void;
  private metadataCallback?: (metadata: AudioMetadata) => void;

  async initialize() {
    this.ready = true;
  }

  async dispose() {
    this.ready = false;
    this.connected = false;
  }

  isReady() {
    return this.ready;
  }

  async connect() {
    this.connected = true;
  }

  sendAudio(chunk: ArrayBuffer) {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    // Simulate processing
  }

  async disconnect() {
    this.connected = false;
  }

  onTranscription(callback: (result: TranscriptionResult) => void) {
    this.transcriptionCallback = callback;
  }

  onLLMChunk(callback: (text: string) => void) {
    this.llmChunkCallback = callback;
  }

  onAudio(callback: (chunk: AudioChunk) => void) {
    this.audioCallback = callback;
  }

  onMetadata(callback: (metadata: AudioMetadata) => void) {
    this.metadataCallback = callback;
  }

  // Test helpers
  emitTranscription(text: string, isFinal = true) {
    if (this.transcriptionCallback) {
      this.transcriptionCallback({
        text,
        isFinal,
        confidence: 0.95,
      });
    }
  }

  emitLLMChunk(text: string) {
    if (this.llmChunkCallback) {
      this.llmChunkCallback(text);
    }
  }

  emitAudio(data: ArrayBuffer) {
    if (this.audioCallback) {
      this.audioCallback({
        data,
        timestamp: Date.now(),
      });
    }
  }

  emitMetadata(metadata: AudioMetadata) {
    if (this.metadataCallback) {
      this.metadataCallback(metadata);
    }
  }

  isConnected() {
    return this.connected;
  }
}

/**
 * Failing provider for error testing
 */
export class FailingProvider implements LLMProvider {
  type = 'rest' as const;
  config: LLMProviderConfig = { model: 'fail' };

  async initialize() {
    throw new Error('Initialization failed');
  }

  async dispose() {}

  isReady() {
    return false;
  }

  async generate() {
    throw new Error('Generation failed');
  }

  async generateFromMessages() {
    return this.generate();
  }
}
