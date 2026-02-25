/**
 * OpenAI LLM provider using the official OpenAI SDK
 *
 * Thin subclass of OpenAICompatibleLLM that adds OpenAI-specific options
 * (organizationId) and defaults baseURL to OpenAI's endpoint.
 */

import { OpenAICompatibleLLM } from '../openai-compatible/OpenAICompatibleLLM';
import type { OpenAICompatibleLLMConfig } from '../openai-compatible/OpenAICompatibleLLM';
import { Logger } from '../../../utils/logger';

/**
 * OpenAI LLM provider configuration.
 * Provide either `apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set; if both are provided `proxyUrl` takes precedence.
 */
export interface OpenAILLMConfig extends OpenAICompatibleLLMConfig {
  /** Organization ID (optional) */
  organizationId?: string;
}

/**
 * OpenAI LLM provider
 * Uses the official OpenAI SDK for chat completions
 */
export class OpenAILLM extends OpenAICompatibleLLM {
  declare public config: OpenAILLMConfig;
  protected override readonly providerName = 'OpenAILLM';

  constructor(config: OpenAILLMConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Add OpenAI-specific options (organization) to the SDK client.
   */
  protected override buildClientOptions(): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    if (this.config.organizationId) {
      options.organization = this.config.organizationId;
    }
    return options;
  }
}
