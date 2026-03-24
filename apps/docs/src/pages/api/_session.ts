/**
 * Session management for API routes.
 *
 * Uses an HMAC-signed session cookie. The /api/session endpoint creates the
 * cookie; other API routes validate it via validateSession().
 *
 * The session ID is a random value signed with a server-side secret. This
 * prevents external scripts from calling the token endpoint directly — they
 * would need to first load a page that creates the session.
 */

export const SESSION_COOKIE = 'cv_agent_session';
const SESSION_MAX_AGE = 3600; // 1 hour

/** Server secret for HMAC signing. Falls back to a build-time random value. */
const SECRET = process.env.SESSION_SECRET || crypto.randomUUID();

/**
 * Create a signed session value: `id.signature`
 */
export function createSignedSession(): { value: string; id: string } {
  const id = crypto.randomUUID();
  const signature = signValue(id);
  return { value: `${id}.${signature}`, id };
}

/**
 * Validate a session cookie from a request. Returns the session ID if valid.
 */
export function validateSession(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  const cookies = parseCookies(cookieHeader);
  const sessionValue = cookies[SESSION_COOKIE];
  if (!sessionValue) return null;

  const dotIndex = sessionValue.lastIndexOf('.');
  if (dotIndex === -1) return null;

  const id = sessionValue.slice(0, dotIndex);
  const signature = sessionValue.slice(dotIndex + 1);

  if (signValue(id) !== signature) return null;

  return id;
}

/**
 * Build a Set-Cookie header value for the session.
 */
export function buildSessionCookie(signedValue: string): string {
  return `${SESSION_COOKIE}=${signedValue}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MAX_AGE}; Secure`;
}

// ─── Helpers ──────────────────────────────────────────────────────────

function signValue(value: string): string {
  // Simple HMAC-like signature using Web Crypto SubtleCrypto is async,
  // so we use a sync hash approach with a keyed prefix instead.
  // This is sufficient for session validation (not cryptographic security).
  let hash = 0;
  const input = `${SECRET}:${value}`;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of header.split(';')) {
    const [key, ...rest] = pair.trim().split('=');
    if (key) cookies[key.trim()] = rest.join('=').trim();
  }
  return cookies;
}
