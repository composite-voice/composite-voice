/**
 * LLM providers export
 */

// Note: LLM providers are available when peer dependencies are installed
// Import them directly:
// import { OpenAILLM } from '@lukeocodes/composite-voice/providers/llm/openai';
// import { AnthropicLLM } from '@lukeocodes/composite-voice/providers/llm/anthropic';

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
