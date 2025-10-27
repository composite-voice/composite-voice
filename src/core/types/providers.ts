/**
 * Provider interface definitions
 */

import type { AudioChunk, AudioMetadata } from './audio';

/**
 * Communication type for providers
 */
export type ProviderType = 'rest' | 'websocket';

/**
 * Base configuration for all providers
 */
export interface BaseProviderConfig {
  /** API key or authentication token */
  apiKey?: string;
  /** Custom endpoint URL */
  endpoint?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Request timeout in milliseconds */
  timeout?: number;
}

/**
 * Base interface that all providers must implement
 */
export interface BaseProvider {
  /** Type of communication this provider uses */
  readonly type: ProviderType;

  /** Initialize the provider */
  initialize(): Promise<void>;

  /** Clean up resources and dispose of the provider */
  dispose(): Promise<void>;

  /** Check if provider is initialized and ready */
  isReady(): boolean;
}

/**
 * Transcription result from STT providers
 */
export interface TranscriptionResult {
  /** Transcribed text */
  text: string;
  /** Whether this is a final transcription or interim */
  isFinal: boolean;
  /** Confidence score (0-1) if available */
  confidence?: number;
  /** Additional metadata from the provider */
  metadata?: Record<string, unknown>;
}

/**
 * STT Provider configuration
 */
export interface STTProviderConfig extends BaseProviderConfig {
  /** Language code (e.g., 'en-US', 'es-ES') */
  language?: string;
  /** Model to use for transcription */
  model?: string;
  /** Enable interim results (for WebSocket providers) */
  interimResults?: boolean;
  /** Enable punctuation */
  punctuation?: boolean;
  /** Custom vocabulary or phrases to boost recognition */
  keywords?: string[];
}

/**
 * REST STT Provider interface
 * Transcribes complete audio files
 */
export interface RestSTTProvider extends BaseProvider {
  /** Configuration for this provider */
  config: STTProviderConfig;

  /**
   * Transcribe complete audio file
   * Results are sent via onTranscription callback (same as Live providers)
   * @param audio Audio blob to transcribe
   */
  transcribe(audio: Blob): Promise<void>;

  /**
   * Register callback for transcription results
   * Provider sends text TO CompositeVoice via this callback
   * @param callback Function to call with transcription results
   */
  onTranscription(callback: (result: TranscriptionResult) => void): void;
}

/**
 * Live STT Provider interface
 * Transcribes streaming audio in real-time
 */
export interface LiveSTTProvider extends BaseProvider {
  /** Configuration for this provider */
  config: STTProviderConfig;

  /**
   * Connect to streaming service
   */
  connect(): Promise<void>;

  /**
   * Send audio chunk for transcription
   * CompositeVoice sends audio TO provider
   * @param chunk Audio data chunk
   */
  sendAudio(chunk: ArrayBuffer): void;

  /**
   * Disconnect from streaming service
   */
  disconnect(): Promise<void>;

  /**
   * Register callback for transcription results
   * Provider sends text TO CompositeVoice
   * @param callback Function to call with transcription results
   */
  onTranscription(callback: (result: TranscriptionResult) => void): void;
}

/**
 * STT Provider (union type for backward compatibility)
 */
export type STTProvider = RestSTTProvider | LiveSTTProvider;

/**
 * LLM Provider configuration
 */
export interface LLMProviderConfig extends BaseProviderConfig {
  /** Model to use (e.g., 'gpt-4', 'claude-3-opus') */
  model: string;
  /** Temperature for generation (0-2) */
  temperature?: number;
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Top P sampling */
  topP?: number;
  /** System prompt */
  systemPrompt?: string;
  /** Whether to stream responses */
  stream?: boolean;
  /** Stop sequences */
  stopSequences?: string[];
}

/**
 * LLM message format
 */
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * LLM generation options
 */
export interface LLMGenerationOptions {
  /** Override temperature */
  temperature?: number;
  /** Override max tokens */
  maxTokens?: number;
  /** Override stop sequences */
  stopSequences?: string[];
  /** Additional provider-specific options */
  extra?: Record<string, unknown>;
}

/**
 * LLM Provider interface
 */
export interface LLMProvider extends BaseProvider {
  /** Configuration for this provider */
  config: LLMProviderConfig;

  /**
   * Generate a response from a prompt
   * @param prompt User prompt text
   * @param options Generation options
   * @returns Async iterable of text chunks (streams if enabled) or single response
   */
  generate(prompt: string, options?: LLMGenerationOptions): Promise<AsyncIterable<string>>;

  /**
   * Generate a response from a conversation
   * @param messages Array of conversation messages
   * @param options Generation options
   * @returns Async iterable of text chunks (streams if enabled) or single response
   */
  generateFromMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>>;
}

/**
 * TTS Provider configuration
 */
export interface TTSProviderConfig extends BaseProviderConfig {
  /** Voice ID or name */
  voice?: string;
  /** Model to use for synthesis */
  model?: string;
  /** Speech rate (0.25 - 4.0, where 1.0 is normal) */
  rate?: number;
  /** Pitch adjustment (-20 to 20 semitones) */
  pitch?: number;
  /** Output audio format */
  outputFormat?: string;
  /** Sample rate for output audio */
  sampleRate?: number;
}

/**
 * REST TTS Provider interface
 * Synthesizes complete text to audio
 */
export interface RestTTSProvider extends BaseProvider {
  /** Configuration for this provider */
  config: TTSProviderConfig;

  /**
   * Synthesize complete text to audio
   * @param text Text to synthesize
   * @returns Audio blob
   */
  synthesize(text: string): Promise<Blob>;
}

/**
 * Live TTS Provider interface
 * Synthesizes streaming text to audio in real-time
 */
export interface LiveTTSProvider extends BaseProvider {
  /** Configuration for this provider */
  config: TTSProviderConfig;

  /**
   * Connect to streaming service
   */
  connect(): Promise<void>;

  /**
   * Send text chunk for synthesis
   * CompositeVoice sends text TO provider
   * @param chunk Text to synthesize
   */
  sendText(chunk: string): void;

  /**
   * Finalize synthesis and process remaining text
   */
  finalize(): Promise<void>;

  /**
   * Disconnect from streaming service
   */
  disconnect(): Promise<void>;

  /**
   * Register callback for audio chunks
   * Provider sends audio TO CompositeVoice
   * @param callback Function to call with audio chunks
   */
  onAudio(callback: (chunk: AudioChunk) => void): void;

  /**
   * Register callback for audio metadata (optional)
   * Metadata helps AudioPlayer configure playback (sample rate, channels, etc.)
   * Providers may emit this once at the start or not at all
   * This method is always available, but providers are not required to emit metadata
   * @param callback Function to call with audio metadata
   */
  onMetadata(callback: (metadata: AudioMetadata) => void): void;
}

/**
 * TTS Provider (union type for backward compatibility)
 */
export type TTSProvider = RestTTSProvider | LiveTTSProvider;
