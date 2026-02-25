/**
 * Internal routing utilities shared across all proxy adapters.
 * Server-side only — never imported by browser bundles.
 */

import type { ServerResponse } from 'http';
import type { CompositeVoiceProxyConfig } from '../types';

export type RouteType = 'http' | 'websocket';

export interface ProxyRoute {
  provider: string; // 'anthropic' | 'openai' | 'deepgram' | 'elevenlabs' | 'assemblyai'
  type: RouteType;
  targetBase: string; // e.g. 'https://api.anthropic.com'
  authHeaders: Record<string, string>;
}

/**
 * Build the set of active routes for the given configuration.
 * Only routes with a configured API key (or explicit proxy target) are included.
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

  return routes;
}

/**
 * Find an HTTP route whose provider prefix matches the request URL.
 * Returns `null` if the URL is not a proxy path.
 *
 * Example: `/proxy/anthropic/v1/messages` with prefix `/proxy` → anthropic route
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

/** Find an HTTP route by provider name directly. */
export function matchHttpRouteByProvider(
  routes: ProxyRoute[],
  provider: string
): ProxyRoute | null {
  return routes.find((r) => r.type === 'http' && r.provider === provider) ?? null;
}

/**
 * Find a WebSocket route whose provider prefix matches the upgrade request URL.
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
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-api-key, anthropic-version, anthropic-beta'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}
