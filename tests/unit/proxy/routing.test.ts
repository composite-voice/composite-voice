import { buildRoutes, matchWsRoute, matchHttpRoute } from '../../../src/proxy/utils/routing';
import type { CompositeVoiceProxyConfig } from '../../../src/proxy/types';

describe('proxy routing', () => {
  describe('buildRoutes', () => {
    it('includes ElevenLabs WebSocket route when elevenlabsApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        elevenlabsApiKey: 'test-xi-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'elevenlabs',
        type: 'websocket',
        targetBase: 'wss://api.elevenlabs.io',
        authHeaders: {
          'xi-api-key': 'test-xi-key',
        },
      });
    });

    it('does not include ElevenLabs route when elevenlabsApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'elevenlabs')).toBe(true);
    });

    it('includes ElevenLabs alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        elevenlabsApiKey: 'xi-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('elevenlabs');
    });
  });

  describe('matchWsRoute — ElevenLabs', () => {
    const routes = buildRoutes({
      deepgramApiKey: 'dg-key',
      elevenlabsApiKey: 'xi-key',
    });
    const prefix = '/proxy';

    it('matches /proxy/elevenlabs/ path', () => {
      const route = matchWsRoute(routes, '/proxy/elevenlabs/v1/text-to-speech/voice-id', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('elevenlabs');
      expect(route!.type).toBe('websocket');
    });

    it('matches /proxy/elevenlabs with subpath', () => {
      const route = matchWsRoute(routes, '/proxy/elevenlabs/some/path', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('elevenlabs');
    });

    it('does not match HTTP routes for ElevenLabs', () => {
      const route = matchHttpRoute(routes, '/proxy/elevenlabs/v1/text-to-speech', prefix);
      expect(route).toBeNull();
    });

    it('does not match when prefix does not match', () => {
      const route = matchWsRoute(routes, '/api/elevenlabs/v1/tts', prefix);
      expect(route).toBeNull();
    });

    it('still matches Deepgram WebSocket route', () => {
      const route = matchWsRoute(routes, '/proxy/deepgram/v1/listen', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('deepgram');
    });
  });
});
