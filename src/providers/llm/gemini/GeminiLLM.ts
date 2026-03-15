/**
 * Google Gemini LLM provider using the OpenAI-compatible chat completions API.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link GeminiLLM} class, a thin subclass of
 * {@link OpenAICompatibleLLM} that defaults to Google's Gemini API endpoint
 * (`https://generativelanguage.googleapis.com/v1beta/openai`) and the
 * `gemini-2.0-flash` model.
 *
 * Google exposes an OpenAI-compatible chat completions endpoint for Gemini
 * models, so this provider uses the `openai` npm package as its peer
 * dependency rather than a Gemini-specific SDK. This approach keeps the
 * dependency footprint small and leverages all the shared logic in the
 * base class.
 *
 * @see {@link OpenAICompatibleLLM} for the base class that provides all generation logic.
 * @see {@link OpenAILLM} for the OpenAI provider.
 * @see {@link GroqLLM} for ultra-fast inference via Groq.
 * @see {@link MistralLLM} for the Mistral provider.
 */

import { OpenAICompatibleLLM } from '../openai-compatible/OpenAICompatibleLLM';
import type { OpenAICompatibleLLMConfig } from '../openai-compatible/OpenAICompatibleLLM';
import { Logger } from '../../../utils/logger';

/**
 * Configuration for the Gemini LLM provider.
 *
 * @remarks
 * Extends {@link OpenAICompatibleLLMConfig} with the convenience alias
 * {@link GeminiLLMConfig.geminiApiKey | geminiApiKey}. Provide either
 * `geminiApiKey`/`apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set.
 *
 * **Peer dependency:** `openai` (Gemini speaks the OpenAI chat completions format).
 *
 * @example
 * ```ts
 * // Direct API access
 * const config: GeminiLLMConfig = {
 *   geminiApiKey: 'AIza...',
 *   model: 'gemini-2.0-flash',
 *   stream: true,
 *   temperature: 0.7,
 * };
 *
 * // Via server-side proxy
 * const proxyConfig: GeminiLLMConfig = {
 *   proxyUrl: 'http://localhost:3000/api/proxy/gemini',
 *   model: 'gemini-1.5-pro',
 * };
 * ```
 *
 * @see {@link OpenAICompatibleLLMConfig} for inherited properties (apiKey, proxyUrl, endpoint, etc.).
 */
export interface GeminiLLMConfig extends OpenAICompatibleLLMConfig {
  /**
   * Google Gemini API key. Convenience alias for `apiKey`.
   *
   * @remarks
   * If both `geminiApiKey` and `apiKey` are set, `geminiApiKey` takes precedence.
   * Obtain a key from {@link https://aistudio.google.com/apikey | Google AI Studio}.
   *
   * @defaultValue `undefined`
   */
  geminiApiKey?: string;
}

/** @internal Default configuration values for the Gemini provider. */
const GEMINI_DEFAULTS = {
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
  model: 'gemini-2.0-flash',
} as const;

/**
 * Google Gemini LLM provider.
 *
 * @remarks
 * A thin subclass of {@link OpenAICompatibleLLM} that configures defaults for
 * Google's Gemini API. All generation logic (streaming, non-streaming, abort
 * handling, proxy support) is inherited from the base class.
 *
 * Gemini models offer strong multimodal capabilities and competitive performance.
 * The `gemini-2.0-flash` model (default) provides fast inference with good
 * quality for voice assistant use cases.
 *
 * @example
 * ```ts
 * import { GeminiLLM } from 'composite-voice';
 *
 * const llm = new GeminiLLM({
 *   geminiApiKey: process.env.GEMINI_API_KEY,
 *   model: 'gemini-2.0-flash',
 *   systemPrompt: 'You are a helpful voice assistant.',
 * });
 * await llm.initialize();
 *
 * const stream = await llm.generate('What is the tallest mountain?');
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk);
 * }
 *
 * await llm.dispose();
 * ```
 *
 * @see {@link GeminiLLMConfig} for configuration options.
 * @see {@link OpenAICompatibleLLM} for the base class.
 * @see {@link OpenAILLM} for the OpenAI alternative.
 */
export class GeminiLLM extends OpenAICompatibleLLM {
  declare public config: GeminiLLMConfig;
  protected override readonly providerName = 'GeminiLLM';

  /**
   * Creates a new Gemini LLM provider instance.
   *
   * @remarks
   * The constructor resolves the API key (preferring `geminiApiKey` over `apiKey`)
   * and applies Gemini-specific defaults for `baseURL` and `model`.
   *
   * @param config - Gemini provider configuration. Must include at least
   *   `geminiApiKey`/`apiKey` or `proxyUrl`.
   * @param logger - Optional custom logger instance.
   */
  constructor(config: GeminiLLMConfig, logger?: Logger) {
    const resolvedKey = config.geminiApiKey ?? config.apiKey;
    const finalConfig: GeminiLLMConfig = {
      ...config,
      ...(resolvedKey !== undefined ? { apiKey: resolvedKey } : {}),
      endpoint: config.endpoint ?? GEMINI_DEFAULTS.baseURL,
      model: config.model ?? GEMINI_DEFAULTS.model,
    };
    super(finalConfig, logger);
  }
}
