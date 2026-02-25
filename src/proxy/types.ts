/**
 * Types for the CompositeVoice proxy middleware.
 * This module is server-side only and must never be imported by browser bundles.
 */

/**
 * Configuration for the CompositeVoice proxy server.
 * API keys live here (server-side only).  Browsers connect to the proxy
 * using provider-level `proxyUrl` options and never see the real keys.
 */
export interface CompositeVoiceProxyConfig {
  /** Deepgram API key — used for WebSocket STT and TTS proxying */
  deepgramApiKey?: string;
  /** Anthropic API key — used for HTTP LLM proxying */
  anthropicApiKey?: string;
  /** OpenAI API key — used for HTTP LLM proxying */
  openaiApiKey?: string;
  /** ElevenLabs API key — used for WebSocket TTS proxying */
  elevenlabsApiKey?: string;
  /** AssemblyAI API key — used for WebSocket STT proxying */
  assemblyaiApiKey?: string;
  /** Groq API key — used for HTTP LLM proxying */
  groqApiKey?: string;
  /** Mistral API key — used for HTTP LLM proxying */
  mistralApiKey?: string;
  /** Gemini API key — used for HTTP LLM proxying */
  geminiApiKey?: string;
  /**
   * URL path prefix for all proxy routes.
   * @default '/proxy'
   */
  pathPrefix?: string;
  /**
   * CORS configuration.  When the proxy and the app share the same origin
   * you typically do not need this.  Set `origins: ['*']` for dev convenience
   * or list specific origins in production.
   */
  cors?: {
    /** Allowed origins.  Omit or leave empty to skip CORS headers entirely. */
    origins?: string[];
  };
}
