/**
 * OpenAI LLM provider using the official OpenAI SDK
 */

import { BaseLLMProvider } from '../../base/BaseLLMProvider';
import type {
  LLMProviderConfig,
  LLMGenerationOptions,
  LLMMessage,
} from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError } from '../../../utils/errors';

// Type-safe imports for optional peer dependency
type OpenAI = typeof import('openai').default;
type OpenAIInstance = InstanceType<OpenAI>;
type ChatCompletionMessageParam =
  import('openai/resources/chat/completions').ChatCompletionMessageParam;

/**
 * OpenAI LLM provider configuration
 */
export interface OpenAILLMConfig extends LLMProviderConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Model to use (e.g., 'gpt-4', 'gpt-3.5-turbo') */
  model: string;
  /** Organization ID (optional) */
  organizationId?: string;
  /** Base URL for API (optional, for custom endpoints) */
  baseURL?: string;
  /** Maximum retries for failed requests */
  maxRetries?: number;
}

/**
 * OpenAI LLM provider
 * Uses the official OpenAI SDK for chat completions
 */
export class OpenAILLM extends BaseLLMProvider {
  declare public config: OpenAILLMConfig;
  private client: OpenAIInstance | null = null;

  constructor(config: OpenAILLMConfig, logger?: Logger) {
    super(config, logger);
  }

  protected async onInitialize(): Promise<void> {
    try {
      // Dynamically import OpenAI SDK (peer dependency)
      const OpenAIModule = await import('openai');
      const OpenAI = OpenAIModule.default;

      // Initialize OpenAI client
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        organization: this.config.organizationId,
        baseURL: this.config.baseURL,
        maxRetries: this.config.maxRetries ?? 3,
        timeout: this.config.timeout ?? 60000,
        dangerouslyAllowBrowser: true, // Allow browser usage
      });

      this.logger.info('OpenAI LLM initialized', {
        model: this.config.model,
        stream: this.config.stream ?? true,
      });
    } catch (error) {
      if ((error as Error).message?.includes('Cannot find module')) {
        throw new ProviderInitializationError(
          'OpenAILLM',
          new Error(
            'OpenAI SDK not found. Install with: npm install openai\n' +
              'The OpenAI SDK is a peer dependency and must be installed separately.'
          )
        );
      }
      throw new ProviderInitializationError('OpenAILLM', error as Error);
    }
  }

  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('OpenAI LLM disposed');
  }

  /**
   * Generate a response from a prompt
   */
  async generate(prompt: string, options?: LLMGenerationOptions): Promise<AsyncIterable<string>> {
    const messages = this.promptToMessages(prompt);
    return this.generateFromMessages(messages, options);
  }

  /**
   * Generate a response from a conversation
   */
  async generateFromMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    this.assertReady();

    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const mergedOptions = this.mergeOptions(options);
    const shouldStream = this.config.stream ?? true;

    // Convert messages to OpenAI format
    const openaiMessages: ChatCompletionMessageParam[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    if (shouldStream) {
      return this.streamResponse(openaiMessages, mergedOptions);
    } else {
      return this.nonStreamResponse(openaiMessages, mergedOptions);
    }
  }

  /**
   * Stream response from OpenAI
   */
  private async streamResponse(
    messages: ChatCompletionMessageParam[],
    options: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const client = this.client;
    const config = this.config;
    const logger = this.logger;

    return {
      async *[Symbol.asyncIterator]() {
        try {
          logger.debug('Starting OpenAI streaming request', {
            model: config.model,
            messageCount: messages.length,
          });

          const stream = await client.chat.completions.create({
            model: config.model,
            messages,
            temperature: options.temperature ?? null,
            max_tokens: options.maxTokens ?? null,
            top_p: config.topP ?? null,
            stop: options.stopSequences ?? null,
            stream: true,
            ...options.extra,
          });

          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          }

          logger.debug('OpenAI streaming request completed');
        } catch (error) {
          logger.error('OpenAI streaming request failed', error);
          throw error;
        }
      },
    };
  }

  /**
   * Non-streaming response from OpenAI
   */
  private async nonStreamResponse(
    messages: ChatCompletionMessageParam[],
    options: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    if (!this.client) {
      throw new Error('OpenAI client not initialized');
    }

    const client = this.client;
    const config = this.config;
    const logger = this.logger;

    return {
      async *[Symbol.asyncIterator]() {
        try {
          logger.debug('Starting OpenAI non-streaming request', {
            model: config.model,
            messageCount: messages.length,
          });

          const response = await client.chat.completions.create({
            model: config.model,
            messages,
            temperature: options.temperature ?? null,
            max_tokens: options.maxTokens ?? null,
            top_p: config.topP ?? null,
            stop: options.stopSequences ?? null,
            stream: false,
            ...options.extra,
          });

          const content = response.choices[0]?.message?.content ?? '';
          yield content;

          logger.debug('OpenAI non-streaming request completed', {
            tokensUsed: response.usage?.total_tokens,
          });
        } catch (error) {
          logger.error('OpenAI non-streaming request failed', error);
          throw error;
        }
      },
    };
  }
}
