/**
 * @packageDocumentation
 * Anthropic LLM provider.
 *
 * @remarks
 * Re-exports the {@link AnthropicLLM} class and its configuration type. AnthropicLLM
 * connects to the Anthropic Messages API with SSE streaming support, enabling
 * real-time token-by-token response generation with Claude models.
 *
 * @example
 * ```typescript
 * import { AnthropicLLM } from '@lukeocodes/composite-voice';
 *
 * const llm = new AnthropicLLM({
 *   proxyUrl: '/api/proxy/anthropic',
 *   model: 'claude-haiku-4-6',
 *   systemPrompt: 'You are a helpful voice assistant. Keep responses concise.',
 *   maxTokens: 256,
 * });
 * ```
 *
 * @see {@link OpenAILLM} for OpenAI models
 * @see {@link GroqLLM} for ultra-fast inference with Groq
 */
export { AnthropicLLM } from './AnthropicLLM';
export type { AnthropicLLMConfig } from './AnthropicLLM';
