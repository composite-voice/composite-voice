/**
 * @packageDocumentation
 * Groq LLM provider.
 *
 * @remarks
 * Re-exports the {@link GroqLLM} class and its configuration type. GroqLLM
 * connects to the Groq API (OpenAI-compatible) for ultra-fast LLM inference
 * powered by Groq's LPU (Language Processing Unit) hardware.
 *
 * Extends {@link OpenAICompatibleLLM} with the Groq-specific base URL.
 *
 * @example
 * ```typescript
 * import { GroqLLM } from 'composite-voice';
 *
 * const llm = new GroqLLM({
 *   proxyUrl: '/api/proxy/groq',
 *   model: 'llama-3.3-70b-versatile',
 *   systemPrompt: 'You are a helpful voice assistant.',
 * });
 * ```
 *
 * @see {@link OpenAILLM} for OpenAI models
 * @see {@link AnthropicLLM} for Anthropic Claude models
 * @see {@link OpenAICompatibleLLM} for creating custom OpenAI-compatible providers
 */

export { GroqLLM } from './GroqLLM';
export type { GroqLLMConfig } from './GroqLLM';
