/**
 * WebLLM provider — runs LLMs entirely in-browser via WebGPU
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
type MLCEngine = import('@mlc-ai/web-llm').MLCEngine;
type ChatCompletionMessageParam =
  import('@mlc-ai/web-llm').ChatCompletionMessageParam;
type InitProgressReport =
  import('@mlc-ai/web-llm').InitProgressReport;

/** Progress info emitted while the model downloads / compiles shaders. */
export interface WebLLMLoadProgress {
  progress: number;
  timeElapsed: number;
  text: string;
}

/**
 * WebLLM LLM provider configuration.
 * No API key or proxy needed — everything runs client-side via WebGPU.
 */
export interface WebLLMLLMConfig extends LLMProviderConfig {
  /**
   * WebLLM model identifier.
   * Example: `'Llama-3.2-1B-Instruct-q4f16_1-MLC'`
   *
   * @see https://github.com/mlc-ai/web-llm#available-models
   */
  model: string;

  /**
   * Callback fired during model download and WebGPU shader compilation.
   * Wire this to a progress bar for good UX — initial loads can be 100 MB+.
   */
  onLoadProgress?: (progress: WebLLMLoadProgress) => void;

  /**
   * Override entries from `mlc-chat-config.json` at engine creation time.
   * Useful for tuning `context_window_size`, `prefill_chunk_size`, etc.
   */
  chatOpts?: Record<string, unknown>;
}

/**
 * WebLLM LLM provider
 * Uses @mlc-ai/web-llm to run models entirely in-browser via WebGPU
 */
export class WebLLMLLM extends BaseLLMProvider {
  declare public config: WebLLMLLMConfig;
  private engine: MLCEngine | null = null;

  constructor(config: WebLLMLLMConfig, logger?: Logger) {
    super(config, logger);
  }

  protected async onInitialize(): Promise<void> {
    try {
      const webllm = await import('@mlc-ai/web-llm');

      this.logger.info('Loading WebLLM model (this may take a while on first run)', {
        model: this.config.model,
      });

      this.engine = await webllm.CreateMLCEngine(this.config.model, {
        initProgressCallback: (report: InitProgressReport) => {
          this.config.onLoadProgress?.({
            progress: report.progress,
            timeElapsed: report.timeElapsed,
            text: report.text,
          });
          this.logger.debug('WebLLM load progress', {
            progress: Math.round(report.progress * 100),
            text: report.text,
          });
        },
        ...(this.config.chatOpts ? { chatOpts: this.config.chatOpts } : {}),
      });

      this.logger.info('WebLLM engine ready', {
        model: this.config.model,
        stream: this.config.stream ?? true,
      });
    } catch (error) {
      if (
        (error as Error).message?.includes('Cannot find module') ||
        (error as Error).message?.includes('Failed to resolve')
      ) {
        throw new ProviderInitializationError(
          'WebLLMLLM',
          new Error(
            'WebLLM SDK not found. Install with: npm install @mlc-ai/web-llm\n' +
              'The @mlc-ai/web-llm package is a peer dependency and must be installed separately.'
          )
        );
      }
      throw new ProviderInitializationError('WebLLMLLM', error as Error);
    }
  }

  protected async onDispose(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
    this.logger.info('WebLLM engine disposed (GPU memory freed)');
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

    if (!this.engine) {
      throw new Error('WebLLM engine not initialized');
    }

    const mergedOptions = this.mergeOptions(options);
    const shouldStream = this.config.stream ?? true;

    // WebLLM uses the OpenAI chat format — system messages are passed inline
    const webllmMessages: ChatCompletionMessageParam[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    if (shouldStream) {
      return this.streamResponse(webllmMessages, mergedOptions);
    } else {
      return this.nonStreamResponse(webllmMessages, mergedOptions);
    }
  }

  /**
   * Stream response from WebLLM engine
   */
  private async streamResponse(
    messages: ChatCompletionMessageParam[],
    options: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    if (!this.engine) {
      throw new Error('WebLLM engine not initialized');
    }

    const engine = this.engine;
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

        // Wire AbortSignal to engine.interruptGenerate()
        const onAbort = () => {
          engine.interruptGenerate();
        };
        signal?.addEventListener('abort', onAbort, { once: true });

        try {
          logger.debug('Starting WebLLM streaming request', {
            model: config.model,
            messageCount: messages.length,
          });

          const stream = await engine.chat.completions.create({
            messages,
            temperature: options.temperature ?? null,
            max_tokens: options.maxTokens ?? null,
            top_p: config.topP ?? null,
            stop: options.stopSequences ?? null,
            stream: true as const,
            stream_options: { include_usage: true },
            ...options.extra,
          });

          for await (const chunk of stream) {
            if (signal?.aborted) break;
            const delta = chunk.choices[0]?.delta?.content;
            if (delta) {
              yield delta;
            }
          }

          logger.debug('WebLLM streaming request completed');
        } catch (error) {
          if (signal?.aborted || (error as Error).name === 'AbortError') {
            const err = new Error('AbortError');
            err.name = 'AbortError';
            throw err;
          }
          logger.error('WebLLM streaming request failed', error);
          throw error;
        } finally {
          signal?.removeEventListener('abort', onAbort);
        }
      },
    };
  }

  /**
   * Non-streaming response from WebLLM engine
   */
  private async nonStreamResponse(
    messages: ChatCompletionMessageParam[],
    options: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    if (!this.engine) {
      throw new Error('WebLLM engine not initialized');
    }

    const engine = this.engine;
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

        // Wire AbortSignal to engine.interruptGenerate()
        const onAbort = () => {
          engine.interruptGenerate();
        };
        signal?.addEventListener('abort', onAbort, { once: true });

        try {
          logger.debug('Starting WebLLM non-streaming request', {
            model: config.model,
            messageCount: messages.length,
          });

          const response = await engine.chat.completions.create({
            messages,
            temperature: options.temperature ?? null,
            max_tokens: options.maxTokens ?? null,
            top_p: config.topP ?? null,
            stop: options.stopSequences ?? null,
            stream: false as const,
            ...options.extra,
          });

          const content = response.choices[0]?.message?.content ?? '';
          yield content;

          logger.debug('WebLLM non-streaming request completed', {
            tokensUsed: response.usage?.total_tokens,
          });
        } catch (error) {
          if (signal?.aborted || (error as Error).name === 'AbortError') {
            const err = new Error('AbortError');
            err.name = 'AbortError';
            throw err;
          }
          logger.error('WebLLM non-streaming request failed', error);
          throw error;
        } finally {
          signal?.removeEventListener('abort', onAbort);
        }
      },
    };
  }
}
