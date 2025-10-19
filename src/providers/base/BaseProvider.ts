/**
 * Base provider class
 */

import type {
  BaseProvider as IBaseProvider,
  BaseProviderConfig,
  ProviderType,
} from '../../core/types/providers';
import { ProviderInitializationError } from '../../utils/errors';
import { Logger } from '../../utils/logger';

/**
 * Abstract base provider implementation
 */
export abstract class BaseProvider implements IBaseProvider {
  public readonly type: ProviderType;
  protected config: BaseProviderConfig;
  protected logger: Logger;
  protected initialized = false;

  constructor(type: ProviderType, config: BaseProviderConfig, logger?: Logger) {
    this.type = type;
    this.config = config;
    this.logger =
      logger?.child(this.constructor.name) ??
      new Logger(this.constructor.name, { enabled: config.debug ?? false });
  }

  /**
   * Initialize the provider
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
   * Clean up resources and dispose of the provider
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
   * Check if provider is initialized and ready
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get provider configuration
   */
  getConfig(): BaseProviderConfig {
    return { ...this.config };
  }

  /**
   * Update provider configuration
   */
  updateConfig(config: Partial<BaseProviderConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Configuration updated');
    this.onConfigUpdate(config);
  }

  /**
   * Provider-specific initialization logic
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * Provider-specific disposal logic
   */
  protected abstract onDispose(): Promise<void>;

  /**
   * Handle configuration updates (optional override)
   */
  protected onConfigUpdate(_config: Partial<BaseProviderConfig>): void {
    // Override in subclasses if needed
  }

  /**
   * Assert that the provider is ready
   */
  protected assertReady(): void {
    if (!this.initialized) {
      throw new Error(`${this.constructor.name} is not initialized. Call initialize() first.`);
    }
  }
}
