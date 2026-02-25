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

    it('includes AssemblyAI WebSocket route when assemblyaiApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        assemblyaiApiKey: 'test-aai-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'assemblyai',
        type: 'websocket',
        targetBase: 'wss://api.assemblyai.com',
        authHeaders: {
          Authorization: 'test-aai-key',
        },
      });
    });

    it('does not include AssemblyAI route when assemblyaiApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'assemblyai')).toBe(true);
    });

    it('includes AssemblyAI alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        assemblyaiApiKey: 'aai-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('assemblyai');
    });

    it('includes Groq HTTP route when groqApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        groqApiKey: 'test-groq-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'groq',
        type: 'http',
        targetBase: 'https://api.groq.com/openai',
        authHeaders: {
          Authorization: 'Bearer test-groq-key',
        },
      });
    });

    it('does not include Groq route when groqApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'groq')).toBe(true);
    });

    it('includes Groq alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        groqApiKey: 'groq-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('groq');
    });

    it('includes Mistral HTTP route when mistralApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        mistralApiKey: 'test-mistral-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'mistral',
        type: 'http',
        targetBase: 'https://api.mistral.ai',
        authHeaders: {
          Authorization: 'Bearer test-mistral-key',
        },
      });
    });

    it('does not include Mistral route when mistralApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'mistral')).toBe(true);
    });

    it('includes Mistral alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        mistralApiKey: 'mistral-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('mistral');
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

  describe('matchWsRoute — AssemblyAI', () => {
    const routes = buildRoutes({
      deepgramApiKey: 'dg-key',
      assemblyaiApiKey: 'aai-key',
    });
    const prefix = '/proxy';

    it('matches /proxy/assemblyai/ path', () => {
      const route = matchWsRoute(routes, '/proxy/assemblyai/v2/realtime/ws', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('assemblyai');
      expect(route!.type).toBe('websocket');
    });

    it('matches /proxy/assemblyai with subpath', () => {
      const route = matchWsRoute(routes, '/proxy/assemblyai/some/path', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('assemblyai');
    });

    it('does not match HTTP routes for AssemblyAI', () => {
      const route = matchHttpRoute(routes, '/proxy/assemblyai/v2/realtime', prefix);
      expect(route).toBeNull();
    });

    it('does not match when prefix does not match', () => {
      const route = matchWsRoute(routes, '/api/assemblyai/v2/realtime/ws', prefix);
      expect(route).toBeNull();
    });

    it('still matches Deepgram WebSocket route', () => {
      const route = matchWsRoute(routes, '/proxy/deepgram/v1/listen', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('deepgram');
    });
  });

  describe('matchHttpRoute — Groq', () => {
    const routes = buildRoutes({
      anthropicApiKey: 'ant-key',
      groqApiKey: 'groq-key',
    });
    const prefix = '/proxy';

    it('matches /proxy/groq/ path', () => {
      const route = matchHttpRoute(routes, '/proxy/groq/v1/chat/completions', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('groq');
      expect(route!.type).toBe('http');
    });

    it('matches /proxy/groq with subpath', () => {
      const route = matchHttpRoute(routes, '/proxy/groq/some/path', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('groq');
    });

    it('does not match WebSocket routes for Groq', () => {
      const route = matchWsRoute(routes, '/proxy/groq/v1/chat/completions', prefix);
      expect(route).toBeNull();
    });

    it('does not match when prefix does not match', () => {
      const route = matchHttpRoute(routes, '/api/groq/v1/chat/completions', prefix);
      expect(route).toBeNull();
    });

    it('still matches Anthropic HTTP route', () => {
      const route = matchHttpRoute(routes, '/proxy/anthropic/v1/messages', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('anthropic');
    });
  });

  describe('matchHttpRoute — Mistral', () => {
    const routes = buildRoutes({
      anthropicApiKey: 'ant-key',
      mistralApiKey: 'mistral-key',
    });
    const prefix = '/proxy';

    it('matches /proxy/mistral/ path', () => {
      const route = matchHttpRoute(routes, '/proxy/mistral/v1/chat/completions', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('mistral');
      expect(route!.type).toBe('http');
    });

    it('matches /proxy/mistral with subpath', () => {
      const route = matchHttpRoute(routes, '/proxy/mistral/some/path', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('mistral');
    });

    it('does not match WebSocket routes for Mistral', () => {
      const route = matchWsRoute(routes, '/proxy/mistral/v1/chat/completions', prefix);
      expect(route).toBeNull();
    });

    it('does not match when prefix does not match', () => {
      const route = matchHttpRoute(routes, '/api/mistral/v1/chat/completions', prefix);
      expect(route).toBeNull();
    });

    it('still matches Anthropic HTTP route', () => {
      const route = matchHttpRoute(routes, '/proxy/anthropic/v1/messages', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('anthropic');
    });
  });
});
