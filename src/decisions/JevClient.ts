/**
 * Dependency-free HTTP client for TypeSafe's Jev System One API.
 *
 * @remarks
 * Jev returns typed decisions and does not fill an LLM pipeline role. Use it
 * from application code or through {@link createJevGuardrail} before TTS.
 *
 * @see https://api.typesafe.ai/docs
 * @packageDocumentation
 */

import type { JevQuestions, JevRequest, JevResponse } from './types';
import { validateJevQuestions, validateJevResponse } from './validation';

/** Connection settings for {@link JevClient}. */
export interface JevClientOptions {
  /** TypeSafe key. Use only on your server; use proxyUrl in a browser. */
  apiKey?: string;
  /** Full URL of your application's Jev proxy endpoint. No API key is sent. */
  proxyUrl?: string;
  /** Model name or alias from TypeSafe's GET /v1/models. @defaultValue 'jev-latest' */
  model?: string;
  /** Request timeout, including response parsing. Zero disables it. @defaultValue 10000 */
  timeoutMs?: number;
  /** Override fetch for testing or an authenticated application proxy. */
  fetch?: typeof fetch;
}

/** HTTP failure without echoing potentially sensitive upstream response text. */
export class JevAPIError extends Error {
  constructor(public readonly status: number) {
    super(`Jev request failed (HTTP ${status})`);
    this.name = 'JevAPIError';
  }
}

/**
 * Evaluates named questions against structured state using the native API.
 *
 * @example
 * ```typescript
 * const jev = new JevClient({ apiKey: process.env.TYPESAFE_API_KEY! });
 * const result = await jev.evaluate({
 *   state: 'Please connect me to a person.',
 *   questions: { handoff: { type: 'noul', instructions: 'Is a human requested?' } },
 * });
 * console.log(result.answers.handoff.noul);
 * ```
 */
export class JevClient {
  private readonly options: JevClientOptions;

  constructor(options: JevClientOptions) {
    if (!options.proxyUrl?.trim() && !options.apiKey?.trim()) {
      throw new Error('Jev requires an apiKey or proxyUrl');
    }
    if (options.proxyUrl !== undefined && !options.proxyUrl.trim()) {
      throw new Error('Jev proxyUrl must not be empty');
    }
    if (options.model !== undefined && !options.model.trim()) {
      throw new Error('Jev model must not be empty');
    }
    const timeoutMs = options.timeoutMs ?? 10000;
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 2147483647) {
      throw new Error('Jev timeoutMs must be between 0 and 2147483647');
    }
    this.options = { ...options, timeoutMs };
  }

  /**
   * Evaluate a batch of questions with matching, type-inferred answers.
   *
   * @remarks
   * HTTP errors, malformed responses, timeouts, and cancellation reject.
   * Requests are not retried automatically, keeping latency bounded.
   */
  async evaluate<const Q extends JevQuestions>(
    request: JevRequest<Q>,
    options: { signal?: AbortSignal | undefined } = {}
  ): Promise<JevResponse<Q>> {
    validateJevQuestions(request.questions);
    const model = request.model ?? this.options.model ?? 'jev-latest';
    if (!model.trim()) throw new Error('Jev model must not be empty');
    const body = JSON.stringify({ model, state: request.state, questions: request.questions });
    // Validate against the sent snapshot even if the caller later mutates its questions.
    const sent = JSON.parse(body) as { questions: Q };
    validateJevQuestions(sent.questions);
    const controller = new AbortController();
    const abort = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abort();
    else options.signal?.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      controller.signal.throwIfAborted();
      if (this.options.timeoutMs) {
        timer = setTimeout(
          () => controller.abort(new DOMException('Jev request timed out', 'TimeoutError')),
          this.options.timeoutMs
        );
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (!this.options.proxyUrl) headers.Authorization = `Bearer ${this.options.apiKey}`;
      const fetcher = this.options.fetch ?? globalThis.fetch;
      const response = await fetcher(
        this.options.proxyUrl ?? 'https://api.typesafe.ai/v1/systemone',
        {
          method: 'POST',
          headers,
          body,
          signal: controller.signal,
        }
      );
      controller.signal.throwIfAborted();
      if (!response.ok) throw new JevAPIError(response.status);
      const result: unknown = await response.json();
      controller.signal.throwIfAborted();
      validateJevResponse(result, sent.questions);
      return result;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
    }
  }
}
