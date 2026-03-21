/**
 * HTTP client with retry, backoff, timeout, and error classification.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module is the REST equivalent of {@link WebSocketManager}. It wraps
 * the native `fetch` API and adds the reliability features that the
 * `@anthropic-ai/sdk` and `openai` packages previously provided:
 *
 * - **Retry with exponential backoff** — automatically retries on 429
 *   (rate limit) and 5xx (server error) responses, honoring the
 *   `retry-after` header when present.
 * - **Timeout** — uses `AbortSignal.timeout()` combined with any
 *   caller-provided abort signal.
 * - **Error classification** — maps HTTP status codes to the SDK's
 *   existing typed error classes ({@link ProviderResponseError}).
 * - **Auth injection** — sets the `Authorization` header from the
 *   provided API key.
 *
 * @example
 * ```ts
 * const client = new HttpClient({
 *   baseUrl: 'https://api.anthropic.com',
 *   headers: {
 *     'x-api-key': apiKey,
 *     'anthropic-version': '2023-06-01',
 *   },
 * });
 *
 * // Streaming request
 * const response = await client.request('/v1/messages', {
 *   method: 'POST',
 *   body: { model: 'claude-haiku-4-5', messages, max_tokens: 1024, stream: true },
 * });
 * // response.body is a ReadableStream — pipe through SSEParser
 *
 * // Non-streaming request
 * const response = await client.request('/v1/messages', {
 *   method: 'POST',
 *   body: { model: 'claude-haiku-4-5', messages, max_tokens: 1024 },
 * });
 * const data = await response.json();
 * ```
 */

import { ProviderResponseError, TimeoutError } from './errors';
import { Logger } from './logger';

/**
 * Configuration for the {@link HttpClient}.
 */
export interface HttpClientConfig {
  /** Base URL for all requests (e.g., `'https://api.anthropic.com'`). */
  baseUrl: string;

  /**
   * Default headers sent with every request.
   *
   * @remarks
   * Provider-specific headers (e.g., `x-api-key`, `anthropic-version`,
   * `Authorization: Bearer`) should be set here during initialization.
   */
  headers?: Record<string, string>;

  /**
   * Maximum number of retry attempts for retryable errors (429, 5xx).
   *
   * @defaultValue `3`
   */
  maxRetries?: number;

  /**
   * Request timeout in milliseconds.
   *
   * @defaultValue `60000`
   */
  timeout?: number;

  /**
   * Initial delay in milliseconds before the first retry.
   *
   * @defaultValue `1000`
   */
  initialRetryDelay?: number;

  /**
   * Maximum delay in milliseconds between retries.
   *
   * @defaultValue `30000`
   */
  maxRetryDelay?: number;

  /**
   * Multiplier applied to the delay after each retry attempt.
   *
   * @defaultValue `2`
   */
  backoffMultiplier?: number;

  /** Optional logger instance. */
  logger?: Logger;

  /** Provider name used in error messages and logging. */
  providerName?: string;
}

/**
 * Options for a single {@link HttpClient.request} call.
 */
export interface HttpRequestOptions {
  /** HTTP method. @defaultValue `'POST'` */
  method?: string;

  /** Request body — will be JSON-serialized if it's an object. */
  body?: unknown;

  /** Per-request headers merged on top of the client defaults. */
  headers?: Record<string, string>;

  /** Abort signal to cancel this specific request. */
  signal?: AbortSignal;

  /**
   * When `true`, the response is expected to be an SSE stream and the
   * client will not attempt to parse the body as JSON on error.
   */
  stream?: boolean;
}

/**
 * HTTP client with automatic retry, exponential backoff, and error
 * classification.
 *
 * @remarks
 * Mirrors the role of {@link WebSocketManager} for REST-based providers.
 * Where `WebSocketManager` handles connection lifecycle, reconnection,
 * and event dispatching for WebSocket providers, `HttpClient` handles
 * request lifecycle, retries, and error mapping for REST providers.
 *
 * | WebSocketManager       | HttpClient              |
 * |------------------------|-------------------------|
 * | `connect()` + timeout  | `request()` + timeout   |
 * | Reconnection backoff   | Retry backoff           |
 * | `WebSocketState` enum  | HTTP status → errors    |
 * | `connectionTimeout`    | `timeout`               |
 * | `maxAttempts`          | `maxRetries`            |
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly maxRetries: number;
  private readonly timeout: number;
  private readonly initialRetryDelay: number;
  private readonly maxRetryDelay: number;
  private readonly backoffMultiplier: number;
  private readonly logger: Logger | undefined;
  private readonly providerName: string;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.headers = { 'content-type': 'application/json', ...config.headers };
    this.maxRetries = config.maxRetries ?? 3;
    this.timeout = config.timeout ?? 60000;
    this.initialRetryDelay = config.initialRetryDelay ?? 1000;
    this.maxRetryDelay = config.maxRetryDelay ?? 30000;
    this.backoffMultiplier = config.backoffMultiplier ?? 2;
    this.logger = config.logger;
    this.providerName = config.providerName ?? 'HttpClient';
  }

  /**
   * Make an HTTP request with automatic retry and error handling.
   *
   * @remarks
   * Retries are attempted for:
   * - **429** (rate limit) — respects the `retry-after` header if present.
   * - **500, 502, 503, 504** (server errors) — uses exponential backoff.
   *
   * Non-retryable errors (400, 401, 403, 404, 422, etc.) throw immediately
   * as {@link ProviderResponseError}.
   *
   * @param path - URL path appended to the base URL (e.g., `'/v1/messages'`).
   * @param options - Request options including method, body, headers, and signal.
   * @returns The `Response` object on success (2xx status).
   *
   * @throws {@link ProviderResponseError} for non-retryable HTTP errors.
   * @throws {@link ProviderResponseError} after exhausting all retry attempts.
   * @throws {@link TimeoutError} when the request exceeds the configured timeout.
   * @throws `AbortError` when the caller's abort signal fires.
   */
  async request(path: string, options: HttpRequestOptions = {}): Promise<Response> {
    const { method = 'POST', body, headers: extraHeaders, signal, stream } = options;

    const url = `${this.baseUrl}${path}`;
    const headers = { ...this.headers, ...extraHeaders };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Combine caller signal with timeout signal
      const timeoutSignal = AbortSignal.timeout(this.timeout);
      const combinedSignal = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;

      try {
        this.logger?.debug(`${this.providerName} request attempt ${attempt + 1}`, {
          method,
          url,
          stream,
        });

        const response = await fetch(url, {
          method,
          headers,
          ...(body != null ? { body: JSON.stringify(body) } : {}),
          signal: combinedSignal,
        });

        // Success
        if (response.ok) {
          return response;
        }

        // Extract error details
        const errorBody = stream ? '' : await response.text().catch(() => '');
        let errorMessage: string;
        try {
          const parsed = JSON.parse(errorBody);
          errorMessage =
            parsed?.error?.message ?? parsed?.message ?? parsed?.detail ?? errorBody;
        } catch {
          errorMessage = errorBody || response.statusText;
        }

        // Non-retryable status codes — throw immediately
        if (!this.isRetryable(response.status)) {
          throw new ProviderResponseError(this.providerName, response.status, errorMessage);
        }

        // Retryable — compute delay
        lastError = new ProviderResponseError(this.providerName, response.status, errorMessage);

        if (attempt < this.maxRetries) {
          const delay = this.computeDelay(attempt, response);
          this.logger?.info(
            `${this.providerName} retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`,
            { status: response.status }
          );
          await this.sleep(delay, signal);
        }
      } catch (error) {
        // AbortError — always rethrow immediately (no retry)
        if (error instanceof Error && error.name === 'AbortError') {
          if (signal?.aborted) {
            throw error;
          }
          // Timeout (not caller abort)
          throw new TimeoutError(`${this.providerName} request`, this.timeout);
        }

        // Already a typed SDK error — rethrow on last attempt
        if (error instanceof ProviderResponseError) {
          if (attempt >= this.maxRetries) throw error;
          lastError = error;
          continue;
        }

        // Network error — retryable
        lastError = error as Error;
        if (attempt < this.maxRetries) {
          const delay = this.computeDelay(attempt);
          this.logger?.info(
            `${this.providerName} network error, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries})`,
            { error: (error as Error).message }
          );
          await this.sleep(delay, signal);
        }
      }
    }

    // Exhausted all retries
    throw lastError ?? new ProviderResponseError(this.providerName, undefined, 'Max retries exceeded');
  }

  /**
   * Determine whether an HTTP status code is retryable.
   *
   * @param status - The HTTP response status code.
   * @returns `true` for 429 and 5xx status codes.
   */
  private isRetryable(status: number): boolean {
    return status === 429 || (status >= 500 && status < 600);
  }

  /**
   * Compute the retry delay for the given attempt.
   *
   * @remarks
   * Honors the `retry-after` header when present (seconds or date).
   * Falls back to exponential backoff:
   * `min(initialDelay * multiplier^attempt, maxDelay)`
   *
   * Adds jitter of +/- 20% to prevent thundering herd.
   */
  private computeDelay(attempt: number, response?: Response): number {
    // Check retry-after header
    const retryAfter = response?.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!isNaN(seconds)) {
        return Math.min(seconds * 1000, this.maxRetryDelay);
      }
      // Could be a date — parse it
      const date = new Date(retryAfter);
      if (!isNaN(date.getTime())) {
        return Math.min(Math.max(date.getTime() - Date.now(), 0), this.maxRetryDelay);
      }
    }

    // Exponential backoff with jitter
    const base = this.initialRetryDelay * Math.pow(this.backoffMultiplier, attempt);
    const capped = Math.min(base, this.maxRetryDelay);
    const jitter = capped * (0.8 + Math.random() * 0.4); // +/- 20%
    return Math.round(jitter);
  }

  /**
   * Sleep for the given duration, aborting early if the signal fires.
   */
  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(signal.reason);
        return;
      }
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true }
      );
    });
  }
}
