/**
 * Deepgram JWT token endpoint.
 *
 * Generates a short-lived Deepgram JWT via /v1/auth/grant so the browser can
 * connect directly to Deepgram WebSocket APIs (STT, TTS) without exposing the
 * API key. The token is scoped to usage:write and expires in 60 seconds.
 *
 * Security:
 * - Requires a valid session cookie (set by /api/session)
 * - Rate-limited per session (max 10 tokens per minute)
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { validateSession, SESSION_COOKIE } from './_session';

/** Per-session rate limit: max requests and window in ms. */
const RATE_LIMIT = { max: 10, windowMs: 60_000 };

/** In-memory rate limit store (resets on cold start — acceptable for abuse prevention). */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(sessionId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(sessionId, { count: 1, resetAt: now + RATE_LIMIT.windowMs });
    return true;
  }

  if (entry.count >= RATE_LIMIT.max) {
    return false;
  }

  entry.count++;
  return true;
}

export const GET: APIRoute = async ({ request }) => {
  // Validate session
  const sessionId = validateSession(request);
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Invalid or missing session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Rate limit
  if (!checkRateLimit(sessionId)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Generate Deepgram JWT
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Deepgram API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch('https://api.deepgram.com/v1/auth/grant', {
      method: 'POST',
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl_seconds: 60 }),
    });

    if (!res.ok) {
      const text = await res.text();
      return new Response(JSON.stringify({ error: `Deepgram auth failed: ${res.status}`, detail: text }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await res.json();

    return new Response(JSON.stringify({
      token: data.access_token,
      expiresIn: data.expires_in,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to generate token' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
