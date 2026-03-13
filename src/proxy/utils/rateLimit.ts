/**
 * @packageDocumentation
 * In-memory rate limiter for the CompositeVoice proxy.
 *
 * @remarks
 * Provides a simple sliding-window rate limiter that tracks request counts
 * per IP address. Expired entries are cleaned up on each check call to
 * prevent unbounded memory growth.
 *
 * This module is server-side only and must never be imported by browser bundles.
 */

import type { IncomingMessage } from 'http';

/**
 * Rate limit configuration.
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed per window. */
  maxRequests: number;
  /**
   * Window duration in milliseconds.
   * @defaultValue 60000 (1 minute)
   */
  windowMs?: number;
}

/**
 * Internal tracking state for a single IP address.
 * @internal
 */
interface RateLimitEntry {
  /** Number of requests made in the current window. */
  count: number;
  /** Timestamp (ms) when the current window resets. */
  resetTime: number;
}

/**
 * In-memory rate limiter instance.
 *
 * @remarks
 * Created via {@link createRateLimiter}. Each instance maintains its own
 * independent request counter map so multiple proxy instances do not
 * interfere with each other.
 */
export interface RateLimiter {
  /**
   * Check whether the given IP is within its rate limit.
   *
   * @param ip - The client IP address.
   * @returns `true` if the request is allowed, `false` if the rate limit is exceeded.
   */
  check(ip: string): boolean;

  /**
   * Reset all tracked entries. Useful for testing.
   */
  reset(): void;
}

/**
 * Create an in-memory rate limiter.
 *
 * @param config - Rate limiting configuration (max requests and window duration).
 * @returns A {@link RateLimiter} instance.
 */
export function createRateLimiter(config: RateLimitConfig): RateLimiter {
  const windowMs = config.windowMs ?? 60_000;
  const entries = new Map<string, RateLimitEntry>();

  function cleanup(now: number): void {
    for (const [key, entry] of entries) {
      if (now >= entry.resetTime) {
        entries.delete(key);
      }
    }
  }

  function check(ip: string): boolean {
    const now = Date.now();

    // Periodically clean up expired entries
    cleanup(now);

    const existing = entries.get(ip);
    if (!existing || now >= existing.resetTime) {
      // Start a new window
      entries.set(ip, { count: 1, resetTime: now + windowMs });
      return true;
    }

    existing.count += 1;
    return existing.count <= config.maxRequests;
  }

  function reset(): void {
    entries.clear();
  }

  return { check, reset };
}

/**
 * Extract the client IP address from an incoming HTTP request.
 *
 * @remarks
 * Checks the `X-Forwarded-For` header first (for reverse proxy setups),
 * falling back to `req.socket.remoteAddress`. Returns `'unknown'` if
 * no IP can be determined.
 *
 * @param req - The incoming HTTP request.
 * @returns The client IP address string.
 */
export function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return first?.trim() || 'unknown';
  }
  return req.socket?.remoteAddress ?? 'unknown';
}
