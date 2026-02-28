/**
 * Anthropic LLM provider using the official `@anthropic-ai/sdk` package.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link AnthropicLLM} class for generating text with
 * Anthropic's Claude family of models. Unlike the OpenAI-compatible providers,
 * Anthropic uses its own Messages API format with a dedicated system parameter,
 * `content_block_delta` streaming events, and `stop_sequences` (rather than
 * `stop`).
 *
 * The `@anthropic-ai/sdk` npm package is a **peer dependency** and is
 * dynamically imported during initialization. It does not need to be bundled
 * unless this provider is used.
 *
 * @see {@link BaseLLMProvider} for the abstract base class all LLM providers extend.
 * @see {@link OpenAICompatibleLLM} for the OpenAI-compatible base class used by other providers.
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
 * Configuration for the Anthropic LLM provider.
 *
 * @remarks
 * Provide either {@link AnthropicLLMConfig.apiKey | apiKey} (direct API access)
 * or {@link AnthropicLLMConfig.proxyUrl | proxyUrl} (server-side proxy). At
 * least one must be set; if both are provided, `proxyUrl` takes precedence.
 *
 * Anthropic's API differs from OpenAI's in that `max_tokens` is **required**
 * for every request. This config defaults it to `1024` if not explicitly set.
 *
 * @example
 * ```ts
 * // Direct API access
 * const config: AnthropicLLMConfig = {
 *   apiKey: 'sk-ant-...',
 *   model: 'claude-haiku-4-5',
 *   maxTokens: 2048,
 *   systemPrompt: 'You are a helpful voice assistant.',
 * };
 *
 * // Via server-side proxy (recommended for browser apps)
 * const proxyConfig: AnthropicLLMConfig = {
 *   proxyUrl: 'http://localhost:3000/api/proxy/anthropic',
 *   model: 'claude-sonnet-4-6',
 * };
 * ```
 *
 * @see {@link LLMProviderConfig} for inherited base properties (temperature, topP, systemPrompt, etc.).
 */
export interface AnthropicLLMConfig extends LLMProviderConfig {
  /**
   * Anthropic API key.
   * Required when connecting directly to Anthropic.
   * Omit when using `proxyUrl` -- the proxy server supplies the key.
   *
   * @defaultValue `undefined`
   */
  apiKey?: string;
  /**
   * URL of the CompositeVoice proxy server's Anthropic endpoint.
   *
   * @remarks
   * When set, the Anthropic SDK sends requests to this URL instead of
   * `https://api.anthropic.com`, allowing browsers to reach Anthropic through a
   * same-origin proxy that injects the real API key server-side. A dummy API
   * key (`'proxy'`) is used with the SDK.
   *
   * @defaultValue `undefined`
   *
   * @example
   * ```ts
   * proxyUrl: 'http://localhost:3000/api/proxy/anthropic'
   * ```
   */
  proxyUrl?: string;
  /**
   * Anthropic model identifier.
   *
   * @remarks
   * - Fastest: `'claude-haiku-4-5'` (default)
   * - Balanced: `'claude-sonnet-4-6'`
   * - Most capable: `'claude-opus-4-6'`
   *
   * @defaultValue `'claude-haiku-4-5'`
   */
  model: string;
  /**
   * Maximum tokens to generate per response.
   *
   * @remarks
   * Anthropic's Messages API requires this field on every request. The provider
   * defaults to `1024` if not set in config or per-call options.
   *
   * @defaultValue `1024`
   */
  maxTokens?: number;
  /**
   * Base URL for the Anthropic API.
   *
   * @remarks
   * For custom endpoints only. Use `proxyUrl` for the CompositeVoice proxy
   * pattern. When neither is set, the SDK defaults to `https://api.anthropic.com`.
   *
   * @defaultValue `undefined` (SDK default: `'https://api.anthropic.com'`)
   */
  baseURL?: string;
  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Anthropic LLM provider for Claude models.
 *
 * @remarks
 * Uses the official `@anthropic-ai/sdk` for the Messages API with full support
 * for streaming (`messages.stream`) and non-streaming (`messages.create`)
 * responses. The provider handles the Anthropic-specific message format
 * automatically:
 *
 * - **System messages** are extracted from the message array and passed as the
 *   top-level `system` parameter (Anthropic does not accept `role: 'system'`
 *   in the messages array).
 * - **Streaming** yields text from `content_block_delta` events with
 *   `type: 'text_delta'`.
 * - **Abort** support is provided via the `options.signal` parameter, which is
 *   forwarded to the Anthropic SDK to cancel in-flight HTTP requests.
 *
 * @example Basic usage with direct API access
 * ```ts
 * import { AnthropicLLM } from 'composite-voice';
 *
 * const llm = new AnthropicLLM({
 *   apiKey: process.env.ANTHROPIC_API_KEY,
 *   model: 'claude-haiku-4-5',
 *   maxTokens: 512,
 *   systemPrompt: 'You are a concise voice assistant.',
 * });
 * await llm.initialize();
 *
 * const stream = await llm.generate('What is the speed of light?');
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk);
 * }
 *
 * await llm.dispose();
 * ```
 *
 * @example Usage with a server-side proxy (browser-safe)
 * ```ts
 * import { AnthropicLLM } from 'composite-voice';
 *
 * const llm = new AnthropicLLM({
 *   proxyUrl: 'http://localhost:3000/api/proxy/anthropic',
 *   model: 'claude-sonnet-4-6',
 * });
 * await llm.initialize();
 *
 * const stream = await llm.generate('Tell me a joke.');
 * for await (const chunk of stream) {
 *   document.getElementById('output')!.textContent += chunk;
 * }
 * ```
 *
 * @see {@link AnthropicLLMConfig} for configuration options.
 * @see {@link BaseLLMProvider} for the abstract base class.
 * @see {@link OpenAILLM} for the OpenAI alternative.
 */
export class AnthropicLLM extends BaseLLMProvider {
  declare public config: AnthropicLLMConfig;
  private client: AnthropicInstance | null = null;

  /**
   * Creates a new Anthropic LLM provider instance.
   *
   * @remarks
   * The constructor normalizes the configuration by applying defaults:
   * `maxTokens` defaults to `1024`, `stream` defaults to `true`, and
   * `model` defaults to `'claude-haiku-4-5'`.
   *
   * @param config - Anthropic provider configuration. Must include at least
   *   `model` and either `apiKey` or `proxyUrl`.
   * @param logger - Optional custom logger instance. If omitted, a default
   *   logger is created by the base class.
   */
  constructor(config: AnthropicLLMConfig, logger?: Logger) {
    const normalizedConfig: AnthropicLLMConfig = {
      maxTokens: 1024,
      stream: true,
      ...config,
      model: config.model ?? 'claude-haiku-4-5',
    };
    super(normalizedConfig, logger);
  }

  /**
   * Initialize the Anthropic client.
   *
   * @remarks
   * Dynamically imports the `@anthropic-ai/sdk` peer dependency, resolves the
   * base URL (preferring `proxyUrl` over `baseURL`), and creates the SDK client
   * instance. Called automatically by {@link BaseLLMProvider.initialize}.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown if neither `apiKey` nor `proxyUrl` is configured, or if the
   * `@anthropic-ai/sdk` package cannot be found (peer dependency not installed).
   */
  protected async onInitialize(): Promise<void> {
    if (!this.config.apiKey && !this.config.proxyUrl) {
      throw new ProviderInitializationError(
        'AnthropicLLM',
        new Error('AnthropicLLM requires either "apiKey" or "proxyUrl" to be configured.')
      );
    }

    try {
      // Dynamically import Anthropic SDK (peer dependency)
      const AnthropicModule = await import('@anthropic-ai/sdk');
      const Anthropic = AnthropicModule.default;

      // When using a proxy, point the SDK at the proxy URL with a dummy key.
      // The proxy server injects the real Anthropic API key.
      const baseURL = this.config.proxyUrl ?? this.config.baseURL;
      const apiKey = this.config.proxyUrl ? 'proxy' : (this.config.apiKey as string);

      // Initialize Anthropic client
      this.client = new Anthropic({
        apiKey,
        baseURL,
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

  /**
   * Dispose of the Anthropic client and release resources.
   *
   * @remarks
   * Nullifies the client reference so that it can be garbage-collected.
   * Called automatically by {@link BaseLLMProvider.dispose}.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Anthropic LLM disposed');
  }

  /**
   * Generate an LLM response from a single text prompt.
   *
   * @remarks
   * Convenience wrapper that converts the prompt to a message array (prepending
   * the system prompt if configured) and delegates to
   * {@link AnthropicLLM.generateFromMessages | generateFromMessages}.
   *
   * @param prompt - The user's text prompt.
   * @param options - Optional generation overrides (temperature, maxTokens, signal, etc.).
   * @returns An async iterable that yields text chunks. When streaming is enabled
   *   (the default), chunks arrive incrementally; otherwise, a single chunk
   *   containing the full response is yielded.
   *
   * @throws {@link Error}
   * Thrown if the provider has not been initialized or the client is unavailable.
   *
   * @throws `AbortError`
   * Thrown if the provided `options.signal` is aborted before or during generation.
   */
  async generate(prompt: string, options?: LLMGenerationOptions): Promise<AsyncIterable<string>> {
    const messages = this.promptToMessages(prompt);
    return this.generateFromMessages(messages, options);
  }

  /**
   * Generate an LLM response from a multi-turn conversation.
   *
   * @remarks
   * This is the primary generation method. It extracts system messages from the
   * array and passes them as Anthropic's top-level `system` parameter (since
   * Anthropic does not accept `role: 'system'` inline). Remaining messages are
   * converted to the Anthropic `MessageParam` format.
   *
   * Dispatches to either the streaming (`messages.stream`) or non-streaming
   * (`messages.create`) code path based on `config.stream`.
   *
   * @param messages - Array of conversation messages (system, user, assistant).
   *   System messages are extracted and concatenated into the top-level `system`
   *   parameter.
   * @param options - Optional generation overrides (temperature, maxTokens, signal, etc.).
   * @returns An async iterable that yields text chunks. When streaming is enabled
   *   (the default), chunks arrive incrementally from `content_block_delta`
   *   events; otherwise, a single chunk containing the full response is yielded.
   *
   * @throws {@link Error}
   * Thrown if the provider has not been initialized or the client is unavailable.
   *
   * @throws `AbortError`
   * Thrown if the provided `options.signal` is aborted before or during generation.
   *
   * @example
   * ```ts
   * const messages: LLMMessage[] = [
   *   { role: 'system', content: 'You are a helpful assistant.' },
   *   { role: 'user', content: 'Summarize the theory of relativity.' },
   * ];
   *
   * const stream = await anthropicLLM.generateFromMessages(messages);
   * for await (const chunk of stream) {
   *   process.stdout.write(chunk);
   * }
   * ```
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
   * Stream a response from the Anthropic Messages API.
   *
   * @remarks
   * Uses `client.messages.stream()` to open a server-sent events stream.
   * Yields text from `content_block_delta` events where `delta.type` is
   * `'text_delta'`. The abort signal is forwarded to the SDK so that in-flight
   * HTTP requests can be cancelled.
   *
   * @param messages - Messages in Anthropic `MessageParam` format (no system role).
   * @param system - Concatenated system prompt, or `undefined` if none.
   * @param options - Merged generation options including an optional abort signal.
   * @returns An async iterable of streamed text tokens.
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
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
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
   * Perform a non-streaming request to the Anthropic Messages API.
   *
   * @remarks
   * Makes a single API call with `stream: false` and yields the entire text
   * content of the first content block as one string. Usage statistics
   * (input/output tokens) are logged at debug level.
   *
   * @param messages - Messages in Anthropic `MessageParam` format (no system role).
   * @param system - Concatenated system prompt, or `undefined` if none.
   * @param options - Merged generation options including an optional abort signal.
   * @returns An async iterable that yields a single string containing the full response.
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
