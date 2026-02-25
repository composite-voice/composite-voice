/**
 * @packageDocumentation
 * Utility modules for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports all shared utility classes, functions, and error types used across
 * the SDK:
 *
 * - **Errors** -- Typed error classes (`CompositeVoiceError`, `ProviderInitializationError`,
 *   `ProviderConnectionError`, `AudioCaptureError`, etc.) for structured error handling.
 * - **Logger** -- Configurable logging utility with log level support.
 * - **WebSocketManager** -- WebSocket connection manager with automatic reconnection
 *   and exponential backoff.
 * - **Audio utilities** -- Functions for audio format conversion (`floatTo16BitPCM`,
 *   `int16ToFloat`), buffer manipulation (`concatenateArrayBuffers`, `downsampleAudio`),
 *   WAV header creation, RMS calculation, silence detection, and fade effects.
 * - **Turn-taking** -- Utilities for managing conversational turn-taking strategies.
 * - **Browser capabilities** -- Utilities for detecting browser audio and speech API support.
 *
 * @example
 * ```typescript
 * import {
 *   CompositeVoiceError,
 *   Logger,
 *   WebSocketManager,
 *   floatTo16BitPCM,
 *   calculateRMS,
 * } from '@lukeocodes/composite-voice/utils';
 * ```
 */

export * from './errors';
export * from './logger';
export * from './websocket';
export * from './audio';
export * from './turnTaking';
export * from './browserCapabilities';
