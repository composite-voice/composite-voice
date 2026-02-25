/**
 * @packageDocumentation
 * Event system module for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports the typed event system used throughout the SDK. This includes
 * the `EventEmitter` class and all event type definitions for transcription,
 * LLM generation, TTS synthesis, agent state changes, and audio events.
 *
 * The event system provides type-safe event listeners with full TypeScript
 * inference for event payloads.
 *
 * @example
 * ```typescript
 * import { EventEmitter } from '@lukeocodes/composite-voice';
 * import type { TranscriptionEvent, LLMEvent, TTSEvent } from '@lukeocodes/composite-voice';
 *
 * const emitter = new EventEmitter();
 * emitter.on('transcription:speechFinal', (event: TranscriptionSpeechFinalEvent) => {
 *   console.log('Final transcript:', event.text);
 * });
 * ```
 */

export * from './types';
export * from './EventEmitter';
