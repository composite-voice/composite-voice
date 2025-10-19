/**
 * Base LLM provider class
 */

import type {
  LLMProvider,
  LLMProviderConfig,
  LLMGenerationOptions,
  LLMMessage,
} from '../../core/types/providers';
import { BaseProvider } from './BaseProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base LLM provider
 */
export abstract class BaseLLMProvider extends BaseProvider implements LLMProvider {
  public override config: LLMProviderConfig;

  constructor(config: LLMProviderConfig, logger?: Logger) {
    super('rest', config, logger);
    this.config = config;
  }

  /**
   * Generate a response from a prompt
   */
  abstract generate(prompt: string, options?: LLMGenerationOptions): Promise<AsyncIterable<string>>;

  /**
   * Generate a response from a conversation
   */
  abstract generateFromMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>>;

  /**
   * Convert a prompt to messages array
   */
  protected promptToMessages(prompt: string): LLMMessage[] {
    const messages: LLMMessage[] = [];

    if (this.config.systemPrompt) {
      messages.push({
        role: 'system',
        content: this.config.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: prompt,
    });

    return messages;
  }

  /**
   * Merge generation options with config defaults
   */
  protected mergeOptions(options?: LLMGenerationOptions): LLMGenerationOptions {
    const merged: LLMGenerationOptions = {};

    const temperature = options?.temperature ?? this.config.temperature;
    if (temperature !== undefined) merged.temperature = temperature;

    const maxTokens = options?.maxTokens ?? this.config.maxTokens;
    if (maxTokens !== undefined) merged.maxTokens = maxTokens;

    const stopSequences = options?.stopSequences ?? this.config.stopSequences;
    if (stopSequences !== undefined) merged.stopSequences = stopSequences;

    if (options?.extra !== undefined) merged.extra = options.extra;

    return merged;
  }

  /**
   * Get current configuration
   */
  override getConfig(): LLMProviderConfig {
    return { ...this.config };
  }
}
