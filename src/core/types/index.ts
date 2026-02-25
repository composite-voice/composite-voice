/**
 * @packageDocumentation
 * Core type definitions for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports all core TypeScript interfaces and type aliases organized into
 * three categories:
 *
 * - **Audio types** -- `AudioFormat`, `AudioEncoding`, `AudioInputConfig`,
 *   `AudioOutputConfig`, `AudioMetadata`, `AudioChunk`, and related types
 *   for audio format configuration and data representation.
 * - **Provider types** -- `BaseProvider`, `STTProvider`, `LLMProvider`,
 *   `TTSProvider`, and their configuration interfaces that define the
 *   contracts all providers must implement.
 * - **Config types** -- `CompositeVoiceConfig`, `AudioConfig`,
 *   `ReconnectionConfig`, `LoggingConfig`, `ConversationHistoryConfig`,
 *   `EagerLLMConfig`, and `TurnTakingConfig` for SDK configuration.
 *
 * @example
 * ```typescript
 * import type {
 *   CompositeVoiceConfig,
 *   STTProvider,
 *   LLMProvider,
 *   TTSProvider,
 * } from '@lukeocodes/composite-voice';
 * ```
 */

export * from './audio';
export * from './providers';
export * from './config';
