/**
 * BaseProvider tests
 */

import { BaseProvider } from '../../../../src/providers/base/BaseProvider';
import type { BaseProviderConfig } from '../../../../src/core/types/providers';
import { ProviderInitializationError } from '../../../../src/utils/errors';

// Create concrete implementation for testing
class TestProvider extends BaseProvider {
  public initializeCalled = false;
  public disposeCalled = false;
  public shouldFailInit = false;

  protected async onInitialize(): Promise<void> {
    this.initializeCalled = true;
    if (this.shouldFailInit) {
      throw new Error('Init failed');
    }
  }

  protected async onDispose(): Promise<void> {
    this.disposeCalled = true;
  }
}

describe('BaseProvider', () => {
  let provider: TestProvider;
  const config: BaseProviderConfig = {
    apiKey: 'test-key',
    debug: false,
  };

  beforeEach(() => {
    provider = new TestProvider('rest', config);
  });

  describe('initialization', () => {
    it('should create provider with correct type', () => {
      expect(provider.type).toBe('rest');
    });

    it('should initialize provider', async () => {
      await provider.initialize();

      expect(provider.initializeCalled).toBe(true);
      expect(provider.isReady()).toBe(true);
    });

    it('should not initialize twice', async () => {
      await provider.initialize();
      provider.initializeCalled = false;

      await provider.initialize();

      expect(provider.initializeCalled).toBe(false);
    });

    it('should throw ProviderInitializationError on failure', async () => {
      provider.shouldFailInit = true;

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
      expect(provider.isReady()).toBe(false);
    });
  });

  describe('disposal', () => {
    it('should dispose provider', async () => {
      await provider.initialize();
      await provider.dispose();

      expect(provider.disposeCalled).toBe(true);
      expect(provider.isReady()).toBe(false);
    });

    it('should not dispose twice', async () => {
      await provider.initialize();
      await provider.dispose();
      provider.disposeCalled = false;

      await provider.dispose();

      expect(provider.disposeCalled).toBe(false);
    });

    it('should handle disposal without initialization', async () => {
      await expect(provider.dispose()).resolves.not.toThrow();
    });
  });

  describe('readiness check', () => {
    it('should return false before initialization', () => {
      expect(provider.isReady()).toBe(false);
    });

    it('should return true after initialization', async () => {
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });

    it('should return false after disposal', async () => {
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should store configuration', () => {
      const retrievedConfig = provider.getConfig();

      expect(retrievedConfig).toEqual(config);
    });

    it('should return copy of config', () => {
      const config1 = provider.getConfig();
      const config2 = provider.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('should update configuration', () => {
      provider.updateConfig({ endpoint: 'https://api.test.com' });

      const updatedConfig = provider.getConfig();

      expect(updatedConfig.endpoint).toBe('https://api.test.com');
      expect(updatedConfig.apiKey).toBe('test-key');
    });

    it('should call onConfigUpdate hook', () => {
      const spy = jest.spyOn(provider as any, 'onConfigUpdate');

      provider.updateConfig({ endpoint: 'https://api.test.com' });

      expect(spy).toHaveBeenCalledWith({ endpoint: 'https://api.test.com' });
    });
  });

  describe('assertReady', () => {
    it('should not throw when provider is ready', async () => {
      await provider.initialize();

      expect(() => (provider as any).assertReady()).not.toThrow();
    });

    it('should throw when provider is not ready', () => {
      expect(() => (provider as any).assertReady()).toThrow();
    });
  });

  describe('logger', () => {
    it('should create logger from debug flag', () => {
      const debugProvider = new TestProvider('rest', { ...config, debug: true });

      expect((debugProvider as any).logger).toBeDefined();
    });

    it('should use provided logger', () => {
      const mockLogger = {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        child: jest.fn().mockReturnThis(),
      };

      const providerWithLogger = new TestProvider('rest', config, mockLogger as any);

      expect((providerWithLogger as any).logger).toBe(mockLogger);
    });
  });

  describe('type', () => {
    it('should support REST type', () => {
      const restProvider = new TestProvider('rest', config);

      expect(restProvider.type).toBe('rest');
    });

    it('should support WebSocket type', () => {
      const wsProvider = new TestProvider('websocket', config);

      expect(wsProvider.type).toBe('websocket');
    });
  });
});
