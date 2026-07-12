/**
 * @packageDocumentation
 * Internal routing utilities shared across all proxy adapters.
 *
 * @remarks
 * Provides functions to build route tables from proxy configuration, match
 * incoming HTTP and WebSocket requests to provider routes, and set CORS headers.
 * These utilities are used internally by the Express, Next.js, and Node.js
 * adapters and are also exported for custom integrations.
 *
 * This module is server-side only and must never be imported by browser bundles.
 *
 * @see {@link buildRoutes} for constructing route tables
 * @see {@link matchHttpRoute} and {@link matchWsRoute} for URL-based route matching
 * @see {@link setCorsHeaders} for CORS header injection
 */

import type { ServerResponse } from 'http';
import type { CompositeVoiceProxyConfig } from '../types';

/**
 * The transport type for a proxy route.
 *
 * @remarks
 * - `'http'` routes proxy REST/SSE requests (Anthropic, OpenAI, Groq, Mistral, Gemini, Speechify).
 * - `'websocket'` routes proxy bidirectional WebSocket connections (Deepgram, ElevenLabs TTS/STT, AssemblyAI, Cartesia).
 */
export type RouteType = 'http' | 'websocket';

/**
 * A single proxy route definition mapping a provider name to its upstream target.
 *
 * @remarks
 * Each route specifies the provider identifier (used in URL matching), the
 * transport type, the upstream base URL, and the authentication headers
 * to inject into upstream requests.
 */
export interface ProxyRoute {
  /**
   * The provider identifier used in URL path matching.
   *
   * @remarks
   * For example, `'anthropic'` matches URLs like `/proxy/anthropic/v1/messages`.
   */
  provider: string;

  /** The transport type for this route -- either `'http'` or `'websocket'`. */
  type: RouteType;

  /**
   * The upstream base URL to forward requests to.
   *
   * @remarks
   * For example, `'https://api.anthropic.com'` or `'wss://api.deepgram.com'`.
   */
  targetBase: string;

  /**
   * Authentication headers to inject into upstream requests.
   *
   * @remarks
   * These replace any client-provided auth headers. For example,
   * `{ 'x-api-key': '...' }` for Anthropic or `{ Authorization: 'Bearer ...' }` for OpenAI.
   */
  authHeaders: Record<string, string>;
}

/**
 * Build the set of active proxy routes from the given configuration.
 *
 * @remarks
 * Iterates through all supported providers and creates a {@link ProxyRoute} for
 * each one that has a configured API key. Providers without keys are silently
 * skipped. The resulting route array is used by the adapters to match incoming
 * requests to upstream targets.
 *
 * @param config - The proxy configuration containing API keys for each provider.
 * @returns An array of {@link ProxyRoute} objects for all configured providers.
 *
 * @example
 * ```typescript
 * import { buildRoutes } from '@lukeocodes/composite-voice/proxy';
 *
 * const routes = buildRoutes({
 *   anthropicApiKey: 'sk-...',
 *   deepgramApiKey: 'dg-...',
 * });
 * // routes = [
 * //   { provider: 'anthropic', type: 'http', targetBase: 'https://api.anthropic.com', ... },
 * //   { provider: 'deepgram', type: 'websocket', targetBase: 'wss://api.deepgram.com', ... },
 * // ]
 * ```
 */
export function buildRoutes(config: CompositeVoiceProxyConfig): ProxyRoute[] {
  const routes: ProxyRoute[] = [];

  if (config.anthropicApiKey) {
    routes.push({
      provider: 'anthropic',
      type: 'http',
      targetBase: 'https://api.anthropic.com',
      authHeaders: {
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
    });
  }

  if (config.openaiApiKey) {
    routes.push({
      provider: 'openai',
      type: 'http',
      targetBase: 'https://api.openai.com',
      authHeaders: {
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
    });
  }

  if (config.deepgramApiKey) {
    routes.push({
      provider: 'deepgram',
      type: 'websocket',
      targetBase: 'wss://api.deepgram.com',
      authHeaders: {
        Authorization: `Token ${config.deepgramApiKey}`,
      },
    });
  }

  if (config.elevenlabsApiKey) {
    routes.push({
      provider: 'elevenlabs',
      type: 'websocket',
      targetBase: 'wss://api.elevenlabs.io',
      authHeaders: {
        'xi-api-key': config.elevenlabsApiKey,
      },
    });
  }

  if (config.assemblyaiApiKey) {
    routes.push({
      provider: 'assemblyai',
      type: 'websocket',
      targetBase: 'wss://api.assemblyai.com',
      authHeaders: {
        Authorization: config.assemblyaiApiKey,
      },
    });
  }

  if (config.groqApiKey) {
    routes.push({
      provider: 'groq',
      type: 'http',
      targetBase: 'https://api.groq.com/openai',
      authHeaders: {
        Authorization: `Bearer ${config.groqApiKey}`,
      },
    });
  }

  if (config.mistralApiKey) {
    routes.push({
      provider: 'mistral',
      type: 'http',
      targetBase: 'https://api.mistral.ai',
      authHeaders: {
        Authorization: `Bearer ${config.mistralApiKey}`,
      },
    });
  }

  if (config.geminiApiKey) {
    routes.push({
      provider: 'gemini',
      type: 'http',
      targetBase: 'https://generativelanguage.googleapis.com/v1beta/openai',
      authHeaders: {
        Authorization: `Bearer ${config.geminiApiKey}`,
      },
    });
  }

  // Deepgram Agent API uses a separate host (agent.deepgram.com)
  const agentKey = config.deepgramAgentApiKey ?? config.deepgramApiKey;
  if (agentKey) {
    routes.push({
      provider: 'deepgram-agent',
      type: 'websocket',
      targetBase: 'wss://agent.deepgram.com',
      authHeaders: {
        Authorization: `Token ${agentKey}`,
      },
    });
  }

  if (config.speechifyApiKey) {
    routes.push({
      provider: 'speechify',
      type: 'http',
      targetBase: 'https://api.speechify.ai',
      authHeaders: {
        Authorization: `Bearer ${config.speechifyApiKey}`,
      },
    });
  }

  if (config.cartesiaApiKey) {
    routes.push({
      provider: 'cartesia',
      type: 'websocket',
      targetBase: 'wss://api.cartesia.ai',
      authHeaders: {
        'X-API-Key': config.cartesiaApiKey,
      },
    });
  }

  return routes;
}

/**
 * Find an HTTP route whose provider prefix matches the request URL.
 *
 * @remarks
 * Parses the URL to extract the provider name after the prefix, then looks up
 * the corresponding HTTP route. Returns `null` if the URL does not start with
 * the prefix or no matching HTTP route exists.
 *
 * @param routes - The array of configured proxy routes to search.
 * @param url - The request URL to match (e.g., `/proxy/anthropic/v1/messages`).
 * @param prefix - The path prefix to strip (e.g., `/proxy`).
 * @returns The matched {@link ProxyRoute} or `null` if no match is found.
 *
 * @example
 * ```typescript
 * const route = matchHttpRoute(routes, '/proxy/anthropic/v1/messages', '/proxy');
 * // route.provider === 'anthropic'
 * // route.targetBase === 'https://api.anthropic.com'
 * ```
 */
export function matchHttpRoute(
  routes: ProxyRoute[],
  url: string,
  prefix: string
): ProxyRoute | null {
  if (!url.startsWith(prefix)) return null;

  const afterPrefix = url.slice(prefix.length); // '/anthropic/v1/messages'
  if (!afterPrefix.startsWith('/')) return null;

  const rest = afterPrefix.slice(1); // 'anthropic/v1/messages'
  const slashIdx = rest.indexOf('/');
  const provider = slashIdx === -1 ? rest : rest.slice(0, slashIdx);

  return routes.find((r) => r.type === 'http' && r.provider === provider) ?? null;
}

/**
 * Find an HTTP route by provider name directly, without URL parsing.
 *
 * @remarks
 * Used by the Next.js adapter where the provider name has already been extracted
 * from the catch-all route parameters.
 *
 * @param routes - The array of configured proxy routes to search.
 * @param provider - The provider name to match (e.g., `'anthropic'`).
 * @returns The matched {@link ProxyRoute} or `null` if no match is found.
 */
export function matchHttpRouteByProvider(
  routes: ProxyRoute[],
  provider: string
): ProxyRoute | null {
  return routes.find((r) => r.type === 'http' && r.provider === provider) ?? null;
}

/**
 * Find a WebSocket route whose provider prefix matches the upgrade request URL.
 *
 * @remarks
 * Works identically to {@link matchHttpRoute} but filters for routes with
 * `type: 'websocket'` instead of `type: 'http'`.
 *
 * @param routes - The array of configured proxy routes to search.
 * @param url - The upgrade request URL to match (e.g., `/proxy/deepgram/v1/listen`).
 * @param prefix - The path prefix to strip (e.g., `/proxy`).
 * @returns The matched WebSocket {@link ProxyRoute} or `null` if no match is found.
 *
 * @example
 * ```typescript
 * const route = matchWsRoute(routes, '/proxy/deepgram/v1/listen?model=nova-3', '/proxy');
 * // route.provider === 'deepgram'
 * // route.targetBase === 'wss://api.deepgram.com'
 * ```
 */
export function matchWsRoute(routes: ProxyRoute[], url: string, prefix: string): ProxyRoute | null {
  if (!url.startsWith(prefix)) return null;

  const afterPrefix = url.slice(prefix.length);
  if (!afterPrefix.startsWith('/')) return null;

  const rest = afterPrefix.slice(1);
  const slashIdx = rest.indexOf('/');
  const provider = slashIdx === -1 ? rest : rest.slice(0, slashIdx);

  return routes.find((r) => r.type === 'websocket' && r.provider === provider) ?? null;
}

/**
 * Set CORS headers on a Node.js `ServerResponse`.
 *
 * @remarks
 * Applies `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`,
 * `Access-Control-Allow-Headers`, and `Access-Control-Allow-Credentials`
 * headers based on the configured allowed origins. When `origins` includes
 * `'*'`, the wildcard origin is used. Otherwise, the request's `Origin`
 * header is checked against the allow list and echoed back if it matches.
 *
 * @param res - The server response to set headers on.
 * @param origins - The list of allowed origins from the proxy configuration.
 * @param requestOrigin - The `Origin` header from the incoming request, if present.
 */
export function setCorsHeaders(
  res: ServerResponse,
  origins: string[],
  requestOrigin?: string
): void {
  if (!origins.length) return;

  let allowOrigin: string;
  if (origins.includes('*')) {
    allowOrigin = '*';
  } else if (requestOrigin && origins.includes(requestOrigin)) {
    allowOrigin = requestOrigin;
  } else {
    allowOrigin = origins[0] ?? '*';
  }

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}
