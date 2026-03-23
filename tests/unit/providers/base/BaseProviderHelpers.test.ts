/**
 * Tests for BaseProvider helper methods:
 * assertAuth(), isProxyMode, resolveBaseUrl(), resolveApiKey(),
 * resolveWsProtocols(), resolveAuthHeader()
 */

import { BaseProvider } from '../../../../src/providers/base/BaseProvider';
import { ProviderInitializationError } from '../../../../src/utils/errors';

// Concrete subclass that exposes protected helpers for testing
class TestProvider extends BaseProvider {
  protected async onInitialize(): Promise<void> {}
  protected async onDispose(): Promise<void> {}

  // Public wrappers to expose protected methods
  public callAssertAuth(): void {
    this.assertAuth();
  }

  public callResolveBaseUrl(defaultUrl?: string): string | undefined {
    return this.resolveBaseUrl(defaultUrl);
  }

  public callResolveApiKey(): Promise<string> {
    return this.resolveApiKey();
  }

  public callResolveWsProtocols(defaultAuthType?: 'token' | 'bearer'): Promise<string[] | undefined> {
    return this.resolveWsProtocols(defaultAuthType);
  }

  public callResolveAuthHeader(defaultAuthType?: 'token' | 'bearer'): Promise<string | undefined> {
    return this.resolveAuthHeader(defaultAuthType);
  }

  public get publicIsProxyMode(): boolean {
    return this.isProxyMode;
  }
}

describe('BaseProvider helpers', () => {
  // -------------------------------------------------------------------------
  // assertAuth()
  // -------------------------------------------------------------------------
  describe('assertAuth()', () => {
    it('should throw ProviderInitializationError when neither apiKey nor proxyUrl is set', () => {
      const provider = new TestProvider('rest', {});

      expect(() => provider.callAssertAuth()).toThrow(ProviderInitializationError);
    });

    it('should not throw when apiKey is set', () => {
      const provider = new TestProvider('rest', { apiKey: 'sk-123' });

      expect(() => provider.callAssertAuth()).not.toThrow();
    });

    it('should not throw when apiKey is a factory function', () => {
      const provider = new TestProvider('rest', { apiKey: async () => 'sk-123' });

      expect(() => provider.callAssertAuth()).not.toThrow();
    });

    it('should not throw when proxyUrl is set', () => {
      const provider = new TestProvider('rest', {
        proxyUrl: 'http://localhost:3000/proxy',
      });

      expect(() => provider.callAssertAuth()).not.toThrow();
    });

    it('should not throw when both apiKey and proxyUrl are set', () => {
      const provider = new TestProvider('rest', {
        apiKey: 'sk-123',
        proxyUrl: 'http://localhost:3000/proxy',
      });

      expect(() => provider.callAssertAuth()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // isProxyMode
  // -------------------------------------------------------------------------
  describe('isProxyMode', () => {
    it('should return true when proxyUrl is set', () => {
      const provider = new TestProvider('rest', {
        proxyUrl: 'http://localhost:3000/proxy',
      });

      expect(provider.publicIsProxyMode).toBe(true);
    });

    it('should return false when proxyUrl is not set', () => {
      const provider = new TestProvider('rest', { apiKey: 'sk-123' });

      expect(provider.publicIsProxyMode).toBe(false);
    });

    it('should return false when proxyUrl is empty string', () => {
      const provider = new TestProvider('rest', { proxyUrl: '' });

      expect(provider.publicIsProxyMode).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // resolveBaseUrl()
  // -------------------------------------------------------------------------
  describe('resolveBaseUrl()', () => {
    it('should return proxyUrl when set (REST provider)', () => {
      const provider = new TestProvider('rest', {
        proxyUrl: 'http://localhost:3000/proxy',
      });

      expect(provider.callResolveBaseUrl('https://api.default.com')).toBe(
        'http://localhost:3000/proxy'
      );
    });

    it('should convert http to ws for proxyUrl when type is websocket', () => {
      const provider = new TestProvider('websocket', {
        proxyUrl: 'http://localhost:3000/proxy',
      });

      expect(provider.callResolveBaseUrl('wss://api.default.com')).toBe(
        'ws://localhost:3000/proxy'
      );
    });

    it('should convert https to wss for proxyUrl when type is websocket', () => {
      const provider = new TestProvider('websocket', {
        proxyUrl: 'https://my-proxy.example.com/proxy',
      });

      expect(provider.callResolveBaseUrl('wss://api.default.com')).toBe(
        'wss://my-proxy.example.com/proxy'
      );
    });

    it('should return endpoint when set and no proxyUrl', () => {
      const provider = new TestProvider('rest', {
        endpoint: 'https://custom.api.com/v2',
      });

      expect(provider.callResolveBaseUrl('https://api.default.com')).toBe(
        'https://custom.api.com/v2'
      );
    });

    it('should return defaultUrl when neither proxyUrl nor endpoint set', () => {
      const provider = new TestProvider('rest', { apiKey: 'sk-123' });

      expect(provider.callResolveBaseUrl('https://api.default.com')).toBe(
        'https://api.default.com'
      );
    });

    it('should return undefined when all are unset and defaultUrl is undefined', () => {
      const provider = new TestProvider('rest', {});

      expect(provider.callResolveBaseUrl()).toBeUndefined();
    });

    it('should give proxyUrl precedence over endpoint', () => {
      const provider = new TestProvider('rest', {
        proxyUrl: 'http://localhost:3000/proxy',
        endpoint: 'https://custom.api.com/v2',
      });

      expect(provider.callResolveBaseUrl('https://api.default.com')).toBe(
        'http://localhost:3000/proxy'
      );
    });
  });

  // -------------------------------------------------------------------------
  // resolveApiKey()
  // -------------------------------------------------------------------------
  describe('resolveApiKey()', () => {
    it("should return 'proxy' when isProxyMode is true", async () => {
      const provider = new TestProvider('rest', {
        proxyUrl: 'http://localhost:3000/proxy',
        apiKey: 'sk-real-key',
      });

      await expect(provider.callResolveApiKey()).resolves.toBe('proxy');
    });

    it('should return apiKey when set and not proxy mode', async () => {
      const provider = new TestProvider('rest', { apiKey: 'sk-123' });

      await expect(provider.callResolveApiKey()).resolves.toBe('sk-123');
    });

    it('should call factory function and return result', async () => {
      const factory = jest.fn().mockResolvedValue('fresh-token');
      const provider = new TestProvider('rest', { apiKey: factory });

      await expect(provider.callResolveApiKey()).resolves.toBe('fresh-token');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should return empty string when no apiKey and not proxy mode', async () => {
      const provider = new TestProvider('rest', {});

      await expect(provider.callResolveApiKey()).resolves.toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // resolveWsProtocols()
  // -------------------------------------------------------------------------
  describe('resolveWsProtocols()', () => {
    it("should return ['token', apiKey] by default", async () => {
      const provider = new TestProvider('websocket', { apiKey: 'sk-123' });

      await expect(provider.callResolveWsProtocols()).resolves.toEqual(['token', 'sk-123']);
    });

    it("should return ['bearer', apiKey] when defaultAuthType is 'bearer'", async () => {
      const provider = new TestProvider('websocket', { apiKey: 'sk-123' });

      await expect(provider.callResolveWsProtocols('bearer')).resolves.toEqual(['bearer', 'sk-123']);
    });

    it('should call factory and use fresh token', async () => {
      const factory = jest.fn().mockResolvedValue('jwt-token');
      const provider = new TestProvider('websocket', { apiKey: factory });

      await expect(provider.callResolveWsProtocols()).resolves.toEqual(['token', 'jwt-token']);
    });

    it('should return undefined in proxy mode', async () => {
      const provider = new TestProvider('websocket', {
        apiKey: 'sk-123',
        proxyUrl: 'http://localhost:3000/proxy',
      });

      await expect(provider.callResolveWsProtocols()).resolves.toBeUndefined();
    });

    it('should return undefined when no apiKey', async () => {
      const provider = new TestProvider('websocket', {});

      await expect(provider.callResolveWsProtocols()).resolves.toBeUndefined();
    });

    it('should respect config.authType over default parameter', async () => {
      const provider = new TestProvider('websocket', {
        apiKey: 'sk-123',
        authType: 'bearer',
      });

      // Default param is 'token' but config.authType = 'bearer' should win
      await expect(provider.callResolveWsProtocols('token')).resolves.toEqual(['bearer', 'sk-123']);
    });
  });

  // -------------------------------------------------------------------------
  // resolveAuthHeader()
  // -------------------------------------------------------------------------
  describe('resolveAuthHeader()', () => {
    it("should return 'Token <key>' by default", async () => {
      const provider = new TestProvider('rest', { apiKey: 'sk-123' });

      await expect(provider.callResolveAuthHeader()).resolves.toBe('Token sk-123');
    });

    it("should return 'Bearer <key>' when defaultAuthType is 'bearer'", async () => {
      const provider = new TestProvider('rest', { apiKey: 'sk-123' });

      await expect(provider.callResolveAuthHeader('bearer')).resolves.toBe('Bearer sk-123');
    });

    it('should return undefined in proxy mode', async () => {
      const provider = new TestProvider('rest', {
        apiKey: 'sk-123',
        proxyUrl: 'http://localhost:3000/proxy',
      });

      await expect(provider.callResolveAuthHeader()).resolves.toBeUndefined();
    });

    it('should return undefined when no apiKey', async () => {
      const provider = new TestProvider('rest', {});

      await expect(provider.callResolveAuthHeader()).resolves.toBeUndefined();
    });

    it('should respect config.authType over default parameter', async () => {
      const provider = new TestProvider('rest', {
        apiKey: 'sk-123',
        authType: 'bearer',
      });

      // Default param is 'token' but config.authType = 'bearer' should win
      await expect(provider.callResolveAuthHeader('token')).resolves.toBe('Bearer sk-123');
    });
  });
});
