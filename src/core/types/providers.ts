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
import type { ProviderRole } from './roles';

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
 *   readonly roles: readonly ProviderRole[] = ['stt'];
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
 * @see {@link ProviderRole} for the pipeline roles a provider can declare
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
   * Pipeline roles this provider covers.
   *
   * @remarks
   * Each provider declares which stages of the 5-role audio pipeline it can
   * fulfil. Single-role providers list one role (e.g. `['stt']`); multi-role
   * providers list every role they handle (e.g. `['input', 'stt']` for
   * NativeSTT, which manages its own microphone access).
   *
   * The provider resolution algorithm reads this property to assign providers
   * to pipeline slots. Base provider classes set sensible defaults:
   * - {@link BaseSTTProvider}: `['stt']`
   * - {@link BaseLLMProvider}: `['llm']`
   * - {@link BaseTTSProvider}: `['tts']`
   *
   * @defaultValue `[]`
   *
   * @see {@link ProviderRole} for the possible role values
   * @see {@link ResolvedPipeline} for the resolved pipeline slots
   */
  readonly roles: readonly ProviderRole[];

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
   * Multi-segment providers (Deepgram) may emit several `isFinal: true`
   * chunks for a single utterance -- only the last one has `speechFinal: true`.
   *
   * @deprecated Use {@link TranscriptionResult.utteranceComplete | utteranceComplete} instead.
   * This field is retained for informational/display purposes but is no longer
   * used by CompositeVoice to trigger LLM processing.
   */
  speechFinal?: boolean;

  /**
   * Whether this result should trigger the next pipeline stage (LLM).
   *
   * @remarks
   * This is the single flag CompositeVoice checks to decide when to send
   * transcribed text to the LLM. The STT provider is responsible for setting
   * this — it knows its own end-of-utterance semantics.
   *
   * - **DeepgramSTT**: `true` when `speech_final=true` (after buffering all
   *   `is_final` segments into a complete utterance).
   * - **NativeSTT**: `true` when `isFinal=true` (one result per utterance).
   * - **AssemblyAI**: `true` on `FinalTranscript` messages.
   * - **ElevenLabs**: `true` on `committed_transcript` / `final_transcript`.
   *
   * If not set, CompositeVoice will NOT trigger LLM processing for this result.
   */
  utteranceComplete?: boolean;

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
 * REST STT providers expose guard methods that the orchestrator uses to interpret
 * transcription results, and a `transcribe` method for batch processing.
 *
 * @example
 * ```typescript
 * class MyRestSTT implements RestSTTProvider {
 *   readonly type = 'rest';
 *   readonly roles = ['stt'] as const;
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
 *   processAudio(chunk: ArrayBuffer) { /* no-op for REST *\/ }
 *
 *   isUtteranceComplete(result: TranscriptionResult) { return result.utteranceComplete === true; }
 *   isPreflight(result: TranscriptionResult) { return result.isPreflight === true; }
 *   isInterim(result: TranscriptionResult) { return !result.isFinal; }
 *   isFinal(result: TranscriptionResult) { return result.isFinal === true; }
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
   * Process a raw audio chunk. For REST providers this is typically a no-op;
   * use {@link RestSTTProvider.transcribe | transcribe} for batch processing.
   *
   * @param chunk - Raw audio data as an ArrayBuffer
   */
  processAudio(chunk: ArrayBuffer): void;

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

  // === GUARD METHODS ===

  /**
   * Is this result a complete utterance ready for LLM processing?
   *
   * @param result - The transcription result to check
   * @returns `true` when the utterance is complete
   */
  isUtteranceComplete(result: TranscriptionResult): boolean;

  /**
   * Is this a preflight/eager end-of-turn signal?
   *
   * @param result - The transcription result to check
   * @returns `true` when this is a preflight signal
   */
  isPreflight(result: TranscriptionResult): boolean;

  /**
   * Is this an interim (partial, non-final) result?
   *
   * @param result - The transcription result to check
   * @returns `true` when this is an interim result
   */
  isInterim(result: TranscriptionResult): boolean;

  /**
   * Is this a final segment (but not necessarily utterance-complete)?
   *
   * @param result - The transcription result to check
   * @returns `true` when this is a final segment
   */
  isFinal(result: TranscriptionResult): boolean;

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
 * Audio chunks are sent via {@link LiveSTTProvider.processAudio | processAudio},
 * and transcription results arrive asynchronously via the
 * {@link LiveSTTProvider.onTranscription | onTranscription} callback.
 *
 * Guard methods allow the orchestrator to interpret each transcription result
 * without coupling to provider-specific logic.
 *
 * The typical lifecycle is: `initialize()` -\> `connect()` -\> `processAudio()` (repeated) -\> `disconnect()` -\> `dispose()`
 *
 * @example
 * ```typescript
 * class MyLiveSTT implements LiveSTTProvider {
 *   readonly type = 'websocket';
 *   readonly roles = ['stt'] as const;
 *   config: STTProviderConfig;
 *
 *   async initialize() { /* ... *\/ }
 *   async connect() { /* open WebSocket *\/ }
 *   processAudio(chunk: ArrayBuffer) { /* send chunk over WS *\/ }
 *   async disconnect() { /* close WebSocket *\/ }
 *   async dispose() { /* ... *\/ }
 *   isReady() { return true; }
 *
 *   isUtteranceComplete(result: TranscriptionResult) { return result.utteranceComplete === true; }
 *   isPreflight(result: TranscriptionResult) { return result.isPreflight === true; }
 *   isInterim(result: TranscriptionResult) { return !result.isFinal; }
 *   isFinal(result: TranscriptionResult) { return result.isFinal === true; }
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
   * {@link LiveSTTProvider.processAudio | processAudio}. For WebSocket providers, this
   * opens the WebSocket connection.
   *
   * @throws Error if the connection cannot be established
   */
  connect(): Promise<void>;

  /**
   * Send a raw audio chunk for real-time transcription.
   *
   * @remarks
   * The orchestrator calls this method with audio data captured from the
   * microphone. The provider forwards the data over the WebSocket connection.
   *
   * @param chunk - Raw audio data as an ArrayBuffer
   */
  processAudio(chunk: ArrayBuffer): void;

  /**
   * Disconnect from the streaming transcription service.
   *
   * @remarks
   * Closes the WebSocket connection. Can be reconnected by calling
   * {@link LiveSTTProvider.connect | connect} again.
   */
  disconnect(): Promise<void>;

  // === GUARD METHODS ===

  /**
   * Is this result a complete utterance ready for LLM processing?
   *
   * @param result - The transcription result to check
   * @returns `true` when the utterance is complete
   */
  isUtteranceComplete(result: TranscriptionResult): boolean;

  /**
   * Is this a preflight/eager end-of-turn signal?
   *
   * @param result - The transcription result to check
   * @returns `true` when this is a preflight signal
   */
  isPreflight(result: TranscriptionResult): boolean;

  /**
   * Is this an interim (partial, non-final) result?
   *
   * @param result - The transcription result to check
   * @returns `true` when this is an interim result
   */
  isInterim(result: TranscriptionResult): boolean;

  /**
   * Is this a final segment (but not necessarily utterance-complete)?
   *
   * @param result - The transcription result to check
   * @returns `true` when this is a final segment
   */
  isFinal(result: TranscriptionResult): boolean;

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
   * - `'user'` - User input (transcribed speech or typed text)
   * - `'assistant'` - Assistant response (LLM output)
   * - `'tool'` - Tool execution result (sent back after a tool call)
   */
  role: 'system' | 'user' | 'assistant' | 'tool';

  /** The text content of the message. */
  content: string;

  /**
   * How the message was produced.
   *
   * @remarks
   * - `'voice'` - Transcribed from speech via STT (default for user messages)
   * - `'text'` - Typed by the user via `sendMessage()`
   *
   * This is included in the conversation history so the LLM can adapt its
   * response style (e.g., shorter for voice, richer formatting for text).
   * Only meaningful for `role: 'user'` messages.
   */
  modality?: 'voice' | 'text';

  /** Tool calls requested by the assistant (on assistant messages). */
  toolCalls?: LLMToolCall[];

  /** The tool call ID this result belongs to (on tool messages). */
  toolCallId?: string;
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
 * receives transcribed text (or a message history) and produces a text response as
 * a stream of tokens via an async iterable.
 *
 * The handler/guard pattern is used:
 * - **Handler methods** (`processMessages`, `processText`) receive data and produce results.
 * - **Guard methods** (`isToolCall`) allow the orchestrator to interpret response chunks.
 *
 * For voice applications, streaming ({@link LLMProviderConfig.stream | stream: true}) is
 * strongly recommended as it allows TTS synthesis to begin before the full response
 * is generated, significantly reducing end-to-end latency.
 *
 * @example
 * ```typescript
 * class MyLLMProvider implements LLMProvider {
 *   readonly type = 'rest';
 *   readonly roles = ['llm'] as const;
 *   config: LLMProviderConfig;
 *
 *   async initialize() { /* ... *\/ }
 *   async dispose() { /* ... *\/ }
 *   isReady() { return true; }
 *
 *   async *processMessages(messages: LLMMessage[], options?: LLMGenerationOptions) {
 *     const response = await callMyAPI(messages, options);
 *     yield response;
 *   }
 *
 *   async processText(prompt: string, options?: LLMGenerationOptions) {
 *     return this.processMessages([{ role: 'user', content: prompt }], options);
 *   }
 *
 *   isToolCall(chunk: unknown) { return false; }
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

  // === HANDLER METHODS ===

  /**
   * Process a conversation and generate a response.
   *
   * @remarks
   * The primary handler method. Returns an async iterable that yields text
   * chunks. When streaming is enabled, multiple chunks are yielded as tokens
   * arrive. When streaming is disabled, a single chunk containing the full
   * response is yielded.
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
  processMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>>;

  /**
   * Process a single text prompt (convenience wrapper around processMessages).
   *
   * @remarks
   * Converts the prompt to a messages array (optionally prepending a system
   * message from config) and delegates to {@link LLMProvider.processMessages | processMessages}.
   *
   * @param prompt - The user's text input (typically transcribed speech)
   * @param options - Optional generation parameters that override provider defaults
   * @returns An async iterable of text chunks
   *
   * @throws Error if the provider is not initialized
   * @throws AbortError if the generation is cancelled via {@link LLMGenerationOptions.signal | options.signal}
   */
  processText(prompt: string, options?: LLMGenerationOptions): Promise<AsyncIterable<string>>;

  // === GUARD METHODS ===

  /**
   * Check whether a response chunk represents a tool call.
   *
   * @remarks
   * The default implementation returns `false`. Tool-aware providers override
   * this to detect tool invocations in the response stream.
   *
   * @param chunk - A response chunk to inspect
   * @returns `true` when the chunk represents a tool call
   */
  isToolCall(chunk: unknown): boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// Tool Use Types (Provider-Agnostic)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Schema for a single tool parameter.
 */
export interface LLMToolParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'integer';
  description?: string;
  enum?: string[];
}

/**
 * Definition of a tool the LLM can invoke.
 *
 * @remarks
 * Provider-agnostic — converted to Anthropic, OpenAI, etc. format by each provider.
 */
export interface LLMToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, LLMToolParameterSchema>;
    required?: string[];
  };
}

/**
 * A tool invocation emitted by the LLM.
 */
export interface LLMToolCall {
  /** Provider-assigned ID (Anthropic: content block id, OpenAI: tool_call.id) */
  id: string;
  /** Tool name (maps to skill/function name) */
  name: string;
  /** Parsed arguments from the LLM */
  arguments: Record<string, unknown>;
}

/**
 * Result sent back to the LLM after executing a tool.
 */
export interface LLMToolResult {
  /** Must match the LLMToolCall.id */
  toolCallId: string;
  /** Serialized result content */
  content: string;
  /** Whether the tool execution failed */
  isError?: boolean;
}

/**
 * Discriminated union for streaming chunks from tool-aware generation.
 *
 * @remarks
 * `text` chunks go to TTS; `tool_call_*` chunks go to the tool executor.
 * The `done` chunk signals the end of the response with a stop reason.
 */
export type LLMStreamChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_call_start'; toolCall: { id: string; name: string } }
  | { type: 'tool_call_delta'; toolCallId: string; argumentsDelta: string }
  | { type: 'tool_call_end'; toolCallId: string }
  | { type: 'done'; stopReason: 'end_turn' | 'tool_use' | 'stop_sequence' | 'max_tokens' };

/**
 * LLM provider with optional tool use support.
 *
 * @remarks
 * Extends LLMProvider with a `processMessagesWithTools` method. Providers
 * that don't support tool use simply don't implement this interface, and the
 * orchestrator falls back to text-only generation via `processMessages`.
 */
export interface ToolAwareLLMProvider extends LLMProvider {
  /**
   * Process a conversation with tool support. Returns a richer streaming type
   * that separates text from tool invocations.
   *
   * @param messages - Array of conversation messages including history
   * @param options - Optional generation parameters, including tool definitions
   * @returns An async iterable of {@link LLMStreamChunk} objects
   */
  processMessagesWithTools(
    messages: LLMMessage[],
    options?: LLMGenerationOptions & { tools?: LLMToolDefinition[] }
  ): Promise<AsyncIterable<LLMStreamChunk>>;
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
 * Implements single-request synthesis where complete text is sent and a
 * complete audio Blob is returned. Uses the handler/guard pattern:
 *
 * - `processChunk` accumulates text for synthesis.
 * - `finalize` sends the accumulated text to the REST API and returns audio.
 * - `isAudioReady` is a guard for checking audio chunk validity.
 *
 * @example
 * ```typescript
 * class MyRestTTS implements RestTTSProvider {
 *   readonly type = 'rest';
 *   readonly roles = ['tts'] as const;
 *   config: TTSProviderConfig;
 *
 *   async initialize() { /* ... *\/ }
 *   async dispose() { /* ... *\/ }
 *   isReady() { return true; }
 *
 *   processChunk(text: string) { /* accumulate text *\/ }
 *   async finalize() { /* synthesize accumulated text *\/ }
 *   isAudioReady(chunk: AudioChunk) { return chunk.data.byteLength > 0; }
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

  // === HANDLER METHODS ===

  /**
   * Process a text chunk for synthesis.
   *
   * @remarks
   * For REST providers, this typically accumulates text into a buffer.
   * The actual synthesis happens in {@link RestTTSProvider.finalize | finalize}.
   *
   * @param text - A piece of text to synthesize
   */
  processChunk(text: string): void;

  /**
   * Finalize synthesis — flush remaining audio.
   *
   * @remarks
   * For REST providers, this triggers the actual API call with the accumulated
   * text and emits the resulting audio.
   */
  finalize(): Promise<void>;

  /**
   * Synthesize text into a complete audio Blob.
   *
   * @remarks
   * The underlying batch synthesis method. Called by {@link RestTTSProvider.finalize | finalize}
   * with the accumulated text.
   *
   * @param text - The text to synthesize into speech
   * @returns A Blob containing the synthesized audio data
   *
   * @throws Error if the provider is not initialized or the API request fails
   */
  synthesize(text: string): Promise<Blob>;

  // === GUARD METHODS ===

  /**
   * Is this audio chunk ready for playback?
   *
   * @param chunk - The audio chunk to check
   * @returns `true` when the chunk has valid audio data
   */
  isAudioReady(chunk: AudioChunk): boolean;
}

/**
 * Live (WebSocket-based) text-to-speech provider interface.
 *
 * @remarks
 * Implements real-time streaming synthesis over a persistent connection. Text
 * chunks are sent incrementally via {@link LiveTTSProvider.processChunk | processChunk},
 * and audio chunks arrive asynchronously via the
 * {@link LiveTTSProvider.onAudio | onAudio} callback. This enables low-latency
 * voice output where TTS synthesis begins before the LLM has finished generating
 * the full response.
 *
 * The handler/guard pattern is used:
 * - `processChunk` sends text to the WebSocket for incremental synthesis.
 * - `finalize` flushes remaining audio.
 * - `isAudioReady` is a guard for checking audio chunk validity.
 *
 * The typical lifecycle is: `initialize()` -\> `connect()` -\> `processChunk()` (repeated) -\> `finalize()` -\> `disconnect()` -\> `dispose()`
 *
 * @example
 * ```typescript
 * class MyLiveTTS implements LiveTTSProvider {
 *   readonly type = 'websocket';
 *   readonly roles = ['tts'] as const;
 *   config: TTSProviderConfig;
 *
 *   async initialize() { /* ... *\/ }
 *   async connect() { /* open WebSocket *\/ }
 *   processChunk(text: string) { /* send text over WS *\/ }
 *   async finalize() { /* flush remaining text *\/ }
 *   async disconnect() { /* close WebSocket *\/ }
 *   async dispose() { /* ... *\/ }
 *   isReady() { return true; }
 *
 *   isAudioReady(chunk: AudioChunk) { return chunk.data.byteLength > 0; }
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
   * {@link LiveTTSProvider.processChunk | processChunk}. For WebSocket providers, this
   * opens the WebSocket connection.
   *
   * @throws Error if the connection cannot be established
   */
  connect(): Promise<void>;

  // === HANDLER METHODS ===

  /**
   * Process a text chunk for incremental synthesis.
   *
   * @remarks
   * The orchestrator calls this method with text tokens as they arrive from
   * the LLM. The provider sends them to the synthesis service over the
   * established WebSocket connection.
   *
   * @param text - Text to synthesize
   */
  processChunk(text: string): void;

  /**
   * Signal that all text has been sent and the provider should flush remaining audio.
   *
   * @remarks
   * Called after the last {@link LiveTTSProvider.processChunk | processChunk} call to ensure
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

  // === GUARD METHODS ===

  /**
   * Is this audio chunk ready for playback?
   *
   * @param chunk - The audio chunk to check
   * @returns `true` when the chunk has valid audio data
   */
  isAudioReady(chunk: AudioChunk): boolean;

  // === CALLBACKS ===

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

/**
 * Audio input provider interface for the `'input'` pipeline role.
 *
 * @remarks
 * An `AudioInputProvider` captures audio from a source (e.g. microphone,
 * file buffer, network stream) and delivers it as {@link AudioChunk} objects
 * via the {@link AudioInputProvider.onAudio | onAudio} callback. It is the
 * first stage of the 5-role pipeline:
 *
 * ```
 * [AudioInputProvider] -> InputQueue -> [STT] -> [LLM] -> [TTS] -> OutputQueue -> [AudioOutputProvider]
 *  ^^^^^^^^^^^^^^^^^^
 * ```
 *
 * Providers implementing this interface must set `roles` to include `'input'`.
 * Multi-role providers (e.g. NativeSTT) may also include `'stt'` when the
 * underlying API handles both capture and transcription internally.
 *
 * **Lifecycle:** `initialize()` -> `start()` -> audio flows via `onAudio` ->
 * `pause()` / `resume()` -> `stop()` -> `dispose()`
 *
 * @example
 * ```typescript
 * import type { AudioInputProvider, AudioChunk, AudioMetadata } from 'composite-voice';
 *
 * class MyMicrophoneInput implements AudioInputProvider {
 *   readonly type = 'websocket';
 *   readonly roles = ['input'] as const;
 *   private callback?: (chunk: AudioChunk) => void;
 *   private active = false;
 *
 *   async initialize() { /* request permissions *\/ }
 *   async dispose() { /* release resources *\/ }
 *   isReady() { return true; }
 *
 *   start() { this.active = true; /* begin capture *\/ }
 *   stop() { this.active = false; /* end capture *\/ }
 *   pause() { /* pause capture *\/ }
 *   resume() { /* resume capture *\/ }
 *   isActive() { return this.active; }
 *
 *   onAudio(callback: (chunk: AudioChunk) => void) {
 *     this.callback = callback;
 *   }
 *
 *   getMetadata(): AudioMetadata {
 *     return { sampleRate: 16000, encoding: 'linear16', channels: 1, bitDepth: 16 };
 *   }
 * }
 * ```
 *
 * @see {@link BaseProvider} for lifecycle methods
 * @see {@link AudioChunk} for the audio data type
 * @see {@link AudioMetadata} for the metadata type
 * @see {@link AudioOutputProvider} for the corresponding output role
 */
export interface AudioInputProvider extends BaseProvider {
  /**
   * Start capturing audio from the input source.
   *
   * @remarks
   * After calling `start()`, the provider begins delivering audio chunks
   * via the callback registered with {@link AudioInputProvider.onAudio | onAudio}.
   * Must be called after {@link BaseProvider.initialize | initialize}.
   */
  start(): void;

  /**
   * Stop capturing audio and release the input source.
   *
   * @remarks
   * Stops audio delivery. The provider can be restarted with
   * {@link AudioInputProvider.start | start}.
   */
  stop(): void;

  /**
   * Temporarily pause audio capture without releasing the source.
   *
   * @remarks
   * Used by the turn-taking system to mute capture during TTS playback.
   * Resume with {@link AudioInputProvider.resume | resume}.
   */
  pause(): void;

  /**
   * Resume audio capture after a pause.
   *
   * @see {@link AudioInputProvider.pause | pause}
   */
  resume(): void;

  /**
   * Check whether the input source is actively capturing audio.
   *
   * @returns `true` when audio is being captured (between `start()` and `stop()`,
   *   and not paused)
   */
  isActive(): boolean;

  /**
   * Register a callback to receive captured audio chunks.
   *
   * @remarks
   * The provider calls this callback with each chunk of captured audio.
   * Must be called before {@link AudioInputProvider.start | start}.
   *
   * @param callback - Function invoked with each {@link AudioChunk}
   */
  onAudio(callback: (chunk: AudioChunk) => void): void;

  /**
   * Get the audio format metadata for the captured audio.
   *
   * @remarks
   * Returns metadata describing the format of audio chunks this provider
   * will emit. Used by the pipeline to auto-configure the STT provider's
   * encoding, sample rate, and channel settings.
   *
   * @returns {@link AudioMetadata} describing the audio format
   *
   * @see {@link AudioMetadata} for the metadata type
   */
  getMetadata(): AudioMetadata;
}

/**
 * Audio output provider interface for the `'output'` pipeline role.
 *
 * @remarks
 * An `AudioOutputProvider` receives synthesized audio from the TTS stage
 * and plays it through a destination (e.g. speakers, file, null sink).
 * It is the last stage of the 5-role pipeline:
 *
 * ```
 * [AudioInputProvider] -> InputQueue -> [STT] -> [LLM] -> [TTS] -> OutputQueue -> [AudioOutputProvider]
 *                                                                                  ^^^^^^^^^^^^^^^^^^^
 * ```
 *
 * Providers implementing this interface must set `roles` to include `'output'`.
 * Multi-role providers (e.g. NativeTTS) may also include `'tts'` when the
 * underlying API handles both synthesis and playback internally.
 *
 * **Lifecycle:** `initialize()` -> `configure(metadata)` -> `enqueue(chunk)`
 * (repeated) -> `flush()` -> `stop()` -> `dispose()`
 *
 * @example
 * ```typescript
 * import type { AudioOutputProvider, AudioChunk, AudioMetadata } from 'composite-voice';
 *
 * class MySpeakerOutput implements AudioOutputProvider {
 *   readonly type = 'websocket';
 *   readonly roles = ['output'] as const;
 *
 *   async initialize() { /* set up AudioContext *\/ }
 *   async dispose() { /* close AudioContext *\/ }
 *   isReady() { return true; }
 *
 *   configure(metadata: AudioMetadata) { /* configure playback format *\/ }
 *   enqueue(chunk: AudioChunk) { /* buffer chunk for playback *\/ }
 *   async flush() { /* wait for all queued audio to finish playing *\/ }
 *   stop() { /* stop playback immediately *\/ }
 *   pause() { /* pause playback *\/ }
 *   resume() { /* resume playback *\/ }
 *   isPlaying() { return false; }
 *
 *   onPlaybackStart(callback: () => void) { /* ... *\/ }
 *   onPlaybackEnd(callback: () => void) { /* ... *\/ }
 *   onPlaybackError(callback: (error: Error) => void) { /* ... *\/ }
 * }
 * ```
 *
 * @see {@link BaseProvider} for lifecycle methods
 * @see {@link AudioChunk} for the audio data type
 * @see {@link AudioMetadata} for the metadata type
 * @see {@link AudioInputProvider} for the corresponding input role
 */
export interface AudioOutputProvider extends BaseProvider {
  /**
   * Configure the output with the audio format metadata from the TTS provider.
   *
   * @remarks
   * Called when the TTS provider emits metadata describing the format of
   * incoming audio chunks. The output provider uses this to configure its
   * playback pipeline (e.g. AudioContext sample rate).
   *
   * @param metadata - Format description for the incoming audio
   *
   * @see {@link AudioMetadata}
   */
  configure(metadata: AudioMetadata): void;

  /**
   * Enqueue an audio chunk for playback.
   *
   * @remarks
   * Called for each audio chunk received from the TTS provider (via the
   * output queue). Chunks are played in the order they are enqueued.
   *
   * @param chunk - Audio data to play
   *
   * @see {@link AudioChunk}
   */
  enqueue(chunk: AudioChunk): void;

  /**
   * Wait for all enqueued audio to finish playing.
   *
   * @remarks
   * Called after the TTS provider signals that all text has been synthesized.
   * Resolves when the last enqueued chunk has finished playing.
   */
  flush(): Promise<void>;

  /**
   * Stop playback immediately and clear any buffered audio.
   */
  stop(): void;

  /**
   * Temporarily pause playback.
   *
   * @remarks
   * Playback can be resumed with {@link AudioOutputProvider.resume | resume}.
   */
  pause(): void;

  /**
   * Resume playback after a pause.
   *
   * @see {@link AudioOutputProvider.pause | pause}
   */
  resume(): void;

  /**
   * Check whether audio is currently playing.
   *
   * @returns `true` when audio is actively being played
   */
  isPlaying(): boolean;

  /**
   * Register a callback invoked when audio playback begins.
   *
   * @param callback - Function called when playback starts
   */
  onPlaybackStart(callback: () => void): void;

  /**
   * Register a callback invoked when all audio has finished playing.
   *
   * @param callback - Function called when playback ends
   */
  onPlaybackEnd(callback: () => void): void;

  /**
   * Register a callback invoked when a playback error occurs.
   *
   * @param callback - Function called with the error
   */
  onPlaybackError(callback: (error: Error) => void): void;
}

/**
 * A fully resolved 5-role pipeline with a provider assigned to each slot.
 *
 * @remarks
 * `ResolvedPipeline` is the output of the provider resolution algorithm
 * (`resolveProviders()`). It guarantees that every pipeline stage has exactly
 * one provider assigned. Multi-role providers may appear in multiple slots
 * (e.g. NativeSTT fills both `input` and `stt`).
 *
 * ```
 * [input] -> InputQueue -> [stt] -> [llm] -> [tts] -> OutputQueue -> [output]
 *    |                       |        |        |                        |
 *    v                       v        v        v                        v
 * AudioInputProvider   STTProvider  LLMProvider  TTSProvider   AudioOutputProvider
 * ```
 *
 * @example
 * ```typescript
 * import { resolveProviders } from 'composite-voice';
 * import type { ResolvedPipeline } from 'composite-voice';
 *
 * const pipeline: ResolvedPipeline = resolveProviders([
 *   new MicrophoneInput(),
 *   new DeepgramSTT({ apiKey: '...' }),
 *   new AnthropicLLM({ model: 'claude-sonnet-4-20250514', apiKey: '...' }),
 *   new DeepgramTTS({ apiKey: '...' }),
 *   new BrowserAudioOutput(),
 * ]);
 *
 * console.log(pipeline.input);  // MicrophoneInput
 * console.log(pipeline.stt);    // DeepgramSTT
 * console.log(pipeline.llm);    // AnthropicLLM
 * console.log(pipeline.tts);    // DeepgramTTS
 * console.log(pipeline.output); // BrowserAudioOutput
 * ```
 *
 * @see {@link AudioInputProvider} for the input slot contract
 * @see {@link STTProvider} for the stt slot contract
 * @see {@link LLMProvider} for the llm slot contract
 * @see {@link TTSProvider} for the tts slot contract
 * @see {@link AudioOutputProvider} for the output slot contract
 */
export interface ResolvedPipeline {
  /** Provider handling the `'input'` role (audio capture). */
  input: AudioInputProvider;

  /** Provider handling the `'stt'` role (speech-to-text). */
  stt: STTProvider;

  /** Provider handling the `'llm'` role (language model). */
  llm: LLMProvider;

  /** Provider handling the `'tts'` role (text-to-speech). */
  tts: TTSProvider;

  /** Provider handling the `'output'` role (audio playback). */
  output: AudioOutputProvider;
}
