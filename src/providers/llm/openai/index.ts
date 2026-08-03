/**
 * @packageDocumentation
 * OpenAI LLM provider.
 *
 * @remarks
 * Re-exports the {@link OpenAILLM} class and its configuration type. OpenAILLM
 * connects to the OpenAI Chat Completions API with streaming SSE support,
 * enabling real-time token-by-token response generation.
 *
 * Extends {@link OpenAICompatibleLLM} with the OpenAI-specific base URL
 * and authentication scheme.
 *
 * @example
 * ```typescript
 * import { OpenAILLM } from 'composite-voice';
 *
 * const llm = new OpenAILLM({
 *   proxyUrl: '/api/proxy/openai',
 *   model: 'gpt-4o-mini',
 *   systemPrompt: 'You are a helpful voice assistant.',
 * });
 * ```
 *
 * @see {@link AnthropicLLM} for Anthropic Claude models
 * @see {@link OpenAICompatibleLLM} for creating custom OpenAI-compatible providers
 */

export { OpenAILLM } from './OpenAILLM';
export type { OpenAILLMConfig } from './OpenAILLM';
