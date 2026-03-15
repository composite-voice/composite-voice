/**
 * OpenAI LLM provider for GPT models using the official OpenAI SDK.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link OpenAILLM} class, a thin subclass of
 * {@link OpenAICompatibleLLM} that adds OpenAI-specific options
 * (`organizationId`) and defaults `baseURL` to OpenAI's endpoint
 * (`https://api.openai.com/v1`).
 *
 * Because OpenAI's chat completions API is the canonical format that other
 * providers emulate, this class requires very little customization beyond
 * the base class. The `openai` npm package is a **peer dependency**.
 *
 * @see {@link OpenAICompatibleLLM} for the base class that provides all generation logic.
 * @see {@link AnthropicLLM} for the Anthropic alternative.
 * @see {@link GroqLLM} for ultra-fast inference via Groq.
 */

import { OpenAICompatibleLLM } from '../openai-compatible/OpenAICompatibleLLM';
import type { OpenAICompatibleLLMConfig } from '../openai-compatible/OpenAICompatibleLLM';
import { Logger } from '../../../utils/logger';

/**
 * Configuration for the OpenAI LLM provider.
 *
 * @remarks
 * Extends {@link OpenAICompatibleLLMConfig} with the optional
 * {@link OpenAILLMConfig.organizationId | organizationId} field for
 * multi-organization OpenAI accounts.
 *
 * @example
 * ```ts
 * // Direct API access
 * const config: OpenAILLMConfig = {
 *   apiKey: 'sk-...',
 *   model: 'gpt-4',
 *   organizationId: 'org-...',
 *   stream: true,
 *   systemPrompt: 'You are a helpful voice assistant.',
 * };
 *
 * // Via server-side proxy (recommended for browser apps)
 * const proxyConfig: OpenAILLMConfig = {
 *   proxyUrl: 'http://localhost:3000/api/proxy/openai',
 *   model: 'gpt-4o-mini',
 * };
 * ```
 *
 * @see {@link OpenAICompatibleLLMConfig} for inherited properties (apiKey, proxyUrl, endpoint, etc.).
 */
export interface OpenAILLMConfig extends OpenAICompatibleLLMConfig {
  /**
   * OpenAI organization ID for multi-organization accounts.
   *
   * @remarks
   * If your OpenAI API key belongs to multiple organizations, set this to
   * route requests to a specific organization. Passed as the `organization`
   * option to the OpenAI SDK constructor.
   *
   * @defaultValue `undefined`
   */
  organizationId?: string;
}

/**
 * OpenAI LLM provider for GPT models.
 *
 * @remarks
 * A thin subclass of {@link OpenAICompatibleLLM} that configures the OpenAI SDK
 * with OpenAI-specific options. All generation logic (streaming, non-streaming,
 * abort handling, proxy support) is inherited from the base class.
 *
 * The only customization is:
 * - **`providerName`** is set to `'OpenAILLM'` for log/error messages.
 * - **`buildClientOptions()`** injects the `organization` field when
 *   {@link OpenAILLMConfig.organizationId | organizationId} is configured.
 *
 * @example
 * ```ts
 * import { OpenAILLM } from 'composite-voice';
 *
 * const llm = new OpenAILLM({
 *   apiKey: process.env.OPENAI_API_KEY,
 *   model: 'gpt-4o-mini',
 *   systemPrompt: 'You are a concise voice assistant.',
 * });
 * await llm.initialize();
 *
 * const stream = await llm.generate('What causes thunder?');
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk);
 * }
 *
 * await llm.dispose();
 * ```
 *
 * @see {@link OpenAILLMConfig} for configuration options.
 * @see {@link OpenAICompatibleLLM} for the base class.
 * @see {@link AnthropicLLM} for the Anthropic alternative.
 */
export class OpenAILLM extends OpenAICompatibleLLM {
  declare public config: OpenAILLMConfig;
  protected override readonly providerName = 'OpenAILLM';

  /**
   * Creates a new OpenAI LLM provider instance.
   *
   * @param config - OpenAI provider configuration. Must include at least `model`
   *   and either `apiKey` or `proxyUrl`.
   * @param logger - Optional custom logger instance.
   */
  constructor(config: OpenAILLMConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Build OpenAI-specific SDK constructor options.
   *
   * @remarks
   * Injects the `organization` field into the OpenAI SDK constructor when
   * {@link OpenAILLMConfig.organizationId | organizationId} is configured.
   *
   * @returns An object containing the `organization` key if set, or an empty object.
   */
  protected override buildClientOptions(): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    if (this.config.organizationId) {
      options.organization = this.config.organizationId;
    }
    return options;
  }
}
