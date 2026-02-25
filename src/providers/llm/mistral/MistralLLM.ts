/**
 * Mistral LLM provider using the OpenAI-compatible chat completions API.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link MistralLLM} class, a thin subclass of
 * {@link OpenAICompatibleLLM} that defaults to Mistral's API endpoint
 * (`https://api.mistral.ai/v1`) and the `mistral-small-latest` model.
 *
 * Mistral's API is fully OpenAI-compatible, so this provider uses the `openai`
 * npm package as its peer dependency rather than `@mistralai/mistralai`. This
 * keeps the dependency footprint small and leverages all the shared logic in
 * the base class.
 *
 * Mistral offers a range of models from the compact Mistral Small to the
 * powerful Mistral Large, all known for strong multilingual capabilities
 * (especially French and European languages).
 *
 * @see {@link OpenAICompatibleLLM} for the base class that provides all generation logic.
 * @see {@link OpenAILLM} for the OpenAI provider.
 * @see {@link GroqLLM} for ultra-fast inference via Groq.
 * @see {@link GeminiLLM} for the Google Gemini provider.
 */

import { OpenAICompatibleLLM } from '../openai-compatible/OpenAICompatibleLLM';
import type { OpenAICompatibleLLMConfig } from '../openai-compatible/OpenAICompatibleLLM';
import { Logger } from '../../../utils/logger';

/**
 * Configuration for the Mistral LLM provider.
 *
 * @remarks
 * Extends {@link OpenAICompatibleLLMConfig} with the convenience alias
 * {@link MistralLLMConfig.mistralApiKey | mistralApiKey}. Provide either
 * `mistralApiKey`/`apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set.
 *
 * **Peer dependency:** `openai` (Mistral speaks the OpenAI chat completions format).
 *
 * @example
 * ```ts
 * // Direct API access
 * const config: MistralLLMConfig = {
 *   mistralApiKey: 'mis-...',
 *   model: 'mistral-small-latest',
 *   stream: true,
 *   temperature: 0.7,
 * };
 *
 * // Via server-side proxy
 * const proxyConfig: MistralLLMConfig = {
 *   proxyUrl: 'http://localhost:3000/api/proxy/mistral',
 *   model: 'mistral-large-latest',
 * };
 * ```
 *
 * @see {@link OpenAICompatibleLLMConfig} for inherited properties (apiKey, proxyUrl, baseURL, etc.).
 */
export interface MistralLLMConfig extends OpenAICompatibleLLMConfig {
  /**
   * Mistral API key. Convenience alias for `apiKey`.
   *
   * @remarks
   * If both `mistralApiKey` and `apiKey` are set, `mistralApiKey` takes precedence.
   * Obtain a key from {@link https://console.mistral.ai | the Mistral console}.
   *
   * @defaultValue `undefined`
   */
  mistralApiKey?: string;
}

/** @internal Default configuration values for the Mistral provider. */
const MISTRAL_DEFAULTS = {
  baseURL: 'https://api.mistral.ai/v1',
  model: 'mistral-small-latest',
} as const;

/**
 * Mistral LLM provider.
 *
 * @remarks
 * A thin subclass of {@link OpenAICompatibleLLM} that configures defaults for
 * Mistral's API. All generation logic (streaming, non-streaming, abort handling,
 * proxy support) is inherited from the base class.
 *
 * Mistral models are known for strong performance-per-parameter and excellent
 * multilingual support. The `mistral-small-latest` model (default) provides
 * a good balance of speed and quality for voice assistant use cases.
 *
 * @example
 * ```ts
 * import { MistralLLM } from 'composite-voice';
 *
 * const llm = new MistralLLM({
 *   mistralApiKey: process.env.MISTRAL_API_KEY,
 *   model: 'mistral-small-latest',
 *   systemPrompt: 'You are a helpful multilingual voice assistant.',
 * });
 * await llm.initialize();
 *
 * const stream = await llm.generate('Explain the water cycle.');
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk);
 * }
 *
 * await llm.dispose();
 * ```
 *
 * @see {@link MistralLLMConfig} for configuration options.
 * @see {@link OpenAICompatibleLLM} for the base class.
 * @see {@link OpenAILLM} for the OpenAI alternative.
 */
export class MistralLLM extends OpenAICompatibleLLM {
  declare public config: MistralLLMConfig;
  protected override readonly providerName = 'MistralLLM';

  /**
   * Creates a new Mistral LLM provider instance.
   *
   * @remarks
   * The constructor resolves the API key (preferring `mistralApiKey` over `apiKey`)
   * and applies Mistral-specific defaults for `baseURL` and `model`.
   *
   * @param config - Mistral provider configuration. Must include at least
   *   `mistralApiKey`/`apiKey` or `proxyUrl`.
   * @param logger - Optional custom logger instance.
   */
  constructor(config: MistralLLMConfig, logger?: Logger) {
    const resolvedKey = config.mistralApiKey ?? config.apiKey;
    const finalConfig: MistralLLMConfig = {
      ...config,
      ...(resolvedKey !== undefined ? { apiKey: resolvedKey } : {}),
      baseURL: config.baseURL ?? MISTRAL_DEFAULTS.baseURL,
      model: config.model ?? MISTRAL_DEFAULTS.model,
    };
    super(finalConfig, logger);
  }
}
