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
  AllInOneProvider,
  AllInOneProviderConfig,

  // Config types
  CompositeVoiceConfig,
  CompositeConfig,
  AllInOneConfig,
  AudioConfig,
  ReconnectionConfig,
  LoggingConfig,
} from './core/types/index';

// Event types
export type {
  AgentState,
  CompositeVoiceEvent,
  EventType,
  EventListener,
  EventListenerMap,
  TranscriptionEvent,
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
  BaseAllInOneProvider,
} from './providers/base/index';

// Built-in providers
export { NativeSTT } from './providers/stt/native/index';
export { NativeTTS } from './providers/tts/native/index';

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
