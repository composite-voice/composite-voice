/**
 * @packageDocumentation
 * Core type definitions for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports all core TypeScript interfaces and type aliases organized into
 * four categories:
 *
 * - **Role types** -- `ProviderRole`, `ALL_PROVIDER_ROLES` for the 5-role
 *   pipeline (input, stt, llm, tts, output).
 * - **Audio types** -- `AudioFormat`, `AudioEncoding`, `AudioInputConfig`,
 *   `AudioOutputConfig`, `AudioMetadata`, `AudioChunk`, and related types
 *   for audio format configuration and data representation.
 * - **Provider types** -- `BaseProvider`, `STTProvider`, `LLMProvider`,
 *   `TTSProvider`, `AudioInputProvider`, `AudioOutputProvider`,
 *   `ResolvedPipeline`, and their configuration interfaces that define the
 *   contracts all providers must implement.
 * - **Config types** -- `CompositeVoiceConfig`, `AudioBufferQueueConfig`,
 *   `ReconnectionConfig`, `LoggingConfig`, `ConversationHistoryConfig`,
 *   `EagerLLMConfig`, and `TurnTakingConfig` for SDK configuration.
 *
 * @example
 * ```typescript
 * import type {
 *   CompositeVoiceConfig,
 *   ProviderRole,
 *   AudioInputProvider,
 *   AudioOutputProvider,
 *   STTProvider,
 *   LLMProvider,
 *   TTSProvider,
 *   ResolvedPipeline,
 * } from 'composite-voice';
 * ```
 */

export * from './roles';
export * from './audio';
export * from './providers';
export * from './config';
