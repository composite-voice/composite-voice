/**
 * Anthropic LLM provider using native `fetch` with SSE streaming.
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
 * Uses native `fetch` via the shared {@link HttpClient} and {@link SSEParser}
 * utilities — no SDK dependency required.
 *
 * @see {@link BaseLLMProvider} for the abstract base class all LLM providers extend.
 * @see {@link OpenAICompatibleLLM} for the OpenAI-compatible base class used by other providers.
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
 * Anthropic message format — a subset of the Messages API types we actually use.
 * @internal
 */
interface AnthropicMessageParam {
  role: 'user' | 'assistant';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
        | { type: 'tool_result'; tool_use_id: string; content: string }
      >;
}

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
   * Maximum number of retries for failed API requests.
   *
   * @defaultValue `3`
   */
  maxRetries?: number;
}

/** @internal Default Anthropic API base URL. */
const ANTHROPIC_DEFAULT_URL = 'https://api.anthropic.com';

/** @internal Anthropic API version header value. */
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Anthropic LLM provider for Claude models.
 *
 * @remarks
 * Uses native `fetch` via {@link HttpClient} for the Messages API with full
 * support for streaming (SSE) and non-streaming responses. The provider
 * handles the Anthropic-specific message format automatically:
 *
 * - **System messages** are extracted from the message array and passed as the
 *   top-level `system` parameter (Anthropic does not accept `role: 'system'`
 *   in the messages array).
 * - **Streaming** yields text from `content_block_delta` events with
 *   `type: 'text_delta'`.
 * - **Abort** support is provided via the `options.signal` parameter, which is
 *   forwarded to the underlying fetch request.
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
export class AnthropicLLM extends BaseLLMProvider implements ToolAwareLLMProvider {
  declare public config: AnthropicLLMConfig;
  private client: HttpClient | null = null;

  /**
   * Creates a new Anthropic LLM provider instance.
   *
   * @param config - Anthropic provider configuration. Must include at least
   *   `model` and either `apiKey` or `proxyUrl`.
   * @param logger - Optional custom logger instance.
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
   * Initialize the HTTP client for the Anthropic Messages API.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown if neither `apiKey` nor `proxyUrl` is configured.
   */
  protected async onInitialize(): Promise<void> {
    this.assertAuth();

    const baseUrl = this.resolveBaseUrl(ANTHROPIC_DEFAULT_URL);
    if (!baseUrl) throw new Error('Anthropic base URL could not be resolved');
    const apiKey = this.resolveApiKey();

    // Anthropic uses x-api-key header (not Bearer)
    const headers: Record<string, string> = {
      'anthropic-version': ANTHROPIC_VERSION,
    };

    if (!this.isProxyMode) {
      headers['x-api-key'] = apiKey;
    }

    this.client = new HttpClient({
      baseUrl,
      headers,
      maxRetries: this.config.maxRetries ?? 3,
      timeout: this.config.timeout ?? 60000,
      logger: this.logger,
      providerName: 'AnthropicLLM',
    });

    this.logger.info('Anthropic LLM initialized', {
      model: this.config.model,
      stream: this.config.stream ?? true,
    });
  }

  /**
   * Dispose of the HTTP client.
   */
  protected async onDispose(): Promise<void> {
    this.client = null;
    this.logger.info('Anthropic LLM disposed');
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
   * Extracts system messages from the array and passes them as Anthropic's
   * top-level `system` parameter. Dispatches to either the streaming or
   * non-streaming code path based on `config.stream`.
   */
  async generateFromMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    this.assertReady();
    if (!this.client) throw new Error('Anthropic client not initialized');

    const mergedOptions = this.mergeOptions(options);
    const shouldStream = this.config.stream ?? true;

    const { system, anthropicMessages } = this.convertMessages(messages);

    if (shouldStream) {
      return this.streamResponse(anthropicMessages, system, mergedOptions, options?.signal);
    } else {
      return this.nonStreamResponse(anthropicMessages, system, mergedOptions, options?.signal);
    }
  }

  /**
   * Stream a response from the Anthropic Messages API via SSE.
   */
  private async streamResponse(
    messages: AnthropicMessageParam[],
    system: string | undefined,
    options: LLMGenerationOptions,
    signal?: AbortSignal
  ): Promise<AsyncIterable<string>> {
    const client = this.client;
    if (!client) throw new Error('Anthropic client not initialized');
    const config = this.config;
    const logger = this.logger;

    return {
      async *[Symbol.asyncIterator]() {
        throwIfAborted(signal);

        try {
          logger.debug('Starting Anthropic streaming request', {
            model: config.model,
            messageCount: messages.length,
          });

          const body = {
            model: config.model,
            max_tokens: options.maxTokens ?? config.maxTokens ?? 1024,
            messages,
            stream: true,
            ...(system ? { system } : {}),
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(config.topP !== undefined ? { top_p: config.topP } : {}),
            ...(options.stopSequences ? { stop_sequences: options.stopSequences } : {}),
            ...(options.extra ?? {}),
          };

          const response = await client.request('/v1/messages', {
            body,
            ...(signal ? { signal } : {}),
            stream: true,
          });

          if (!response.body) throw new Error('Anthropic streaming response body is null');
          for await (const event of parseSSEStream(response.body, signal)) {
            if (signal?.aborted) break;

            const data = JSON.parse(event.data);

            if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
              yield data.delta.text;
            }
          }

          logger.debug('Anthropic streaming request completed');
        } catch (error) {
          rethrowIfAborted(error, signal);
          logger.error('Anthropic streaming request failed', error);
          throw error;
        }
      },
    };
  }

  /**
   * Perform a non-streaming request to the Anthropic Messages API.
   */
  private async nonStreamResponse(
    messages: AnthropicMessageParam[],
    system: string | undefined,
    options: LLMGenerationOptions,
    signal?: AbortSignal
  ): Promise<AsyncIterable<string>> {
    const client = this.client;
    if (!client) throw new Error('Anthropic client not initialized');
    const config = this.config;
    const logger = this.logger;

    return {
      async *[Symbol.asyncIterator]() {
        throwIfAborted(signal);

        try {
          logger.debug('Starting Anthropic non-streaming request', {
            model: config.model,
            messageCount: messages.length,
          });

          const body = {
            model: config.model,
            max_tokens: options.maxTokens ?? config.maxTokens ?? 1024,
            messages,
            ...(system ? { system } : {}),
            ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
            ...(config.topP !== undefined ? { top_p: config.topP } : {}),
            ...(options.stopSequences ? { stop_sequences: options.stopSequences } : {}),
            ...(options.extra ?? {}),
          };

          const response = await client.request('/v1/messages', {
            body,
            ...(signal ? { signal } : {}),
          });
          const data = await response.json();

          const content = data.content?.[0];
          if (content?.type === 'text') {
            yield content.text;
          }

          logger.debug('Anthropic non-streaming request completed', {
            inputTokens: data.usage?.input_tokens,
            outputTokens: data.usage?.output_tokens,
          });
        } catch (error) {
          rethrowIfAborted(error, signal);
          logger.error('Anthropic non-streaming request failed', error);
          throw error;
        }
      },
    };
  }

  /**
   * Generate a response with tool use support.
   *
   * @remarks
   * Returns an async iterable of `LLMStreamChunk` — text chunks go to TTS,
   * tool_call chunks go to the tool executor. The `done` chunk signals the
   * stop reason so the caller knows whether to send tool results and re-call.
   */
  async generateWithTools(
    messages: LLMMessage[],
    options?: LLMGenerationOptions & { tools?: LLMToolDefinition[] }
  ): Promise<AsyncIterable<LLMStreamChunk>> {
    this.assertReady();
    if (!this.client) throw new Error('Anthropic client not initialized');

    const mergedOptions = this.mergeOptions(options);
    const signal = mergedOptions.signal ?? options?.signal;

    const { system, anthropicMessages } = this.convertMessages(messages, true);

    // Convert tool definitions to Anthropic format
    const tools = options?.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: {
        type: 'object' as const,
        properties: t.parameters.properties,
        required: t.parameters.required ?? null,
      },
    }));

    const client = this.client;
    const config = this.config;
    const logger = this.logger;

    return {
      async *[Symbol.asyncIterator]() {
        throwIfAborted(signal);

        try {
          logger.debug('Starting Anthropic tool-aware streaming request', {
            model: config.model,
            messageCount: anthropicMessages.length,
            toolCount: tools?.length ?? 0,
          });

          const body = {
            model: config.model,
            max_tokens: mergedOptions.maxTokens ?? config.maxTokens ?? 1024,
            messages: anthropicMessages,
            stream: true,
            ...(system ? { system } : {}),
            ...(tools?.length ? { tools } : {}),
            ...(mergedOptions.temperature !== undefined
              ? { temperature: mergedOptions.temperature }
              : {}),
            ...(config.topP !== undefined ? { top_p: config.topP } : {}),
            ...(mergedOptions.stopSequences ? { stop_sequences: mergedOptions.stopSequences } : {}),
            ...(mergedOptions.extra ?? {}),
          };

          const response = await client.request('/v1/messages', {
            body,
            ...(signal ? { signal } : {}),
            stream: true,
          });

          // Track active tool call state during streaming
          let activeToolId = '';
          let activeToolName = '';

          if (!response.body) throw new Error('Anthropic streaming response body is null');
          for await (const event of parseSSEStream(response.body, signal)) {
            if (signal?.aborted) break;

            const data = JSON.parse(event.data);

            if (data.type === 'content_block_start') {
              const block = data.content_block;
              if (block?.type === 'tool_use') {
                activeToolId = block.id ?? '';
                activeToolName = block.name ?? '';
                yield {
                  type: 'tool_call_start',
                  toolCall: { id: activeToolId, name: activeToolName },
                };
              }
            } else if (data.type === 'content_block_delta') {
              if (data.delta?.type === 'text_delta' && data.delta.text) {
                yield { type: 'text', text: data.delta.text };
              } else if (data.delta?.type === 'input_json_delta' && data.delta.partial_json) {
                yield {
                  type: 'tool_call_delta',
                  toolCallId: activeToolId,
                  argumentsDelta: data.delta.partial_json,
                };
              }
            } else if (data.type === 'content_block_stop') {
              if (activeToolId) {
                yield { type: 'tool_call_end', toolCallId: activeToolId };
                activeToolId = '';
              }
            } else if (data.type === 'message_delta') {
              const reason = data.delta?.stop_reason;
              if (reason) {
                yield {
                  type: 'done',
                  stopReason: reason as 'end_turn' | 'tool_use' | 'stop_sequence' | 'max_tokens',
                };
              }
            }
          }

          logger.debug('Anthropic tool-aware streaming request completed');
        } catch (error) {
          rethrowIfAborted(error, signal);
          logger.error('Anthropic tool-aware streaming request failed', error);
          throw error;
        }
      },
    };
  }

  /**
   * Convert SDK messages to Anthropic format, extracting system messages.
   * @internal
   */
  private convertMessages(
    messages: LLMMessage[],
    toolAware = false
  ): { system: string | undefined; anthropicMessages: AnthropicMessageParam[] } {
    // Extract system message (Anthropic uses a top-level system param)
    const systemMessages = messages.filter((m) => m.role === 'system');
    const userMessages = messages.filter((m) => m.role !== 'system');

    const parts: string[] = [];
    if (this.config.systemPrompt) parts.push(this.config.systemPrompt);
    for (const sm of systemMessages) {
      if (sm.content !== this.config.systemPrompt) {
        parts.push(sm.content);
      }
    }
    const system = parts.length > 0 ? parts.join('\n\n') : undefined;

    // Convert to Anthropic message format
    const anthropicMessages: AnthropicMessageParam[] = userMessages.map((msg) => {
      if (toolAware && msg.role === 'assistant' && msg.toolCalls?.length) {
        const content: AnthropicMessageParam['content'] = [];
        if (msg.content)
          (content as Array<{ type: 'text'; text: string }>).push({
            type: 'text',
            text: msg.content,
          });
        for (const tc of msg.toolCalls) {
          (
            content as Array<{
              type: 'tool_use';
              id: string;
              name: string;
              input: Record<string, unknown>;
            }>
          ).push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
        }
        return { role: 'assistant' as const, content };
      }
      if (toolAware && msg.role === 'tool') {
        return {
          role: 'user' as const,
          content: [
            {
              type: 'tool_result' as const,
              tool_use_id: msg.toolCallId ?? '',
              content: msg.content,
            },
          ],
        };
      }
      return { role: msg.role as 'user' | 'assistant', content: msg.content };
    });

    return { system, anthropicMessages };
  }
}
