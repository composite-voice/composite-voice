/**
 * Groq LLM provider for ultra-fast inference via the OpenAI-compatible API.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link GroqLLM} class, a thin subclass of
 * {@link OpenAICompatibleLLM} that defaults to Groq's API endpoint
 * (`https://api.groq.com/openai/v1`) and the `llama-3.3-70b-versatile` model.
 *
 * Groq offers extremely fast inference (often under 500 tokens/second) powered
 * by custom LPU (Language Processing Unit) hardware. Because Groq's API is
 * fully OpenAI-compatible, this provider uses the `openai` npm package as its
 * peer dependency rather than `groq-sdk`.
 *
 * @see {@link OpenAICompatibleLLM} for the base class that provides all generation logic.
 * @see {@link OpenAILLM} for the OpenAI provider.
 * @see {@link MistralLLM} for another OpenAI-compatible provider.
 */

import { OpenAICompatibleLLM } from '../openai-compatible/OpenAICompatibleLLM';
import type { OpenAICompatibleLLMConfig } from '../openai-compatible/OpenAICompatibleLLM';
import { Logger } from '../../../utils/logger';

/**
 * Configuration for the Groq LLM provider.
 *
 * @remarks
 * Extends {@link OpenAICompatibleLLMConfig} with the convenience alias
 * {@link GroqLLMConfig.groqApiKey | groqApiKey}. Provide either
 * `groqApiKey`/`apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set.
 *
 * **Peer dependency:** None (uses native `fetch` with the OpenAI chat completions format).
 *
 * @example
 * ```ts
 * // Direct API access
 * const config: GroqLLMConfig = {
 *   groqApiKey: 'gsk_...',
 *   model: 'llama-3.3-70b-versatile',
 *   stream: true,
 * };
 *
 * // Via server-side proxy
 * const proxyConfig: GroqLLMConfig = {
 *   proxyUrl: 'http://localhost:3000/api/proxy/groq',
 *   model: 'mixtral-8x7b-32768',
 * };
 * ```
 *
 * @see {@link OpenAICompatibleLLMConfig} for inherited properties (apiKey, proxyUrl, endpoint, etc.).
 */
export interface GroqLLMConfig extends OpenAICompatibleLLMConfig {
  /**
   * Groq API key. Convenience alias for `apiKey`.
   *
   * @remarks
   * If both `groqApiKey` and `apiKey` are set, `groqApiKey` takes precedence.
   * Obtain a key from {@link https://console.groq.com | the Groq console}.
   *
   * @defaultValue `undefined`
   */
  groqApiKey?: string;
}

/** @internal Default configuration values for the Groq provider. */
const GROQ_DEFAULTS = {
  baseURL: 'https://api.groq.com/openai/v1',
  model: 'llama-3.3-70b-versatile',
} as const;

/**
 * Groq LLM provider for ultra-fast inference.
 *
 * @remarks
 * A thin subclass of {@link OpenAICompatibleLLM} that configures defaults for
 * Groq's API. All generation logic (streaming, non-streaming, abort handling,
 * proxy support) is inherited from the base class.
 *
 * Groq supports a wide range of open-source models including LLaMA, Mixtral,
 * and Gemma, all served through their custom LPU hardware for extremely fast
 * token generation.
 *
 * @example
 * ```ts
 * import { GroqLLM } from 'composite-voice';
 *
 * const llm = new GroqLLM({
 *   groqApiKey: process.env.GROQ_API_KEY,
 *   model: 'llama-3.3-70b-versatile',
 *   systemPrompt: 'You are a fast and helpful voice assistant.',
 * });
 * await llm.initialize();
 *
 * const stream = await llm.generate('Explain photosynthesis in one sentence.');
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk);
 * }
 *
 * await llm.dispose();
 * ```
 *
 * @see {@link GroqLLMConfig} for configuration options.
 * @see {@link OpenAICompatibleLLM} for the base class.
 * @see {@link OpenAILLM} for the OpenAI alternative.
 */
export class GroqLLM extends OpenAICompatibleLLM {
  declare public config: GroqLLMConfig;
  protected override readonly providerName = 'GroqLLM';

  /**
   * Creates a new Groq LLM provider instance.
   *
   * @remarks
   * The constructor resolves the API key (preferring `groqApiKey` over `apiKey`)
   * and applies Groq-specific defaults for `baseURL` and `model`.
   *
   * @param config - Groq provider configuration. Must include at least
   *   `groqApiKey`/`apiKey` or `proxyUrl`.
   * @param logger - Optional custom logger instance.
   */
  constructor(config: GroqLLMConfig, logger?: Logger) {
    const resolvedKey = config.groqApiKey ?? config.apiKey;
    const finalConfig: GroqLLMConfig = {
      ...config,
      ...(resolvedKey !== undefined ? { apiKey: resolvedKey } : {}),
      endpoint: config.endpoint ?? GROQ_DEFAULTS.baseURL,
      model: config.model ?? GROQ_DEFAULTS.model,
    };
    super(finalConfig, logger);
  }
}
