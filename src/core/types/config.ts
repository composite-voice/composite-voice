/**
 * Configuration types for the CompositeVoice SDK.
 *
 * @remarks
 * This module defines all configuration interfaces used to initialize and customize
 * a CompositeVoice agent. The main entry point is {@link CompositeVoiceConfig}, which
 * accepts a flat `providers` array for pipeline configuration, plus optional settings
 * for queue buffering, reconnection, logging, turn-taking, conversation history, and
 * eager LLM.
 *
 * Default values for each configuration group are exported as constants (e.g.,
 * {@link DEFAULT_AUDIO_INPUT_CONFIG}, {@link DEFAULT_RECONNECTION_CONFIG}) and are
 * automatically applied by the SDK when options are not explicitly provided.
 *
 * @packageDocumentation
 */

import type { AudioInputConfig, AudioOutputConfig } from './audio';
import type { BaseProvider } from './providers';

/**
 * Configuration for an {@link AudioBufferQueue} instance.
 *
 * @remarks
 * Controls the bounded FIFO queue used between pipeline stages (e.g., between
 * an `AudioInputProvider` and the STT provider, or between the TTS provider
 * and an `AudioOutputProvider`). The queue buffers audio frames while the
 * downstream consumer is not yet connected (e.g., during STT WebSocket
 * handshake) and flushes them in order once `startDraining()` is called.
 *
 * @example
 * ```typescript
 * const queueConfig: AudioBufferQueueConfig = {
 *   name: 'input-queue',
 *   maxSize: 2000,
 *   overflowStrategy: 'drop-oldest',
 * };
 * ```
 *
 * @see {@link CompositeVoiceConfig} for where queue config is specified
 */
export interface AudioBufferQueueConfig {
  /**
   * Diagnostic name for the queue, used in log messages and stats events.
   *
   * @remarks
   * When specified via {@link CompositeVoiceConfig.queue}, the SDK automatically
   * assigns names (`'input'` and `'output'`), so this field is optional in that
   * context.
   */
  name: string;

  /**
   * Maximum number of audio chunks the queue can hold before overflow handling
   * kicks in.
   *
   * @remarks
   * When the queue reaches this size and a new chunk is enqueued, the
   * {@link AudioBufferQueueConfig.overflowStrategy | overflowStrategy}
   * determines what happens.
   *
   * @defaultValue 1000
   */
  maxSize: number;

  /**
   * Strategy for handling queue overflow when {@link maxSize} is reached.
   *
   * @remarks
   * - `'drop-oldest'` — Removes the oldest chunk to make room (default).
   *   Best for real-time audio where stale frames are less useful.
   * - `'drop-newest'` — Discards the incoming chunk. Useful when preserving
   *   the beginning of a stream is more important.
   * - `'block'` — Blocks the enqueue call until space is available.
   *   Use with caution as it can cause backpressure in the pipeline.
   *
   * @defaultValue `'drop-oldest'`
   */
  overflowStrategy: 'drop-oldest' | 'drop-newest' | 'block';
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
 * significantly for DeepgramFlux (e.g., `flux-general-en`).
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
   * Whether to cancel speculative generation if the confirmed text differs
   * beyond the {@link similarityThreshold}.
   *
   * @remarks
   * When `true`, if `speech_final` arrives with text that is less similar
   * than `similarityThreshold` to the preflight text, the in-flight LLM
   * generation is cancelled via `AbortSignal` and restarted with the
   * confirmed text. When `false`, the preflight result is always accepted
   * (lowest latency, small risk of an inaccurate response).
   *
   * @defaultValue true
   */
  cancelOnTextChange?: boolean;

  /**
   * Minimum text similarity (0–1) for the eager LLM response to be accepted.
   *
   * @remarks
   * When the confirmed `speech_final` text arrives, it is compared to the
   * preflight text using word-overlap similarity. If the score is **at or
   * above** this threshold, the speculative LLM response is kept. If it is
   * below, the response is cancelled and restarted (when
   * {@link cancelOnTextChange} is `true`).
   *
   * A value of `1.0` requires an exact match (rarely useful in practice).
   * A value of `0.8` allows minor additions at the end of the utterance.
   * A value of `0.5` is very permissive — only cancels when the text
   * changes substantially.
   *
   * @defaultValue 0.8
   */
  similarityThreshold?: number;
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
   * When both `maxTurns` and {@link maxTokens} are set, the more restrictive
   * limit wins (i.e., both constraints are applied and the smallest resulting
   * history is used).
   *
   * @defaultValue 0
   */
  maxTurns?: number;

  /**
   * Approximate token budget for conversation history.
   *
   * @remarks
   * When set, the SDK estimates token count using a `Math.ceil(text.length / 4)`
   * heuristic (roughly 1 token per 4 characters). Oldest non-system turns are
   * removed until the total estimated token count fits within this budget.
   *
   * This is a coarse heuristic, not an exact tokenizer — actual token counts
   * will vary by model and language. Use this as a safety net to prevent
   * excessively large context windows, not as a precise limit.
   *
   * When both {@link maxTurns} and `maxTokens` are set, the more restrictive
   * limit wins.
   *
   * @defaultValue undefined (no token limit)
   */
  maxTokens?: number;

  /**
   * Whether to preserve system messages during history trimming.
   *
   * @remarks
   * When `true` (the default), system messages (role `'system'`) are never
   * removed by turn-based or token-based trimming. They are separated before
   * trimming and prepended back afterward, ensuring system instructions are
   * always present in the LLM context.
   *
   * Set to `false` to treat system messages the same as user/assistant
   * messages during trimming.
   *
   * @defaultValue true
   */
  preserveSystemMessages?: boolean;
}

/**
 * Main configuration type for the CompositeVoice SDK.
 *
 * @remarks
 * This is the top-level configuration object passed to the `CompositeVoice` constructor.
 * It accepts a flat `providers` array containing all pipeline providers, plus optional
 * settings for queue buffering, reconnection, logging, turn-taking, conversation history,
 * eager LLM, error recovery, and custom extensions.
 *
 * The `providers` array replaces the old `{ stt, llm, tts }` pattern, enabling
 * multi-role providers (e.g., NativeSTT covering both `'input'` and `'stt'` roles)
 * and explicit audio I/O providers (e.g., `MicrophoneInput`, `BrowserAudioOutput`).
 *
 * All optional fields have sensible defaults that are applied automatically by the SDK.
 *
 * @example 3-provider config (multi-role NativeSTT and NativeTTS)
 * ```typescript
 * import { CompositeVoice, NativeSTT, AnthropicLLM, NativeTTS } from 'composite-voice';
 *
 * const agent = new CompositeVoice({
 *   providers: [
 *     new NativeSTT(),
 *     new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
 *     new NativeTTS(),
 *   ],
 *   conversationHistory: { enabled: true, maxTurns: 10 },
 *   logging: { enabled: true, level: 'debug' },
 * });
 * ```
 *
 * @example 5-provider config (explicit audio I/O)
 * ```typescript
 * import {
 *   CompositeVoice,
 *   MicrophoneInput,
 *   DeepgramSTT,
 *   AnthropicLLM,
 *   DeepgramTTS,
 *   BrowserAudioOutput,
 * } from 'composite-voice';
 *
 * const agent = new CompositeVoice({
 *   providers: [
 *     new MicrophoneInput({ sampleRate: 16000 }),
 *     new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
 *     new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
 *     new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
 *     new BrowserAudioOutput(),
 *   ],
 *   queue: {
 *     input: { maxSize: 2000 },
 *     output: { maxSize: 500 },
 *   },
 * });
 * ```
 *
 * @see {@link BaseProvider} for the provider interface that all providers implement
 * @see {@link ReconnectionConfig} for WebSocket reconnection settings
 * @see {@link TurnTakingConfig} for turn-taking behavior
 * @see {@link EagerLLMConfig} for speculative generation settings
 * @see {@link ConversationHistoryConfig} for multi-turn history
 * @see {@link AudioBufferQueueConfig} for queue configuration
 */
export interface CompositeVoiceConfig {
  /**
   * Array of provider instances for the voice pipeline.
   *
   * @remarks
   * Each provider declares its {@link BaseProvider.roles | roles} property indicating
   * which pipeline slots it covers. The SDK resolves the 5-role pipeline
   * (`input`, `stt`, `llm`, `tts`, `output`) from this array:
   *
   * - Multi-role providers (e.g., `NativeSTT` with `roles: ['input', 'stt']`) cover
   *   multiple slots with a single instance.
   * - Single-role providers (e.g., `MicrophoneInput` with `roles: ['input']`) cover
   *   exactly one slot.
   * - The `llm` role is always required.
   * - When `input`+`stt` are uncovered, defaults to `NativeSTT()`.
   * - When `tts`+`output` are uncovered, defaults to `NativeTTS()`.
   *
   * @see {@link BaseProvider} for the interface all providers implement
   */
  providers: BaseProvider[];

  /**
   * Queue configuration for input and output audio buffer queues.
   *
   * @remarks
   * When separate input and STT providers are used (e.g., `MicrophoneInput` +
   * `DeepgramSTT`), an `AudioBufferQueue` buffers audio between them to
   * prevent frame loss during STT connection. Similarly for TTS + output.
   * This config lets you tune queue sizes and overflow behavior.
   *
   * @see {@link AudioBufferQueueConfig}
   */
  queue?: {
    /** Configuration overrides for the input→STT buffer queue. */
    input?: Partial<AudioBufferQueueConfig>;
    /** Configuration overrides for the TTS→output buffer queue. */
    output?: Partial<AudioBufferQueueConfig>;
  };

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
   * Pipeline tuning options.
   *
   * @remarks
   * Controls flow between pipeline stages. Currently supports backpressure
   * between LLM and Live TTS providers.
   */
  pipeline?: {
    /**
     * Maximum text chunks buffered between LLM and TTS before pausing LLM generation.
     *
     * @remarks
     * Only applies to Live (WebSocket) TTS providers. REST TTS receives the
     * full response at once and is unaffected. When not set, no backpressure
     * is applied (default behavior).
     *
     * @defaultValue undefined (no limit)
     */
    maxPendingChunks?: number;
  };

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
   * Tool use configuration for LLM function calling.
   *
   * @remarks
   * When provided, the LLM can invoke tools during generation. Text output
   * is streamed to TTS as usual, while tool calls are handled via the
   * `onToolCall` callback. After tool execution, the LLM is called again
   * with the tool result to generate a natural language follow-up.
   *
   * Requires the LLM provider to implement `ToolAwareLLMProvider`.
   */
  tools?: {
    definitions: import('./providers').LLMToolDefinition[];
    onToolCall: (toolCall: import('./providers').LLMToolCall) => Promise<import('./providers').LLMToolResult>;
  };

  /**
   * Recovery strategy configuration for automatic error recovery.
   *
   * @remarks
   * Only applies when `autoRecover` is `true`. Controls the backoff behavior
   * when the SDK attempts to recover from provider errors.
   *
   * @see {@link RecoveryStrategy}
   */
  recovery?: import('../RecoveryOrchestrator').RecoveryStrategy;

  /**
   * Additional custom configuration for provider-specific or application-specific needs.
   *
   * @remarks
   * This catch-all record allows you to pass arbitrary data through the
   * configuration without extending the type. Providers can read from this
   * via the config object.
   */
  extra?: Record<string, unknown>;
}

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
