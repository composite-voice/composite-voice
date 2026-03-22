/**
 * HTTP proxy for Anthropic LLM requests.
 *
 * Forwards POST requests to the Anthropic Messages API, injecting the
 * server-side API key. Requires a valid session cookie.
 *
 * Route: POST /api/proxy/anthropic/v1/messages
 * Upstream: https://api.anthropic.com/v1/messages
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { validateSession } from '../_session';

const ANTHROPIC_BASE = 'https://api.anthropic.com';

export const POST: APIRoute = async ({ request, params }) => {
  // Validate session
  const sessionId = validateSession(request);
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Invalid or missing session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Anthropic API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Extract the path after /api/proxy/ — e.g. "anthropic/v1/messages"
  const fullPath = params.path ?? '';
  const pathParts = fullPath.split('/');
  const provider = pathParts[0];

  if (provider !== 'anthropic') {
    return new Response(JSON.stringify({ error: `Unknown provider: ${provider}` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build upstream URL (strip the "anthropic/" prefix)
  const upstreamPath = pathParts.slice(1).join('/');
  const upstreamUrl = `${ANTHROPIC_BASE}/${upstreamPath}`;

  try {
    const body = await request.text();

    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body,
    });

    // Stream the response back (supports SSE for streaming)
    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      headers: {
        'Content-Type': upstreamRes.headers.get('Content-Type') ?? 'application/json',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Proxy request failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
