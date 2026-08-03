/**
 * @packageDocumentation
 * Core audio capture and playback module for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports the `AudioCapture` and `AudioPlayer` classes that manage
 * microphone input and audio output respectively. These are used internally
 * by the {@link CompositeVoice} orchestrator and can also be used directly
 * for custom audio pipeline integrations.
 *
 * - **AudioCapture** -- Manages microphone access via the Web Audio API,
 *   providing audio chunks to the STT provider.
 * - **AudioPlayer** -- Manages audio playback of TTS output, supporting
 *   queued playback and interruption.
 *
 * @example
 * ```typescript
 * import { AudioCapture, AudioPlayer } from 'composite-voice';
 * ```
 */

export * from './AudioCapture';
export * from './AudioPlayer';
