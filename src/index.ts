/**
 * @packageDocumentation
 * Main entry point for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports all public classes, interfaces, types, and utilities from the SDK.
 * This is the primary module consumers import from when using the SDK.
 *
 * The SDK provides a 5-role audio pipeline with pluggable providers for
 * Audio Input, Speech-to-Text (STT), Large Language Models (LLM),
 * Text-to-Speech (TTS), and Audio Output. Providers declare their roles
 * via a `roles` property, and multi-role providers (e.g., NativeSTT covering
 * both `input` and `stt`) are supported via array-based config.
 *
 * Pipeline: [InputProvider] → InputQueue → [STT] → [LLM] → [TTS] → OutputQueue → [OutputProvider]
 *
 * It features an event-driven architecture, conversation history management,
 * eager LLM pipeline support, configurable turn-taking strategies,
 * audio buffering between pipeline stages, format detection with header caching,
 * and WebSocket reconnection with exponential backoff.
 *
 * @example Basic usage with NativeSTT, Anthropic LLM, and NativeTTS
 * ```typescript
 * import {
 *   CompositeVoice,
 *   NativeSTT,
 *   AnthropicLLM,
 *   NativeTTS,
 * } from '@lukeocodes/composite-voice';
 *
 * const voice = new CompositeVoice({
 *   providers: [
 *     new NativeSTT(),
 *     new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
 *     new NativeTTS(),
 *   ],
 * });
 *
 * voice.on('agent.stateChange', ({ state }) => console.log('State:', state));
 * voice.on('transcription.speechFinal', ({ text }) => console.log('User:', text));
 * voice.on('tts.audio', ({ audio }) => console.log('Audio chunk received'));
 *
 * await voice.initialize();
 * await voice.startListening();
 * ```
 *
 * @example Creating a custom provider
 * ```typescript
 * import { BaseLLMProvider } from '@lukeocodes/composite-voice';
 *
 * class MyCustomLLM extends BaseLLMProvider {
 *   // ... implement abstract methods
 * }
 * ```
 *
 * @see {@link CompositeVoice} for the main orchestrator class
 * @see {@link https://github.com/lukeocodes/composite-voice | GitHub repository} for full documentation
 */

// Main SDK class
export { CompositeVoice } from './CompositeVoice';

// Core types
export type {
  // Role types
  ProviderRole,

  // Audio types
  AudioFormat,
  AudioEncoding,
  AudioInputConfig,
  AudioOutputConfig,
  AudioMetadata,
  AudioChunk,
  AudioCaptureState,
  AudioPlaybackState,

  // Provider types
  ProviderType,
  BaseProvider,
  BaseProviderConfig,
  AudioInputProvider,
  AudioOutputProvider,
  STTProvider,
  STTProviderConfig,
  TranscriptionResult,
  LLMProvider,
  LLMProviderConfig,
  LLMMessage,
  LLMGenerationOptions,
  ToolAwareLLMProvider,
  LLMToolDefinition,
  LLMToolParameterSchema,
  LLMToolCall,
  LLMToolResult,
  LLMStreamChunk,
  TTSProvider,
  TTSProviderConfig,
  ResolvedPipeline,

  // Config types
  CompositeVoiceConfig,
  AudioBufferQueueConfig,
  ReconnectionConfig,
  LoggingConfig,
  ConversationHistoryConfig,
  EagerLLMConfig,
  TurnTakingConfig,
} from './core/types/index';

// Role constants
export { ALL_PROVIDER_ROLES } from './core/types/index';

// Event types
export type {
  AgentState,
  CompositeVoiceEvent,
  EventType,
  EventListener,
  EventListenerMap,
  TranscriptionEvent,
  TranscriptionSpeechFinalEvent,
  TranscriptionPreflightEvent,
  LLMEvent,
  TTSEvent,
  AgentEvent,
  AudioEvent,
  QueueEvent,
  QueueOverflowEvent,
  QueueStatsEvent,
} from './core/events/index';

// Event emitter
export { EventEmitter } from './core/events/index';

// Audio components
export { AudioCapture, AudioPlayer } from './core/audio/index';

// State machine
export { AgentStateMachine } from './core/state/index';

// Base provider classes (for creating custom providers)
export {
  BaseProvider as BaseProviderClass,
  BaseSTTProvider,
  BaseLLMProvider,
  BaseTTSProvider,
  BaseAgentProvider,
} from './providers/base/index';

// Built-in providers - STT
export { NativeSTT } from './providers/stt/native/index';
export type { NativeSTTConfig } from './providers/stt/native/index';
export { DeepgramSTT } from './providers/stt/deepgram/index';
export type {
  DeepgramSTTConfig,
  DeepgramTranscriptionOptions,
} from './providers/stt/deepgram/index';
export { AssemblyAISTT } from './providers/stt/assemblyai/index';
export type { AssemblyAISTTConfig } from './providers/stt/assemblyai/index';
export { DeepgramFlux } from './providers/stt/deepgram-flux/index';
export type { DeepgramFluxConfig, DeepgramFluxOptions } from './providers/stt/deepgram-flux/index';
export { ElevenLabsSTT, LANGUAGE_MAP, resolveLanguageCode } from './providers/stt/elevenlabs/index';
export type {
  ElevenLabsSTTConfig,
  ElevenLabsSTTModel,
  ElevenLabsSTTAudioFormat,
} from './providers/stt/elevenlabs/index';
export { SonioxSTT } from './providers/stt/soniox/index';
export type { SonioxSTTConfig } from './providers/stt/soniox/index';
export { GladiaSTT } from './providers/stt/gladia/index';
export type {
  GladiaSTTConfig,
  GladiaSTTEncoding,
  GladiaSTTRegion,
} from './providers/stt/gladia/index';
export { SpeechmaticsSTT } from './providers/stt/speechmatics/index';
export type { SpeechmaticsSTTConfig } from './providers/stt/speechmatics/index';
export { RevAISTT } from './providers/stt/revai/index';
export type { RevAISTTConfig } from './providers/stt/revai/index';
export { OpenAIRealtimeSTT } from './providers/stt/openai/index';
export type {
  OpenAIRealtimeSTTConfig,
  OpenAIRealtimeTurnDetection,
  OpenAIRealtimeServerVad,
  OpenAIRealtimeSemanticVad,
} from './providers/stt/openai/index';
export { GoogleSTT } from './providers/stt/google/index';
export type {
  GoogleSTTConfig,
  GoogleSTTEncoding,
  GoogleSTTWordInfo,
} from './providers/stt/google/index';

// Built-in providers - LLM (OpenAI-compatible base class for custom providers)
export { OpenAICompatibleLLM } from './providers/llm/openai-compatible/index';
export type { OpenAICompatibleLLMConfig } from './providers/llm/openai-compatible/index';
// Built-in providers - LLM
export { OpenAILLM } from './providers/llm/openai/index';
export type { OpenAILLMConfig } from './providers/llm/openai/index';
export { AnthropicLLM } from './providers/llm/anthropic/index';
export type { AnthropicLLMConfig } from './providers/llm/anthropic/index';
export { GroqLLM } from './providers/llm/groq/index';
export type { GroqLLMConfig } from './providers/llm/groq/index';
export { MistralLLM } from './providers/llm/mistral/index';
export type { MistralLLMConfig } from './providers/llm/mistral/index';
export { GeminiLLM } from './providers/llm/gemini/index';
export type { GeminiLLMConfig } from './providers/llm/gemini/index';
export { WebLLMLLM } from './providers/llm/webllm/index';
export type { WebLLMLLMConfig, WebLLMLoadProgress } from './providers/llm/webllm/index';

// Built-in providers - TTS
export { NativeTTS } from './providers/tts/native/index';
export type { NativeTTSConfig } from './providers/tts/native/index';
export { DeepgramTTS } from './providers/tts/deepgram/index';
export type { DeepgramTTSConfig, DeepgramTTSOptions } from './providers/tts/deepgram/index';
export { OpenAITTS } from './providers/tts/openai/index';
export type {
  OpenAITTSConfig,
  OpenAITTSVoice,
  OpenAITTSFormat,
} from './providers/tts/openai/index';
export { ElevenLabsTTS } from './providers/tts/elevenlabs/index';
export type {
  ElevenLabsTTSConfig,
  ElevenLabsTTSModel,
  ElevenLabsOutputFormat,
} from './providers/tts/elevenlabs/index';
export { CartesiaTTS } from './providers/tts/cartesia/index';
export type {
  CartesiaTTSConfig,
  CartesiaTTSModel,
  CartesiaOutputEncoding,
  CartesiaOutputFormat,
} from './providers/tts/cartesia/index';
export { SpeechifyTTS } from './providers/tts/speechify/index';
export type {
  SpeechifyTTSConfig,
  SpeechifyTTSModel,
  SpeechifyTTSFormat,
} from './providers/tts/speechify/index';
export { MurfTTS } from './providers/tts/murf/index';
export type {
  MurfTTSConfig,
  MurfTTSModelVersion,
  MurfTTSFormat,
  MurfTTSSampleRate,
  MurfTTSChannelType,
} from './providers/tts/murf/index';
export { LMNTTTS } from './providers/tts/lmnt/index';
export type {
  LMNTTTSConfig,
  LMNTTTSModel,
  LMNTTTSFormat,
  LMNTTTSSampleRate,
} from './providers/tts/lmnt/index';
export { SmallestTTS } from './providers/tts/smallest/index';
export type {
  SmallestTTSConfig,
  SmallestTTSModel,
  SmallestTTSFormat,
  SmallestTTSSampleRate,
} from './providers/tts/smallest/index';
export { RimeTTS } from './providers/tts/rime/index';
export type { RimeTTSConfig, RimeTTSModel, RimeTTSFormat } from './providers/tts/rime/index';
export { MiniMaxTTS } from './providers/tts/minimax/index';
export type {
  MiniMaxTTSConfig,
  MiniMaxTTSModel,
  MiniMaxTTSFormat,
  MiniMaxTTSEmotion,
} from './providers/tts/minimax/index';
export { FishAudioTTS } from './providers/tts/fishaudio/index';
export type {
  FishAudioTTSConfig,
  FishAudioTTSModel,
  FishAudioTTSFormat,
  FishAudioTTSLatency,
  FishAudioReference,
} from './providers/tts/fishaudio/index';
export { GoogleTTS } from './providers/tts/google/index';
export type {
  GoogleTTSConfig,
  GoogleTTSAudioEncoding,
  GoogleTTSSsmlGender,
} from './providers/tts/google/index';

// Built-in providers - Agent (single-WebSocket STT+LLM+TTS)
export { DeepgramAgent } from './providers/agent/index';
export type {
  DeepgramAgentConfig,
  AgentFunctionDefinition,
  AgentAudioConfig,
  AgentListenConfig,
  AgentThinkConfig,
  AgentSpeakConfig,
  DeepgramAgentEvent,
  ThinkProvider,
  SpeakProvider,
} from './providers/agent/index';

// Built-in providers - Input
export { MicrophoneInput } from './providers/input/index';
export type { MicrophoneInputConfig } from './providers/input/index';
export { BufferInput } from './providers/input/index';

// Built-in providers - Output
export { BrowserAudioOutput } from './providers/output/index';
export type { BrowserAudioOutputConfig } from './providers/output/index';
export { NullOutput } from './providers/output/index';

// Utilities
export {
  // Errors
  CompositeVoiceError,
  ProviderInitializationError,
  ProviderConnectionError,
  AudioCaptureError,
  AudioPlaybackError,
  MicrophonePermissionError,
  ConfigurationError,
  InvalidStateError,
  ProviderResponseError,
  TimeoutError,
  WebSocketError,

  // Logger
  Logger,
  createLogger,

  // WebSocket manager
  WebSocketManager,
  WebSocketState,

  // Text similarity (for eager LLM pipeline)
  textSimilarity,

  // Audio utilities
  floatTo16BitPCM,
  int16ToFloat,
  concatenateArrayBuffers,
  downsampleAudio,
  getAudioMimeType,
  createWavHeader,
  blobToArrayBuffer,
  createAudioBlob,
  calculateRMS,
  isSilent,
  applyFade,

  // Audio format detection
  detectAudioFormat,
  extractHeader,
  MIN_SNIFF_BYTES,
} from './utils/index';

// Audio format detection types
export type { DetectedAudioFormat } from './utils/index';

// Pipeline utilities
export {
  AudioBufferQueue,
  AudioHeaderCache,
  TTSBackpressure,
  resolveProviders,
  configureSTTFromMetadata,
} from './core/pipeline/index';
export type { QueueStats, DrainCallback, OverflowCallback } from './core/pipeline/index';

// Collaborator classes (extracted from CompositeVoice for modularity)
export {
  ConversationManager,
  TurnTakingController,
  EagerLLMController,
  AudioRouter,
} from './core/collaborators/index';
export type { ReconcileResult } from './core/collaborators/index';

// Recovery orchestrator
export { RecoveryOrchestrator } from './core/RecoveryOrchestrator';
export type { RecoveryStrategy, RecoveryEvent } from './core/RecoveryOrchestrator';

// Provider event adapter (optional debugging utility)
export { ProviderEventAdapter } from './core/ProviderEventAdapter';
