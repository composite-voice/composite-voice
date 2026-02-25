/**
 * Configuration types for the CompositeVoice SDK.
 *
 * @remarks
 * This module defines all configuration interfaces used to initialize and customize
 * a CompositeVoice agent. The main entry point is {@link CompositeVoiceConfig}, which
 * composes provider selection with audio, reconnection, logging, turn-taking, conversation
 * history, and eager LLM settings.
 *
 * Default values for each configuration group are exported as constants (e.g.,
 * {@link DEFAULT_AUDIO_INPUT_CONFIG}, {@link DEFAULT_RECONNECTION_CONFIG}) and are
 * automatically applied by the SDK when options are not explicitly provided.
 *
 * @packageDocumentation
 */

import type { AudioInputConfig, AudioOutputConfig } from './audio';
import type { STTProvider, LLMProvider, TTSProvider } from './providers';

/**
 * Provider configuration specifying the STT, LLM, and TTS providers for the agent.
 *
 * @remarks
 * Every CompositeVoice agent requires exactly one provider for each pipeline stage:
 * speech-to-text (STT), large language model (LLM), and text-to-speech (TTS).
 * Providers can be either REST-based or WebSocket-based (live/streaming).
 *
 * @example
 * ```typescript
 * import { DeepgramSTT, AnthropicLLM, DeepgramTTS } from 'composite-voice';
 *
 * const providers: ProviderConfig = {
 *   stt: new DeepgramSTT({ apiKey: 'dg-key', model: 'nova-3' }),
 *   llm: new AnthropicLLM({ apiKey: 'anthropic-key', model: 'claude-sonnet-4-20250514' }),
 *   tts: new DeepgramTTS({ apiKey: 'dg-key', model: 'aura-2' }),
 * };
 * ```
 *
 * @see {@link STTProvider} for speech-to-text provider interfaces
 * @see {@link LLMProvider} for LLM provider interface
 * @see {@link TTSProvider} for text-to-speech provider interfaces
 */
export interface ProviderConfig {
  /**
   * Speech-to-text provider instance.
   *
   * @see {@link STTProvider}
   */
  stt: STTProvider;

  /**
   * Large language model provider instance.
   *
   * @see {@link LLMProvider}
   */
  llm: LLMProvider;

  /**
   * Text-to-speech provider instance.
   *
   * @see {@link TTSProvider}
   */
  tts: TTSProvider;
}

/**
 * Audio configuration grouping input (capture) and output (playback) settings.
 *
 * @remarks
 * Wraps {@link AudioInputConfig} and {@link AudioOutputConfig} as optional partials.
 * Any properties you omit will be filled in from {@link DEFAULT_AUDIO_INPUT_CONFIG}
 * and {@link DEFAULT_AUDIO_OUTPUT_CONFIG} respectively.
 *
 * @example
 * ```typescript
 * const audio: AudioConfig = {
 *   input: { sampleRate: 16000, format: 'pcm' },
 *   output: { minBufferDuration: 150 },
 * };
 * ```
 *
 * @see {@link AudioInputConfig} for all input options
 * @see {@link AudioOutputConfig} for all output options
 */
export interface AudioConfig {
  /**
   * Audio input (microphone) configuration.
   *
   * @remarks
   * Partial -- unspecified properties fall back to {@link DEFAULT_AUDIO_INPUT_CONFIG}.
   *
   * @see {@link AudioInputConfig}
   */
  input?: Partial<AudioInputConfig>;

  /**
   * Audio output (playback) configuration.
   *
   * @remarks
   * Partial -- unspecified properties fall back to {@link DEFAULT_AUDIO_OUTPUT_CONFIG}.
   *
   * @see {@link AudioOutputConfig}
   */
  output?: Partial<AudioOutputConfig>;
}

/**
 * Configuration for automatic WebSocket reconnection with exponential backoff.
 *
 * @remarks
 * WebSocket-based providers (e.g., DeepgramSTT, DeepgramTTS) can lose their
 * connection due to network issues. When reconnection is enabled, the SDK
 * automatically attempts to re-establish the connection using exponential backoff.
 *
 * The delay between attempts is calculated as:
 * `min(initialDelay * backoffMultiplier ^ attempt, maxDelay)`
 *
 * @example
 * ```typescript
 * const reconnection: ReconnectionConfig = {
 *   enabled: true,
 *   maxAttempts: 5,
 *   initialDelay: 1000,
 *   maxDelay: 30000,
 *   backoffMultiplier: 2,
 * };
 * ```
 *
 * @see {@link DEFAULT_RECONNECTION_CONFIG} for default values
 * @see {@link CompositeVoiceConfig} for where this is used
 */
export interface ReconnectionConfig {
  /**
   * Whether automatic reconnection is enabled.
   *
   * @defaultValue true (via {@link DEFAULT_RECONNECTION_CONFIG})
   */
  enabled: boolean;

  /**
   * Maximum number of reconnection attempts before giving up.
   *
   * @remarks
   * After this many failed attempts, the SDK emits an error event and stops retrying.
   *
   * @defaultValue 5
   */
  maxAttempts?: number;

  /**
   * Initial delay before the first reconnection attempt, in milliseconds.
   *
   * @defaultValue 1000
   */
  initialDelay?: number;

  /**
   * Maximum delay between reconnection attempts, in milliseconds.
   *
   * @remarks
   * Caps the exponential backoff to prevent excessively long waits.
   *
   * @defaultValue 30000
   */
  maxDelay?: number;

  /**
   * Multiplier applied to the delay after each failed attempt.
   *
   * @remarks
   * A value of 2 doubles the delay each time: 1s, 2s, 4s, 8s, ...
   *
   * @defaultValue 2
   */
  backoffMultiplier?: number;
}

/**
 * Configuration for SDK logging output.
 *
 * @remarks
 * Controls whether the SDK emits log messages and at what verbosity level.
 * You can supply a custom logger function to route SDK logs into your own
 * logging infrastructure (e.g., a remote logging service or structured logger).
 *
 * @example
 * ```typescript
 * const logging: LoggingConfig = {
 *   enabled: true,
 *   level: 'debug',
 *   logger: (level, message, ...args) => {
 *     myLogger.log({ level, message, data: args });
 *   },
 * };
 * ```
 *
 * @see {@link DEFAULT_LOGGING_CONFIG} for default values
 * @see {@link CompositeVoiceConfig} for where this is used
 */
export interface LoggingConfig {
  /**
   * Whether logging is enabled.
   *
   * @defaultValue false (via {@link DEFAULT_LOGGING_CONFIG})
   */
  enabled: boolean;

  /**
   * Minimum log level to emit.
   *
   * @remarks
   * Messages below this level are suppressed. Levels in order of increasing
   * severity: `'debug'`, `'info'`, `'warn'`, `'error'`.
   *
   * @defaultValue `'info'`
   */
  level?: 'debug' | 'info' | 'warn' | 'error';

  /**
   * Custom logger function to handle log output.
   *
   * @remarks
   * When provided, the SDK calls this function instead of `console.log`.
   * Return `void` or `undefined`.
   *
   * @param level - The log level string (`'debug'`, `'info'`, `'warn'`, or `'error'`)
   * @param message - The log message
   * @param args - Additional data associated with the log entry
   */
  logger?: (level: string, message: string, ...args: unknown[]) => void | undefined;
}

/**
 * Configuration for turn-taking behavior between the user and the agent.
 *
 * @remarks
 * Controls whether the SDK pauses microphone capture while the agent is speaking
 * (TTS playback). This prevents the agent's own speech from being picked up by the
 * microphone and re-transcribed, which would create a feedback loop.
 *
 * The `'auto'` mode lets the SDK decide based on the provider combination and the
 * chosen {@link TurnTakingConfig.autoStrategy | autoStrategy}.
 *
 * @example
 * ```typescript
 * const turnTaking: TurnTakingConfig = {
 *   pauseCaptureOnPlayback: 'auto',
 *   autoStrategy: 'conservative',
 * };
 * ```
 *
 * @see {@link DEFAULT_TURN_TAKING_CONFIG} for default values
 * @see {@link CompositeVoiceConfig} for where this is used
 */
export interface TurnTakingConfig {
  /**
   * Whether to pause audio capture during TTS playback.
   *
   * @remarks
   * - `'auto'` - Let the SDK decide based on the provider combination and {@link TurnTakingConfig.autoStrategy | autoStrategy}
   * - `true` - Always pause capture during playback (prevents echo, safe default)
   * - `false` - Never pause capture (full-duplex mode, requires good echo cancellation)
   *
   * @defaultValue `'auto'`
   */
  pauseCaptureOnPlayback: 'auto' | boolean;

  /**
   * Strategy to use when {@link TurnTakingConfig.pauseCaptureOnPlayback | pauseCaptureOnPlayback} is `'auto'`.
   *
   * @remarks
   * - `'conservative'` - Pause for most provider combinations (safer, prevents echo)
   * - `'aggressive'` - Only pause for known problematic combinations listed in
   *   {@link TurnTakingConfig.alwaysPauseCombinations | alwaysPauseCombinations}
   * - `'detect'` - Attempt to detect echo cancellation support at runtime
   *
   * @defaultValue `'conservative'`
   */
  autoStrategy?: 'conservative' | 'aggressive' | 'detect';

  /**
   * Provider combinations that should always pause capture during playback.
   *
   * @remarks
   * Used when {@link TurnTakingConfig.autoStrategy | autoStrategy} is `'aggressive'`.
   * Each entry specifies an STT and TTS provider name pair. Use `'any'` as a wildcard.
   *
   * @defaultValue `[{ stt: 'NativeSTT', tts: 'NativeTTS' }]`
   */
  alwaysPauseCombinations?: Array<{ stt: string; tts: string }>;
}

/**
 * Configuration for the eager LLM pipeline (speculative generation).
 *
 * @remarks
 * When enabled, CompositeVoice starts LLM generation speculatively the moment
 * the STT provider emits a preflight/eager-end-of-turn signal -- before
 * `speech_final` is confirmed. This reduces speech-to-first-token latency
 * significantly for Deepgram v2 models (e.g., `flux-general-en`).
 *
 * If `speech_final` arrives with different text than the preflight, the SDK
 * can cancel the speculative generation and restart with the confirmed text
 * (controlled by {@link EagerLLMConfig.cancelOnTextChange | cancelOnTextChange}).
 *
 * @example
 * ```typescript
 * const eagerLLM: EagerLLMConfig = {
 *   enabled: true,
 *   cancelOnTextChange: true,
 * };
 * ```
 *
 * @see {@link TranscriptionPreflightEvent} for the event that triggers eager generation
 * @see {@link CompositeVoiceConfig} for where this is used
 */
export interface EagerLLMConfig {
  /**
   * Whether to enable eager LLM start on STT preflight events.
   *
   * @defaultValue false
   */
  enabled: boolean;

  /**
   * Whether to cancel speculative generation if the confirmed text differs.
   *
   * @remarks
   * When `true`, if `speech_final` arrives with different text than the
   * preflight, the in-flight LLM generation is cancelled via `AbortSignal`
   * and restarted with the confirmed text. When `false`, the preflight
   * result is always accepted (lower latency, small risk of a slightly
   * inaccurate response).
   *
   * @defaultValue true
   */
  cancelOnTextChange?: boolean;
}

/**
 * Configuration for multi-turn conversation history.
 *
 * @remarks
 * When enabled, the SDK accumulates user and assistant messages across turns
 * and sends them to the LLM as context, enabling multi-turn conversations.
 * The {@link ConversationHistoryConfig.maxTurns | maxTurns} setting controls
 * how many turns are retained; oldest turns are dropped when the limit is reached.
 *
 * @example
 * ```typescript
 * const conversationHistory: ConversationHistoryConfig = {
 *   enabled: true,
 *   maxTurns: 10,
 * };
 * ```
 *
 * @see {@link LLMMessage} for the message format sent to the LLM
 * @see {@link CompositeVoiceConfig} for where this is used
 */
export interface ConversationHistoryConfig {
  /**
   * Whether conversation history is enabled.
   *
   * @remarks
   * When `true`, all turns are accumulated and sent to the LLM as context.
   *
   * @defaultValue false
   */
  enabled: boolean;

  /**
   * Maximum number of conversation turns to retain.
   *
   * @remarks
   * A "turn" is a user + assistant message pair. Oldest turns are dropped
   * when the limit is reached. Set to `0` for unlimited history.
   *
   * @defaultValue 0
   */
  maxTurns?: number;
}

/**
 * Main configuration type for the CompositeVoice SDK.
 *
 * @remarks
 * This is the top-level configuration object passed to the `CompositeVoice` constructor.
 * It extends {@link ProviderConfig} (requiring STT, LLM, and TTS providers) and adds
 * optional settings for audio, reconnection, logging, turn-taking, conversation history,
 * eager LLM, error recovery, and custom extensions.
 *
 * All optional fields have sensible defaults that are applied automatically by the SDK.
 *
 * @example
 * ```typescript
 * import { CompositeVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from 'composite-voice';
 *
 * const agent = new CompositeVoice({
 *   stt: new DeepgramSTT({ apiKey: 'dg-key', model: 'nova-3' }),
 *   llm: new AnthropicLLM({ apiKey: 'anthropic-key', model: 'claude-sonnet-4-20250514' }),
 *   tts: new DeepgramTTS({ apiKey: 'dg-key', model: 'aura-2' }),
 *   audio: {
 *     input: { sampleRate: 16000, format: 'pcm' },
 *   },
 *   conversationHistory: { enabled: true, maxTurns: 10 },
 *   logging: { enabled: true, level: 'debug' },
 * });
 * ```
 *
 * @see {@link ProviderConfig} for required provider fields
 * @see {@link AudioConfig} for audio configuration
 * @see {@link ReconnectionConfig} for WebSocket reconnection settings
 * @see {@link TurnTakingConfig} for turn-taking behavior
 * @see {@link EagerLLMConfig} for speculative generation settings
 * @see {@link ConversationHistoryConfig} for multi-turn history
 */
export type CompositeVoiceConfig = ProviderConfig & {
  /**
   * Audio configuration for input capture and output playback.
   *
   * @see {@link AudioConfig}
   */
  audio?: AudioConfig;

  /**
   * WebSocket reconnection configuration.
   *
   * @remarks
   * Defaults to {@link DEFAULT_RECONNECTION_CONFIG} when not specified.
   *
   * @see {@link ReconnectionConfig}
   */
  reconnection?: ReconnectionConfig;

  /**
   * Logging configuration.
   *
   * @remarks
   * Defaults to {@link DEFAULT_LOGGING_CONFIG} when not specified.
   *
   * @see {@link LoggingConfig}
   */
  logging?: LoggingConfig;

  /**
   * Turn-taking behavior configuration.
   *
   * @remarks
   * Defaults to {@link DEFAULT_TURN_TAKING_CONFIG} when not specified.
   *
   * @see {@link TurnTakingConfig}
   */
  turnTaking?: TurnTakingConfig;

  /**
   * Conversation history configuration.
   *
   * @remarks
   * When enabled, previous turns are sent to the LLM as context for
   * multi-turn conversations.
   *
   * @see {@link ConversationHistoryConfig}
   */
  conversationHistory?: ConversationHistoryConfig;

  /**
   * Eager LLM configuration.
   *
   * @remarks
   * When enabled, the LLM starts speculatively on STT preflight events,
   * reducing speech-to-first-token latency.
   *
   * @see {@link EagerLLMConfig}
   */
  eagerLLM?: EagerLLMConfig;

  /**
   * Whether to enable automatic error recovery.
   *
   * @remarks
   * When `true`, the SDK attempts to recover from provider errors
   * automatically (e.g., reinitializing a crashed provider) instead of
   * propagating the error immediately.
   */
  autoRecover?: boolean;

  /**
   * Additional custom configuration for provider-specific or application-specific needs.
   *
   * @remarks
   * This catch-all record allows you to pass arbitrary data through the
   * configuration without extending the type. Providers can read from this
   * via the config object.
   */
  extra?: Record<string, unknown>;
};

/**
 * Default audio input configuration values.
 *
 * @remarks
 * These defaults are optimized for speech recognition: 16kHz mono PCM with
 * all browser audio processing features enabled.
 *
 * @see {@link AudioInputConfig} for the type definition
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
 * Default audio output configuration values.
 *
 * @remarks
 * These defaults provide a balance between low latency and smooth playback.
 * The 200ms minimum buffer duration prevents stuttering on most devices.
 *
 * @see {@link AudioOutputConfig} for the type definition
 */
export const DEFAULT_AUDIO_OUTPUT_CONFIG: AudioOutputConfig = {
  bufferSize: 4096,
  minBufferDuration: 200,
  enableSmoothing: true,
};

/**
 * Default WebSocket reconnection configuration values.
 *
 * @remarks
 * Reconnection is enabled by default with up to 5 attempts using exponential
 * backoff starting at 1 second and capping at 30 seconds. The backoff sequence
 * is: 1s, 2s, 4s, 8s, 16s (capped at 30s).
 *
 * @see {@link ReconnectionConfig} for the type definition
 */
export const DEFAULT_RECONNECTION_CONFIG: ReconnectionConfig = {
  enabled: true,
  maxAttempts: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Default logging configuration values.
 *
 * @remarks
 * Logging is disabled by default. When enabled, the default level is `'info'`.
 *
 * @see {@link LoggingConfig} for the type definition
 */
export const DEFAULT_LOGGING_CONFIG: LoggingConfig = {
  enabled: false,
  level: 'info',
};

/**
 * Default turn-taking configuration values.
 *
 * @remarks
 * Uses `'auto'` with a `'conservative'` strategy by default, which pauses
 * microphone capture during TTS playback for most provider combinations.
 * NativeSTT is always paused because the Web Speech API cannot handle
 * concurrent input and output.
 *
 * @see {@link TurnTakingConfig} for the type definition
 */
export const DEFAULT_TURN_TAKING_CONFIG: TurnTakingConfig = {
  pauseCaptureOnPlayback: 'auto',
  autoStrategy: 'conservative',
  alwaysPauseCombinations: [
    { stt: 'NativeSTT', tts: 'NativeTTS' },
    { stt: 'NativeSTT', tts: 'any' }, // NativeSTT always needs pause
  ],
};
