/**
 * @packageDocumentation
 * Large Language Model (LLM) providers for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports all built-in LLM provider implementations:
 *
 * - **OpenAICompatibleLLM** -- Base class for any OpenAI-compatible API. Extend this
 *   to create custom providers for self-hosted or third-party OpenAI-compatible endpoints.
 * - **OpenAILLM** -- Connects to the OpenAI Chat Completions API with streaming support.
 * - **AnthropicLLM** -- Connects to the Anthropic Messages API with SSE streaming.
 * - **GroqLLM** -- Connects to the Groq API (OpenAI-compatible) for ultra-fast inference.
 * - **MistralLLM** -- Connects to the Mistral AI API (OpenAI-compatible).
 * - **GeminiLLM** -- Connects to Google Gemini via the OpenAI-compatible endpoint.
 * - **WebLLMLLM** -- Runs LLMs entirely in the browser using WebLLM (WebGPU). No API key required.
 *
 * @example
 * ```typescript
 * import { AnthropicLLM, OpenAILLM, GroqLLM } from 'composite-voice/providers/llm';
 *
 * const llm = new AnthropicLLM({
 *   proxyUrl: '/api/proxy/anthropic',
 *   model: 'claude-haiku-4-5',
 *   systemPrompt: 'You are a helpful voice assistant.',
 * });
 * ```
 *
 * @see {@link OpenAICompatibleLLM} for creating custom OpenAI-compatible providers
 * @see {@link WebLLMLLM} for fully in-browser LLM inference
 */

// Re-export OpenAI-compatible base class (for custom providers)
export { OpenAICompatibleLLM } from './openai-compatible';
export type { OpenAICompatibleLLMConfig } from './openai-compatible';

// Re-export OpenAI provider
export { OpenAILLM } from './openai';
export type { OpenAILLMConfig } from './openai';

// Re-export Anthropic provider
export { AnthropicLLM } from './anthropic';
export type { AnthropicLLMConfig } from './anthropic';

// Re-export Groq provider
export { GroqLLM } from './groq';
export type { GroqLLMConfig } from './groq';

// Re-export Mistral provider
export { MistralLLM } from './mistral';
export type { MistralLLMConfig } from './mistral';

// Re-export Gemini provider
export { GeminiLLM } from './gemini';
export type { GeminiLLMConfig } from './gemini';

// Re-export WebLLM provider
export { WebLLMLLM } from './webllm';
export type { WebLLMLLMConfig, WebLLMLoadProgress } from './webllm';
