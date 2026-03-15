/**
 * Mock provider implementations for testing
 */

import type {
  RestSTTProvider,
  LLMProvider,
  RestTTSProvider,
  LiveSTTProvider,
  STTProviderConfig,
  LLMProviderConfig,
  TTSProviderConfig,
  TranscriptionResult,
  BaseProvider,
  AudioInputProvider,
  AudioOutputProvider,
} from '../../src/core/types/providers';
import type { ProviderRole } from '../../src/core/types/roles';
import type { AudioChunk, AudioMetadata } from '../../src/core/types/audio';

/**
 * Mock STT Provider
 */
export class MockSTTProvider implements RestSTTProvider {
  type = 'rest' as const;
  roles: readonly ProviderRole[] = ['stt'];
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

  async transcribe(_audio: Blob): Promise<void> {
    // Results delivered via onTranscription callback
  }

  processAudio(_chunk: ArrayBuffer): void {
    // No-op for REST STT
  }

  onTranscription(callback: (result: TranscriptionResult) => void) {
    this.transcriptionCallback = callback;
  }

  // Guard methods
  isUtteranceComplete(result: TranscriptionResult): boolean {
    return result.isFinal === true;
  }

  isPreflight(_result: TranscriptionResult): boolean {
    return false;
  }

  isInterim(result: TranscriptionResult): boolean {
    return !result.isFinal;
  }

  isFinal(result: TranscriptionResult): boolean {
    return result.isFinal === true;
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
  roles: readonly ProviderRole[] = ['llm'];
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

  async processText(prompt: string) {
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

  async generate(prompt: string) {
    return this.processText(prompt);
  }

  async processMessages() {
    return this.processText('test');
  }

  async generateFromMessages() {
    return this.processMessages();
  }

  isToolCall(_chunk: unknown): boolean {
    return false;
  }
}

/**
 * Mock TTS Provider
 */
export class MockTTSProvider implements RestTTSProvider {
  type = 'rest' as const;
  roles: readonly ProviderRole[] = ['tts'];
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

  processChunk(_text: string): void {
    // Accumulate text for synthesis
  }

  async finalize(): Promise<void> {
    // Flush remaining audio
  }

  isAudioReady(chunk: AudioChunk): boolean {
    return chunk.data.byteLength > 0;
  }

  async synthesize(_text: string): Promise<Blob> {
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
 *
 * @remarks
 * Combines STT + LLM + TTS capabilities in a single provider with WebSocket transport.
 * Uses roles to declare all covered pipeline stages.
 */
export class MockAllInOneProvider implements BaseProvider {
  type = 'websocket' as const;
  roles: readonly ProviderRole[] = ['stt', 'llm', 'tts'];
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

  processAudio(_chunk: ArrayBuffer) {
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
 * Mock Input Provider implementing AudioInputProvider.
 *
 * @remarks
 * Simulates an audio input source for integration testing. Chunks are
 * delivered to the registered `onAudio` callback when {@link pushChunk}
 * is called (manual push mode). The provider tracks start/stop/pause/resume
 * lifecycle calls.
 */
export class MockInputProvider implements AudioInputProvider {
  type = 'rest' as const;
  roles: readonly ProviderRole[] = ['input'];
  private ready = false;
  private active = false;
  private paused = false;
  private audioCallback?: (chunk: AudioChunk) => void;
  private sequenceCounter = 0;
  private readonly metadata: AudioMetadata;

  /** Track lifecycle calls for assertions. */
  public startCalled = false;
  public stopCalled = false;
  public pauseCalled = false;
  public resumeCalled = false;

  constructor(metadata?: Partial<AudioMetadata>) {
    this.metadata = {
      sampleRate: metadata?.sampleRate ?? 16000,
      encoding: metadata?.encoding ?? 'linear16',
      channels: metadata?.channels ?? 1,
      bitDepth: metadata?.bitDepth ?? 16,
    };
  }

  async initialize() {
    this.ready = true;
  }

  async dispose() {
    this.ready = false;
    this.active = false;
  }

  isReady() {
    return this.ready;
  }

  start() {
    this.active = true;
    this.paused = false;
    this.startCalled = true;
  }

  stop() {
    this.active = false;
    this.stopCalled = true;
  }

  pause() {
    this.paused = true;
    this.pauseCalled = true;
  }

  resume() {
    this.paused = false;
    this.resumeCalled = true;
  }

  isActive() {
    return this.active && !this.paused;
  }

  onAudio(callback: (chunk: AudioChunk) => void) {
    this.audioCallback = callback;
  }

  getMetadata(): AudioMetadata {
    return { ...this.metadata };
  }

  // ─── Test helpers ────────────────────────────────────────────────────

  /** Push a single chunk to the registered callback. */
  pushChunk(data?: ArrayBuffer): AudioChunk {
    const chunk: AudioChunk = {
      data: data ?? new Uint8Array([this.sequenceCounter & 0xff]).buffer,
      timestamp: Date.now(),
      sequence: this.sequenceCounter++,
    };
    if (this.audioCallback && this.active && !this.paused) {
      this.audioCallback(chunk);
    }
    return chunk;
  }

  /** Push N chunks in sequence and return them. */
  pushChunks(count: number): AudioChunk[] {
    const chunks: AudioChunk[] = [];
    for (let i = 0; i < count; i++) {
      chunks.push(this.pushChunk());
    }
    return chunks;
  }
}

/**
 * Mock Output Provider implementing AudioOutputProvider.
 *
 * @remarks
 * Records all enqueued chunks and lifecycle calls for assertion in tests.
 */
export class MockOutputProvider implements AudioOutputProvider {
  type = 'rest' as const;
  roles: readonly ProviderRole[] = ['output'];
  private ready = false;
  private playing = false;
  private playbackStartCallback?: () => void;
  private playbackEndCallback?: () => void;
  private playbackErrorCallback?: (error: Error) => void;

  /** Chunks enqueued into this output. */
  public enqueuedChunks: AudioChunk[] = [];
  /** Metadata passed to configure(). */
  public configuredMetadata?: AudioMetadata;
  /** Track lifecycle calls for assertions. */
  public flushCalled = false;
  public stopCalled = false;
  public pauseCalled = false;
  public resumeCalled = false;

  async initialize() {
    this.ready = true;
  }

  async dispose() {
    this.ready = false;
  }

  isReady() {
    return this.ready;
  }

  configure(metadata: AudioMetadata) {
    this.configuredMetadata = metadata;
  }

  enqueue(chunk: AudioChunk) {
    this.enqueuedChunks.push(chunk);
  }

  async flush() {
    this.flushCalled = true;
  }

  stop() {
    this.playing = false;
    this.stopCalled = true;
  }

  pause() {
    this.pauseCalled = true;
  }

  resume() {
    this.resumeCalled = true;
  }

  isPlaying() {
    return this.playing;
  }

  onPlaybackStart(callback: () => void) {
    this.playbackStartCallback = callback;
  }

  onPlaybackEnd(callback: () => void) {
    this.playbackEndCallback = callback;
  }

  onPlaybackError(callback: (error: Error) => void) {
    this.playbackErrorCallback = callback;
  }

  // ─── Test helpers ────────────────────────────────────────────────────

  /** Simulate playback start. */
  emitPlaybackStart() {
    this.playing = true;
    this.playbackStartCallback?.();
  }

  /** Simulate playback end. */
  emitPlaybackEnd() {
    this.playing = false;
    this.playbackEndCallback?.();
  }

  /** Simulate playback error. */
  emitPlaybackError(error: Error) {
    this.playbackErrorCallback?.(error);
  }
}

/**
 * Mock Live STT Provider implementing LiveSTTProvider.
 *
 * @remarks
 * Simulates a WebSocket-based STT provider with a configurable connection
 * delay. Records all audio data sent via `processAudio()` for assertion.
 */
export class MockLiveSTTProvider implements LiveSTTProvider {
  type = 'websocket' as const;
  roles: readonly ProviderRole[] = ['stt'];
  config: STTProviderConfig = { model: 'mock-live' };
  private ready = false;
  private connected = false;
  private transcriptionCallback?: (result: TranscriptionResult) => void;

  /** Audio buffers received via processAudio()/sendAudio(). */
  public receivedAudio: ArrayBuffer[] = [];

  /** Configurable delay in ms for connect(). */
  public connectDelayMs: number;

  constructor(connectDelayMs = 0) {
    this.connectDelayMs = connectDelayMs;
  }

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
    if (this.connectDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.connectDelayMs));
    }
    this.connected = true;
  }

  sendAudio(chunk: ArrayBuffer) {
    if (!this.connected) {
      throw new Error('MockLiveSTTProvider: not connected');
    }
    this.receivedAudio.push(chunk);
  }

  processAudio(chunk: ArrayBuffer) {
    this.sendAudio(chunk);
  }

  async disconnect() {
    this.connected = false;
  }

  onTranscription(callback: (result: TranscriptionResult) => void) {
    this.transcriptionCallback = callback;
  }

  // ─── Guard methods ─────────────────────────────────────────────────

  isUtteranceComplete(result: TranscriptionResult): boolean {
    return result.isFinal === true;
  }

  isPreflight(_result: TranscriptionResult): boolean {
    return false;
  }

  isInterim(result: TranscriptionResult): boolean {
    return !result.isFinal;
  }

  isFinal(result: TranscriptionResult): boolean {
    return result.isFinal === true;
  }

  // ─── Test helpers ────────────────────────────────────────────────────

  isConnected() {
    return this.connected;
  }

  emitTranscription(text: string, isFinal = true) {
    this.transcriptionCallback?.({
      text,
      isFinal,
      confidence: 0.95,
    });
  }
}

/**
 * Failing provider for error testing
 */
export class FailingProvider implements LLMProvider {
  type = 'rest' as const;
  roles: readonly ProviderRole[] = ['llm'];
  config: LLMProviderConfig = { model: 'fail' };

  async initialize() {
    throw new Error('Initialization failed');
  }

  async dispose() {}

  isReady() {
    return false;
  }

  async processText(): Promise<AsyncIterable<string>> {
    throw new Error('Generation failed');
  }

  async generate(): Promise<AsyncIterable<string>> {
    return this.processText();
  }

  async processMessages(): Promise<AsyncIterable<string>> {
    return this.processText();
  }

  async generateFromMessages(): Promise<AsyncIterable<string>> {
    return this.processText();
  }

  isToolCall(_chunk: unknown): boolean {
    return false;
  }
}
