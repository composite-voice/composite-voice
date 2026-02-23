/**
 * Anthropic LLM provider using the official Anthropic SDK
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
type AnthropicSDK = typeof import('@anthropic-ai/sdk').default;
type AnthropicInstance = InstanceType<AnthropicSDK>;
type MessageParam = import('@anthropic-ai/sdk/resources/messages').MessageParam;
type MessageStreamEvent = import('@anthropic-ai/sdk/resources/messages').MessageStreamEvent;

/**
 * Anthropic LLM provider configuration
 */
export interface AnthropicLLMConfig extends LLMProviderConfig {
  /** Anthropic API key */
  apiKey: string;
  /**
   * Model to use.
   * Fastest (default): 'claude-haiku-4-6'
   * Balanced: 'claude-sonnet-4-6'
   * Most capable: 'claude-opus-4-6'
   */
  model: string;
  /** Maximum tokens to generate (required by Anthropic API, defaults to 1024) */
  maxTokens?: number;
  /** Base URL for API (optional, for custom endpoints) */
  baseURL?: string;
  /** Maximum retries for failed requests */
  maxRetries?: number;
}

/**
 * Anthropic LLM provider
 * Uses the official Anthropic SDK for messages API with streaming
 */
export class AnthropicLLM extends BaseLLMProvider {
  declare public config: AnthropicLLMConfig;
  private client: AnthropicInstance | null = null;

  constructor(config: AnthropicLLMConfig, logger?: Logger) {
    const normalizedConfig: AnthropicLLMConfig = {
      maxTokens: 1024,
      stream: true,
      ...config,
      model: config.model ?? 'claude-haiku-4-6',
    };
    super(normalizedConfig, logger);
  }

  protected async onInitialize(): Promise<void> {
    try {
      // Dynamically import Anthropic SDK (peer dependency)
      const AnthropicModule = await import('@anthropic-ai/sdk');
      const Anthropic = AnthropicModule.default;

      // Initialize Anthropic client
      this.client = new Anthropic({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseURL,
        maxRetries: this.config.maxRetries ?? 3,
        timeout: this.config.timeout ?? 60000,
        dangerouslyAllowBrowser: true,
      });

      this.logger.info('Anthropic LLM initialized', {
        model: this.config.model,
        stream: this.config.stream ?? true,
      });
    } catch (error) {
      if ((error as Error).message?.includes('Cannot find module')) {
        throw new ProviderInitializationError(
          'AnthropicLLM',
          new Error(
            'Anthropic SDK not found. Install with: npm install @anthropic-ai/sdk\n' +
              'The Anthropic SDK is a peer dependency and must be installed separately.'
          )
        );
      }
      throw new ProviderInitializationError('AnthropicLLM', error as Error);
    }
  }

  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Anthropic LLM disposed');
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
      throw new Error('Anthropic client not initialized');
    }

    const mergedOptions = this.mergeOptions(options);
    const shouldStream = this.config.stream ?? true;

    // Extract system message (Anthropic uses a top-level system param)
    const systemMessages = messages.filter((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const system =
      systemMessages.length > 0
        ? systemMessages.map((m) => m.content).join('\n')
        : this.config.systemPrompt;

    // Convert to Anthropic message format
    const anthropicMessages: MessageParam[] = userMessages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

    if (shouldStream) {
      return this.streamResponse(anthropicMessages, system, mergedOptions);
    } else {
      return this.nonStreamResponse(anthropicMessages, system, mergedOptions);
    }
  }

  /**
   * Stream response from Anthropic
   */
  private async streamResponse(
    messages: MessageParam[],
    system: string | undefined,
    options: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    const client = this.client;
    const config = this.config;
    const logger = this.logger;
    const signal = options.signal;

    return {
      async *[Symbol.asyncIterator]() {
        if (signal?.aborted) {
          const err = new Error('AbortError');
          err.name = 'AbortError';
          throw err;
        }

        try {
          logger.debug('Starting Anthropic streaming request', {
            model: config.model,
            messageCount: messages.length,
          });

          const streamParams = {
            model: config.model,
            max_tokens: options.maxTokens ?? config.maxTokens ?? 1024,
            messages,
            ...(system ? { system } : {}),
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(config.topP !== undefined ? { top_p: config.topP } : {}),
            ...(options.stopSequences ? { stop_sequences: options.stopSequences } : {}),
            ...(options.extra ?? {}),
          };
          // Pass AbortSignal to the Anthropic SDK so it can cancel the HTTP request
          const stream = signal
            ? client.messages.stream(streamParams, { signal })
            : client.messages.stream(streamParams);

          for await (const event of stream as AsyncIterable<MessageStreamEvent>) {
            if (signal?.aborted) break;
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              yield event.delta.text;
            }
          }

          logger.debug('Anthropic streaming request completed');
        } catch (error) {
          if (signal?.aborted || (error as Error).name === 'AbortError') {
            const err = new Error('AbortError');
            err.name = 'AbortError';
            throw err;
          }
          logger.error('Anthropic streaming request failed', error);
          throw error;
        }
      },
    };
  }

  /**
   * Non-streaming response from Anthropic
   */
  private async nonStreamResponse(
    messages: MessageParam[],
    system: string | undefined,
    options: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    if (!this.client) {
      throw new Error('Anthropic client not initialized');
    }

    const client = this.client;
    const config = this.config;
    const logger = this.logger;
    const signal = options.signal;

    return {
      async *[Symbol.asyncIterator]() {
        if (signal?.aborted) {
          const err = new Error('AbortError');
          err.name = 'AbortError';
          throw err;
        }

        try {
          logger.debug('Starting Anthropic non-streaming request', {
            model: config.model,
            messageCount: messages.length,
          });

          const createParams = {
            model: config.model,
            max_tokens: options.maxTokens ?? config.maxTokens ?? 1024,
            messages,
            ...(system ? { system } : {}),
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(config.topP !== undefined ? { top_p: config.topP } : {}),
            ...(options.stopSequences ? { stop_sequences: options.stopSequences } : {}),
            stream: false as const,
            ...(options.extra ?? {}),
          };
          const response = signal
            ? await client.messages.create(createParams, { signal })
            : await client.messages.create(createParams);

          const content = response.content[0];
          if (content?.type === 'text') {
            yield content.text;
          }

          logger.debug('Anthropic non-streaming request completed', {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          });
        } catch (error) {
          if (signal?.aborted || (error as Error).name === 'AbortError') {
            const err = new Error('AbortError');
            err.name = 'AbortError';
            throw err;
          }
          logger.error('Anthropic non-streaming request failed', error);
          throw error;
        }
      },
    };
  }
}
