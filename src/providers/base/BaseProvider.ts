/**
 * Root base class for all CompositeVoice providers (STT, LLM, TTS).
 *
 * @packageDocumentation
 */

import type {
  BaseProvider as IBaseProvider,
  BaseProviderConfig,
  ProviderType,
} from '../../core/types/providers';
import type { ProviderRole } from '../../core/types/roles';
import { ProviderInitializationError } from '../../utils/errors';
import { Logger } from '../../utils/logger';

/**
 * Abstract base provider that every CompositeVoice provider extends.
 *
 * @remarks
 * `BaseProvider` defines the lifecycle shared by all provider categories:
 *
 * 1. **Construction** -- receives a {@link ProviderType}, a
 *    {@link BaseProviderConfig}, and an optional {@link Logger}.
 * 2. **Initialization** -- {@link initialize} delegates to the subclass hook
 *    {@link onInitialize} and guards against double-init.
 * 3. **Runtime** -- the provider is considered ready ({@link isReady} returns
 *    `true`) after initialization succeeds.
 * 4. **Disposal** -- {@link dispose} delegates to {@link onDispose} and resets
 *    the ready state.
 *
 * Subclasses override the two abstract hooks ({@link onInitialize} and
 * {@link onDispose}) plus optionally {@link onConfigUpdate} to react to
 * runtime configuration changes.
 *
 * **Inheritance hierarchy:**
 *
 * ```
 * BaseProvider
 *  +-- BaseSTTProvider
 *  |    +-- LiveSTTProvider   (WebSocket STT)
 *  |    +-- RestSTTProvider   (REST STT)
 *  +-- BaseLLMProvider        (all LLM providers)
 *  +-- BaseTTSProvider
 *       +-- LiveTTSProvider   (WebSocket TTS)
 *       +-- RestTTSProvider   (REST TTS)
 * ```
 *
 * @example
 * ```ts
 * import { BaseProvider } from 'composite-voice';
 * import type { BaseProviderConfig, ProviderType } from 'composite-voice';
 *
 * class MyCustomProvider extends BaseProvider {
 *   constructor(config: BaseProviderConfig) {
 *     super('rest', config);
 *   }
 *
 *   protected async onInitialize(): Promise<void> {
 *     // Acquire resources, validate credentials, etc.
 *   }
 *
 *   protected async onDispose(): Promise<void> {
 *     // Release resources, close connections, etc.
 *   }
 * }
 * ```
 *
 * @see {@link BaseSTTProvider} for speech-to-text providers
 * @see {@link BaseLLMProvider} for large-language-model providers
 * @see {@link BaseTTSProvider} for text-to-speech providers
 */
export abstract class BaseProvider implements IBaseProvider {
  /** Communication transport this provider uses (`'rest'` or `'websocket'`). */
  public readonly type: ProviderType;

  /**
   * Pipeline roles this provider covers.
   *
   * @remarks
   * Subclasses override this to declare which pipeline stages they handle.
   * For example, {@link BaseSTTProvider} sets `['stt']`, while NativeSTT
   * overrides to `['input', 'stt']` because it manages its own microphone.
   *
   * @defaultValue `[]`
   *
   * @see {@link ProviderRole} for the possible role values
   */
  public readonly roles: readonly ProviderRole[] = [];

  /** Provider-specific configuration. */
  protected config: BaseProviderConfig;

  /** Scoped logger instance for this provider. */
  protected logger: Logger;

  /** Tracks whether {@link initialize} has completed successfully. */
  protected initialized = false;

  /**
   * Create a new provider instance.
   *
   * @param type - The communication transport (`'rest'` or `'websocket'`).
   * @param config - Provider configuration options.
   * @param logger - Optional parent logger; a child logger scoped to this
   *   provider's class name will be derived from it. When omitted a new
   *   {@link Logger} is created using the `debug` flag from `config`.
   */
  constructor(type: ProviderType, config: BaseProviderConfig, logger?: Logger) {
    this.type = type;
    this.config = config;
    this.logger =
      logger?.child(this.constructor.name) ??
      new Logger(this.constructor.name, { enabled: config.debug ?? false });
  }

  /**
   * Initialize the provider, making it ready for use.
   *
   * @remarks
   * Calls the subclass hook {@link onInitialize}. If the provider has already
   * been initialized the call is a no-op.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when {@link onInitialize} rejects. The original error is wrapped
   * with the provider class name for diagnostics.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Already initialized');
      return;
    }

    this.logger.info('Initializing provider');

    try {
      await this.onInitialize();
      this.initialized = true;
      this.logger.info('Provider initialized');
    } catch (error) {
      this.logger.error('Failed to initialize provider', error);
      throw new ProviderInitializationError(this.constructor.name, error as Error);
    }
  }

  /**
   * Clean up resources and dispose of the provider.
   *
   * @remarks
   * Delegates to the subclass hook {@link onDispose} and resets the
   * initialized flag. If the provider is not initialized, the call is a no-op.
   *
   * @throws Re-throws any error raised by {@link onDispose}.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      this.logger.debug('Already disposed');
      return;
    }

    this.logger.info('Disposing provider');

    try {
      await this.onDispose();
      this.initialized = false;
      this.logger.info('Provider disposed');
    } catch (error) {
      this.logger.error('Error disposing provider', error);
      throw error;
    }
  }

  /**
   * Check whether the provider has been initialized and is ready.
   *
   * @returns `true` when {@link initialize} has completed successfully and
   *   {@link dispose} has not yet been called.
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get a shallow copy of the current provider configuration.
   *
   * @returns A new object containing all current configuration values.
   */
  getConfig(): BaseProviderConfig {
    return { ...this.config };
  }

  /**
   * Merge partial configuration updates into the current config.
   *
   * @remarks
   * After merging, the subclass hook {@link onConfigUpdate} is called so
   * providers can react to changed values at runtime.
   *
   * @param config - A partial configuration object whose keys will overwrite
   *   existing values.
   */
  updateConfig(config: Partial<BaseProviderConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Configuration updated');
    this.onConfigUpdate(config);
  }

  /**
   * Provider-specific initialization logic.
   *
   * @remarks
   * Subclasses **must** implement this method to perform any setup required
   * before the provider can be used (e.g. validate credentials, open
   * connections, load models).
   *
   * @virtual
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Provider-specific disposal logic.
   *
   * @remarks
   * Subclasses **must** implement this method to release any resources
   * acquired during {@link onInitialize} (e.g. close connections, free
   * memory).
   *
   * @virtual
   */
  protected abstract onDispose(): Promise<void>;

  /**
   * Hook called after {@link updateConfig} merges new values.
   *
   * @remarks
   * The default implementation is a no-op. Override in subclasses to react
   * to runtime configuration changes (e.g. reconnect with a new API key).
   *
   * @param _config - The partial configuration that was merged.
   *
   * @virtual
   */
  protected onConfigUpdate(_config: Partial<BaseProviderConfig>): void {
    // Override in subclasses if needed
  }

  /**
   * Guard that throws if the provider has not been initialized.
   *
   * @remarks
   * Call at the start of any method that requires the provider to be ready.
   *
   * @throws {@link Error}
   * Thrown with a descriptive message when {@link initialized} is `false`.
   */
  protected assertReady(): void {
    if (!this.initialized) {
      throw new Error(`${this.constructor.name} is not initialized. Call initialize() first.`);
    }
  }
}
