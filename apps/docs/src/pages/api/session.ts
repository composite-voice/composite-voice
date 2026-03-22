/**
 * Session creation endpoint.
 *
 * Creates a signed session cookie that other API routes (like /api/deepgram-token)
 * require. This prevents external scripts from calling the token endpoint directly.
 *
 * Called once when the voice agent panel opens.
 */
export const prerender = false;

import type { APIRoute } from 'astro';
import { createSignedSession, buildSessionCookie } from './_session';

export const POST: APIRoute = async () => {
  const { value } = createSignedSession();

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': buildSessionCookie(value),
    },
  });
};
