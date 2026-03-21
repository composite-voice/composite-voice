/**
 * Base class for any LLM provider that speaks the OpenAI chat completions format.
 *
 * @packageDocumentation
 *
 * @remarks
 * Groq, Mistral, Gemini, DeepSeek, Perplexity, and others all expose
 * OpenAI-compatible `/v1/chat/completions` endpoints. This module provides the
 * {@link OpenAICompatibleLLM} base class that handles the shared logic --
 * native fetch via {@link HttpClient}, SSE streaming, non-streaming, abort,
 * and proxy mode -- so concrete subclasses only need to supply a `baseURL`
 * and `providerName`.
 *
 * Uses native `fetch` via the shared {@link HttpClient} and {@link SSEParser}
 * utilities — no SDK dependency required.
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
  LLMToolDefinition,
  LLMStreamChunk,
  ToolAwareLLMProvider,
} from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { HttpClient } from '../../../utils/http';
import { parseSSEStream } from '../../../utils/sse';
import { throwIfAborted, rethrowIfAborted } from '../../../utils/abort';

/**
 * Configuration for any OpenAI-compatible LLM provider.
 *
 * @remarks
 * Provide either {@link OpenAICompatibleLLMConfig.apiKey | apiKey} (direct API
 * access) or {@link OpenAICompatibleLLMConfig.proxyUrl | proxyUrl} (server-side
 * proxy). At least one must be set; if both are provided, `proxyUrl` takes
 * precedence and requests are sent through the proxy, which injects the
 * real API key server-side.
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
 * OpenAI-compatible chat completions message format.
 * @internal
 */
interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

/** @internal Default OpenAI API base URL. */
const OPENAI_DEFAULT_URL = 'https://api.openai.com/v1';

/**
 * Base LLM provider for any service that speaks the OpenAI chat completions format.
 *
 * @remarks
 * This class implements the **Template Method** pattern. The base class provides
 * the full generation pipeline -- HTTP client initialization, SSE streaming,
 * non-streaming, abort handling, and proxy support -- while subclasses customize
 * behavior by overriding a small number of hooks:
 *
 * 1. **{@link OpenAICompatibleLLM.providerName | providerName}** -- Display name
 *    used in log messages and error reports.
 * 2. **{@link OpenAICompatibleLLM.buildHeaders | buildHeaders()}** --
 *    Return provider-specific headers merged into every request
 *    (e.g., `OpenAI-Organization` for OpenAI).
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
 *       endpoint: config.endpoint ?? 'https://api.myprovider.com/v1',
 *       model: config.model ?? 'my-default-model',
 *     });
 *   }
 *
 *   protected override buildHeaders(): Record<string, string> {
 *     return { 'X-Custom': this.config.customField ?? '' };
 *   }
 * }
 * ```
 *
 * @see {@link BaseLLMProvider} for the abstract base class.
 * @see {@link OpenAICompatibleLLMConfig} for configuration options.
 * @see {@link OpenAILLM} for the first-party OpenAI subclass.
 */
export class OpenAICompatibleLLM extends BaseLLMProvider implements ToolAwareLLMProvider {
  declare public config: OpenAICompatibleLLMConfig;
  private client: HttpClient | null = null;

  /**
   * Display name used in log messages and errors.
   *
   * @defaultValue `'OpenAICompatibleLLM'`
   */
  protected readonly providerName: string = 'OpenAICompatibleLLM';

  /**
   * Creates a new OpenAI-compatible LLM provider instance.
   *
   * @param config - Provider configuration. Must include at least `model` and
   *   either `apiKey` or `proxyUrl`.
   * @param logger - Optional custom logger instance.
   */
  constructor(config: OpenAICompatibleLLMConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Build provider-specific headers merged into every request.
   *
   * @remarks
   * Override in subclasses to inject provider-specific headers. The returned
   * headers are merged on top of the base headers (`Authorization`, `Content-Type`).
   *
   * @returns An object of additional headers.
   *
   * @example
   * ```ts
   * // In OpenAILLM:
   * protected override buildHeaders(): Record<string, string> {
   *   if (this.config.organizationId) {
   *     return { 'OpenAI-Organization': this.config.organizationId };
   *   }
   *   return {};
   * }
   * ```
   */
  protected buildHeaders(): Record<string, string> {
    return {};
  }

  /**
   * Initialize the HTTP client for the OpenAI-compatible API.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown if neither `apiKey` nor `proxyUrl` is configured.
   */
  protected async onInitialize(): Promise<void> {
    this.assertAuth();

    const baseUrl = this.resolveBaseUrl(OPENAI_DEFAULT_URL);
    if (!baseUrl) throw new Error(`${this.providerName} base URL could not be resolved`);
    const apiKey = this.resolveApiKey();

    const headers: Record<string, string> = {
      ...this.buildHeaders(),
    };

    if (!this.isProxyMode) {
      headers['authorization'] = `Bearer ${apiKey}`;
    }

    this.client = new HttpClient({
      baseUrl,
      headers,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 60000,
      logger: this.logger,
      providerName: this.providerName,
    });

    this.logger.info(`${this.providerName} initialized`, {
      model: this.config.model,
      stream: this.config.stream ?? true,
    });
  }

  /**
   * Dispose of the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info(`${this.providerName} disposed`);
  }

  async generate(prompt: string, options?: LLMGenerationOptions): Promise<AsyncIterable<string>> {
    const messages = this.promptToMessages(prompt);
    return this.generateFromMessages(messages, options);
  }

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
   * Converts messages to OpenAI's `ChatCompletionMessageParam` format and
   * dispatches to either the streaming or non-streaming code path.
   */
  async generateFromMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    this.assertReady();
    if (!this.client) throw new Error(`${this.providerName} client not initialized`);

    const mergedOptions = this.mergeOptions(options);
    if (options?.signal) {
      mergedOptions.signal = options.signal;
    }
    const shouldStream = this.config.stream ?? true;

    // Convert messages to OpenAI format
    const openaiMessages: ChatCompletionMessage[] = messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content,
          tool_call_id: msg.toolCallId ?? '',
        };
      }
      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        return {
          role: 'assistant' as const,
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });

    if (shouldStream) {
      return this.streamResponse(openaiMessages, mergedOptions);
    } else {
      return this.nonStreamResponse(openaiMessages, mergedOptions);
    }
  }

  /**
   * Generate with tool support using the OpenAI-compatible function calling format.
   *
   * @remarks
   * Converts `LLMToolDefinition` to OpenAI's `{ type: "function", function: {...} }`
   * format. Streaming responses yield `LLMStreamChunk` discriminated unions that
   * separate text from tool invocations. All OpenAI-compatible providers (OpenAI,
   * Groq, Gemini, Mistral) support this format.
   */
  async generateWithTools(
    messages: LLMMessage[],
    options?: LLMGenerationOptions & { tools?: LLMToolDefinition[] }
  ): Promise<AsyncIterable<LLMStreamChunk>> {
    this.assertReady();
    if (!this.client) throw new Error(`${this.providerName} client not initialized`);

    const mergedOptions = this.mergeOptions(options);
    const signal = mergedOptions.signal ?? options?.signal;

    // Convert messages to OpenAI format (including tool messages)
    const openaiMessages: ChatCompletionMessage[] = messages.map((msg) => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          content: msg.content,
          tool_call_id: msg.toolCallId ?? '',
        };
      }
      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        return {
          role: 'assistant' as const,
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      };
    });

    // Convert tool definitions to OpenAI format
    const tools = options?.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object' as const,
          properties: t.parameters.properties,
          required: t.parameters.required ?? undefined,
        },
      },
    }));

    const client = this.client;
    const config = this.config;
    const logger = this.logger;
    const providerName = this.providerName;

    return {
      async *[Symbol.asyncIterator]() {
        throwIfAborted(signal);

        try {
          logger.debug(`Starting ${providerName} tool-aware streaming request`, {
            model: config.model,
            messageCount: openaiMessages.length,
            toolCount: tools?.length ?? 0,
          });

          const body = {
            model: config.model,
            messages: openaiMessages,
            temperature: mergedOptions.temperature ?? null,
            max_tokens: mergedOptions.maxTokens ?? null,
            top_p: config.topP ?? null,
            stop: mergedOptions.stopSequences ?? null,
            stream: true,
            ...(tools?.length ? { tools } : {}),
            ...(mergedOptions.extra ?? {}),
          };

          const response = await client.request('/chat/completions', {
            body,
            ...(signal ? { signal } : {}),
            stream: true,
          });

          if (!response.body) throw new Error(`${providerName} streaming response body is null`);

          // Track active tool calls (OpenAI can stream multiple in parallel)
          const activeToolCalls = new Map<number, { id: string; name: string }>();

          for await (const event of parseSSEStream(response.body, signal)) {
            if (signal?.aborted) break;

            const chunk = JSON.parse(event.data);
            const choice = chunk.choices?.[0];
            if (!choice) continue;

            const delta = choice.delta;

            // Text content
            if (delta?.content) {
              yield { type: 'text', text: delta.content };
            }

            // Tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;

                if (tc.id) {
                  // New tool call starting
                  activeToolCalls.set(idx, { id: tc.id, name: tc.function?.name ?? '' });
                  yield {
                    type: 'tool_call_start',
                    toolCall: { id: tc.id, name: tc.function?.name ?? '' },
                  };
                }

                if (tc.function?.arguments) {
                  const active = activeToolCalls.get(idx);
                  if (active) {
                    yield {
                      type: 'tool_call_delta',
                      toolCallId: active.id,
                      argumentsDelta: tc.function.arguments,
                    };
                  }
                }
              }
            }

            // Finish reason — emit tool_call_end for any active calls, then done
            if (choice.finish_reason) {
              for (const [, tc] of activeToolCalls) {
                yield { type: 'tool_call_end', toolCallId: tc.id };
              }
              activeToolCalls.clear();

              const reason = choice.finish_reason === 'tool_calls'
                ? 'tool_use'
                : choice.finish_reason === 'stop'
                  ? 'end_turn'
                  : (choice.finish_reason as 'end_turn' | 'tool_use' | 'stop_sequence' | 'max_tokens');
              yield { type: 'done', stopReason: reason };
            }
          }

          logger.debug(`${providerName} tool-aware streaming request completed`);
        } catch (error) {
          rethrowIfAborted(error, signal);
          logger.error(`${providerName} tool-aware streaming request failed`, error);
          throw error;
        }
      },
    };
  }

  /**
   * Stream a response using the OpenAI-compatible chat completions API.
   */
  private async streamResponse(
    messages: ChatCompletionMessage[],
    options: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    const client = this.client;
    if (!client) throw new Error(`${this.providerName} client not initialized`);
    const config = this.config;
    const logger = this.logger;
    const signal = options.signal;
    const providerName = this.providerName;

    return {
      async *[Symbol.asyncIterator]() {
        throwIfAborted(signal);

        try {
          logger.debug(`Starting ${providerName} streaming request`, {
            model: config.model,
            messageCount: messages.length,
          });

          const body = {
            model: config.model,
            messages,
            temperature: options.temperature ?? null,
            max_tokens: options.maxTokens ?? null,
            top_p: config.topP ?? null,
            stop: options.stopSequences ?? null,
            stream: true,
            ...options.extra,
          };

          const response = await client.request('/chat/completions', {
            body,
            ...(signal ? { signal } : {}),
            stream: true,
          });

          if (!response.body) throw new Error(`${providerName} streaming response body is null`);
          for await (const event of parseSSEStream(response.body, signal)) {
            if (signal?.aborted) break;

            const chunk = JSON.parse(event.data);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          }

          logger.debug(`${providerName} streaming request completed`);
        } catch (error) {
          rethrowIfAborted(error, signal);
          logger.error(`${providerName} streaming request failed`, error);
          throw error;
        }
      },
    };
  }

  /**
   * Perform a non-streaming request using the OpenAI-compatible chat completions API.
   */
  private async nonStreamResponse(
    messages: ChatCompletionMessage[],
    options: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    const client = this.client;
    if (!client) throw new Error(`${this.providerName} client not initialized`);
    const config = this.config;
    const logger = this.logger;
    const signal = options.signal;
    const providerName = this.providerName;

    return {
      async *[Symbol.asyncIterator]() {
        throwIfAborted(signal);

        try {
          logger.debug(`Starting ${providerName} non-streaming request`, {
            model: config.model,
            messageCount: messages.length,
          });

          const body = {
            model: config.model,
            messages,
            temperature: options.temperature ?? null,
            max_tokens: options.maxTokens ?? null,
            top_p: config.topP ?? null,
            stop: options.stopSequences ?? null,
            stream: false,
            ...options.extra,
          };

          const response = await client.request('/chat/completions', {
            body,
            ...(signal ? { signal } : {}),
          });
          const data = await response.json();

          const content = data.choices?.[0]?.message?.content ?? '';
          yield content;

          logger.debug(`${providerName} non-streaming request completed`, {
            tokensUsed: data.usage?.total_tokens,
          });
        } catch (error) {
          rethrowIfAborted(error, signal);
          logger.error(`${providerName} non-streaming request failed`, error);
          throw error;
        }
      },
    };
  }
}
