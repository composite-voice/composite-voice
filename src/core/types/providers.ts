/**
 * Provider interface definitions for the CompositeVoice SDK.
 *
 * @remarks
 * This module defines the contracts that all STT, LLM, and TTS providers must
 * implement to be used with the CompositeVoice pipeline. Each provider category
 * has a base configuration interface (extending {@link BaseProviderConfig}), a
 * base runtime interface (extending {@link BaseProvider}), and specialized
 * interfaces for REST vs. live/WebSocket communication patterns.
 *
 * To create a custom provider, implement the appropriate interface
 * ({@link RestSTTProvider} or {@link LiveSTTProvider} for STT,
 * {@link LLMProvider} for LLM, {@link RestTTSProvider} or
 * {@link LiveTTSProvider} for TTS) and pass it to {@link CompositeVoiceConfig}.
 *
 * @packageDocumentation
 */

import type { AudioChunk, AudioMetadata } from './audio';

/**
 * Communication type for providers.
 *
 * @remarks
 * Indicates whether a provider communicates via REST (HTTP request/response)
 * or WebSocket (persistent bidirectional connection). This affects how the SDK
 * manages the provider's lifecycle and data flow.
 *
 * - `'rest'` - Provider uses HTTP requests; each operation is a standalone call
 * - `'websocket'` - Provider uses a persistent WebSocket connection for streaming
 *
 * @see {@link BaseProvider} for where this type is used
 */
export type ProviderType = 'rest' | 'websocket';

/**
 * Base configuration shared by all provider types.
 *
 * @remarks
 * Provides common configuration fields that apply to any provider regardless
 * of its category (STT, LLM, TTS) or communication type (REST, WebSocket).
 * Specific provider configurations extend this interface with additional fields.
 *
 * @example
 * ```typescript
 * const config: BaseProviderConfig = {
 *   apiKey: 'your-api-key',
 *   endpoint: 'https://api.example.com/v1',
 *   debug: false,
 *   timeout: 30000,
 * };
 * ```
 *
 * @see {@link STTProviderConfig} for STT-specific configuration
 * @see {@link LLMProviderConfig} for LLM-specific configuration
 * @see {@link TTSProviderConfig} for TTS-specific configuration
 */
export interface BaseProviderConfig {
  /**
   * API key or authentication token for the provider.
   *
   * @remarks
   * For client-side usage, consider using a proxy server to keep API keys
   * secure. The SDK provides Express, Next.js, and Node adapters for this purpose.
   */
  apiKey?: string;

  /**
   * Custom endpoint URL to override the provider's default API endpoint.
   *
   * @remarks
   * Useful for self-hosted instances, proxy servers, or development environments.
   */
  endpoint?: string;

  /**
   * Whether to enable debug logging for this provider.
   *
   * @remarks
   * When `true`, the provider emits detailed internal logs. This is separate
   * from the SDK-level {@link LoggingConfig}.
   *
   * @defaultValue false
   */
  debug?: boolean;

  /**
   * Request timeout in milliseconds.
   *
   * @remarks
   * Applies to HTTP requests (REST providers) and connection establishment
   * (WebSocket providers). Set to `0` for no timeout.
   */
  timeout?: number;
}

/**
 * Base interface that all providers must implement.
 *
 * @remarks
 * Defines the lifecycle methods and metadata properties common to every provider.
 * All STT, LLM, and TTS provider interfaces extend this base. The SDK calls
 * {@link BaseProvider.initialize | initialize} during agent startup and
 * {@link BaseProvider.dispose | dispose} during shutdown.
 *
 * @example
 * ```typescript
 * class MyCustomProvider implements BaseProvider {
 *   readonly type: ProviderType = 'rest';
 *   readonly managedAudio = false;
 *   private ready = false;
 *
 *   async initialize(): Promise<void> {
 *     // Set up resources
 *     this.ready = true;
 *   }
 *
 *   async dispose(): Promise<void> {
 *     // Clean up resources
 *     this.ready = false;
 *   }
 *
 *   isReady(): boolean {
 *     return this.ready;
 *   }
 * }
 * ```
 *
 * @see {@link ProviderType} for communication type values
 * @see {@link RestSTTProvider} for a REST-based STT implementation contract
 * @see {@link LiveSTTProvider} for a WebSocket-based STT implementation contract
 * @see {@link LLMProvider} for the LLM implementation contract
 * @see {@link RestTTSProvider} for a REST-based TTS implementation contract
 * @see {@link LiveTTSProvider} for a WebSocket-based TTS implementation contract
 */
export interface BaseProvider {
  /**
   * The communication type this provider uses.
   *
   * @see {@link ProviderType}
   */
  readonly type: ProviderType;

  /**
   * Whether this provider manages its own audio pipeline.
   *
   * @remarks
   * When `true`, CompositeVoice will NOT set up AudioCapture (for STT) or
   * AudioPlayer (for TTS) -- the provider handles audio directly with the
   * device (e.g., NativeSTT uses the Web Speech API's `SpeechRecognition`,
   * NativeTTS uses `SpeechSynthesis`).
   *
   * @defaultValue false
   */
  readonly managedAudio: boolean;

  /**
   * Initialize the provider and allocate any required resources.
   *
   * @remarks
   * Called by CompositeVoice during agent startup. The provider should be
   * ready to process requests after this method resolves.
   *
   * @throws Error if initialization fails (e.g., invalid API key, network error)
   */
  initialize(): Promise<void>;

  /**
   * Clean up resources and dispose of the provider.
   *
   * @remarks
   * Called by CompositeVoice during agent shutdown. The provider should close
   * any open connections, clear buffers, and release resources.
   */
  dispose(): Promise<void>;

  /**
   * Check if the provider is initialized and ready to process requests.
   *
   * @returns `true` if the provider has been initialized and is operational
   */
  isReady(): boolean;
}

/**
 * Result of a speech-to-text transcription.
 *
 * @remarks
 * Represents a transcription result emitted by an STT provider. The result can be
 * interim (partial, still being refined) or final. For providers like Deepgram that
 * support multi-segment utterances, additional flags ({@link TranscriptionResult.speechFinal | speechFinal},
 * {@link TranscriptionResult.isPreflight | isPreflight}) indicate when the complete
 * utterance is finished and when speculative processing can begin.
 *
 * @example
 * ```typescript
 * sttProvider.onTranscription((result: TranscriptionResult) => {
 *   if (result.isPreflight) {
 *     console.log('Preflight:', result.text);
 *   } else if (result.speechFinal) {
 *     console.log('Final utterance:', result.text);
 *   } else if (result.isFinal) {
 *     console.log('Segment final:', result.text);
 *   } else {
 *     console.log('Interim:', result.text);
 *   }
 * });
 * ```
 *
 * @see {@link RestSTTProvider.onTranscription} for registering transcription callbacks
 * @see {@link LiveSTTProvider.onTranscription} for registering transcription callbacks
 * @see {@link TranscriptionFinalEvent} for the corresponding SDK event
 */
export interface TranscriptionResult {
  /** The transcribed text. */
  text: string;

  /**
   * Whether this is a final transcription segment or an interim (partial) result.
   *
   * @remarks
   * Interim results update as the user speaks and are replaced by subsequent
   * results. Final results represent a committed segment of the transcription.
   */
  isFinal: boolean;

  /**
   * Whether this result marks the end of a complete utterance.
   *
   * @remarks
   * For Deepgram: `true` when `speech_final=true` (the speaker has stopped talking).
   * For NativeSTT and other providers that emit one result per utterance: equals {@link TranscriptionResult.isFinal | isFinal}.
   *
   * CompositeVoice uses this (falling back to {@link TranscriptionResult.isFinal | isFinal}) to decide when to
   * trigger LLM processing. Multi-segment providers (Deepgram) may emit
   * several `isFinal: true` chunks for a single utterance -- only the last one
   * has `speechFinal: true`.
   */
  speechFinal?: boolean;

  /**
   * Whether this is a preflight/eager-end-of-turn signal.
   *
   * @remarks
   * DeepgramFlux (e.g., `flux-general-en`) can emit this before
   * `speech_final` to allow the next pipeline stage (LLM) to start
   * generating speculatively. The text may still change slightly when the
   * confirmed `speech_final` arrives.
   *
   * @see {@link EagerLLMConfig} for enabling speculative generation
   * @see {@link TranscriptionPreflightEvent} for the corresponding SDK event
   */
  isPreflight?: boolean;

  /**
   * Confidence score for the transcription, from 0 (lowest) to 1 (highest).
   *
   * @remarks
   * Not all providers supply confidence scores. When unavailable, this is `undefined`.
   */
  confidence?: number;

  /**
   * Additional provider-specific metadata.
   *
   * @remarks
   * May contain information such as word-level timestamps, speaker diarization
   * data, or other provider-specific fields.
   */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for speech-to-text providers.
 *
 * @remarks
 * Extends {@link BaseProviderConfig} with STT-specific options for language,
 * model selection, interim results, punctuation, and keyword boosting.
 *
 * @example
 * ```typescript
 * const sttConfig: STTProviderConfig = {
 *   apiKey: 'your-api-key',
 *   language: 'en-US',
 *   model: 'nova-3',
 *   interimResults: true,
 *   punctuation: true,
 *   keywords: ['CompositeVoice', 'Deepgram'],
 * };
 * ```
 *
 * @see {@link BaseProviderConfig} for inherited fields
 * @see {@link RestSTTProvider} for REST-based STT providers
 * @see {@link LiveSTTProvider} for WebSocket-based STT providers
 */
export interface STTProviderConfig extends BaseProviderConfig {
  /**
   * Language code for transcription.
   *
   * @remarks
   * Uses BCP 47 language tags (e.g., `'en-US'`, `'es-ES'`, `'fr-FR'`).
   * The supported languages depend on the provider and model.
   */
  language?: string;

  /**
   * Model to use for transcription.
   *
   * @remarks
   * Provider-specific model identifier (e.g., `'nova-3'` for Deepgram).
   */
  model?: string;

  /**
   * Whether to enable interim (partial) transcription results.
   *
   * @remarks
   * When `true`, the provider emits results as the user speaks, before the
   * utterance is complete. Only applicable to live/WebSocket providers.
   */
  interimResults?: boolean;

  /**
   * Whether to enable automatic punctuation in transcription results.
   */
  punctuation?: boolean;

  /**
   * Custom vocabulary or keyword phrases to boost recognition accuracy.
   *
   * @remarks
   * Useful for domain-specific terminology, product names, or proper nouns
   * that the model might not recognize well by default.
   */
  keywords?: string[];
}

/**
 * REST-based speech-to-text provider interface.
 *
 * @remarks
 * Implements file-based transcription where complete audio blobs are sent in a
 * single request. Results are delivered asynchronously via the
 * {@link RestSTTProvider.onTranscription | onTranscription} callback, matching the same
 * pattern used by live providers for a consistent API.
 *
 * @example
 * ```typescript
 * class MyRestSTT implements RestSTTProvider {
 *   readonly type = 'rest';
 *   readonly managedAudio = false;
 *   config: STTProviderConfig;
 *
 *   constructor(config: STTProviderConfig) {
 *     this.config = config;
 *   }
 *
 *   async initialize() { /* ... *\/ }
 *   async dispose() { /* ... *\/ }
 *   isReady() { return true; }
 *
 *   async transcribe(audio: Blob) {
 *     const result = await callMyAPI(audio);
 *     this.callback?.({ text: result, isFinal: true });
 *   }
 *
 *   onTranscription(callback: (result: TranscriptionResult) => void) {
 *     this.callback = callback;
 *   }
 * }
 * ```
 *
 * @see {@link BaseProvider} for lifecycle methods
 * @see {@link LiveSTTProvider} for the streaming alternative
 * @see {@link TranscriptionResult} for the result type
 */
export interface RestSTTProvider extends BaseProvider {
  /**
   * Configuration for this STT provider.
   *
   * @see {@link STTProviderConfig}
   */
  config: STTProviderConfig;

  /**
   * Transcribe a complete audio blob.
   *
   * @remarks
   * Results are delivered asynchronously via the callback registered with
   * {@link RestSTTProvider.onTranscription | onTranscription}, not via the return value.
   *
   * @param audio - Audio data as a Blob to transcribe
   *
   * @throws Error if the provider is not initialized or the API request fails
   */
  transcribe(audio: Blob): Promise<void>;

  /**
   * Register a callback for transcription results.
   *
   * @remarks
   * The provider calls this callback with transcription results as they become
   * available. Must be called before {@link RestSTTProvider.transcribe | transcribe}.
   *
   * @param callback - Function invoked with each {@link TranscriptionResult}
   */
  onTranscription(callback: (result: TranscriptionResult) => void): void;
}

/**
 * Live (WebSocket-based) speech-to-text provider interface.
 *
 * @remarks
 * Implements real-time streaming transcription over a persistent connection.
 * Audio chunks are sent incrementally via {@link LiveSTTProvider.sendAudio | sendAudio},
 * and transcription results arrive asynchronously via the
 * {@link LiveSTTProvider.onTranscription | onTranscription} callback.
 *
 * The typical lifecycle is: `initialize()` -\> `connect()` -\> `sendAudio()` (repeated) -\> `disconnect()` -\> `dispose()`
 *
 * @example
 * ```typescript
 * class MyLiveSTT implements LiveSTTProvider {
 *   readonly type = 'websocket';
 *   readonly managedAudio = false;
 *   config: STTProviderConfig;
 *
 *   async initialize() { /* ... *\/ }
 *   async connect() { /* open WebSocket *\/ }
 *   sendAudio(chunk: ArrayBuffer) { /* send chunk over WS *\/ }
 *   async disconnect() { /* close WebSocket *\/ }
 *   async dispose() { /* ... *\/ }
 *   isReady() { return true; }
 *
 *   onTranscription(callback: (result: TranscriptionResult) => void) {
 *     this.callback = callback;
 *   }
 * }
 * ```
 *
 * @see {@link BaseProvider} for lifecycle methods
 * @see {@link RestSTTProvider} for the file-based alternative
 * @see {@link TranscriptionResult} for the result type
 */
export interface LiveSTTProvider extends BaseProvider {
  /**
   * Configuration for this STT provider.
   *
   * @see {@link STTProviderConfig}
   */
  config: STTProviderConfig;

  /**
   * Establish the streaming connection to the transcription service.
   *
   * @remarks
   * Must be called after {@link BaseProvider.initialize | initialize} and before
   * {@link LiveSTTProvider.sendAudio | sendAudio}. For WebSocket providers, this
   * opens the WebSocket connection.
   *
   * @throws Error if the connection cannot be established
   */
  connect(): Promise<void>;

  /**
   * Send an audio chunk for real-time transcription.
   *
   * @remarks
   * CompositeVoice calls this method with audio data captured from the microphone.
   * The chunk is sent to the transcription service over the established connection.
   *
   * @param chunk - Raw audio data as an ArrayBuffer
   */
  sendAudio(chunk: ArrayBuffer): void;

  /**
   * Disconnect from the streaming transcription service.
   *
   * @remarks
   * Closes the WebSocket connection. Can be reconnected by calling
   * {@link LiveSTTProvider.connect | connect} again.
   */
  disconnect(): Promise<void>;

  /**
   * Register a callback for transcription results.
   *
   * @remarks
   * The provider calls this callback with transcription results as they arrive
   * over the WebSocket connection. Must be called before {@link LiveSTTProvider.connect | connect}.
   *
   * @param callback - Function invoked with each {@link TranscriptionResult}
   */
  onTranscription(callback: (result: TranscriptionResult) => void): void;
}

/**
 * Union type for all speech-to-text providers.
 *
 * @remarks
 * A provider can be either REST-based ({@link RestSTTProvider}) or
 * WebSocket-based ({@link LiveSTTProvider}). The SDK determines the
 * communication pattern at runtime based on the provider's {@link BaseProvider.type | type} property.
 *
 * @see {@link RestSTTProvider} for file-based transcription
 * @see {@link LiveSTTProvider} for real-time streaming transcription
 */
export type STTProvider = RestSTTProvider | LiveSTTProvider;

/**
 * Configuration for large language model providers.
 *
 * @remarks
 * Extends {@link BaseProviderConfig} with LLM-specific options for model selection,
 * generation parameters, system prompt, and streaming behavior.
 *
 * @example
 * ```typescript
 * const llmConfig: LLMProviderConfig = {
 *   apiKey: 'your-api-key',
 *   model: 'claude-sonnet-4-20250514',
 *   temperature: 0.7,
 *   maxTokens: 150,
 *   systemPrompt: 'You are a helpful voice assistant. Keep responses brief.',
 *   stream: true,
 * };
 * ```
 *
 * @see {@link BaseProviderConfig} for inherited fields
 * @see {@link LLMProvider} for the provider interface
 */
export interface LLMProviderConfig extends BaseProviderConfig {
  /**
   * Model identifier to use for generation.
   *
   * @remarks
   * Provider-specific model name (e.g., `'claude-sonnet-4-20250514'` for Anthropic,
   * `'gpt-4'` for OpenAI).
   */
  model: string;

  /**
   * Temperature for controlling generation randomness.
   *
   * @remarks
   * Values from 0 (deterministic) to 2 (highly creative). Lower values
   * produce more focused responses; higher values increase variety.
   */
  temperature?: number;

  /**
   * Maximum number of tokens to generate in the response.
   *
   * @remarks
   * For voice applications, lower values (100-300) help keep responses concise
   * and reduce TTS latency.
   */
  maxTokens?: number;

  /**
   * Top-P (nucleus) sampling parameter.
   *
   * @remarks
   * Limits token selection to the smallest set whose cumulative probability
   * exceeds this value. Values from 0 to 1. Often used as an alternative
   * to temperature.
   */
  topP?: number;

  /**
   * System prompt providing instructions and context to the LLM.
   *
   * @remarks
   * Sets the behavior and persona of the assistant. For voice applications,
   * include instructions to keep responses brief and conversational.
   */
  systemPrompt?: string;

  /**
   * Whether to stream the LLM response token by token.
   *
   * @remarks
   * When `true`, the provider yields tokens incrementally via an async iterable.
   * Streaming is essential for low-latency voice applications as it allows TTS
   * to begin synthesizing before the full response is generated.
   */
  stream?: boolean;

  /**
   * Sequences that cause the LLM to stop generating.
   *
   * @remarks
   * When the model generates any of these sequences, generation halts.
   * Useful for controlling response boundaries.
   */
  stopSequences?: string[];
}

/**
 * A single message in an LLM conversation.
 *
 * @remarks
 * Represents one turn in a multi-turn conversation. The SDK accumulates these
 * messages when {@link ConversationHistoryConfig} is enabled and passes them to
 * {@link LLMProvider.generateFromMessages | generateFromMessages}.
 *
 * @example
 * ```typescript
 * const messages: LLMMessage[] = [
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'What is the weather today?' },
 *   { role: 'assistant', content: 'I cannot check the weather, but I can help with other questions!' },
 *   { role: 'user', content: 'Tell me a joke instead.' },
 * ];
 * ```
 *
 * @see {@link LLMProvider.generateFromMessages} for using message arrays
 * @see {@link ConversationHistoryConfig} for enabling multi-turn history
 */
export interface LLMMessage {
  /**
   * The role of the message author.
   *
   * @remarks
   * - `'system'` - System instructions (typically the first message)
   * - `'user'` - User input (transcribed speech)
   * - `'assistant'` - Assistant response (LLM output)
   */
  role: 'system' | 'user' | 'assistant';

  /** The text content of the message. */
  content: string;
}

/**
 * Options for controlling a single LLM generation request.
 *
 * @remarks
 * These options override the provider-level {@link LLMProviderConfig} settings
 * for a specific generation call. They are passed to {@link LLMProvider.generate | generate}
 * and {@link LLMProvider.generateFromMessages | generateFromMessages}.
 *
 * The {@link LLMGenerationOptions.signal | signal} property is particularly important
 * for the eager LLM pipeline, where speculative generations may need to be cancelled.
 *
 * @example
 * ```typescript
 * const controller = new AbortController();
 *
 * const options: LLMGenerationOptions = {
 *   temperature: 0.5,
 *   maxTokens: 100,
 *   signal: controller.signal,
 * };
 *
 * const stream = await llmProvider.generate('Hello!', options);
 * // Cancel if needed:
 * controller.abort();
 * ```
 *
 * @see {@link LLMProviderConfig} for provider-level defaults
 * @see {@link LLMProvider} for the provider interface that accepts these options
 */
export interface LLMGenerationOptions {
  /**
   * Override the provider's default temperature for this generation.
   *
   * @see {@link LLMProviderConfig.temperature}
   */
  temperature?: number;

  /**
   * Override the provider's default max tokens for this generation.
   *
   * @see {@link LLMProviderConfig.maxTokens}
   */
  maxTokens?: number;

  /**
   * Override the provider's default stop sequences for this generation.
   *
   * @see {@link LLMProviderConfig.stopSequences}
   */
  stopSequences?: string[];

  /**
   * AbortSignal for cancelling an in-flight generation.
   *
   * @remarks
   * Providers that support cancellation (Anthropic, OpenAI) will stop
   * yielding tokens and throw an `AbortError` when this signal fires.
   * Used by CompositeVoice for the eager/preflight pipeline to cancel
   * speculative generations when the confirmed text differs.
   *
   * @see {@link EagerLLMConfig} for the eager pipeline configuration
   */
  signal?: AbortSignal;

  /**
   * Additional provider-specific options.
   *
   * @remarks
   * Allows passing through options that are specific to a particular
   * LLM provider without extending this interface.
   */
  extra?: Record<string, unknown>;
}

/**
 * Large language model provider interface.
 *
 * @remarks
 * Defines the contract for LLM providers in the CompositeVoice pipeline. The provider
 * receives transcribed text (or a message history) and produces a text response,
 * either as a complete string or as a stream of tokens via an async iterable.
 *
 * For voice applications, streaming ({@link LLMProviderConfig.stream | stream: true}) is
 * strongly recommended as it allows TTS synthesis to begin before the full response
 * is generated, significantly reducing end-to-end latency.
 *
 * @example
 * ```typescript
 * class MyLLMProvider implements LLMProvider {
 *   readonly type = 'rest';
 *   readonly managedAudio = false;
 *   config: LLMProviderConfig;
 *
 *   async initialize() { /* ... *\/ }
 *   async dispose() { /* ... *\/ }
 *   isReady() { return true; }
 *
 *   async *generate(prompt: string, options?: LLMGenerationOptions) {
 *     const response = await callMyAPI(prompt, options);
 *     yield response;
 *   }
 *
 *   async *generateFromMessages(messages: LLMMessage[], options?: LLMGenerationOptions) {
 *     const response = await callMyAPI(messages, options);
 *     yield response;
 *   }
 * }
 * ```
 *
 * @see {@link BaseProvider} for lifecycle methods
 * @see {@link LLMProviderConfig} for configuration options
 * @see {@link LLMGenerationOptions} for per-request options
 * @see {@link LLMMessage} for conversation message format
 */
export interface LLMProvider extends BaseProvider {
  /**
   * Configuration for this LLM provider.
   *
   * @see {@link LLMProviderConfig}
   */
  config: LLMProviderConfig;

  /**
   * Generate a response from a single user prompt.
   *
   * @remarks
   * Returns an async iterable that yields text chunks. When streaming is enabled,
   * multiple chunks are yielded as tokens arrive. When streaming is disabled,
   * a single chunk containing the full response is yielded.
   *
   * @param prompt - The user's text input (typically transcribed speech)
   * @param options - Optional generation parameters that override provider defaults
   * @returns An async iterable of text chunks
   *
   * @throws Error if the provider is not initialized
   * @throws AbortError if the generation is cancelled via {@link LLMGenerationOptions.signal | options.signal}
   */
  generate(prompt: string, options?: LLMGenerationOptions): Promise<AsyncIterable<string>>;

  /**
   * Generate a response from a multi-turn conversation.
   *
   * @remarks
   * Used when {@link ConversationHistoryConfig} is enabled. The messages array
   * includes the system prompt, previous conversation turns, and the latest
   * user input. Returns an async iterable of text chunks, same as
   * {@link LLMProvider.generate | generate}.
   *
   * @param messages - Array of conversation messages including history
   * @param options - Optional generation parameters that override provider defaults
   * @returns An async iterable of text chunks
   *
   * @throws Error if the provider is not initialized
   * @throws AbortError if the generation is cancelled via {@link LLMGenerationOptions.signal | options.signal}
   *
   * @see {@link LLMMessage} for the message format
   * @see {@link ConversationHistoryConfig} for history configuration
   */
  generateFromMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>>;
}

/**
 * Configuration for text-to-speech providers.
 *
 * @remarks
 * Extends {@link BaseProviderConfig} with TTS-specific options for voice selection,
 * model, speech rate, pitch, and output audio format.
 *
 * @example
 * ```typescript
 * const ttsConfig: TTSProviderConfig = {
 *   apiKey: 'your-api-key',
 *   voice: 'aura-asteria-en',
 *   model: 'aura-2',
 *   rate: 1.0,
 *   outputFormat: 'pcm',
 *   sampleRate: 24000,
 * };
 * ```
 *
 * @see {@link BaseProviderConfig} for inherited fields
 * @see {@link RestTTSProvider} for REST-based TTS providers
 * @see {@link LiveTTSProvider} for WebSocket-based TTS providers
 */
export interface TTSProviderConfig extends BaseProviderConfig {
  /**
   * Voice ID or name to use for synthesis.
   *
   * @remarks
   * Provider-specific voice identifier. For example, Deepgram uses
   * identifiers like `'aura-asteria-en'`, while ElevenLabs uses voice IDs.
   */
  voice?: string;

  /**
   * Model to use for text-to-speech synthesis.
   *
   * @remarks
   * Provider-specific model identifier (e.g., `'aura-2'` for Deepgram).
   */
  model?: string;

  /**
   * Speech rate multiplier.
   *
   * @remarks
   * Values from 0.25 (quarter speed) to 4.0 (quadruple speed), where 1.0
   * is normal speed. Not all providers support rate adjustment.
   */
  rate?: number;

  /**
   * Pitch adjustment in semitones.
   *
   * @remarks
   * Values from -20 to +20 semitones. Not all providers support pitch adjustment.
   */
  pitch?: number;

  /**
   * Output audio format identifier.
   *
   * @remarks
   * Provider-specific format string (e.g., `'linear16'`, `'mp3'`, `'opus'`).
   */
  outputFormat?: string;

  /**
   * Sample rate for the output audio in Hz.
   *
   * @remarks
   * Common values are 16000, 24000, and 48000. Must match the format
   * capabilities of the chosen voice and model.
   */
  sampleRate?: number;
}

/**
 * REST-based text-to-speech provider interface.
 *
 * @remarks
 * Implements single-request synthesis where the complete text is sent and a
 * complete audio Blob is returned. Suitable for short utterances where
 * streaming latency is not critical.
 *
 * @example
 * ```typescript
 * class MyRestTTS implements RestTTSProvider {
 *   readonly type = 'rest';
 *   readonly managedAudio = false;
 *   config: TTSProviderConfig;
 *
 *   async initialize() { /* ... *\/ }
 *   async dispose() { /* ... *\/ }
 *   isReady() { return true; }
 *
 *   async synthesize(text: string): Promise<Blob> {
 *     const audioData = await callMyAPI(text);
 *     return new Blob([audioData], { type: 'audio/mp3' });
 *   }
 * }
 * ```
 *
 * @see {@link BaseProvider} for lifecycle methods
 * @see {@link LiveTTSProvider} for the streaming alternative
 * @see {@link TTSProviderConfig} for configuration options
 */
export interface RestTTSProvider extends BaseProvider {
  /**
   * Configuration for this TTS provider.
   *
   * @see {@link TTSProviderConfig}
   */
  config: TTSProviderConfig;

  /**
   * Synthesize text into a complete audio Blob.
   *
   * @param text - The text to synthesize into speech
   * @returns A Blob containing the synthesized audio data
   *
   * @throws Error if the provider is not initialized or the API request fails
   */
  synthesize(text: string): Promise<Blob>;
}

/**
 * Live (WebSocket-based) text-to-speech provider interface.
 *
 * @remarks
 * Implements real-time streaming synthesis over a persistent connection. Text chunks
 * are sent incrementally via {@link LiveTTSProvider.sendText | sendText}, and audio chunks
 * arrive asynchronously via the {@link LiveTTSProvider.onAudio | onAudio} callback. This
 * enables low-latency voice output where TTS synthesis begins before the LLM has
 * finished generating the full response.
 *
 * The typical lifecycle is: `initialize()` -\> `connect()` -\> `sendText()` (repeated) -\> `finalize()` -\> `disconnect()` -\> `dispose()`
 *
 * @example
 * ```typescript
 * class MyLiveTTS implements LiveTTSProvider {
 *   readonly type = 'websocket';
 *   readonly managedAudio = false;
 *   config: TTSProviderConfig;
 *
 *   async initialize() { /* ... *\/ }
 *   async connect() { /* open WebSocket *\/ }
 *   sendText(chunk: string) { /* send text over WS *\/ }
 *   async finalize() { /* flush remaining text *\/ }
 *   async disconnect() { /* close WebSocket *\/ }
 *   async dispose() { /* ... *\/ }
 *   isReady() { return true; }
 *
 *   onAudio(callback: (chunk: AudioChunk) => void) {
 *     this.audioCallback = callback;
 *   }
 *
 *   onMetadata(callback: (metadata: AudioMetadata) => void) {
 *     this.metadataCallback = callback;
 *   }
 * }
 * ```
 *
 * @see {@link BaseProvider} for lifecycle methods
 * @see {@link RestTTSProvider} for the single-request alternative
 * @see {@link AudioChunk} for the audio data type
 * @see {@link AudioMetadata} for the metadata type
 */
export interface LiveTTSProvider extends BaseProvider {
  /**
   * Configuration for this TTS provider.
   *
   * @see {@link TTSProviderConfig}
   */
  config: TTSProviderConfig;

  /**
   * Establish the streaming connection to the synthesis service.
   *
   * @remarks
   * Must be called after {@link BaseProvider.initialize | initialize} and before
   * {@link LiveTTSProvider.sendText | sendText}. For WebSocket providers, this
   * opens the WebSocket connection.
   *
   * @throws Error if the connection cannot be established
   */
  connect(): Promise<void>;

  /**
   * Send a text chunk for real-time synthesis.
   *
   * @remarks
   * CompositeVoice calls this method with text tokens as they arrive from the LLM.
   * The provider sends them to the synthesis service over the established connection.
   *
   * @param chunk - Text to synthesize
   */
  sendText(chunk: string): void;

  /**
   * Signal that all text has been sent and the provider should flush remaining audio.
   *
   * @remarks
   * Called after the last {@link LiveTTSProvider.sendText | sendText} call to ensure
   * all buffered text is processed and the final audio chunks are emitted.
   */
  finalize(): Promise<void>;

  /**
   * Disconnect from the streaming synthesis service.
   *
   * @remarks
   * Closes the WebSocket connection. Can be reconnected by calling
   * {@link LiveTTSProvider.connect | connect} again.
   */
  disconnect(): Promise<void>;

  /**
   * Register a callback for receiving synthesized audio chunks.
   *
   * @remarks
   * The provider calls this callback with audio data as it is synthesized.
   * Must be called before {@link LiveTTSProvider.connect | connect}.
   *
   * @param callback - Function invoked with each {@link AudioChunk}
   */
  onAudio(callback: (chunk: AudioChunk) => void): void;

  /**
   * Register a callback for receiving audio format metadata.
   *
   * @remarks
   * Metadata describes the format of audio chunks (sample rate, encoding, channels)
   * and helps the AudioPlayer configure playback correctly. Providers may emit
   * metadata once at the start of a session or not at all. This method is always
   * available on the interface, but providers are not required to emit metadata.
   *
   * @param callback - Function invoked with the {@link AudioMetadata}
   */
  onMetadata(callback: (metadata: AudioMetadata) => void): void;
}

/**
 * Union type for all text-to-speech providers.
 *
 * @remarks
 * A provider can be either REST-based ({@link RestTTSProvider}) or
 * WebSocket-based ({@link LiveTTSProvider}). The SDK determines the
 * communication pattern at runtime based on the provider's {@link BaseProvider.type | type} property.
 *
 * @see {@link RestTTSProvider} for single-request synthesis
 * @see {@link LiveTTSProvider} for real-time streaming synthesis
 */
export type TTSProvider = RestTTSProvider | LiveTTSProvider;
