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

    it('includes Cartesia WebSocket route when cartesiaApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        cartesiaApiKey: 'test-cartesia-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'cartesia',
        type: 'websocket',
        targetBase: 'wss://api.cartesia.ai',
        authHeaders: {
          'X-API-Key': 'test-cartesia-key',
        },
      });
    });

    it('does not include Cartesia route when cartesiaApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'cartesia')).toBe(true);
    });

    it('includes Cartesia alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        cartesiaApiKey: 'cartesia-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('cartesia');
    });

    it('includes Gemini HTTP route when geminiApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        geminiApiKey: 'test-gemini-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'gemini',
        type: 'http',
        targetBase: 'https://generativelanguage.googleapis.com/v1beta/openai',
        authHeaders: {
          Authorization: 'Bearer test-gemini-key',
        },
      });
    });

    it('does not include Gemini route when geminiApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'gemini')).toBe(true);
    });

    it('includes Gemini alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        geminiApiKey: 'gemini-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('gemini');
    });

    it('includes Soniox WebSocket route when sonioxApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        sonioxApiKey: 'test-soniox-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'soniox',
        type: 'websocket',
        targetBase: 'wss://stt-rt.soniox.com',
        authHeaders: {
          Authorization: 'Bearer test-soniox-key',
        },
      });
    });

    it('does not include Soniox route when sonioxApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'soniox')).toBe(true);
    });

    it('includes Soniox alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        sonioxApiKey: 'soniox-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('soniox');
    });

    it('includes Speechify HTTP route when speechifyApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        speechifyApiKey: 'test-speechify-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'speechify',
        type: 'http',
        targetBase: 'https://api.speechify.ai',
        authHeaders: {
          Authorization: 'Bearer test-speechify-key',
        },
      });
    });

    it('does not include Speechify route when speechifyApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'speechify')).toBe(true);
    });

    it('includes Speechify alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        speechifyApiKey: 'speechify-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('speechify');
    });

it('includes Murf HTTP route when murfApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        murfApiKey: 'test-murf-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'murf',
        type: 'http',
        targetBase: 'https://api.murf.ai',
        authHeaders: {
          'api-key': 'test-murf-key',
        },
      });
    });

    it('does not include Murf route when murfApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'murf')).toBe(true);
    });

    it('includes Murf alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        murfApiKey: 'murf-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('murf');
    });

    it('includes Gladia HTTP route when gladiaApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        gladiaApiKey: 'test-gladia-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'gladia',
        type: 'http',
        targetBase: 'https://api.gladia.io',
        authHeaders: {
          'x-gladia-key': 'test-gladia-key',
        },
      });
    });

    it('does not include Gladia route when gladiaApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'gladia')).toBe(true);
    });

    it('includes Gladia alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        gladiaApiKey: 'gladia-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('gladia');
    });

    it('includes LMNT HTTP route when lmntApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        lmntApiKey: 'test-lmnt-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'lmnt',
        type: 'http',
        targetBase: 'https://api.lmnt.com',
        authHeaders: {
          'X-API-Key': 'test-lmnt-key',
        },
      });
    });

    it('does not include LMNT route when lmntApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'lmnt')).toBe(true);
    });

    it('includes LMNT alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        lmntApiKey: 'lmnt-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('lmnt');
    });

    it('includes Smallest HTTP route when smallestApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        smallestApiKey: 'test-smallest-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'smallest',
        type: 'http',
        targetBase: 'https://api.smallest.ai',
        authHeaders: {
          Authorization: 'Bearer test-smallest-key',
        },
      });
    });

    it('does not include Smallest route when smallestApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'smallest')).toBe(true);
    });

    it('includes Smallest alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        smallestApiKey: 'smallest-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('smallest');
    });

    it('includes Rime HTTP route when rimeApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        rimeApiKey: 'test-rime-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'rime',
        type: 'http',
        targetBase: 'https://users.rime.ai',
        authHeaders: {
          Authorization: 'Bearer test-rime-key',
        },
      });
    });

    it('does not include Rime route when rimeApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'rime')).toBe(true);
    });

    it('includes Rime alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        rimeApiKey: 'rime-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('rime');
    });

    it('includes MiniMax HTTP route when minimaxApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        minimaxApiKey: 'test-minimax-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'minimax',
        type: 'http',
        targetBase: 'https://api.minimax.io',
        authHeaders: {
          Authorization: 'Bearer test-minimax-key',
        },
      });
    });

    it('does not include MiniMax route when minimaxApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'minimax')).toBe(true);
    });

    it('includes MiniMax alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        minimaxApiKey: 'minimax-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('minimax');
    });

    it('includes Speechmatics WebSocket route when speechmaticsApiKey is provided', () => {
      const config: CompositeVoiceProxyConfig = {
        speechmaticsApiKey: 'test-speechmatics-key',
      };

      const routes = buildRoutes(config);

      expect(routes).toHaveLength(1);
      expect(routes[0]).toEqual({
        provider: 'speechmatics',
        type: 'websocket',
        targetBase: 'wss://eu.rt.speechmatics.com',
        authHeaders: {
          Authorization: 'Bearer test-speechmatics-key',
        },
      });
    });

    it('does not include Speechmatics route when speechmaticsApiKey is not provided', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
      };

      const routes = buildRoutes(config);

      expect(routes.every((r) => r.provider !== 'speechmatics')).toBe(true);
    });

    it('includes Speechmatics alongside other providers', () => {
      const config: CompositeVoiceProxyConfig = {
        deepgramApiKey: 'dg-key',
        anthropicApiKey: 'ant-key',
        speechmaticsApiKey: 'speechmatics-key',
      };

      const routes = buildRoutes(config);

      const providers = routes.map((r) => r.provider);
      expect(providers).toContain('anthropic');
      expect(providers).toContain('deepgram');
      expect(providers).toContain('speechmatics');
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

  describe('matchWsRoute — Cartesia', () => {
    const routes = buildRoutes({
      deepgramApiKey: 'dg-key',
      cartesiaApiKey: 'cartesia-key',
    });
    const prefix = '/proxy';

    it('matches /proxy/cartesia/ path', () => {
      const route = matchWsRoute(routes, '/proxy/cartesia/tts/websocket', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('cartesia');
      expect(route!.type).toBe('websocket');
    });

    it('matches /proxy/cartesia with subpath', () => {
      const route = matchWsRoute(routes, '/proxy/cartesia/some/path', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('cartesia');
    });

    it('does not match HTTP routes for Cartesia', () => {
      const route = matchHttpRoute(routes, '/proxy/cartesia/tts/websocket', prefix);
      expect(route).toBeNull();
    });

    it('does not match when prefix does not match', () => {
      const route = matchWsRoute(routes, '/api/cartesia/tts/websocket', prefix);
      expect(route).toBeNull();
    });

    it('still matches Deepgram WebSocket route', () => {
      const route = matchWsRoute(routes, '/proxy/deepgram/v1/listen', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('deepgram');
    });
  });

  describe('matchHttpRoute — Gemini', () => {
    const routes = buildRoutes({
      anthropicApiKey: 'ant-key',
      geminiApiKey: 'gemini-key',
    });
    const prefix = '/proxy';

    it('matches /proxy/gemini/ path', () => {
      const route = matchHttpRoute(routes, '/proxy/gemini/v1/chat/completions', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('gemini');
      expect(route!.type).toBe('http');
    });

    it('matches /proxy/gemini with subpath', () => {
      const route = matchHttpRoute(routes, '/proxy/gemini/some/path', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('gemini');
    });

    it('does not match WebSocket routes for Gemini', () => {
      const route = matchWsRoute(routes, '/proxy/gemini/v1/chat/completions', prefix);
      expect(route).toBeNull();
    });

    it('does not match when prefix does not match', () => {
      const route = matchHttpRoute(routes, '/api/gemini/v1/chat/completions', prefix);
      expect(route).toBeNull();
    });

    it('still matches Anthropic HTTP route', () => {
      const route = matchHttpRoute(routes, '/proxy/anthropic/v1/messages', prefix);
      expect(route).not.toBeNull();
      expect(route!.provider).toBe('anthropic');
    });
  });
});
