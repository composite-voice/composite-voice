/**
 * Base class for any LLM provider that speaks the OpenAI chat completions format.
 *
 * @packageDocumentation
 *
 * @remarks
 * Groq, Mistral, Gemini, DeepSeek, Perplexity, and others all expose
 * OpenAI-compatible `/v1/chat/completions` endpoints. This module provides the
 * {@link OpenAICompatibleLLM} base class that handles the shared logic --
 * dynamic SDK import, streaming, non-streaming, abort, and proxy mode -- so
 * concrete subclasses only need to supply a `baseURL` and `providerName`.
 *
 * This module follows the **Template Method** design pattern: the base class
 * defines the algorithm skeleton (`generate`, `generateFromMessages`,
 * `onInitialize`) and defers provider-specific behavior to overridable hooks
 * (`providerName`, `buildClientOptions`).
 *
 * @see {@link BaseLLMProvider} for the abstract base class all LLM providers extend.
 * @see {@link OpenAILLM} for the OpenAI-specific subclass.
 * @see {@link GroqLLM} for the Groq-specific subclass.
 * @see {@link GeminiLLM} for the Gemini-specific subclass.
 * @see {@link MistralLLM} for the Mistral-specific subclass.
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
 *
 * @remarks
 * Provide either {@link OpenAICompatibleLLMConfig.apiKey | apiKey} (direct API
 * access) or {@link OpenAICompatibleLLMConfig.proxyUrl | proxyUrl} (server-side
 * proxy). At least one must be set; if both are provided, `proxyUrl` takes
 * precedence and the SDK sends requests through the proxy, which injects the
 * real API key server-side.
 *
 * All subclass config interfaces (e.g., `OpenAILLMConfig`, `GroqLLMConfig`)
 * extend this interface and may add provider-specific fields.
 *
 * @example
 * ```ts
 * // Direct API access
 * const config: OpenAICompatibleLLMConfig = {
 *   apiKey: 'sk-...',
 *   model: 'gpt-4',
 *   baseURL: 'https://api.openai.com/v1',
 *   stream: true,
 * };
 *
 * // Via server-side proxy
 * const proxyConfig: OpenAICompatibleLLMConfig = {
 *   proxyUrl: 'http://localhost:3000/api/proxy/openai',
 *   model: 'gpt-4',
 * };
 * ```
 *
 * @see {@link LLMProviderConfig} for inherited base properties (temperature, maxTokens, systemPrompt, etc.).
 */
export interface OpenAICompatibleLLMConfig extends LLMProviderConfig {
  /**
   * Model identifier for the provider.
   *
   * @example `'gpt-4'`, `'llama-3.3-70b-versatile'`, `'gemini-2.0-flash'`
   */
  model: string;
  /**
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/**
 * Base LLM provider for any service that speaks the OpenAI chat completions format.
 *
 * @remarks
 * This class implements the **Template Method** pattern. The base class provides
 * the full generation pipeline -- SDK initialization, streaming, non-streaming,
 * abort handling, and proxy support -- while subclasses customize behavior by
 * overriding a small number of hooks:
 *
 * 1. **{@link OpenAICompatibleLLM.providerName | providerName}** -- Display name
 *    used in log messages and error reports.
 * 2. **{@link OpenAICompatibleLLM.buildClientOptions | buildClientOptions()}** --
 *    Return an object of provider-specific options merged into the `new OpenAI()`
 *    constructor call (e.g., `organization` for OpenAI).
 *
 * Subclasses typically also define their own config interface that extends
 * {@link OpenAICompatibleLLMConfig} to add provider-specific fields.
 *
 * The `openai` npm package is a **peer dependency** and is dynamically imported
 * during {@link OpenAICompatibleLLM.onInitialize | initialization}. It does not
 * need to be bundled unless one of the OpenAI-compatible providers is used.
 *
 * @example Creating a custom provider for a new OpenAI-compatible API
 * ```ts
 * import { OpenAICompatibleLLM } from 'composite-voice';
 * import type { OpenAICompatibleLLMConfig } from 'composite-voice';
 *
 * interface MyProviderConfig extends OpenAICompatibleLLMConfig {
 *   customField?: string;
 * }
 *
 * class MyProviderLLM extends OpenAICompatibleLLM {
 *   declare public config: MyProviderConfig;
 *   protected override readonly providerName = 'MyProviderLLM';
 *
 *   constructor(config: MyProviderConfig) {
 *     super({
 *       ...config,
 *       baseURL: config.baseURL ?? 'https://api.myprovider.com/v1',
 *       model: config.model ?? 'my-default-model',
 *     });
 *   }
 *
 *   protected override buildClientOptions(): Record<string, unknown> {
 *     return { customHeader: this.config.customField };
 *   }
 * }
 * ```
 *
 * @see {@link BaseLLMProvider} for the abstract base class.
 * @see {@link OpenAICompatibleLLMConfig} for configuration options.
 * @see {@link OpenAILLM} for the first-party OpenAI subclass.
 */
export class OpenAICompatibleLLM extends BaseLLMProvider {
  declare public config: OpenAICompatibleLLMConfig;
  private client: OpenAIInstance | null = null;

  /**
   * Display name used in log messages and errors.
   *
   * @remarks
   * Override this property in subclasses to provide a meaningful name
   * (e.g., `'GroqLLM'`, `'GeminiLLM'`). The name appears in all log output
   * and in {@link ProviderInitializationError} messages.
   *
   * @defaultValue `'OpenAICompatibleLLM'`
   */
  protected readonly providerName: string = 'OpenAICompatibleLLM';

  /**
   * Creates a new OpenAI-compatible LLM provider instance.
   *
   * @param config - Provider configuration. Must include at least `model` and
   *   either `apiKey` or `proxyUrl`.
   * @param logger - Optional custom logger instance. If omitted, a default
   *   logger is created by the base class.
   */
  constructor(config: OpenAICompatibleLLMConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Build the options object passed to `new OpenAI(...)`.
   *
   * @remarks
   * Override in subclasses to inject provider-specific SDK constructor options.
   * The returned object is spread into the OpenAI client constructor after
   * the base options (`apiKey`, `baseURL`, `maxRetries`, `timeout`,
   * `dangerouslyAllowBrowser`).
   *
   * @returns An object of additional options to pass to the OpenAI SDK constructor.
   *
   * @example
   * ```ts
   * // In a subclass (e.g., OpenAILLM):
   * protected override buildClientOptions(): Record<string, unknown> {
   *   return { organization: this.config.organizationId };
   * }
   * ```
   */
  protected buildClientOptions(): Record<string, unknown> {
    return {};
  }

  /**
   * Initialize the OpenAI-compatible client.
   *
   * @remarks
   * Dynamically imports the `openai` peer dependency, resolves the base URL
   * (preferring `proxyUrl` over `baseURL`), and creates the SDK client instance.
   * Called automatically by {@link BaseLLMProvider.initialize}.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown if neither `apiKey` nor `proxyUrl` is configured, or if the `openai`
   * package cannot be found (peer dependency not installed).
   */
  protected async onInitialize(): Promise<void> {
    this.assertAuth();

    try {
      // Dynamically import OpenAI SDK (peer dependency)
      const OpenAIModule = await import('openai');
      const OpenAI = OpenAIModule.default;

      // Initialize OpenAI-compatible client
      this.client = new OpenAI({
        apiKey: this.resolveApiKey(),
        baseURL: this.resolveBaseUrl(),
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

  /**
   * Dispose of the OpenAI client and release resources.
   *
   * @remarks
   * Nullifies the client reference so that it can be garbage-collected.
   * Called automatically by {@link BaseLLMProvider.dispose}.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info(`${this.providerName} disposed`);
  }

  /**
   * Generate an LLM response from a single text prompt.
   *
   * @remarks
   * Convenience wrapper that converts the prompt to a message array (prepending
   * the system prompt if configured) and delegates to
   * {@link OpenAICompatibleLLM.generateFromMessages | generateFromMessages}.
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
   *
   * @example
   * ```ts
   * const provider = new OpenAICompatibleLLM({ apiKey: 'sk-...', model: 'gpt-4' });
   * await provider.initialize();
   *
   * const stream = await provider.generate('Explain quantum computing briefly.');
   * for await (const chunk of stream) {
   *   process.stdout.write(chunk);
   * }
   * ```
   */
  async generate(prompt: string, options?: LLMGenerationOptions): Promise<AsyncIterable<string>> {
    const messages = this.promptToMessages(prompt);
    return this.generateFromMessages(messages, options);
  }

  /**
   * Implement the abstract {@link BaseLLMProvider.processMessages} method.
   *
   * @remarks
   * Delegates to {@link generateFromMessages}.
   */
  async processMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    return this.generateFromMessages(messages, options);
  }

  /**
   * Generate an LLM response from a multi-turn conversation.
   *
   * @remarks
   * This is the primary generation method. It merges per-call options with
   * the provider config defaults, converts the messages to OpenAI's
   * `ChatCompletionMessageParam` format, and dispatches to either the
   * streaming or non-streaming code path based on `config.stream`.
   *
   * The returned async iterable respects the `options.signal` abort signal.
   * When aborted, iteration stops and an `AbortError` is thrown. This is used
   * by the CompositeVoice eager/preflight pipeline to cancel speculative
   * generations.
   *
   * @param messages - Array of conversation messages (system, user, assistant).
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
   *
   * @example
   * ```ts
   * const provider = new OpenAICompatibleLLM({ apiKey: 'sk-...', model: 'gpt-4' });
   * await provider.initialize();
   *
   * const messages: LLMMessage[] = [
   *   { role: 'system', content: 'You are a helpful assistant.' },
   *   { role: 'user', content: 'What is the capital of France?' },
   * ];
   *
   * const stream = await provider.generateFromMessages(messages);
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
      throw new Error(`${this.providerName} client not initialized`);
    }

    const mergedOptions = this.mergeOptions(options);
    // mergeOptions doesn't carry signal — preserve it explicitly
    if (options?.signal) {
      mergedOptions.signal = options.signal;
    }
    const shouldStream = this.config.stream ?? true;

    // Convert messages to OpenAI format (filter out tool messages — not yet supported)
    const openaiMessages: ChatCompletionMessageParam[] = messages
      .filter((msg) => msg.role !== 'tool')
      .map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      }));

    if (shouldStream) {
      return this.streamResponse(openaiMessages, mergedOptions);
    } else {
      return this.nonStreamResponse(openaiMessages, mergedOptions);
    }
  }

  /**
   * Stream a response using the OpenAI-compatible chat completions API.
   *
   * @remarks
   * Creates an async iterable that opens a streaming request to the provider.
   * Each chunk's `delta.content` is yielded as a string token. The iteration
   * respects the `options.signal` abort signal: if aborted, the loop breaks
   * and an `AbortError` is thrown.
   *
   * @param messages - Messages in OpenAI `ChatCompletionMessageParam` format.
   * @param options - Merged generation options including an optional abort signal.
   * @returns An async iterable of streamed text tokens.
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
   * Perform a non-streaming request using the OpenAI-compatible chat completions API.
   *
   * @remarks
   * Makes a single, non-streamed API call and yields the entire response as one
   * string. The abort signal is checked before the request and passed to the SDK
   * so that in-flight HTTP requests can be cancelled.
   *
   * @param messages - Messages in OpenAI `ChatCompletionMessageParam` format.
   * @param options - Merged generation options including an optional abort signal.
   * @returns An async iterable that yields a single string containing the full response.
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
