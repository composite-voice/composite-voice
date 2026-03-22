/**
 * @packageDocumentation
 * Proxy configuration types for the CompositeVoice server-side proxy middleware.
 *
 * @remarks
 * This module defines the configuration interface used by all proxy adapters
 * (Express, Next.js, Node.js). It is server-side only and must never be imported
 * by browser bundles. API keys are stored in this configuration and injected into
 * upstream requests by the proxy — browsers never see the real credentials.
 *
 * @example
 * ```typescript
 * import type { CompositeVoiceProxyConfig } from '@lukeocodes/composite-voice/proxy';
 *
 * const config: CompositeVoiceProxyConfig = {
 *   deepgramApiKey: process.env.DEEPGRAM_API_KEY,
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   openaiApiKey: process.env.OPENAI_API_KEY,
 *   pathPrefix: '/api/proxy',
 *   cors: { origins: ['http://localhost:5173'] },
 * };
 * ```
 *
 * @see {@link createExpressProxy} for Express/Connect usage
 * @see {@link createNextJsProxy} for Next.js App Router usage
 * @see {@link createNodeProxy} for plain Node.js usage
 */

/**
 * Configuration for the CompositeVoice proxy server.
 *
 * @remarks
 * API keys live here (server-side only). Browsers connect to the proxy
 * using provider-level `proxyUrl` options and never see the real keys.
 * Only providers with a configured API key will have routes registered;
 * unconfigured providers are silently skipped.
 *
 * @example
 * ```typescript
 * const config: CompositeVoiceProxyConfig = {
 *   deepgramApiKey: process.env.DEEPGRAM_API_KEY,
 *   anthropicApiKey: process.env.ANTHROPIC_API_KEY,
 *   pathPrefix: '/api/proxy',
 *   cors: { origins: ['*'] },
 * };
 * ```
 */
export interface CompositeVoiceProxyConfig {
  /**
   * Deepgram API key -- used for WebSocket STT and TTS proxying.
   *
   * @remarks
   * When set, the proxy registers a WebSocket route at `{pathPrefix}/deepgram`
   * that forwards connections to `wss://api.deepgram.com`.
   *
   * @defaultValue `undefined` (Deepgram proxying disabled)
   */
  deepgramApiKey?: string;

  /**
   * Anthropic API key -- used for HTTP LLM proxying.
   *
   * @remarks
   * When set, the proxy registers an HTTP route at `{pathPrefix}/anthropic`
   * that forwards requests to `https://api.anthropic.com`.
   *
   * @defaultValue `undefined` (Anthropic proxying disabled)
   */
  anthropicApiKey?: string;

  /**
   * OpenAI API key -- used for HTTP LLM and TTS proxying.
   *
   * @remarks
   * When set, the proxy registers an HTTP route at `{pathPrefix}/openai`
   * that forwards requests to `https://api.openai.com`.
   *
   * @defaultValue `undefined` (OpenAI proxying disabled)
   */
  openaiApiKey?: string;

  /**
   * ElevenLabs API key -- used for WebSocket TTS and STT proxying.
   *
   * @remarks
   * When set, the proxy registers a WebSocket route at `{pathPrefix}/elevenlabs`
   * that forwards connections to `wss://api.elevenlabs.io`. This single route
   * handles both TTS (`/v1/text-to-speech/...`) and STT (`/v1/speech-to-text/...`)
   * traffic. The `xi-api-key` auth header is injected server-side.
   *
   * @defaultValue `undefined` (ElevenLabs proxying disabled)
   */
  elevenlabsApiKey?: string;

  /**
   * AssemblyAI API key -- used for WebSocket STT proxying.
   *
   * @remarks
   * When set, the proxy registers a WebSocket route at `{pathPrefix}/assemblyai`
   * that forwards connections to `wss://api.assemblyai.com`.
   *
   * @defaultValue `undefined` (AssemblyAI proxying disabled)
   */
  assemblyaiApiKey?: string;

  /**
   * Groq API key -- used for HTTP LLM proxying.
   *
   * @remarks
   * When set, the proxy registers an HTTP route at `{pathPrefix}/groq`
   * that forwards requests to `https://api.groq.com/openai`.
   *
   * @defaultValue `undefined` (Groq proxying disabled)
   */
  groqApiKey?: string;

  /**
   * Mistral API key -- used for HTTP LLM proxying.
   *
   * @remarks
   * When set, the proxy registers an HTTP route at `{pathPrefix}/mistral`
   * that forwards requests to `https://api.mistral.ai`.
   *
   * @defaultValue `undefined` (Mistral proxying disabled)
   */
  mistralApiKey?: string;

  /**
   * Gemini API key -- used for HTTP LLM proxying.
   *
   * @remarks
   * When set, the proxy registers an HTTP route at `{pathPrefix}/gemini`
   * that forwards requests to `https://generativelanguage.googleapis.com/v1beta/openai`.
   *
   * @defaultValue `undefined` (Gemini proxying disabled)
   */
  geminiApiKey?: string;

  /**
   * Deepgram API key for the Agent API -- used for WebSocket Voice Agent proxying.
   *
   * @remarks
   * When set, the proxy registers a WebSocket route at `{pathPrefix}/deepgram-agent`
   * that forwards connections to `wss://agent.deepgram.com`. This is separate
   * from the standard Deepgram STT/TTS route because the Agent API uses a
   * different host (`agent.deepgram.com` vs `api.deepgram.com`).
   *
   * If omitted but `deepgramApiKey` is set, the agent route reuses the same key.
   *
   * @defaultValue `undefined` (falls back to `deepgramApiKey` when present)
   */
  deepgramAgentApiKey?: string;

  /**
   * Cartesia API key -- used for WebSocket TTS proxying.
   *
   * @remarks
   * When set, the proxy registers a WebSocket route at `{pathPrefix}/cartesia`
   * that forwards connections to `wss://api.cartesia.ai`.
   *
   * @defaultValue `undefined` (Cartesia proxying disabled)
   */
  cartesiaApiKey?: string;

  /**
   * URL path prefix for all proxy routes.
   *
   * @remarks
   * All proxy routes are mounted under this prefix. For example, with a prefix
   * of `'/api/proxy'`, the Anthropic provider route becomes `/api/proxy/anthropic/...`.
   *
   * @defaultValue `'/proxy'`
   */
  pathPrefix?: string;

  /**
   * CORS configuration for cross-origin requests.
   *
   * @remarks
   * When the proxy and the app share the same origin you typically do not need this.
   * Set `origins: ['*']` for development convenience or list specific origins in production.
   * Omitting this property or leaving `origins` empty skips CORS header injection entirely.
   *
   * @example
   * ```typescript
   * // Allow all origins (development)
   * cors: { origins: ['*'] }
   *
   * // Allow specific origins (production)
   * cors: { origins: ['https://myapp.com', 'https://staging.myapp.com'] }
   * ```
   */
  cors?: {
    /**
     * Allowed origins for CORS.
     *
     * @remarks
     * Omit or leave empty to skip CORS headers entirely. Use `['*']` to allow
     * any origin, or list specific origins for tighter security.
     *
     * @defaultValue `undefined` (no CORS headers)
     */
    origins?: string[];
  };

  /**
   * Security middleware configuration.
   *
   * @remarks
   * All limits are optional. When omitted, no limit is enforced and behaviour
   * is identical to a proxy without the `security` field -- fully backward-compatible.
   */
  security?: {
    /**
     * Maximum request body size in bytes for HTTP forwarding.
     * Requests exceeding this are rejected with 413 Payload Too Large.
     *
     * @defaultValue `undefined` (no limit)
     */
    maxBodySize?: number;

    /**
     * Maximum WebSocket message size in bytes.
     * Messages exceeding this close the connection with code 1009 (Message Too Big).
     *
     * @defaultValue `undefined` (no limit)
     */
    maxWsMessageSize?: number;

    /**
     * Simple rate limiting: max requests per window per IP.
     *
     * @defaultValue `undefined` (no rate limiting)
     */
    rateLimit?: {
      /** Maximum requests allowed per window. */
      maxRequests: number;
      /**
       * Window duration in milliseconds.
       *
       * @defaultValue 60000 (1 minute)
       */
      windowMs?: number;
    };

    /**
     * Optional authentication function. Return `true` to allow, `false` to reject with 401.
     * Called with the incoming request for HTTP, or the upgrade request for WebSocket.
     */
    authenticate?: (req: {
      headers: Record<string, string | string[] | undefined>;
      url?: string;
    }) => boolean | Promise<boolean>;
  };
}
