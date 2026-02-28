/**
 * Abstract base class for all large-language-model (LLM) providers.
 *
 * @packageDocumentation
 */

import type {
  LLMProvider,
  LLMProviderConfig,
  LLMGenerationOptions,
  LLMMessage,
} from '../../core/types/providers';
import type { ProviderRole } from '../../core/types/roles';
import { BaseProvider } from './BaseProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base class for LLM providers in CompositeVoice.
 *
 * @remarks
 * `BaseLLMProvider` extends {@link BaseProvider} and implements the
 * {@link LLMProvider} interface. It provides shared helpers for building
 * message arrays and merging generation options, while requiring subclasses
 * to implement the two generation methods.
 *
 * All LLM providers communicate over REST (`type = 'rest'`) and follow a
 * **Receive Text -> Send Text** contract:
 *
 * - Input: a plain-text prompt *or* an array of {@link LLMMessage} objects.
 * - Output: an `AsyncIterable<string>` that yields text chunks (supports
 *   both streaming and non-streaming implementations).
 *
 * **Inheritance hierarchy:**
 *
 * ```
 * BaseProvider
 *  +-- BaseLLMProvider          <-- you are here
 *       +-- AnthropicLLM        (streaming SSE)
 *       +-- OpenAILLM           (non-streaming / streaming)
 *       +-- GroqLLM             (streaming)
 *       +-- WebLLMLLM           (in-browser inference)
 * ```
 *
 * @example
 * ```ts
 * import { BaseLLMProvider } from 'composite-voice';
 * import type { LLMProviderConfig, LLMGenerationOptions, LLMMessage } from 'composite-voice';
 *
 * class MyLLMProvider extends BaseLLMProvider {
 *   constructor(config: LLMProviderConfig) {
 *     super(config);
 *   }
 *
 *   protected async onInitialize(): Promise<void> { }
 *   protected async onDispose(): Promise<void> { }
 *
 *   async generate(prompt: string, options?: LLMGenerationOptions) {
 *     const messages = this.promptToMessages(prompt);
 *     return this.generateFromMessages(messages, options);
 *   }
 *
 *   async *generateFromMessages(messages: LLMMessage[], options?: LLMGenerationOptions) {
 *     const merged = this.mergeOptions(options);
 *     const response = await myApi.chat(messages, merged);
 *     yield response.text;
 *   }
 * }
 * ```
 *
 * @see {@link BaseProvider} for the root provider lifecycle
 * @see {@link LLMProvider} for the interface contract
 */
export abstract class BaseLLMProvider extends BaseProvider implements LLMProvider {
  /** LLM providers cover the `'llm'` pipeline role by default. */
  public override readonly roles: readonly ProviderRole[] = ['llm'];

  /** LLM-specific provider configuration. */
  public override config: LLMProviderConfig;

  /**
   * Create a new LLM provider.
   *
   * @param config - LLM provider configuration including model name,
   *   temperature, system prompt, and other generation defaults.
   * @param logger - Optional parent logger; a child will be derived.
   */
  constructor(config: LLMProviderConfig, logger?: Logger) {
    super('rest', config, logger);
    this.config = config;
  }

  /**
   * Generate a response from a single user prompt.
   *
   * @remarks
   * **Interface: Receive Text -> Send Text.**
   * This is the simplest way to get a completion. Implementations typically
   * convert the prompt into a messages array (optionally prepending a system
   * message) and delegate to {@link generateFromMessages}.
   *
   * @param prompt - The user's input text.
   * @param options - Optional generation overrides (temperature, max tokens,
   *   stop sequences, abort signal, etc.).
   * @returns An `AsyncIterable` that yields text chunks as they arrive.
   *
   * @virtual
   */
  abstract generate(prompt: string, options?: LLMGenerationOptions): Promise<AsyncIterable<string>>;

  /**
   * Generate a response from an array of conversation messages.
   *
   * @remarks
   * **Interface: Receive Text -> Send Text.**
   * Use this method when you need multi-turn conversation support.
   * The `messages` array can include `system`, `user`, and `assistant`
   * roles to provide full conversational context.
   *
   * @param messages - Ordered array of {@link LLMMessage} objects
   *   representing the conversation history.
   * @param options - Optional generation overrides.
   * @returns An `AsyncIterable` that yields text chunks as they arrive.
   *
   * @virtual
   */
  abstract generateFromMessages(
    messages: LLMMessage[],
    options?: LLMGenerationOptions
  ): Promise<AsyncIterable<string>>;

  /**
   * Convert a plain-text prompt into an {@link LLMMessage} array.
   *
   * @remarks
   * If the provider's config includes a `systemPrompt`, it is prepended as a
   * `system` message. The prompt itself becomes a `user` message.
   *
   * @param prompt - The user's input text.
   * @returns A messages array suitable for {@link generateFromMessages}.
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
   * Merge per-call generation options with the provider's config defaults.
   *
   * @remarks
   * Values supplied in `options` take precedence over values in
   * {@link config}. Only defined values are included in the result,
   * allowing providers to distinguish "not set" from explicit values.
   *
   * @param options - Optional per-call overrides.
   * @returns A merged {@link LLMGenerationOptions} object.
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
   * Get a shallow copy of the current LLM configuration.
   *
   * @returns A new {@link LLMProviderConfig} object.
   */
  override getConfig(): LLMProviderConfig {
    return { ...this.config };
  }
}
