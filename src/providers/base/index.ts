/**
 * @packageDocumentation
 * Base provider abstract classes for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports all abstract base classes that providers must extend. These classes
 * define the contracts and shared behavior for each provider type:
 *
 * - **BaseProvider** -- Root abstract class with shared lifecycle (`initialize`, `destroy`).
 * - **BaseSTTProvider** -- Abstract base for Speech-to-Text providers.
 * - **BaseLLMProvider** -- Abstract base for Large Language Model providers.
 * - **BaseTTSProvider** -- Abstract base for Text-to-Speech providers.
 * - **RestSTTProvider** -- Base for REST-based STT providers.
 * - **LiveSTTProvider** -- Base for WebSocket-based streaming STT providers.
 * - **RestTTSProvider** -- Base for REST-based TTS providers.
 * - **LiveTTSProvider** -- Base for WebSocket-based streaming TTS providers.
 *
 * Extend these classes to create custom provider implementations.
 *
 * @example
 * ```typescript
 * import { BaseLLMProvider } from '@lukeocodes/composite-voice';
 * import type { LLMProviderConfig, LLMMessage } from '@lukeocodes/composite-voice';
 *
 * class MyCustomLLM extends BaseLLMProvider {
 *   // ... implement abstract methods
 * }
 * ```
 *
 * @see {@link BaseSTTProvider} for creating custom STT providers
 * @see {@link BaseLLMProvider} for creating custom LLM providers
 * @see {@link BaseTTSProvider} for creating custom TTS providers
 */

export * from './BaseProvider';
export * from './BaseSTTProvider';
export * from './BaseLLMProvider';
export * from './BaseTTSProvider';
export * from './RestSTTProvider';
export * from './LiveSTTProvider';
export * from './RestTTSProvider';
export * from './LiveTTSProvider';
export * from './BaseAgentProvider';
