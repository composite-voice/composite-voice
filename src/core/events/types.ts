/**
 * Event type definitions for the CompositeVoice SDK.
 *
 * @remarks
 * This module defines all events emitted by the CompositeVoice agent during its
 * lifecycle. Events are organized into five categories:
 *
 * - **Transcription events** (`transcription.*`) - STT pipeline status and results
 * - **LLM events** (`llm.*`) - Language model generation progress
 * - **TTS events** (`tts.*`) - Text-to-speech synthesis progress
 * - **Agent events** (`agent.*`) - Agent lifecycle and state changes
 * - **Audio events** (`audio.*`) - Microphone capture and audio playback status
 * - **Queue events** (`queue.*`) - Audio buffer queue overflow and stats
 *
 * Subscribe to events using the `on()` method on a CompositeVoice instance.
 * All event listeners receive a typed event object extending {@link BaseEvent}.
 *
 * @example
 * ```typescript
 * import { CompositeVoice } from 'composite-voice';
 *
 * const agent = new CompositeVoice({ stt, llm, tts });
 *
 * agent.on('transcription.final', (event) => {
 *   console.log('User said:', event.text);
 * });
 *
 * agent.on('llm.chunk', (event) => {
 *   process.stdout.write(event.chunk);
 * });
 *
 * agent.on('agent.stateChange', (event) => {
 *   console.log(`State: ${event.previousState} -> ${event.state}`);
 * });
 * ```
 *
 * @packageDocumentation
 */

import type { AudioChunk, AudioMetadata } from '../types/audio';

/**
 * The possible states of the CompositeVoice agent.
 *
 * @remarks
 * Represents the high-level state of the voice pipeline. The agent transitions
 * between these states as it processes user speech:
 *
 * `idle` -\> `ready` -\> `listening` -\> `thinking` -\> `speaking` -\> `listening` ...
 *
 * - `'idle'` - Agent is created but not yet initialized
 * - `'ready'` - Agent is initialized and waiting to start
 * - `'listening'` - Agent is actively capturing and transcribing user speech
 * - `'thinking'` - Agent is processing the transcription through the LLM
 * - `'speaking'` - Agent is synthesizing and playing back the response
 * - `'error'` - Agent has encountered an unrecoverable error
 *
 * @see {@link AgentStateChangeEvent} for the event emitted on state transitions
 */
export type AgentState = 'idle' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'error';

/**
 * Base interface for all CompositeVoice events.
 *
 * @remarks
 * Every event emitted by the SDK includes a timestamp and an optional metadata
 * record. Specific event interfaces extend this base with additional fields
 * relevant to their event type.
 *
 * @see {@link CompositeVoiceEvent} for the union of all event types
 * @see {@link EventListenerMap} for the typed listener map
 */
export interface BaseEvent {
  /**
   * Unix timestamp (in milliseconds) when the event occurred.
   *
   * @remarks
   * Useful for latency measurements and debugging the pipeline timing.
   */
  timestamp: number;

  /**
   * Optional metadata associated with the event.
   *
   * @remarks
   * May contain provider-specific data or debugging information.
   */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Transcription events
// ---------------------------------------------------------------------------

/**
 * Emitted when the STT provider begins listening for speech.
 *
 * @remarks
 * Indicates that the speech-to-text pipeline is active and ready to receive
 * audio input. This event fires after the microphone is initialized and the
 * STT provider connection is established.
 *
 * @see {@link TranscriptionEvent} for all transcription event types
 */
export interface TranscriptionStartEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'transcription.start';
}

/**
 * Emitted when the STT provider produces an interim (partial) transcription.
 *
 * @remarks
 * Interim results represent the provider's current best guess for what the user
 * is saying. They are updated frequently and replaced by subsequent interim or
 * final results. Useful for showing real-time "typing" feedback in the UI.
 *
 * @example
 * ```typescript
 * agent.on('transcription.interim', (event) => {
 *   updateLiveCaption(event.text);
 * });
 * ```
 *
 * @see {@link TranscriptionFinalEvent} for committed transcription segments
 * @see {@link TranscriptionEvent} for all transcription event types
 */
export interface TranscriptionInterimEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'transcription.interim';

  /** The interim transcription text. */
  text: string;

  /** Confidence score (0-1) for this interim result, if available. */
  confidence?: number;
}

/**
 * Emitted when the STT provider commits a final transcription segment.
 *
 * @remarks
 * A final segment is a committed portion of the transcription that will not
 * change. For multi-segment providers like Deepgram, multiple `transcription.final`
 * events may be emitted for a single utterance. Use {@link TranscriptionSpeechFinalEvent}
 * to detect when the complete utterance is finished.
 *
 * @example
 * ```typescript
 * agent.on('transcription.final', (event) => {
 *   appendToTranscript(event.text);
 * });
 * ```
 *
 * @see {@link TranscriptionSpeechFinalEvent} for complete utterance detection
 * @see {@link TranscriptionInterimEvent} for partial results
 * @see {@link TranscriptionEvent} for all transcription event types
 */
export interface TranscriptionFinalEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'transcription.final';

  /** The final transcription text for this segment. */
  text: string;

  /** Confidence score (0-1) for this final result, if available. */
  confidence?: number;
}

/**
 * Emitted when an utterance is fully complete.
 *
 * @remarks
 * This is the canonical trigger for LLM processing. For Deepgram, this fires
 * when `speech_final=true` (the speaker has stopped talking). For NativeSTT
 * and other providers that emit one result per utterance, this equals
 * `transcription.final`.
 *
 * Multi-segment providers (Deepgram) may emit several `transcription.final`
 * events for a single utterance. Only the last one is followed by
 * `transcription.speechFinal`.
 *
 * @example
 * ```typescript
 * agent.on('transcription.speechFinal', (event) => {
 *   console.log('Complete utterance:', event.text);
 * });
 * ```
 *
 * @see {@link TranscriptionFinalEvent} for individual segments
 * @see {@link TranscriptionPreflightEvent} for early/speculative triggers
 * @see {@link TranscriptionEvent} for all transcription event types
 */
export interface TranscriptionSpeechFinalEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'transcription.speechFinal';

  /** The complete transcribed text for the entire utterance. */
  text: string;

  /** Confidence score (0-1) for this result, if available. */
  confidence?: number;
}

/**
 * Emitted when a provider sends a preflight/eager-end-of-turn signal.
 *
 * @remarks
 * DeepgramFlux (e.g., `flux-general-en`) emits this before `speech_final`
 * to allow downstream stages (LLM) to start generating speculatively. The text
 * may change slightly when the confirmed `speech_final` arrives.
 *
 * This event is only relevant when {@link EagerLLMConfig} is enabled.
 *
 * @example
 * ```typescript
 * agent.on('transcription.preflight', (event) => {
 *   console.log('Preflight transcript:', event.text);
 * });
 * ```
 *
 * @see {@link EagerLLMConfig} for enabling the eager LLM pipeline
 * @see {@link TranscriptionSpeechFinalEvent} for the confirmed result
 * @see {@link TranscriptionEvent} for all transcription event types
 */
export interface TranscriptionPreflightEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'transcription.preflight';

  /**
   * Provisional transcript text.
   *
   * @remarks
   * May change slightly when the confirmed `speech_final` arrives.
   */
  text: string;

  /** Confidence score (0-1) for this preflight result, if available. */
  confidence?: number;
}

/**
 * Emitted when the STT provider encounters an error.
 *
 * @remarks
 * The {@link TranscriptionErrorEvent.recoverable | recoverable} flag indicates
 * whether the SDK can attempt to recover automatically (e.g., by reconnecting).
 *
 * @see {@link TranscriptionEvent} for all transcription event types
 */
export interface TranscriptionErrorEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'transcription.error';

  /** The error that occurred. */
  error: Error;

  /** Whether the error is recoverable (e.g., temporary network issue). */
  recoverable: boolean;
}

/**
 * Union of all transcription-related events.
 *
 * @remarks
 * Use this type to handle any transcription event generically, or subscribe
 * to specific event types via the {@link EventListenerMap}.
 *
 * @see {@link TranscriptionStartEvent}
 * @see {@link TranscriptionInterimEvent}
 * @see {@link TranscriptionFinalEvent}
 * @see {@link TranscriptionSpeechFinalEvent}
 * @see {@link TranscriptionPreflightEvent}
 * @see {@link TranscriptionErrorEvent}
 */
export type TranscriptionEvent =
  | TranscriptionStartEvent
  | TranscriptionInterimEvent
  | TranscriptionFinalEvent
  | TranscriptionSpeechFinalEvent
  | TranscriptionPreflightEvent
  | TranscriptionErrorEvent;

// ---------------------------------------------------------------------------
// LLM events
// ---------------------------------------------------------------------------

/**
 * Emitted when the LLM begins generating a response.
 *
 * @remarks
 * Contains the prompt text that was sent to the LLM. For multi-turn
 * conversations, this is the latest user message (the full history
 * is sent internally via {@link LLMProvider.generateFromMessages}).
 *
 * @example
 * ```typescript
 * agent.on('llm.start', (event) => {
 *   console.log('Generating response for:', event.prompt);
 * });
 * ```
 *
 * @see {@link LLMEvent} for all LLM event types
 */
export interface LLMStartEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'llm.start';

  /** The prompt text sent to the LLM. */
  prompt: string;
}

/**
 * Emitted for each token/chunk received from the LLM during streaming.
 *
 * @remarks
 * When the LLM provider streams its response, this event fires for each
 * text chunk received. The {@link LLMChunkEvent.accumulated | accumulated} field
 * contains the full response text generated so far.
 *
 * @example
 * ```typescript
 * agent.on('llm.chunk', (event) => {
 *   // Show streaming response
 *   updateResponseDisplay(event.accumulated);
 * });
 * ```
 *
 * @see {@link LLMCompleteEvent} for the final complete response
 * @see {@link LLMEvent} for all LLM event types
 */
export interface LLMChunkEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'llm.chunk';

  /** The individual text chunk received in this streaming update (raw, includes markdown). */
  chunk: string;

  /** The full response text accumulated so far (all chunks concatenated). */
  accumulated: string;

  /**
   * The visual version of this chunk — raw text including code fences and markdown.
   * Use this for rendering in a chat UI.
   */
  visual: string;

  /**
   * The spoken version of this chunk — markdown stripped, code fences omitted.
   * SSML, XML, and JSON outside of code fences are preserved.
   * Use this for TTS. Empty string when inside a code fence.
   */
  spoken: string;
}

/**
 * Emitted when the LLM has finished generating the complete response.
 *
 * @remarks
 * Contains the full response text. For streaming providers, this fires after
 * the last {@link LLMChunkEvent}. The optional {@link LLMCompleteEvent.tokensUsed | tokensUsed}
 * field reports token consumption when available from the provider.
 *
 * @example
 * ```typescript
 * agent.on('llm.complete', (event) => {
 *   console.log('Full response:', event.text);
 *   if (event.tokensUsed) {
 *     console.log('Tokens used:', event.tokensUsed);
 *   }
 * });
 * ```
 *
 * @see {@link LLMStartEvent} for the generation start
 * @see {@link LLMChunkEvent} for streaming chunks
 * @see {@link LLMEvent} for all LLM event types
 */
export interface LLMCompleteEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'llm.complete';

  /** The complete response text from the LLM. */
  text: string;

  /**
   * Number of tokens consumed by this generation, if reported by the provider.
   *
   * @remarks
   * May include input and output tokens combined, depending on the provider.
   */
  tokensUsed?: number;
}

/**
 * Emitted when the LLM provider encounters an error during generation.
 *
 * @remarks
 * The {@link LLMErrorEvent.recoverable | recoverable} flag indicates whether
 * the SDK can attempt to recover (e.g., by retrying the request).
 *
 * @see {@link LLMEvent} for all LLM event types
 */
export interface LLMErrorEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'llm.error';

  /** The error that occurred during generation. */
  error: Error;

  /** Whether the error is recoverable (e.g., rate limit, temporary failure). */
  recoverable: boolean;
}

/**
 * Union of all LLM-related events.
 *
 * @remarks
 * Use this type to handle any LLM event generically, or subscribe to specific
 * event types via the {@link EventListenerMap}.
 *
 * @see {@link LLMStartEvent}
 * @see {@link LLMChunkEvent}
 * @see {@link LLMCompleteEvent}
 * @see {@link LLMErrorEvent}
 */
export type LLMEvent = LLMStartEvent | LLMChunkEvent | LLMCompleteEvent | LLMErrorEvent;

// ---------------------------------------------------------------------------
// TTS events
// ---------------------------------------------------------------------------

/**
 * Emitted when the TTS provider begins synthesizing speech.
 *
 * @remarks
 * Contains the text that will be synthesized. For streaming TTS, this
 * may be the first chunk of text sent to the provider.
 *
 * @example
 * ```typescript
 * agent.on('tts.start', (event) => {
 *   console.log('Synthesizing:', event.text);
 * });
 * ```
 *
 * @see {@link TTSEvent} for all TTS event types
 */
export interface TTSStartEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'tts.start';

  /** The text being synthesized into speech. */
  text: string;
}

/**
 * Emitted when a chunk of synthesized audio is received from the TTS provider.
 *
 * @remarks
 * For streaming TTS providers, multiple audio events are emitted as audio
 * data arrives. Each event contains an {@link AudioChunk} with raw audio
 * bytes that are queued for playback.
 *
 * @example
 * ```typescript
 * agent.on('tts.audio', (event) => {
 *   console.log(`Audio chunk: ${event.chunk.data.byteLength} bytes`);
 * });
 * ```
 *
 * @see {@link AudioChunk} for the audio data structure
 * @see {@link TTSEvent} for all TTS event types
 */
export interface TTSAudioEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'tts.audio';

  /**
   * The audio chunk received from the TTS provider.
   *
   * @see {@link AudioChunk}
   */
  chunk: AudioChunk;
}

/**
 * Emitted when audio format metadata is received from the TTS provider.
 *
 * @remarks
 * Contains information about the audio format (sample rate, encoding, channels)
 * that helps the AudioPlayer configure playback correctly. Typically emitted
 * once at the start of a synthesis session.
 *
 * Note: This event does not extend {@link BaseEvent} but includes its own
 * `timestamp` field for consistency.
 *
 * @see {@link AudioMetadata} for the metadata structure
 * @see {@link TTSEvent} for all TTS event types
 */
export interface TTSMetadataEvent {
  /** Discriminant for this event type. */
  type: 'tts.metadata';

  /** Unix timestamp (in milliseconds) when the metadata was received. */
  timestamp: number;

  /**
   * Audio format metadata from the TTS provider.
   *
   * @see {@link AudioMetadata}
   */
  metadata: AudioMetadata;
}

/**
 * Emitted when the TTS provider has finished synthesizing all audio.
 *
 * @remarks
 * Indicates that no more audio chunks will be emitted for the current
 * synthesis request. Playback may still be in progress when this event fires.
 *
 * @see {@link TTSEvent} for all TTS event types
 */
export interface TTSCompleteEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'tts.complete';
}

/**
 * Emitted when the TTS provider encounters an error during synthesis.
 *
 * @remarks
 * The {@link TTSErrorEvent.recoverable | recoverable} flag indicates whether
 * the SDK can attempt to recover (e.g., by retrying the synthesis).
 *
 * @see {@link TTSEvent} for all TTS event types
 */
export interface TTSErrorEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'tts.error';

  /** The error that occurred during synthesis. */
  error: Error;

  /** Whether the error is recoverable (e.g., temporary network issue). */
  recoverable: boolean;
}

/**
 * Union of all TTS-related events.
 *
 * @remarks
 * Use this type to handle any TTS event generically, or subscribe to specific
 * event types via the {@link EventListenerMap}.
 *
 * @see {@link TTSStartEvent}
 * @see {@link TTSAudioEvent}
 * @see {@link TTSMetadataEvent}
 * @see {@link TTSCompleteEvent}
 * @see {@link TTSErrorEvent}
 */
export type TTSEvent =
  | TTSStartEvent
  | TTSAudioEvent
  | TTSMetadataEvent
  | TTSCompleteEvent
  | TTSErrorEvent;

// ---------------------------------------------------------------------------
// Guardrail events
// ---------------------------------------------------------------------------

/**
 * Emitted when a guardrail rewrites text on its way to the TTS provider.
 *
 * @remarks
 * The `llm.chunk` and `llm.complete` events still carry the raw model output —
 * guardrails only change what is spoken. Subscribe here when the UI should
 * show the redacted text instead, or to audit what was rewritten.
 *
 * One event is emitted per guardrail that actually changed the text. A
 * guardrail that passes text through unchanged is silent.
 *
 * @example
 * ```typescript
 * agent.on('guardrail.applied', (event) => {
 *   console.log(`${event.guardrail} rewrote ${event.stage} text: ${event.reason}`);
 * });
 * ```
 *
 * @see {@link GuardrailBlockedEvent} for suppressed text
 * @see {@link GuardrailEvent} for all guardrail event types
 */
export interface GuardrailAppliedEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'guardrail.applied';

  /** Name of the guardrail that rewrote the text. */
  guardrail: string;

  /**
   * Pipeline point at which it ran.
   *
   * @remarks
   * `'chunk'` for text filtered while streaming to a Live TTS provider,
   * `'final'` for a complete utterance.
   */
  stage: 'chunk' | 'final';

  /** Text the guardrail received. */
  original: string;

  /** Text the guardrail produced, which is what gets synthesized. */
  text: string;

  /** Explanation supplied by the guardrail, if any. */
  reason?: string;

  /** Detail supplied by the guardrail (matched categories, counts, scores). */
  metadata?: Record<string, unknown>;
}

/**
 * Emitted when a guardrail suppresses text instead of speaking it.
 *
 * @remarks
 * At the `'final'` stage nothing is synthesized for the utterance. At the
 * `'chunk'` stage the current segment and every later segment of the same
 * utterance are dropped — text already handed to the TTS provider cannot be
 * recalled. Use `mode: 'buffered'` when a block must be absolute.
 *
 * @example
 * ```typescript
 * agent.on('guardrail.blocked', (event) => {
 *   showNotice(`Response withheld by ${event.guardrail}: ${event.reason}`);
 * });
 * ```
 *
 * @see {@link GuardrailEvent} for all guardrail event types
 */
export interface GuardrailBlockedEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'guardrail.blocked';

  /** Name of the guardrail that blocked the text. */
  guardrail: string;

  /** Pipeline point at which it ran. */
  stage: 'chunk' | 'final';

  /** Text that was suppressed. */
  original: string;

  /** Explanation supplied by the guardrail, if any. */
  reason?: string;

  /** Detail supplied by the guardrail (matched categories, counts, scores). */
  metadata?: Record<string, unknown>;
}

/**
 * Emitted when a guardrail throws or exceeds its timeout.
 *
 * @remarks
 * The {@link GuardrailErrorEvent.policy | policy} field reports how the SDK
 * handled it: `'passthrough'` kept the text and skipped the guardrail,
 * `'block'` suppressed the text. Treat these events as an alert — a guardrail
 * that fails silently is a guardrail that is not protecting anything.
 *
 * @example
 * ```typescript
 * agent.on('guardrail.error', (event) => {
 *   metrics.increment('guardrail.failure', { guardrail: event.guardrail });
 * });
 * ```
 *
 * @see {@link GuardrailEvent} for all guardrail event types
 */
export interface GuardrailErrorEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'guardrail.error';

  /** Name of the guardrail that failed. */
  guardrail: string;

  /** Pipeline point at which it ran. */
  stage: 'chunk' | 'final';

  /** The error thrown, or a timeout error synthesized by the SDK. */
  error: Error;

  /** How the failure was handled, per the configured error policy. */
  policy: 'passthrough' | 'block';
}

/**
 * Union of all guardrail-related events.
 *
 * @remarks
 * Use this type to handle any guardrail event generically, or subscribe to
 * specific event types via the {@link EventListenerMap}.
 *
 * @see {@link GuardrailAppliedEvent}
 * @see {@link GuardrailBlockedEvent}
 * @see {@link GuardrailErrorEvent}
 */
export type GuardrailEvent = GuardrailAppliedEvent | GuardrailBlockedEvent | GuardrailErrorEvent;

// ---------------------------------------------------------------------------
// Agent lifecycle events
// ---------------------------------------------------------------------------

/**
 * Emitted when the agent has been initialized and is ready to start.
 *
 * @remarks
 * All providers have been initialized and the agent is waiting for the
 * user to begin speaking. This is a good place to update UI to indicate
 * the agent is ready.
 *
 * @example
 * ```typescript
 * agent.on('agent.ready', () => {
 *   showStatus('Agent is ready. Start speaking!');
 * });
 * ```
 *
 * @see {@link AgentEvent} for all agent event types
 */
export interface AgentReadyEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'agent.ready';
}

/**
 * Emitted when the agent transitions between states.
 *
 * @remarks
 * Provides both the new state and the previous state, enabling UI updates
 * that reflect the current pipeline stage (listening, thinking, speaking).
 *
 * @example
 * ```typescript
 * agent.on('agent.stateChange', (event) => {
 *   console.log(`${event.previousState} -> ${event.state}`);
 *   updateStatusIndicator(event.state);
 * });
 * ```
 *
 * @see {@link AgentState} for the possible state values
 * @see {@link AgentEvent} for all agent event types
 */
export interface AgentStateChangeEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'agent.stateChange';

  /**
   * The new state the agent has transitioned to.
   *
   * @see {@link AgentState}
   */
  state: AgentState;

  /**
   * The state the agent was in before this transition.
   *
   * @see {@link AgentState}
   */
  previousState: AgentState;
}

/**
 * Emitted when the agent encounters a top-level error.
 *
 * @remarks
 * This event covers errors not specific to a single provider (those have their
 * own error events like `transcription.error`, `llm.error`, `tts.error`).
 * The {@link AgentErrorEvent.context | context} field provides additional
 * information about where the error occurred.
 *
 * @example
 * ```typescript
 * agent.on('agent.error', (event) => {
 *   console.error(`Agent error in ${event.context}:`, event.error);
 *   if (!event.recoverable) {
 *     showFatalError(event.error.message);
 *   }
 * });
 * ```
 *
 * @see {@link AgentEvent} for all agent event types
 */
export interface AgentErrorEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'agent.error';

  /** The error that occurred. */
  error: Error;

  /** Whether the error is recoverable. */
  recoverable: boolean;

  /**
   * Additional context about where the error occurred.
   *
   * @remarks
   * May contain the name of the operation or subsystem that failed
   * (e.g., `'initialization'`, `'pipeline'`, `'audio-capture'`).
   */
  context?: string;
}

/**
 * Union of all agent lifecycle events.
 *
 * @remarks
 * Use this type to handle any agent event generically, or subscribe to
 * specific event types via the {@link EventListenerMap}.
 *
 * @see {@link AgentReadyEvent}
 * @see {@link AgentStateChangeEvent}
 * @see {@link AgentErrorEvent}
 */
export type AgentEvent = AgentReadyEvent | AgentStateChangeEvent | AgentErrorEvent;

// ---------------------------------------------------------------------------
// Audio events
// ---------------------------------------------------------------------------

/**
 * Emitted when microphone audio capture begins.
 *
 * @remarks
 * Indicates that the SDK has successfully obtained microphone access and
 * is sending audio data to the STT provider.
 *
 * @see {@link AudioEvent} for all audio event types
 */
export interface AudioCaptureStartEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'audio.capture.start';
}

/**
 * Emitted when microphone audio capture stops.
 *
 * @remarks
 * Indicates that the SDK has stopped capturing audio from the microphone.
 * This may occur during turn-taking (when the agent is speaking) or when
 * the agent is shut down.
 *
 * @see {@link AudioEvent} for all audio event types
 */
export interface AudioCaptureStopEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'audio.capture.stop';
}

/**
 * Emitted when an error occurs during audio capture.
 *
 * @remarks
 * Common causes include microphone permission denial, device disconnection,
 * or AudioContext failures.
 *
 * @see {@link AudioEvent} for all audio event types
 */
export interface AudioCaptureErrorEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'audio.capture.error';

  /** The error that occurred during capture. */
  error: Error;
}

/**
 * Emitted when audio playback of the agent's response begins.
 *
 * @remarks
 * Indicates that synthesized audio from the TTS provider is being played
 * through the speakers. During playback, microphone capture may be paused
 * depending on the {@link TurnTakingConfig}.
 *
 * @see {@link AudioEvent} for all audio event types
 * @see {@link TurnTakingConfig} for turn-taking behavior
 */
export interface AudioPlaybackStartEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'audio.playback.start';
}

/**
 * Emitted when audio playback of the agent's response ends.
 *
 * @remarks
 * All queued audio has been played. If turn-taking paused capture, it will
 * be resumed after this event.
 *
 * @see {@link AudioEvent} for all audio event types
 */
export interface AudioPlaybackEndEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'audio.playback.end';
}

/**
 * Emitted when an error occurs during audio playback.
 *
 * @remarks
 * Common causes include AudioContext suspension, decoding errors, or
 * browser autoplay policy violations.
 *
 * @see {@link AudioEvent} for all audio event types
 */
export interface AudioPlaybackErrorEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'audio.playback.error';

  /** The error that occurred during playback. */
  error: Error;
}

/**
 * Union of all audio-related events.
 *
 * @remarks
 * Use this type to handle any audio event generically, or subscribe to
 * specific event types via the {@link EventListenerMap}.
 *
 * @see {@link AudioCaptureStartEvent}
 * @see {@link AudioCaptureStopEvent}
 * @see {@link AudioCaptureErrorEvent}
 * @see {@link AudioPlaybackStartEvent}
 * @see {@link AudioPlaybackEndEvent}
 * @see {@link AudioPlaybackErrorEvent}
 */
export type AudioEvent =
  | AudioCaptureStartEvent
  | AudioCaptureStopEvent
  | AudioCaptureErrorEvent
  | AudioPlaybackStartEvent
  | AudioPlaybackEndEvent
  | AudioPlaybackErrorEvent;

// ---------------------------------------------------------------------------
// Queue events
// ---------------------------------------------------------------------------

/**
 * Emitted when an {@link AudioBufferQueue} drops chunks due to overflow.
 *
 * @remarks
 * This event fires each time the queue drops one or more chunks because it
 * has reached its configured `maxSize` and the overflow strategy is
 * `'drop-oldest'` or `'drop-newest'`. The event includes the queue name,
 * the number of chunks dropped in this overflow instance, and the current
 * buffer size after the drop.
 *
 * Monitoring this event helps detect situations where the STT or output
 * consumer is too slow to keep up with the producer, potentially causing
 * audio gaps.
 *
 * @example
 * ```typescript
 * agent.on('queue.overflow', (event) => {
 *   console.warn(
 *     `Queue "${event.queueName}" overflowed: ` +
 *     `${event.droppedChunks} chunks dropped, ${event.currentSize} remaining`
 *   );
 * });
 * ```
 *
 * @see {@link QueueStatsEvent} for periodic pipeline health snapshots
 * @see {@link QueueEvent} for all queue event types
 */
export interface QueueOverflowEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'queue.overflow';

  /**
   * Diagnostic name of the queue that overflowed.
   *
   * @remarks
   * Typically `'input'` (between InputProvider and STT) or `'output'`
   * (between TTS and OutputProvider).
   */
  queueName: string;

  /**
   * Number of chunks dropped in this overflow instance.
   *
   * @remarks
   * For `'drop-oldest'` and `'drop-newest'` strategies, this is typically 1
   * per overflow event. The cumulative total is available via
   * {@link QueueStatsEvent.totalDropped} or {@link QueueStats.totalDropped}.
   */
  droppedChunks: number;

  /**
   * Current number of chunks in the buffer after the drop.
   *
   * @remarks
   * Equals the queue's `maxSize` for `'drop-oldest'` (the buffer remains
   * full after replacing the oldest chunk).
   */
  currentSize: number;
}

/**
 * Emitted when queue statistics are requested via `getQueueStats()`.
 *
 * @remarks
 * This event provides a point-in-time snapshot of an {@link AudioBufferQueue}'s
 * health metrics, including current size, total throughput counters, and the
 * age of the oldest buffered chunk. One event is emitted per queue (input and
 * output) each time `getQueueStats()` is called.
 *
 * Use this event for dashboards, logging, or alerting on pipeline health.
 *
 * @example
 * ```typescript
 * agent.on('queue.stats', (event) => {
 *   console.log(
 *     `Queue "${event.queueName}": ${event.size} buffered, ` +
 *     `${event.totalEnqueued} in, ${event.totalDequeued} out, ` +
 *     `oldest: ${event.oldestChunkAge}ms`
 *   );
 * });
 *
 * // Trigger stats emission
 * const stats = agent.getQueueStats();
 * ```
 *
 * @see {@link QueueOverflowEvent} for overflow-specific alerts
 * @see {@link QueueEvent} for all queue event types
 */
export interface QueueStatsEvent extends BaseEvent {
  /** Discriminant for this event type. */
  type: 'queue.stats';

  /**
   * Diagnostic name of the queue.
   *
   * @remarks
   * Typically `'input'` or `'output'`.
   */
  queueName: string;

  /**
   * Current number of chunks in the buffer.
   *
   * @remarks
   * Always 0 when the queue is in draining (pass-through) mode.
   */
  size: number;

  /**
   * Total number of chunks enqueued since creation.
   *
   * @remarks
   * Includes chunks that were subsequently dropped due to overflow.
   */
  totalEnqueued: number;

  /**
   * Total number of chunks delivered to the drain callback.
   *
   * @remarks
   * Includes both buffered chunks flushed during drain and pass-through chunks.
   */
  totalDequeued: number;

  /**
   * Age of the oldest chunk in the buffer, in milliseconds.
   *
   * @remarks
   * Returns 0 when the buffer is empty or in draining mode.
   */
  oldestChunkAge: number;
}

/**
 * Union of all queue-related events.
 *
 * @remarks
 * Use this type to handle any queue event generically, or subscribe to
 * specific event types via the {@link EventListenerMap}.
 *
 * @see {@link QueueOverflowEvent}
 * @see {@link QueueStatsEvent}
 */
export type QueueEvent = QueueOverflowEvent | QueueStatsEvent;

// ---------------------------------------------------------------------------
// Composite types
// ---------------------------------------------------------------------------

/**
 * Union of all events that can be emitted by a CompositeVoice agent.
 *
 * @remarks
 * This is the top-level event type encompassing every category:
 * transcription, LLM, TTS, agent lifecycle, and audio events.
 * Use the discriminated `type` field to narrow to a specific event interface.
 *
 * @example
 * ```typescript
 * function handleEvent(event: CompositeVoiceEvent) {
 *   switch (event.type) {
 *     case 'transcription.final':
 *       console.log('Transcript:', event.text);
 *       break;
 *     case 'llm.complete':
 *       console.log('Response:', event.text);
 *       break;
 *     case 'agent.stateChange':
 *       console.log('State:', event.state);
 *       break;
 *   }
 * }
 * ```
 *
 * @see {@link TranscriptionEvent}
 * @see {@link LLMEvent}
 * @see {@link TTSEvent}
 * @see {@link GuardrailEvent}
 * @see {@link AgentEvent}
 * @see {@link AudioEvent}
 * @see {@link QueueEvent}
 */
export type CompositeVoiceEvent =
  | TranscriptionEvent
  | LLMEvent
  | TTSEvent
  | GuardrailEvent
  | AgentEvent
  | AudioEvent
  | QueueEvent;

/**
 * String union of all possible event type identifiers.
 *
 * @remarks
 * Derived from the `type` discriminant field of {@link CompositeVoiceEvent}.
 * Use this type when you need to reference event type strings without
 * importing each individual event interface.
 *
 * @example
 * ```typescript
 * const eventTypes: EventType[] = [
 *   'transcription.final',
 *   'llm.complete',
 *   'tts.complete',
 * ];
 * ```
 *
 * @see {@link CompositeVoiceEvent} for the full event union
 */
export type EventType = CompositeVoiceEvent['type'];

/**
 * Generic event listener function type.
 *
 * @remarks
 * A function that receives a typed event and optionally returns a Promise
 * for asynchronous handling. The SDK awaits async listeners before proceeding.
 *
 * @typeParam T - The specific event type this listener handles, defaults to
 * {@link CompositeVoiceEvent} (any event)
 *
 * @see {@link EventListenerMap} for typed event subscriptions
 */
export type EventListener<T extends CompositeVoiceEvent = CompositeVoiceEvent> = (
  event: T
) => void | Promise<void>;

/**
 * Typed mapping from event type strings to their corresponding listener signatures.
 *
 * @remarks
 * This interface enables fully type-safe event subscriptions. When you call
 * `agent.on('transcription.final', callback)`, TypeScript infers that the
 * callback receives a {@link TranscriptionFinalEvent} -- no manual type
 * assertions needed.
 *
 * @example
 * ```typescript
 * // The callback parameter is automatically typed as TranscriptionFinalEvent
 * agent.on('transcription.final', (event) => {
 *   console.log(event.text);       // string -- type-safe
 *   console.log(event.confidence); // number | undefined -- type-safe
 * });
 *
 * // The callback parameter is automatically typed as AgentStateChangeEvent
 * agent.on('agent.stateChange', (event) => {
 *   console.log(event.state);         // AgentState -- type-safe
 *   console.log(event.previousState); // AgentState -- type-safe
 * });
 * ```
 *
 * @see {@link EventListener} for the listener function type
 * @see {@link EventType} for valid event type strings
 * @see {@link CompositeVoiceEvent} for the full event union
 */
export interface EventListenerMap {
  /** Listener for {@link TranscriptionStartEvent}. */
  'transcription.start': EventListener<TranscriptionStartEvent>;

  /** Listener for {@link TranscriptionInterimEvent}. */
  'transcription.interim': EventListener<TranscriptionInterimEvent>;

  /** Listener for {@link TranscriptionFinalEvent}. */
  'transcription.final': EventListener<TranscriptionFinalEvent>;

  /** Listener for {@link TranscriptionSpeechFinalEvent}. */
  'transcription.speechFinal': EventListener<TranscriptionSpeechFinalEvent>;

  /** Listener for {@link TranscriptionPreflightEvent}. */
  'transcription.preflight': EventListener<TranscriptionPreflightEvent>;

  /** Listener for {@link TranscriptionErrorEvent}. */
  'transcription.error': EventListener<TranscriptionErrorEvent>;

  /** Listener for {@link LLMStartEvent}. */
  'llm.start': EventListener<LLMStartEvent>;

  /** Listener for {@link LLMChunkEvent}. */
  'llm.chunk': EventListener<LLMChunkEvent>;

  /** Listener for {@link LLMCompleteEvent}. */
  'llm.complete': EventListener<LLMCompleteEvent>;

  /** Listener for {@link LLMErrorEvent}. */
  'llm.error': EventListener<LLMErrorEvent>;

  /** Listener for {@link TTSStartEvent}. */
  'tts.start': EventListener<TTSStartEvent>;

  /** Listener for {@link TTSAudioEvent}. */
  'tts.audio': EventListener<TTSAudioEvent>;

  /** Listener for {@link TTSMetadataEvent}. */
  'tts.metadata': EventListener<TTSMetadataEvent>;

  /** Listener for {@link TTSCompleteEvent}. */
  'tts.complete': EventListener<TTSCompleteEvent>;

  /** Listener for {@link TTSErrorEvent}. */
  'tts.error': EventListener<TTSErrorEvent>;

  /** Listener for {@link GuardrailAppliedEvent}. */
  'guardrail.applied': EventListener<GuardrailAppliedEvent>;

  /** Listener for {@link GuardrailBlockedEvent}. */
  'guardrail.blocked': EventListener<GuardrailBlockedEvent>;

  /** Listener for {@link GuardrailErrorEvent}. */
  'guardrail.error': EventListener<GuardrailErrorEvent>;

  /** Listener for {@link AgentReadyEvent}. */
  'agent.ready': EventListener<AgentReadyEvent>;

  /** Listener for {@link AgentStateChangeEvent}. */
  'agent.stateChange': EventListener<AgentStateChangeEvent>;

  /** Listener for {@link AgentErrorEvent}. */
  'agent.error': EventListener<AgentErrorEvent>;

  /** Listener for {@link AudioCaptureStartEvent}. */
  'audio.capture.start': EventListener<AudioCaptureStartEvent>;

  /** Listener for {@link AudioCaptureStopEvent}. */
  'audio.capture.stop': EventListener<AudioCaptureStopEvent>;

  /** Listener for {@link AudioCaptureErrorEvent}. */
  'audio.capture.error': EventListener<AudioCaptureErrorEvent>;

  /** Listener for {@link AudioPlaybackStartEvent}. */
  'audio.playback.start': EventListener<AudioPlaybackStartEvent>;

  /** Listener for {@link AudioPlaybackEndEvent}. */
  'audio.playback.end': EventListener<AudioPlaybackEndEvent>;

  /** Listener for {@link AudioPlaybackErrorEvent}. */
  'audio.playback.error': EventListener<AudioPlaybackErrorEvent>;

  /** Listener for {@link QueueOverflowEvent}. */
  'queue.overflow': EventListener<QueueOverflowEvent>;

  /** Listener for {@link QueueStatsEvent}. */
  'queue.stats': EventListener<QueueStatsEvent>;
}
