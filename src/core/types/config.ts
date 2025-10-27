/**
 * Configuration types for the CompositeVoice SDK
 */

import type { AudioInputConfig, AudioOutputConfig } from './audio';
import type { STTProvider, LLMProvider, TTSProvider } from './providers';

/**
 * Configuration for CompositeVoice (STT, LLM, TTS providers)
 */
export interface ProviderConfig {
  /** Speech-to-text provider */
  stt: STTProvider;
  /** Large language model provider */
  llm: LLMProvider;
  /** Text-to-speech provider */
  tts: TTSProvider;
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
 * Turn-taking behavior configuration
 */
export interface TurnTakingConfig {
  /**
   * Whether to pause audio capture during TTS playback
   *
   * Set to 'auto' to let the SDK decide based on providers
   * Set to true to always pause (prevents echo, safe default)
   * Set to false to never pause (full-duplex, requires good echo cancellation)
   *
   * @default 'auto'
   */
  pauseCaptureOnPlayback: 'auto' | boolean;

  /**
   * Strategy to use when pauseCaptureOnPlayback is 'auto'
   *
   * 'conservative': Pause for most providers (safer, prevents echo)
   * 'aggressive': Only pause for known problematic combinations
   * 'detect': Attempt to detect echo cancellation support at runtime
   *
   * @default 'conservative'
   */
  autoStrategy?: 'conservative' | 'aggressive' | 'detect';

  /**
   * Provider combinations that should always pause
   * Used when autoStrategy is 'aggressive'
   *
   * @default [{ stt: 'NativeSTT', tts: 'NativeTTS' }]
   */
  alwaysPauseCombinations?: Array<{ stt: string; tts: string }>;
}

/**
 * Main SDK configuration
 */
export type CompositeVoiceConfig = ProviderConfig & {
  /** Audio configuration */
  audio?: AudioConfig;
  /** WebSocket reconnection configuration */
  reconnection?: ReconnectionConfig;
  /** Logging configuration */
  logging?: LoggingConfig;
  /** Turn-taking behavior configuration */
  turnTaking?: TurnTakingConfig;
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

/**
 * Default turn-taking configuration
 */
export const DEFAULT_TURN_TAKING_CONFIG: TurnTakingConfig = {
  pauseCaptureOnPlayback: 'auto',
  autoStrategy: 'conservative',
  alwaysPauseCombinations: [
    { stt: 'NativeSTT', tts: 'NativeTTS' },
    { stt: 'NativeSTT', tts: 'any' }, // NativeSTT always needs pause
  ],
};
