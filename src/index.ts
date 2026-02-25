/**
 * CompositeVoice SDK - Main entry point
 */

// Main SDK class
export { CompositeVoice } from './CompositeVoice';

// Core types
export type {
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
  STTProvider,
  STTProviderConfig,
  TranscriptionResult,
  LLMProvider,
  LLMProviderConfig,
  LLMMessage,
  LLMGenerationOptions,
  TTSProvider,
  TTSProviderConfig,

  // Config types
  CompositeVoiceConfig,
  AudioConfig,
  ReconnectionConfig,
  LoggingConfig,
  ConversationHistoryConfig,
  EagerLLMConfig,
  TurnTakingConfig,
} from './core/types/index';

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
export { WebLLMLLM } from './providers/llm/webllm/index';
export type { WebLLMLLMConfig, WebLLMLoadProgress } from './providers/llm/webllm/index';

// Built-in providers - TTS
export { NativeTTS } from './providers/tts/native/index';
export type { NativeTTSConfig } from './providers/tts/native/index';
export { DeepgramTTS } from './providers/tts/deepgram/index';
export type { DeepgramTTSConfig, DeepgramTTSOptions } from './providers/tts/deepgram/index';
export { OpenAITTS } from './providers/tts/openai/index';
export type { OpenAITTSConfig, OpenAITTSVoice, OpenAITTSFormat } from './providers/tts/openai/index';
export { ElevenLabsTTS } from './providers/tts/elevenlabs/index';
export type {
  ElevenLabsTTSConfig,
  ElevenLabsTTSModel,
  ElevenLabsOutputFormat,
} from './providers/tts/elevenlabs/index';

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
} from './utils/index';
