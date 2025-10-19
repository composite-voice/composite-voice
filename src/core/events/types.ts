/**
 * Event type definitions for the CompositeVoice SDK
 */

import type { AudioChunk, AudioMetadata } from '../types/audio';

/**
 * Agent state
 */
export type AgentState = 'idle' | 'ready' | 'listening' | 'thinking' | 'speaking' | 'error';

/**
 * Base event interface
 */
export interface BaseEvent {
  /** Timestamp when the event occurred */
  timestamp: number;
  /** Optional event metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Transcription events
 */
export interface TranscriptionStartEvent extends BaseEvent {
  type: 'transcription.start';
}

export interface TranscriptionInterimEvent extends BaseEvent {
  type: 'transcription.interim';
  text: string;
  confidence?: number;
}

export interface TranscriptionFinalEvent extends BaseEvent {
  type: 'transcription.final';
  text: string;
  confidence?: number;
}

export interface TranscriptionErrorEvent extends BaseEvent {
  type: 'transcription.error';
  error: Error;
  recoverable: boolean;
}

export type TranscriptionEvent =
  | TranscriptionStartEvent
  | TranscriptionInterimEvent
  | TranscriptionFinalEvent
  | TranscriptionErrorEvent;

/**
 * LLM events
 */
export interface LLMStartEvent extends BaseEvent {
  type: 'llm.start';
  prompt: string;
}

export interface LLMChunkEvent extends BaseEvent {
  type: 'llm.chunk';
  chunk: string;
  accumulated: string;
}

export interface LLMCompleteEvent extends BaseEvent {
  type: 'llm.complete';
  text: string;
  tokensUsed?: number;
}

export interface LLMErrorEvent extends BaseEvent {
  type: 'llm.error';
  error: Error;
  recoverable: boolean;
}

export type LLMEvent = LLMStartEvent | LLMChunkEvent | LLMCompleteEvent | LLMErrorEvent;

/**
 * TTS events
 */
export interface TTSStartEvent extends BaseEvent {
  type: 'tts.start';
  text: string;
}

export interface TTSAudioEvent extends BaseEvent {
  type: 'tts.audio';
  chunk: AudioChunk;
}

export interface TTSMetadataEvent {
  type: 'tts.metadata';
  timestamp: number;
  metadata: AudioMetadata;
}

export interface TTSCompleteEvent extends BaseEvent {
  type: 'tts.complete';
}

export interface TTSErrorEvent extends BaseEvent {
  type: 'tts.error';
  error: Error;
  recoverable: boolean;
}

export type TTSEvent =
  | TTSStartEvent
  | TTSAudioEvent
  | TTSMetadataEvent
  | TTSCompleteEvent
  | TTSErrorEvent;

/**
 * Agent lifecycle events
 */
export interface AgentReadyEvent extends BaseEvent {
  type: 'agent.ready';
}

export interface AgentStateChangeEvent extends BaseEvent {
  type: 'agent.stateChange';
  state: AgentState;
  previousState: AgentState;
}

export interface AgentErrorEvent extends BaseEvent {
  type: 'agent.error';
  error: Error;
  recoverable: boolean;
  context?: string;
}

export type AgentEvent = AgentReadyEvent | AgentStateChangeEvent | AgentErrorEvent;

/**
 * Audio events
 */
export interface AudioCaptureStartEvent extends BaseEvent {
  type: 'audio.capture.start';
}

export interface AudioCaptureStopEvent extends BaseEvent {
  type: 'audio.capture.stop';
}

export interface AudioCaptureErrorEvent extends BaseEvent {
  type: 'audio.capture.error';
  error: Error;
}

export interface AudioPlaybackStartEvent extends BaseEvent {
  type: 'audio.playback.start';
}

export interface AudioPlaybackEndEvent extends BaseEvent {
  type: 'audio.playback.end';
}

export interface AudioPlaybackErrorEvent extends BaseEvent {
  type: 'audio.playback.error';
  error: Error;
}

export type AudioEvent =
  | AudioCaptureStartEvent
  | AudioCaptureStopEvent
  | AudioCaptureErrorEvent
  | AudioPlaybackStartEvent
  | AudioPlaybackEndEvent
  | AudioPlaybackErrorEvent;

/**
 * All possible events
 */
export type CompositeVoiceEvent =
  | TranscriptionEvent
  | LLMEvent
  | TTSEvent
  | AgentEvent
  | AudioEvent;

/**
 * Event type string union
 */
export type EventType = CompositeVoiceEvent['type'];

/**
 * Event listener function type
 */
export type EventListener<T extends CompositeVoiceEvent = CompositeVoiceEvent> = (
  event: T
) => void | Promise<void>;

/**
 * Event listener map for typed event subscriptions
 */
export interface EventListenerMap {
  'transcription.start': EventListener<TranscriptionStartEvent>;
  'transcription.interim': EventListener<TranscriptionInterimEvent>;
  'transcription.final': EventListener<TranscriptionFinalEvent>;
  'transcription.error': EventListener<TranscriptionErrorEvent>;

  'llm.start': EventListener<LLMStartEvent>;
  'llm.chunk': EventListener<LLMChunkEvent>;
  'llm.complete': EventListener<LLMCompleteEvent>;
  'llm.error': EventListener<LLMErrorEvent>;

  'tts.start': EventListener<TTSStartEvent>;
  'tts.audio': EventListener<TTSAudioEvent>;
  'tts.metadata': EventListener<TTSMetadataEvent>;
  'tts.complete': EventListener<TTSCompleteEvent>;
  'tts.error': EventListener<TTSErrorEvent>;

  'agent.ready': EventListener<AgentReadyEvent>;
  'agent.stateChange': EventListener<AgentStateChangeEvent>;
  'agent.error': EventListener<AgentErrorEvent>;

  'audio.capture.start': EventListener<AudioCaptureStartEvent>;
  'audio.capture.stop': EventListener<AudioCaptureStopEvent>;
  'audio.capture.error': EventListener<AudioCaptureErrorEvent>;
  'audio.playback.start': EventListener<AudioPlaybackStartEvent>;
  'audio.playback.end': EventListener<AudioPlaybackEndEvent>;
  'audio.playback.error': EventListener<AudioPlaybackErrorEvent>;
}
