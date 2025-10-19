/**
 * Configuration types for the CompositeVoice SDK
 */

import type { AudioInputConfig, AudioOutputConfig } from './audio';
import type { STTProvider, LLMProvider, TTSProvider, AllInOneProvider } from './providers';

/**
 * Agent mode
 */
export type AgentMode = 'composite' | 'all-in-one';

/**
 * Configuration for composite mode (separate STT, LLM, TTS providers)
 */
export interface CompositeConfig {
  mode: 'composite';
  /** Speech-to-text provider */
  stt: STTProvider;
  /** Large language model provider */
  llm: LLMProvider;
  /** Text-to-speech provider */
  tts: TTSProvider;
}

/**
 * Configuration for all-in-one mode (single integrated provider)
 */
export interface AllInOneConfig {
  mode: 'all-in-one';
  /** All-in-one provider that handles STT → LLM → TTS */
  provider: AllInOneProvider;
}

/**
 * Audio configuration
 */
export interface AudioConfig {
  /** Audio input (microphone) configuration */
  input?: Partial<AudioInputConfig>;
  /** Audio output (playback) configuration */
  output?: Partial<AudioOutputConfig>;
}

/**
 * Reconnection configuration for WebSocket providers
 */
export interface ReconnectionConfig {
  /** Enable automatic reconnection */
  enabled: boolean;
  /** Maximum number of reconnection attempts */
  maxAttempts?: number;
  /** Initial delay before reconnection in ms */
  initialDelay?: number;
  /** Maximum delay between reconnection attempts in ms */
  maxDelay?: number;
  /** Backoff multiplier for exponential backoff */
  backoffMultiplier?: number;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  /** Enable logging */
  enabled: boolean;
  /** Log level */
  level?: 'debug' | 'info' | 'warn' | 'error';
  /** Custom logger function */
  logger?: (level: string, message: string, ...args: unknown[]) => void | undefined;
}

/**
 * Main SDK configuration
 */
export type CompositeVoiceConfig = (CompositeConfig | AllInOneConfig) & {
  /** Audio configuration */
  audio?: AudioConfig;
  /** WebSocket reconnection configuration */
  reconnection?: ReconnectionConfig;
  /** Logging configuration */
  logging?: LoggingConfig;
  /** Enable automatic error recovery */
  autoRecover?: boolean;
  /** Additional custom configuration */
  extra?: Record<string, unknown>;
};

/**
 * Default audio input configuration
 */
export const DEFAULT_AUDIO_INPUT_CONFIG: AudioInputConfig = {
  sampleRate: 16000,
  format: 'pcm',
  channels: 1,
  chunkDuration: 100,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

/**
 * Default audio output configuration
 */
export const DEFAULT_AUDIO_OUTPUT_CONFIG: AudioOutputConfig = {
  bufferSize: 4096,
  minBufferDuration: 200,
  enableSmoothing: true,
};

/**
 * Default reconnection configuration
 */
export const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  enabled: true,
  maxAttempts: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Default logging configuration
 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  enabled: false,
  level: 'info',
};
