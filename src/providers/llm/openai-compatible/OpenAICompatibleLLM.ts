/**
 * Base class for any LLM provider that speaks the OpenAI chat completions format.
 *
 * Groq, Mistral, Gemini, DeepSeek, Perplexity, and others all expose
 * OpenAI-compatible `/v1/chat/completions` endpoints. This class handles
 * the shared logic — dynamic SDK import, streaming, non-streaming, abort,
 * and proxy mode — so concrete subclasses only need to supply a `baseURL`.
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
 * Configuration for any OpenAI-compatible LLM provider.
 * Provide either `apiKey` (direct API access) or `proxyUrl` (server-side proxy).
 * At least one must be set; if both are provided `proxyUrl` takes precedence.
 */
export interface OpenAICompatibleLLMConfig extends LLMProviderConfig {
  /**
   * API key for the provider.
   * Required when connecting directly. Omit when using `proxyUrl`.
   */
  apiKey?: string;
  /**
   * URL of the CompositeVoice proxy server endpoint for this provider.
   * Example: `'http://localhost:3000/api/proxy/openai'`
   */
  proxyUrl?: string;
  /** Model identifier (e.g., 'gpt-4', 'llama-3.3-70b-versatile') */
  model: string;
  /**
   * Base URL for the provider's API.
   * Defaults differ per subclass (e.g., OpenAI uses `https://api.openai.com/v1`).
   * Not used when `proxyUrl` is set.
   */
  baseURL?: string;
  /** Maximum retries for failed requests */
  maxRetries?: number;
}

/**
 * Base LLM provider for any service that speaks the OpenAI chat completions format.
 *
 * Subclasses typically only need to:
 * 1. Define their own config interface extending `OpenAICompatibleLLMConfig`
 * 2. Override `providerName` for log/error messages
 * 3. Optionally override `buildClientOptions()` for provider-specific SDK options
 */
export class OpenAICompatibleLLM extends BaseLLMProvider {
  declare public config: OpenAICompatibleLLMConfig;
  private client: OpenAIInstance | null = null;

  /** Display name used in log messages and errors. Override in subclasses. */
  protected readonly providerName: string = 'OpenAICompatibleLLM';

  constructor(config: OpenAICompatibleLLMConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Build the options object passed to `new OpenAI(...)`.
   * Override in subclasses to add provider-specific options
   * (e.g., `organization` for OpenAI).
   */
  protected buildClientOptions(): Record<string, unknown> {
    return {};
  }

  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        this.providerName,
        new Error(
          `${this.providerName} requires either "apiKey" or "proxyUrl" to be configured.`
        )
      );
    }

    try {
      // Dynamically import OpenAI SDK (peer dependency)
      const OpenAIModule = await import('openai');
      const OpenAI = OpenAIModule.default;

      const baseURL = this.config.proxyUrl ?? this.config.baseURL;
      const apiKey = this.config.proxyUrl ? 'proxy' : (this.config.apiKey as string);

      // Initialize OpenAI-compatible client
      this.client = new OpenAI({
        apiKey,
        baseURL,
        maxRetries: this.config.maxRetries ?? 3,
        timeout: this.config.timeout ?? 60000,
        dangerouslyAllowBrowser: true,
        ...this.buildClientOptions(),
      });

      this.logger.info(`${this.providerName} initialized`, {
        model: this.config.model,
        stream: this.config.stream ?? true,
      });
    } catch (error) {
      if ((error as Error).message?.includes('Cannot find module')) {
        throw new ProviderInitializationError(
          this.providerName,
          new Error(
            'OpenAI SDK not found. Install with: npm install openai\n' +
              'The OpenAI SDK is a peer dependency and must be installed separately.'
          )
        );
      }
      throw new ProviderInitializationError(this.providerName, error as Error);
    }
  }

  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info(`${this.providerName} disposed`);
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
      throw new Error(`${this.providerName} client not initialized`);
    }

    const mergedOptions = this.mergeOptions(options);
    // mergeOptions doesn't carry signal — preserve it explicitly
    if (options?.signal) {
      mergedOptions.signal = options.signal;
    }
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
   * Stream response using OpenAI-compatible API
   */
  private async streamResponse(
    messages: ChatCompletionMessageParam[],
    options: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    if (!this.client) {
      throw new Error(`${this.providerName} client not initialized`);
    }

    const client = this.client;
    const config = this.config;
    const logger = this.logger;
    const signal = options.signal;
    const providerName = this.providerName;

    return {
      async *[Symbol.asyncIterator]() {
        if (signal?.aborted) {
          const err = new Error('AbortError');
          err.name = 'AbortError';
          throw err;
        }

        try {
          logger.debug(`Starting ${providerName} streaming request`, {
            model: config.model,
            messageCount: messages.length,
          });

          const streamParams = {
            model: config.model,
            messages,
            temperature: options.temperature ?? null,
            max_tokens: options.maxTokens ?? null,
            top_p: config.topP ?? null,
            stop: options.stopSequences ?? null,
            stream: true as const,
            ...options.extra,
          };
          const stream = signal
            ? await client.chat.completions.create(streamParams, { signal })
            : await client.chat.completions.create(streamParams);

          for await (const chunk of stream) {
            if (signal?.aborted) break;
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          }

          logger.debug(`${providerName} streaming request completed`);
        } catch (error) {
          if (signal?.aborted || (error as Error).name === 'AbortError') {
            const err = new Error('AbortError');
            err.name = 'AbortError';
            throw err;
          }
          logger.error(`${providerName} streaming request failed`, error);
          throw error;
        }
      },
    };
  }

  /**
   * Non-streaming response using OpenAI-compatible API
   */
  private async nonStreamResponse(
    messages: ChatCompletionMessageParam[],
    options: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    if (!this.client) {
      throw new Error(`${this.providerName} client not initialized`);
    }

    const client = this.client;
    const config = this.config;
    const logger = this.logger;
    const signal = options.signal;
    const providerName = this.providerName;

    return {
      async *[Symbol.asyncIterator]() {
        if (signal?.aborted) {
          const err = new Error('AbortError');
          err.name = 'AbortError';
          throw err;
        }

        try {
          logger.debug(`Starting ${providerName} non-streaming request`, {
            model: config.model,
            messageCount: messages.length,
          });

          const createParams = {
            model: config.model,
            messages,
            temperature: options.temperature ?? null,
            max_tokens: options.maxTokens ?? null,
            top_p: config.topP ?? null,
            stop: options.stopSequences ?? null,
            stream: false as const,
            ...options.extra,
          };
          const response = signal
            ? await client.chat.completions.create(createParams, { signal })
            : await client.chat.completions.create(createParams);

          const content = response.choices[0]?.message?.content ?? '';
          yield content;

          logger.debug(`${providerName} non-streaming request completed`, {
            tokensUsed: response.usage?.total_tokens,
          });
        } catch (error) {
          if (signal?.aborted || (error as Error).name === 'AbortError') {
            const err = new Error('AbortError');
            err.name = 'AbortError';
            throw err;
          }
          logger.error(`${providerName} non-streaming request failed`, error);
          throw error;
        }
      },
    };
  }
}
