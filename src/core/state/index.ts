/**
 * @packageDocumentation
 * Core state management module for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports state machine classes and their associated state types. The SDK
 * uses finite state machines to manage the lifecycle of audio capture, audio
 * playback, processing pipelines, and the overall agent state.
 *
 * - **AgentStateMachine** -- Manages the top-level agent state transitions
 *   (idle, listening, thinking, speaking).
 * - **SimpleAudioCaptureStateMachine** -- Tracks microphone capture state.
 * - **SimpleAudioPlaybackStateMachine** -- Tracks audio playback state.
 * - **SimpleProcessingStateMachine** -- Tracks LLM/TTS processing state.
 *
 * @example
 * ```typescript
 * import { AgentStateMachine } from 'composite-voice';
 * import type { AgentState } from 'composite-voice';
 * ```
 */

export { AgentStateMachine } from './AgentStateMachine';
export { SimpleAudioCaptureStateMachine } from './SimpleAudioCaptureStateMachine';
export { SimpleAudioPlaybackStateMachine } from './SimpleAudioPlaybackStateMachine';
export { SimpleProcessingStateMachine } from './SimpleProcessingStateMachine';

export type { AgentState } from '../events/types';
export type { AudioCaptureState } from './SimpleAudioCaptureStateMachine';
export type { PlaybackState } from './SimpleAudioPlaybackStateMachine';
export type { ProcessingState } from './SimpleProcessingStateMachine';
