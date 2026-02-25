/**
 * @packageDocumentation
 * Mistral AI LLM provider.
 *
 * @remarks
 * Re-exports the {@link MistralLLM} class and its configuration type. MistralLLM
 * connects to the Mistral AI API (OpenAI-compatible) for LLM inference with
 * Mistral's family of models (e.g., Mistral Large, Mistral Small, Codestral).
 *
 * Extends {@link OpenAICompatibleLLM} with the Mistral-specific base URL.
 *
 * @example
 * ```typescript
 * import { MistralLLM } from '@lukeocodes/composite-voice';
 *
 * const llm = new MistralLLM({
 *   proxyUrl: '/api/proxy/mistral',
 *   model: 'mistral-large-latest',
 *   systemPrompt: 'You are a helpful voice assistant.',
 * });
 * ```
 *
 * @see {@link OpenAILLM} for OpenAI models
 * @see {@link OpenAICompatibleLLM} for creating custom OpenAI-compatible providers
 */

export { MistralLLM } from './MistralLLM';
export type { MistralLLMConfig } from './MistralLLM';
