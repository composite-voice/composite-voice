/**
 * @packageDocumentation
 * Providers module for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports all provider base classes and built-in provider implementations
 * for STT, LLM, and TTS. This barrel module aggregates providers from
 * `base`, `stt`, `llm`, and `tts` submodules for convenient access.
 *
 * For creating custom providers, extend the base classes:
 * - {@link BaseSTTProvider} for Speech-to-Text
 * - {@link BaseLLMProvider} for Large Language Models
 * - {@link BaseTTSProvider} for Text-to-Speech
 *
 * @example
 * ```typescript
 * import { DeepgramSTT, AnthropicLLM, DeepgramTTS } from '@lukeocodes/composite-voice/providers';
 * ```
 */

export * from './base/index';
export * from './stt/index';
export * from './llm/index';
export * from './tts/index';
