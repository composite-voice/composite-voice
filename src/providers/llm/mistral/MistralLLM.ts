/**
 * Mistral LLM provider using the OpenAI-compatible chat completions API.
 *
 * Thin subclass of OpenAICompatibleLLM that defaults to Mistral's endpoint
 * and model. Uses the `openai` SDK as a peer dependency (Mistral's API is
 * fully OpenAI-compatible, so `@mistralai/mistralai` is not required).
 */

import { OpenAICompatibleLLM } from '../openai-compatible/OpenAICompatibleLLM';
import type { OpenAICompatibleLLMConfig } from '../openai-compatible/OpenAICompatibleLLM';
import { Logger } from '../../../utils/logger';

/**
 * Mistral LLM provider configuration.
 * Provide either `mistralApiKey`/`apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set; if both are provided `proxyUrl` takes precedence.
 *
 * Peer dependency: `openai` (Mistral speaks the OpenAI chat completions format).
 */
export interface MistralLLMConfig extends OpenAICompatibleLLMConfig {
  /**
   * Mistral API key. Convenience alias for `apiKey`.
   * If both `mistralApiKey` and `apiKey` are set, `mistralApiKey` takes precedence.
   */
  mistralApiKey?: string;
}

const MISTRAL_DEFAULTS = {
  baseURL: 'https://api.mistral.ai/v1',
  model: 'mistral-small-latest',
} as const;

/**
 * Mistral LLM provider.
 * Uses Mistral's models via the OpenAI-compatible API.
 */
export class MistralLLM extends OpenAICompatibleLLM {
  declare public config: MistralLLMConfig;
  protected override readonly providerName = 'MistralLLM';

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
