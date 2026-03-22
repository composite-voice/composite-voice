/**
 * Type definitions for the Deepgram Agent API provider.
 *
 * @remarks
 * These types map 1:1 to the Deepgram Agent V1 AsyncAPI specification at
 * {@link https://dpgr.am/asyncapi.yml}. The `DeepgramAgentConfig` is
 * the user-facing configuration object; the nested `listen`, `think`,
 * and `speak` blocks are passed directly in the WebSocket Settings message.
 *
 * @packageDocumentation
 */

import type { BaseProviderConfig } from '../../../core/types/providers';

// ─── Think (LLM) providers ──────────────────────────────────────────────────

/**
 * OpenAI LLM configuration for the Deepgram Agent API.
 *
 * @remarks
 * Routes LLM inference through the OpenAI REST API. The Agent API manages
 * the connection server-side; you only supply the model and optional tuning.
 */
export interface OpenAIThinkProvider {
  /** Provider identifier, must be `'open_ai'`. */
  type: 'open_ai';

  /** REST API version. @defaultValue `'v1'` */
  version?: 'v1';

  /** Model ID (e.g. `'gpt-4o'`, `'gpt-4o-mini'`). */
  model: string;

  /**
   * Sampling temperature controlling randomness.
   *
   * @remarks
   * Range is 0 – 2. Lower values produce more deterministic output.
   */
  temperature?: number;
}

/**
 * Anthropic LLM configuration for the Deepgram Agent API.
 *
 * @remarks
 * Routes LLM inference through the Anthropic Messages API.
 */
export interface AnthropicThinkProvider {
  /** Provider identifier, must be `'anthropic'`. */
  type: 'anthropic';

  /** REST API version. @defaultValue `'v1'` */
  version?: 'v1';

  /** Model ID (e.g. `'claude-sonnet-4-20250514'`). */
  model: string;

  /**
   * Sampling temperature controlling randomness.
   *
   * @remarks
   * Range is 0 – 1. Lower values produce more deterministic output.
   */
  temperature?: number;
}

/**
 * Google (Gemini) LLM configuration for the Deepgram Agent API.
 *
 * @remarks
 * Routes LLM inference through the Google Generative Language API.
 */
export interface GoogleThinkProvider {
  /** Provider identifier, must be `'google'`. */
  type: 'google';

  /** REST API version. @defaultValue `'v1beta'` */
  version?: 'v1beta';

  /** Model ID (e.g. `'gemini-2.0-flash'`). */
  model: string;

  /**
   * Sampling temperature controlling randomness.
   *
   * @remarks
   * Range is 0 – 2. Lower values produce more deterministic output.
   */
  temperature?: number;
}

/**
 * Groq LLM configuration for the Deepgram Agent API.
 *
 * @remarks
 * Routes LLM inference through the Groq API for low-latency inference.
 */
export interface GroqThinkProvider {
  /** Provider identifier, must be `'groq'`. */
  type: 'groq';

  /** REST API version. @defaultValue `'v1'` */
  version?: 'v1';

  /** Model ID (e.g. `'llama-3.3-70b-versatile'`). */
  model: string;

  /**
   * Sampling temperature controlling randomness.
   *
   * @remarks
   * Range is 0 – 2. Lower values produce more deterministic output.
   */
  temperature?: number;
}

/**
 * AWS Bedrock LLM configuration for the Deepgram Agent API.
 *
 * @remarks
 * Routes LLM inference through AWS Bedrock. Requires IAM or STS credentials
 * to authenticate with the AWS service.
 */
export interface AwsBedrockThinkProvider {
  /** Provider identifier, must be `'aws_bedrock'`. */
  type: 'aws_bedrock';

  /** Bedrock model ID (e.g. `'anthropic.claude-3-haiku-20240307-v1:0'`). */
  model: string;

  /**
   * Sampling temperature controlling randomness.
   *
   * @remarks
   * Range is model-dependent. Lower values produce more deterministic output.
   */
  temperature?: number;

  /**
   * AWS credentials for authenticating with Bedrock.
   *
   * @remarks
   * Supports both IAM and STS (temporary) credential types.
   * `session_token` is only required for STS credentials.
   */
  credentials?: {
    /** Credential type: `'sts'` for temporary, `'iam'` for long-lived. */
    type: 'sts' | 'iam';
    /** AWS region (e.g. `'us-east-1'`). */
    region: string;
    /** AWS access key ID. */
    access_key_id: string;
    /** AWS secret access key. */
    secret_access_key: string;
    /** STS session token (required when `type` is `'sts'`). */
    session_token?: string;
  };
}

/**
 * Union of all supported LLM provider configurations for the Agent API.
 *
 * @remarks
 * Discriminated on the `type` field. Pass one of these to
 * {@link AgentThinkConfig.provider}.
 */
export type ThinkProvider =
  | OpenAIThinkProvider
  | AnthropicThinkProvider
  | GoogleThinkProvider
  | GroqThinkProvider
  | AwsBedrockThinkProvider;

// ─── Speak (TTS) providers ──────────────────────────────────────────────────

/**
 * Deepgram TTS configuration for the Deepgram Agent API.
 *
 * @remarks
 * Uses Deepgram's own Aura text-to-speech models. This is the default
 * speak provider and requires no additional credentials beyond the
 * Deepgram API key.
 */
export interface DeepgramSpeakProvider {
  /** Provider identifier, must be `'deepgram'`. */
  type: 'deepgram';

  /** REST API version. @defaultValue `'v1'` */
  version?: 'v1';

  /** Voice model ID (e.g. `'aura-2-thalia-en'`). */
  model?: string;
}

/**
 * ElevenLabs TTS configuration for the Deepgram Agent API.
 *
 * @remarks
 * Routes speech synthesis through the ElevenLabs API. Requires an
 * ElevenLabs API key configured on the Deepgram side and a custom
 * endpoint set in {@link AgentSpeakConfig.endpoint}.
 */
export interface ElevenLabsSpeakProvider {
  /** Provider identifier, must be `'eleven_labs'`. */
  type: 'eleven_labs';

  /** REST API version. @defaultValue `'v1'` */
  version?: 'v1';

  /** ElevenLabs model ID (e.g. `'eleven_turbo_v2_5'`). */
  model_id?: string;

  /** BCP-47 language code (e.g. `'en'`, `'es'`). */
  language?: string;
}

/**
 * Cartesia TTS configuration for the Deepgram Agent API.
 *
 * @remarks
 * Routes speech synthesis through the Cartesia API. Requires a custom
 * endpoint set in {@link AgentSpeakConfig.endpoint}.
 */
export interface CartesiaSpeakProvider {
  /** Provider identifier, must be `'cartesia'`. */
  type: 'cartesia';

  /** REST API version. */
  version?: string;

  /** Cartesia model ID. */
  model_id?: string;

  /**
   * Voice selection.
   *
   * @remarks
   * Specifies the voice to use. `mode` is typically `'id'` and `id` is the
   * Cartesia voice identifier.
   */
  voice?: { mode: string; id: string };

  /** BCP-47 language code (e.g. `'en'`, `'fr'`). */
  language?: string;
}

/**
 * OpenAI TTS configuration for the Deepgram Agent API.
 *
 * @remarks
 * Routes speech synthesis through the OpenAI Audio API. Requires a custom
 * endpoint set in {@link AgentSpeakConfig.endpoint}.
 */
export interface OpenAISpeakProvider {
  /** Provider identifier, must be `'open_ai'`. */
  type: 'open_ai';

  /** REST API version. @defaultValue `'v1'` */
  version?: 'v1';

  /** OpenAI TTS model ID (e.g. `'tts-1'`, `'tts-1-hd'`). */
  model?: string;

  /** Voice name (e.g. `'alloy'`, `'echo'`, `'nova'`). */
  voice?: string;
}

/**
 * AWS Polly TTS configuration for the Deepgram Agent API.
 *
 * @remarks
 * Routes speech synthesis through AWS Polly. Requires IAM or STS credentials
 * to authenticate with the AWS service.
 */
export interface AwsPollySpeakProvider {
  /** Provider identifier, must be `'aws_polly'`. */
  type: 'aws_polly';

  /** Polly voice ID (e.g. `'Joanna'`, `'Matthew'`). */
  voice: string;

  /** BCP-47 language code (e.g. `'en-US'`). */
  language: string;

  /**
   * Polly speech synthesis engine.
   *
   * @remarks
   * - `'generative'` — Highest quality, limited voice selection.
   * - `'long-form'` — Optimized for long-form content like articles.
   * - `'neural'` — High quality, wider voice selection than generative.
   * - `'standard'` — Lowest latency, concatenative synthesis.
   */
  engine: 'generative' | 'long-form' | 'standard' | 'neural';

  /**
   * AWS credentials for authenticating with Polly.
   *
   * @remarks
   * Supports both IAM and STS (temporary) credential types.
   * `session_token` is only required for STS credentials.
   */
  credentials: {
    /** Credential type: `'sts'` for temporary, `'iam'` for long-lived. */
    type: 'sts' | 'iam';
    /** AWS region (e.g. `'us-east-1'`). */
    region: string;
    /** AWS access key ID. */
    access_key_id: string;
    /** AWS secret access key. */
    secret_access_key: string;
    /** STS session token (required when `type` is `'sts'`). */
    session_token?: string;
  };
}

/**
 * Union of all supported TTS provider configurations for the Agent API.
 *
 * @remarks
 * Discriminated on the `type` field. Pass one of these to
 * {@link AgentSpeakConfig.provider}.
 */
export type SpeakProvider =
  | DeepgramSpeakProvider
  | ElevenLabsSpeakProvider
  | CartesiaSpeakProvider
  | OpenAISpeakProvider
  | AwsPollySpeakProvider;

// ─── Agent function definitions ─────────────────────────────────────────────

/**
 * Defines a function the agent can invoke during a conversation.
 *
 * @remarks
 * Functions can be executed either server-side (via `endpoint`) or
 * client-side (via {@link DeepgramAgentConfig.onFunctionCall}). If no
 * `endpoint` is provided, the function call is dispatched to the client.
 */
export interface AgentFunctionDefinition {
  /** Unique function name the LLM references when requesting a call. */
  name: string;

  /** Human-readable description of what the function does, provided to the LLM as context. */
  description?: string;

  /** JSON Schema describing the function's parameters, passed to the LLM for structured argument generation. */
  parameters?: Record<string, unknown>;

  /** Server-side endpoint. If omitted, function is called client-side. */
  endpoint?: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
  };
}

// ─── Agent settings (maps to the Settings WebSocket message) ────────────────

/**
 * Audio encoding and sample rate settings for Agent API input and output.
 *
 * @remarks
 * Controls how audio is encoded on the wire between the client and the
 * Deepgram Agent API. Defaults are suitable for most browser-based use cases.
 */
export interface AgentAudioConfig {
  /** Microphone / input audio settings. */
  input?: {
    /** Audio codec (e.g. `'linear16'`, `'opus'`, `'flac'`). */
    encoding?: string;
    /** Sample rate in Hz (e.g. `16000`, `24000`). */
    sample_rate?: number;
  };
  /** Agent speech / output audio settings. */
  output?: {
    /** Audio codec (e.g. `'linear16'`, `'opus'`, `'mp3'`). */
    encoding?: string;
    /** Sample rate in Hz (e.g. `16000`, `24000`). */
    sample_rate?: number;
    /** Output bitrate in bits per second (relevant for lossy codecs). */
    bitrate?: number;
    /**
     * Container format for output audio.
     *
     * @remarks
     * Use `'none'` for raw PCM without a container header. Other values
     * depend on the encoding (e.g. `'ogg'` for Opus).
     */
    container?: string;
  };
}

/**
 * STT (speech-to-text) configuration for the Agent API listen stage.
 *
 * @remarks
 * The listen stage is always powered by Deepgram's own STT models
 * (Nova / Flux). This config controls model selection, language, and
 * formatting options.
 */
export interface AgentListenConfig {
  /** Deepgram STT provider settings. */
  provider?: {
    /** Provider identifier, must be `'deepgram'`. */
    type: 'deepgram';
    /** STT API version. @defaultValue `'v1'` */
    version?: 'v1' | 'v2';
    /** STT model ID (e.g. `'nova-3'`). */
    model?: string;
    /** BCP-47 language code (e.g. `'en'`, `'es'`). */
    language?: string;
    /**
     * Key terms to boost during recognition.
     *
     * @remarks
     * Improves accuracy for domain-specific vocabulary, proper nouns, or
     * uncommon words by biasing the model towards these terms.
     */
    keyterms?: string[];
    /**
     * Enable smart formatting of transcription output.
     *
     * @remarks
     * When `true`, Deepgram applies automatic formatting such as
     * punctuation, numerals, and dates.
     */
    smart_format?: boolean;
  };
}

/**
 * LLM configuration for the Agent API think stage.
 *
 * @remarks
 * Controls which LLM provider handles inference, the system prompt,
 * available functions, and optional custom endpoint routing.
 */
export interface AgentThinkConfig {
  /** LLM provider configuration. See {@link ThinkProvider} for options. */
  provider: ThinkProvider;

  /**
   * Custom LLM endpoint override.
   *
   * @remarks
   * Route inference through a self-hosted or OpenAI-compatible endpoint
   * instead of the provider's default URL.
   */
  endpoint?: {
    /** Fully-qualified URL of the custom LLM endpoint. */
    url: string;
    /** Additional HTTP headers sent with each request. */
    headers?: Record<string, string>;
  };

  /** System prompt that defines the agent's persona and behaviour. */
  prompt?: string;

  /** Functions the agent can call during the conversation. */
  functions?: AgentFunctionDefinition[];

  /**
   * Maximum number of conversation-history tokens sent to the LLM.
   *
   * @remarks
   * Set to `'max'` to use the model's full context window. A numeric value
   * caps the token count, which can reduce latency and cost for long sessions.
   */
  context_length?: number | 'max';
}

/**
 * TTS configuration for the Agent API speak stage.
 *
 * @remarks
 * Controls which TTS provider synthesizes the agent's speech. For
 * non-Deepgram providers, you must also set {@link AgentSpeakConfig.endpoint}.
 */
export interface AgentSpeakConfig {
  /** TTS provider configuration. See {@link SpeakProvider} for options. */
  provider: SpeakProvider;

  /**
   * Custom TTS endpoint override.
   *
   * @remarks
   * Required for non-Deepgram TTS providers (ElevenLabs, Cartesia, OpenAI,
   * AWS Polly). Routes synthesis requests to the specified URL.
   */
  endpoint?: {
    /** Fully-qualified URL of the TTS endpoint. */
    url: string;
    /** Additional HTTP headers sent with each request. */
    headers?: Record<string, string>;
  };
}

// ─── User-facing config ─────────────────────────────────────────────────────

/**
 * Top-level configuration for the Deepgram Agent API provider.
 *
 * @remarks
 * This interface maps to the Settings WebSocket message defined in the
 * Deepgram Agent V1 AsyncAPI spec. It extends {@link BaseProviderConfig}
 * so `apiKey`, `proxyUrl`, and other base fields are also available.
 *
 * @example
 * ```typescript
 * const config: DeepgramAgentConfig = {
 *   apiKey: process.env.DEEPGRAM_API_KEY,
 *   audio: {
 *     input:  { encoding: 'linear16', sample_rate: 16000 },
 *     output: { encoding: 'linear16', sample_rate: 24000, container: 'none' },
 *   },
 *   listen: {
 *     provider: { type: 'deepgram', model: 'nova-3', language: 'en' },
 *   },
 *   think: {
 *     provider: { type: 'open_ai', model: 'gpt-4o-mini' },
 *     prompt: 'You are a helpful assistant.',
 *     functions: [
 *       { name: 'get_weather', description: 'Get current weather', parameters: { ... } },
 *     ],
 *   },
 *   speak: {
 *     provider: { type: 'deepgram', model: 'aura-2-thalia-en' },
 *   },
 *   greeting: 'Hello! How can I help you today?',
 * };
 * ```
 */
export interface DeepgramAgentConfig extends BaseProviderConfig {
  /** Audio encoding/sample rate for input and output. */
  audio?: AgentAudioConfig;

  /** STT configuration (Deepgram Nova/Flux). */
  listen?: AgentListenConfig;

  /** LLM configuration (provider, prompt, functions). */
  think?: AgentThinkConfig;

  /** TTS configuration (provider, voice). */
  speak?: AgentSpeakConfig;

  /** Greeting message the agent speaks when the session starts. */
  greeting?: string;

  /** Pre-seed conversation context. */
  context?: {
    messages?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
  };

  /** Enable experimental Agent API features (e.g. AgentStartedSpeaking). */
  experimental?: boolean;

  /**
   * Client-side function call handler.
   *
   * @remarks
   * Called when the Agent API requests execution of a client-side function.
   * Return the result content as a string.
   */
  onFunctionCall?: (call: {
    id: string;
    name: string;
    arguments: string;
  }) => Promise<{ content: string }>;
}

// ─── WebSocket message types (server → client) ─────────────────────────────

/** Sent when the WebSocket connection is established. */
export interface AgentWelcomeMessage {
  type: 'Welcome';
  /** Unique identifier for this session, useful for debugging and support. */
  request_id: string;
}

/** Confirms the Settings message was accepted and applied. */
export interface AgentSettingsAppliedMessage {
  type: 'SettingsApplied';
}

/** Final transcription of a user or assistant utterance. */
export interface AgentConversationTextMessage {
  type: 'ConversationText';
  /** Who produced this text: `'user'` (STT result) or `'assistant'` (LLM output). */
  role: 'user' | 'assistant';
  /** The transcribed or generated text content. */
  content: string;
}

/** Indicates the user began speaking (voice activity detected). */
export interface AgentUserStartedSpeakingMessage {
  type: 'UserStartedSpeaking';
}

/** Streamed partial LLM output while the agent is generating a response. */
export interface AgentThinkingMessage {
  type: 'AgentThinking';
  /** Partial text content generated so far. */
  content: string;
}

/** Requests execution of one or more functions during the conversation. */
export interface AgentFunctionCallRequestMessage {
  type: 'FunctionCallRequest';
  /**
   * Functions the agent wants to call.
   *
   * @remarks
   * Each entry contains the function name, JSON-encoded arguments, and
   * whether the call should be handled client-side or was already handled
   * by a server-side endpoint.
   */
  functions: Array<{
    /** Unique call identifier used to correlate responses. */
    id: string;
    /** Function name matching an {@link AgentFunctionDefinition.name}. */
    name: string;
    /** JSON-encoded arguments generated by the LLM. */
    arguments: string;
    /** `true` when the function has no server endpoint and must be handled client-side. */
    client_side: boolean;
  }>;
}

/**
 * Indicates the agent began speaking, with latency metrics.
 *
 * @remarks
 * Only emitted when {@link DeepgramAgentConfig.experimental} is `true`.
 * All latency values are in **seconds**.
 */
export interface AgentStartedSpeakingMessage {
  type: 'AgentStartedSpeaking';
  /** Total end-to-end latency from user silence to first audio byte, in seconds. */
  total_latency: number;
  /** Time spent in TTS synthesis, in seconds. */
  tts_latency: number;
  /** Time spent in LLM inference (text-to-text), in seconds. */
  ttt_latency: number;
}

/** Indicates the agent has finished sending audio for the current utterance. */
export interface AgentAudioDoneMessage {
  type: 'AgentAudioDone';
}

/** An error occurred in the Agent API pipeline. */
export interface AgentErrorMessage {
  type: 'Error';
  /** Human-readable error description. */
  description: string;
  /** Machine-readable error code for programmatic handling (e.g. `'model_error'`). */
  code: string;
}

/** A non-fatal warning from the Agent API pipeline. */
export interface AgentWarningMessage {
  type: 'Warning';
  /** Human-readable warning description. */
  description: string;
  /** Machine-readable warning code for programmatic handling. */
  code: string;
}

/** Confirms a mid-session prompt update was applied. */
export interface AgentPromptUpdatedMessage {
  type: 'PromptUpdated';
}

/** Confirms a mid-session TTS configuration update was applied. */
export interface AgentSpeakUpdatedMessage {
  type: 'SpeakUpdated';
}

/** Confirms a mid-session LLM configuration update was applied. */
export interface AgentThinkUpdatedMessage {
  type: 'ThinkUpdated';
}

/** The agent refused a text injection (e.g. prompt injection attempt detected). */
export interface AgentInjectionRefusedMessage {
  type: 'InjectionRefused';
  /** Reason the injection was refused. */
  message: string;
}

/** Response sent back to the agent after executing a function call. */
export interface AgentFunctionCallResponseMessage {
  type: 'FunctionCallResponse';
  /** Call identifier from the original request (omit if not provided). */
  id?: string;
  /** Function name that was executed. */
  name: string;
  /** String result content returned by the function. */
  content: string;
}

/**
 * Union of all server-to-client WebSocket messages from the Agent API.
 *
 * @remarks
 * Discriminated on the `type` field. Used internally to parse incoming
 * WebSocket frames.
 */
export type AgentServerMessage =
  | AgentWelcomeMessage
  | AgentSettingsAppliedMessage
  | AgentConversationTextMessage
  | AgentUserStartedSpeakingMessage
  | AgentThinkingMessage
  | AgentFunctionCallRequestMessage
  | AgentStartedSpeakingMessage
  | AgentAudioDoneMessage
  | AgentErrorMessage
  | AgentWarningMessage
  | AgentPromptUpdatedMessage
  | AgentSpeakUpdatedMessage
  | AgentThinkUpdatedMessage
  | AgentInjectionRefusedMessage
  | AgentFunctionCallResponseMessage;

// ─── Client-facing event types ──────────────────────────────────────────

/**
 * Discriminated union of events emitted by the Deepgram Agent provider.
 *
 * @remarks
 * Discriminated on the `type` field. These are the camelCase, client-friendly
 * counterparts to the raw {@link AgentServerMessage} types. Subscribe to
 * these via the provider's event emitter.
 *
 * Latency values on `agent_started_speaking` are in **seconds**.
 */
export type DeepgramAgentEvent =
  | { type: 'user_started_speaking' }
  | { type: 'agent_thinking'; content: string }
  | { type: 'agent_started_speaking'; totalLatency: number; ttsLatency: number; tttLatency: number }
  | { type: 'agent_audio_done' }
  | { type: 'conversation_text'; role: 'user' | 'assistant'; content: string }
  | { type: 'function_call'; functions: Array<{ id: string; name: string; arguments: string; clientSide: boolean }> }
  | { type: 'injection_refused'; message: string }
  | { type: 'prompt_updated' }
  | { type: 'speak_updated' }
  | { type: 'think_updated' }
  | { type: 'error'; code: string; description: string }
  | { type: 'warning'; code: string; description: string };
