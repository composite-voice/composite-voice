/**
 * Groq LLM provider using the OpenAI-compatible chat completions API.
 *
 * Thin subclass of OpenAICompatibleLLM that defaults to Groq's endpoint
 * and model. Uses the `openai` SDK as a peer dependency (Groq's API is
 * fully OpenAI-compatible, so `groq-sdk` is not required).
 */

import { OpenAICompatibleLLM } from '../openai-compatible/OpenAICompatibleLLM';
import type { OpenAICompatibleLLMConfig } from '../openai-compatible/OpenAICompatibleLLM';
import { Logger } from '../../../utils/logger';

/**
 * Groq LLM provider configuration.
 * Provide either `groqApiKey`/`apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set; if both are provided `proxyUrl` takes precedence.
 *
 * Peer dependency: `openai` (Groq speaks the OpenAI chat completions format).
 */
export interface GroqLLMConfig extends OpenAICompatibleLLMConfig {
  /**
   * Groq API key. Convenience alias for `apiKey`.
   * If both `groqApiKey` and `apiKey` are set, `groqApiKey` takes precedence.
   */
  groqApiKey?: string;
}

const GROQ_DEFAULTS = {
  baseURL: 'https://api.groq.com/openai/v1',
  model: 'llama-3.3-70b-versatile',
} as const;

/**
 * Groq LLM provider.
 * Uses Groq's ultra-fast inference via the OpenAI-compatible API.
 */
export class GroqLLM extends OpenAICompatibleLLM {
  declare public config: GroqLLMConfig;
  protected override readonly providerName = 'GroqLLM';

  constructor(config: GroqLLMConfig, logger?: Logger) {
    const resolvedKey = config.groqApiKey ?? config.apiKey;
    const finalConfig: GroqLLMConfig = {
      ...config,
      ...(resolvedKey !== undefined ? { apiKey: resolvedKey } : {}),
      baseURL: config.baseURL ?? GROQ_DEFAULTS.baseURL,
      model: config.model ?? GROQ_DEFAULTS.model,
    };
    super(finalConfig, logger);
  }
}
