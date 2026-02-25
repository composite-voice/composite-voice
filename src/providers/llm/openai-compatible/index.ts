/**
 * @packageDocumentation
 * OpenAI-compatible LLM base class.
 *
 * @remarks
 * Re-exports the {@link OpenAICompatibleLLM} abstract class and its configuration type.
 * This base class implements the OpenAI Chat Completions API protocol with streaming
 * SSE support, and can be extended to create providers for any OpenAI-compatible
 * endpoint (e.g., self-hosted vLLM, Ollama, LiteLLM, or third-party services).
 *
 * The built-in {@link OpenAILLM}, {@link GroqLLM}, {@link MistralLLM}, and
 * {@link GeminiLLM} providers all extend this class.
 *
 * @example
 * ```typescript
 * import { OpenAICompatibleLLM } from '@lukeocodes/composite-voice';
 * import type { OpenAICompatibleLLMConfig } from '@lukeocodes/composite-voice';
 *
 * class MyCustomLLM extends OpenAICompatibleLLM {
 *   constructor(config: OpenAICompatibleLLMConfig) {
 *     super({ ...config, baseUrl: 'https://my-custom-api.example.com' });
 *   }
 * }
 * ```
 *
 * @see {@link OpenAILLM} for the standard OpenAI provider
 * @see {@link GroqLLM} for the Groq provider
 */

export { OpenAICompatibleLLM } from './OpenAICompatibleLLM';
export type { OpenAICompatibleLLMConfig } from './OpenAICompatibleLLM';
