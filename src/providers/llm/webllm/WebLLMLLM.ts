/**
 * WebLLM provider -- runs LLMs entirely in-browser via WebGPU.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link WebLLMLLM} class for running large language
 * models directly in the browser using WebGPU acceleration. Unlike all other
 * LLM providers in CompositeVoice, WebLLM requires **no API key**, **no proxy
 * server**, and **no network connection** after the initial model download.
 *
 * The `@mlc-ai/web-llm` npm package is a **peer dependency** and is dynamically
 * imported during initialization. The first load of a model downloads its
 * weights (often 100 MB+) and compiles WebGPU shaders, which can take
 * significant time. Subsequent loads are cached by the browser.
 *
 * WebLLM supports a wide range of quantized models including LLaMA, Mistral,
 * Phi, and others. Model performance depends on the user's GPU capabilities.
 *
 * @see {@link BaseLLMProvider} for the abstract base class all LLM providers extend.
 * @see {@link OpenAICompatibleLLM} for the server-side OpenAI-compatible base class.
 * @see {@link https://github.com/mlc-ai/web-llm | WebLLM on GitHub} for available models.
 */

import { BaseLLMProvider } from '../../base/BaseLLMProvider';
import type {
  LLMProviderConfig,
  LLMGenerationOptions,
  LLMMessage,
} from '../../../core/types/providers';
import { Logger } from '../../../utils/logger';
import { importPeerDep } from '../../../utils/importPeerDep';

// Type-safe imports for optional peer dependency
type MLCEngine = import('@mlc-ai/web-llm').MLCEngine;
type ChatCompletionMessageParam = import('@mlc-ai/web-llm').ChatCompletionMessageParam;
type InitProgressReport = import('@mlc-ai/web-llm').InitProgressReport;

/**
 * Progress information emitted during model download and WebGPU shader compilation.
 *
 * @remarks
 * Wire this to a progress bar or loading indicator in your UI. The initial
 * model download can be 100 MB+ and shader compilation takes additional time,
 * so providing visual feedback is essential for good UX.
 *
 * @see {@link WebLLMLLMConfig.onLoadProgress} for the callback that receives these events.
 */
export interface WebLLMLoadProgress {
  /**
   * Download/compilation progress as a fraction between 0 and 1.
   *
   * @remarks
   * Multiply by 100 for a percentage value.
   */
  progress: number;
  /**
   * Time elapsed since the load started, in seconds.
   */
  timeElapsed: number;
  /**
   * Human-readable description of the current loading phase.
   *
   * @example `'Downloading model weights (45%)'`, `'Compiling shaders...'`
   */
  text: string;
}

/**
 * Configuration for the WebLLM in-browser LLM provider.
 *
 * @remarks
 * Unlike server-side providers, WebLLM needs no API key or proxy -- everything
 * runs client-side via WebGPU. The only required field is
 * {@link WebLLMLLMConfig.model | model}.
 *
 * @example
 * ```ts
 * const config: WebLLMLLMConfig = {
 *   model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
 *   stream: true,
 *   systemPrompt: 'You are a helpful assistant running locally.',
 *   onLoadProgress: ({ progress, text }) => {
 *     console.log(`Loading: ${Math.round(progress * 100)}% - ${text}`);
 *   },
 * };
 * ```
 *
 * @see {@link LLMProviderConfig} for inherited base properties (temperature, maxTokens, systemPrompt, etc.).
 * @see {@link https://github.com/mlc-ai/web-llm#available-models | Available WebLLM models}
 */
export interface WebLLMLLMConfig extends LLMProviderConfig {
  /**
   * WebLLM model identifier.
   *
   * @remarks
   * Must match one of the model IDs supported by `@mlc-ai/web-llm`. The model
   * weights are downloaded on first use and cached by the browser for subsequent
   * loads.
   *
   * @example `'Llama-3.2-1B-Instruct-q4f16_1-MLC'`
   *
   * @see {@link https://github.com/mlc-ai/web-llm#available-models | Available models}
   */
  model: string;

  /**
   * Callback fired during model download and WebGPU shader compilation.
   *
   * @remarks
   * Wire this to a progress bar for good UX -- initial loads can be 100 MB+.
   * The callback receives a {@link WebLLMLoadProgress} object with `progress`
   * (0--1), `timeElapsed` (seconds), and a human-readable `text` description.
   *
   * @defaultValue `undefined`
   *
   * @example
   * ```ts
   * onLoadProgress: ({ progress, text }) => {
   *   progressBar.style.width = `${progress * 100}%`;
   *   statusLabel.textContent = text;
   * }
   * ```
   */
  onLoadProgress?: (progress: WebLLMLoadProgress) => void;

  /**
   * Override entries from `mlc-chat-config.json` at engine creation time.
   *
   * @remarks
   * Useful for tuning engine parameters such as `context_window_size`,
   * `prefill_chunk_size`, or `sliding_window_size` without modifying the
   * model's packaged configuration.
   *
   * @defaultValue `undefined`
   *
   * @example
   * ```ts
   * chatOpts: {
   *   context_window_size: 2048,
   *   prefill_chunk_size: 1024,
   * }
   * ```
   */
  chatOpts?: Record<string, unknown>;
}

/**
 * WebLLM in-browser LLM provider.
 *
 * @remarks
 * Uses `@mlc-ai/web-llm` to run language models entirely in the browser via
 * WebGPU. This provider is unique among CompositeVoice LLM providers in that
 * it requires no API key, no server, and no network connection after the
 * initial model download.
 *
 * **Key characteristics:**
 * - **Zero server cost:** All inference runs on the user's GPU.
 * - **Privacy-first:** No data leaves the browser.
 * - **Offline capable:** Works without network after the first model download.
 * - **Abort support:** Uses `engine.interruptGenerate()` when the abort signal
 *   fires, which is more reliable than HTTP cancellation for local inference.
 * - **Resource cleanup:** The `dispose()` method calls `engine.unload()` to
 *   free GPU memory.
 *
 * **Requirements:**
 * - A browser with WebGPU support (Chrome 113+, Edge 113+).
 * - The `@mlc-ai/web-llm` peer dependency must be installed.
 * - Sufficient GPU memory for the selected model.
 *
 * @example
 * ```ts
 * import { WebLLMLLM } from 'composite-voice';
 *
 * const llm = new WebLLMLLM({
 *   model: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
 *   systemPrompt: 'You are a helpful local assistant.',
 *   onLoadProgress: ({ progress, text }) => {
 *     console.log(`Loading: ${Math.round(progress * 100)}% - ${text}`);
 *   },
 * });
 * await llm.initialize(); // Downloads model on first run
 *
 * const stream = await llm.generate('Tell me about WebGPU.');
 * for await (const chunk of stream) {
 *   document.getElementById('output')!.textContent += chunk;
 * }
 *
 * await llm.dispose(); // Frees GPU memory
 * ```
 *
 * @see {@link WebLLMLLMConfig} for configuration options.
 * @see {@link BaseLLMProvider} for the abstract base class.
 * @see {@link OpenAICompatibleLLM} for server-side alternatives.
 */
export class WebLLMLLM extends BaseLLMProvider {
  declare public config: WebLLMLLMConfig;
  private engine: MLCEngine | null = null;

  /**
   * Creates a new WebLLM in-browser LLM provider instance.
   *
   * @param config - WebLLM provider configuration. The only required field is `model`.
   * @param logger - Optional custom logger instance. If omitted, a default
   *   logger is created by the base class.
   */
  constructor(config: WebLLMLLMConfig, logger?: Logger) {
    super(config, logger);
  }

  /**
   * Initialize the WebLLM engine.
   *
   * @remarks
   * Dynamically imports the `@mlc-ai/web-llm` peer dependency and creates
   * an MLC engine. This triggers model weight download (on first use) and
   * WebGPU shader compilation. Progress is reported via the
   * {@link WebLLMLLMConfig.onLoadProgress | onLoadProgress} callback.
   *
   * This method can take a significant amount of time on first run (minutes
   * for large models) due to the download and compilation steps. Subsequent
   * runs are much faster thanks to browser caching.
   *
   * Called automatically by {@link BaseLLMProvider.initialize}.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown if the `@mlc-ai/web-llm` package cannot be found (peer dependency
   * not installed) or if engine creation fails (e.g., no WebGPU support).
   */
  protected async onInitialize(): Promise<void> {
    // Dynamically import WebLLM SDK (peer dependency)
    const webllm = await importPeerDep<typeof import('@mlc-ai/web-llm')>(
      '@mlc-ai/web-llm',
      'WebLLMLLM',
    );

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
  }

  /**
   * Dispose of the WebLLM engine and free GPU memory.
   *
   * @remarks
   * Calls `engine.unload()` to release all GPU resources (model weights,
   * KV cache, compiled shaders). This is important for freeing VRAM,
   * especially on devices with limited GPU memory.
   *
   * Called automatically by {@link BaseLLMProvider.dispose}.
   */
  protected async onDispose(): Promise<void> {
    if (this.engine) {
      await this.engine.unload();
      this.engine = null;
    }
    this.logger.info('WebLLM engine disposed (GPU memory freed)');
  }

  /**
   * Generate an LLM response from a multi-turn conversation.
   *
   * @remarks
   * This is the primary generation method. It converts messages to WebLLM's
   * `ChatCompletionMessageParam` format (which matches the OpenAI format) and
   * dispatches to either the streaming or non-streaming code path based on
   * `config.stream`.
   *
   * System messages are passed inline (WebLLM supports `role: 'system'` in
   * the messages array, unlike Anthropic).
   *
   * @param messages - Array of conversation messages (system, user, assistant).
   * @param options - Optional generation overrides (temperature, maxTokens, signal, etc.).
   * @returns An async iterable that yields text chunks. When streaming is enabled
   *   (the default), chunks arrive incrementally; otherwise, a single chunk
   *   containing the full response is yielded.
   *
   * @throws {@link Error}
   * Thrown if the provider has not been initialized or the engine is unavailable.
   *
   * @throws `AbortError`
   * Thrown if the provided `options.signal` is aborted before or during generation.
   *
   * @example
   * ```ts
   * const messages: LLMMessage[] = [
   *   { role: 'system', content: 'You are a local assistant.' },
   *   { role: 'user', content: 'What can you do offline?' },
   * ];
   *
   * const stream = await webllm.processMessages(messages);
   * for await (const chunk of stream) {
   *   console.log(chunk);
   * }
   * ```
   */
  async processMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>> {
    this.assertReady();

    if (!this.engine) {
      throw new Error('WebLLM engine not initialized');
    }

    const mergedOptions = this.mergeOptions(options);
    const shouldStream = this.config.stream ?? true;

    // WebLLM uses the OpenAI chat format — filter tool messages (not supported)
    const webllmMessages: ChatCompletionMessageParam[] = messages
      .filter((msg) => msg.role !== 'tool')
      .map((msg) => ({
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content,
      }));

    if (shouldStream) {
      return this.streamResponse(webllmMessages, mergedOptions);
    } else {
      return this.nonStreamResponse(webllmMessages, mergedOptions);
    }
  }

  /**
   * Stream a response from the WebLLM engine.
   *
   * @remarks
   * Creates a streaming chat completion request via the engine's OpenAI-compatible
   * API. Each chunk's `delta.content` is yielded as a string token.
   *
   * Abort handling is done via `engine.interruptGenerate()` which is wired to the
   * abort signal's `'abort'` event. This is more reliable than HTTP cancellation
   * for local inference since there is no network request to cancel.
   *
   * @param messages - Messages in WebLLM `ChatCompletionMessageParam` format.
   * @param options - Merged generation options including an optional abort signal.
   * @returns An async iterable of streamed text tokens.
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
   * Perform a non-streaming request to the WebLLM engine.
   *
   * @remarks
   * Makes a single, non-streamed inference call and yields the entire response
   * as one string. Abort handling is wired via `engine.interruptGenerate()`.
   * Usage statistics (total tokens) are logged at debug level.
   *
   * @param messages - Messages in WebLLM `ChatCompletionMessageParam` format.
   * @param options - Merged generation options including an optional abort signal.
   * @returns An async iterable that yields a single string containing the full response.
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
