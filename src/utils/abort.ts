/**
 * Shared abort-signal helpers used by all REST-based providers.
 *
 * @packageDocumentation
 *
 * @remarks
 * These tiny utilities eliminate the duplicated abort-check boilerplate that
 * previously appeared in every async generator across the LLM and TTS
 * providers. They pair naturally with the {@link HttpClient} and
 * {@link SSEParser} utilities.
 */

/**
 * Throw an `AbortError` if the signal has already been aborted.
 *
 * @remarks
 * Call this at the top of any async generator or long-running operation
 * to bail out early when the caller has already cancelled. The thrown
 * error follows the same shape browsers use for `AbortController.abort()`.
 *
 * @param signal - The abort signal to check, or `undefined` to skip.
 *
 * @throws `AbortError` when `signal.aborted` is `true`.
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('AbortError');
    err.name = 'AbortError';
    throw err;
  }
}

/**
 * Check whether an unknown error is an abort error.
 *
 * @remarks
 * Handles both the browser-native `DOMException` with name `'AbortError'`
 * and the plain `Error` shape used by this SDK and by Node's
 * `AbortController`.
 *
 * @param error - The error to inspect.
 * @returns `true` when the error represents an intentional abort.
 */
export function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * Re-throw an error as a normalized `AbortError` if the signal was aborted,
 * otherwise re-throw the original error.
 *
 * @remarks
 * Useful in catch blocks where the real cause of a fetch failure may be
 * masked (e.g., a `TypeError: network error` triggered by an aborted
 * request). When the signal is aborted, callers always see a clean
 * `AbortError` regardless of the underlying exception.
 *
 * @param error - The caught error.
 * @param signal - The abort signal to check.
 *
 * @throws `AbortError` when `signal.aborted` is `true`.
 * @throws The original `error` otherwise.
 */
export function rethrowIfAborted(error: unknown, signal?: AbortSignal): never {
  if (signal?.aborted || isAbortError(error)) {
    const err = new Error('AbortError');
    err.name = 'AbortError';
    throw err;
  }
  throw error;
}
