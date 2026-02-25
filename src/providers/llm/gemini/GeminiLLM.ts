/**
 * Gemini LLM provider using Google's OpenAI-compatible chat completions API.
 *
 * Thin subclass of OpenAICompatibleLLM that defaults to Gemini's endpoint
 * and model. Uses the `openai` SDK as a peer dependency (Gemini's API is
 * fully OpenAI-compatible via the generativelanguage.googleapis.com endpoint).
 */

import { OpenAICompatibleLLM } from '../openai-compatible/OpenAICompatibleLLM';
import type { OpenAICompatibleLLMConfig } from '../openai-compatible/OpenAICompatibleLLM';
import { Logger } from '../../../utils/logger';

/**
 * Gemini LLM provider configuration.
 * Provide either `geminiApiKey`/`apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set; if both are provided `proxyUrl` takes precedence.
 *
 * Peer dependency: `openai` (Gemini speaks the OpenAI chat completions format).
 */
export interface GeminiLLMConfig extends OpenAICompatibleLLMConfig {
  /**
   * Gemini API key. Convenience alias for `apiKey`.
   * If both `geminiApiKey` and `apiKey` are set, `geminiApiKey` takes precedence.
   */
  geminiApiKey?: string;
}

const GEMINI_DEFAULTS = {
  baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
  model: 'gemini-2.0-flash',
} as const;

/**
 * Gemini LLM provider.
 * Uses Google's Gemini models via the OpenAI-compatible API.
 */
export class GeminiLLM extends OpenAICompatibleLLM {
  declare public config: GeminiLLMConfig;
  protected override readonly providerName = 'GeminiLLM';

  constructor(config: GeminiLLMConfig, logger?: Logger) {
    const resolvedKey = config.geminiApiKey ?? config.apiKey;
    const finalConfig: GeminiLLMConfig = {
      ...config,
      ...(resolvedKey !== undefined ? { apiKey: resolvedKey } : {}),
      baseURL: config.baseURL ?? GEMINI_DEFAULTS.baseURL,
      model: config.model ?? GEMINI_DEFAULTS.model,
    };
    super(finalConfig, logger);
  }
}
