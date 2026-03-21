/**
 * Server-Sent Events (SSE) stream parser for streaming LLM responses.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides a lightweight async generator that parses an SSE
 * byte stream (from a `fetch` `Response.body`) into structured events.
 * It replaces the SSE parsing previously handled internally by the
 * `@anthropic-ai/sdk` and `openai` packages.
 *
 * The parser follows the {@link https://html.spec.whatwg.org/multipage/server-sent-events.html | W3C SSE specification}:
 * - Lines starting with `:` are comments (ignored).
 * - Empty lines dispatch the current event.
 * - `data:`, `event:`, and `id:` fields are accumulated per event.
 * - Multiple `data:` lines within one event are joined with `\n`.
 * - The `[DONE]` sentinel (used by OpenAI-compatible APIs) terminates the stream.
 *
 * @example
 * ```ts
 * const response = await fetch(url, { method: 'POST', body, headers });
 * for await (const event of parseSSEStream(response.body!)) {
 *   const data = JSON.parse(event.data);
 *   // process data...
 * }
 * ```
 */

/**
 * A single parsed SSE event.
 */
export interface SSEEvent {
  /** The event type from the `event:` field, or `undefined` for default message events. */
  event?: string;
  /** The event payload from the `data:` field(s). Multiple `data:` lines are joined with `\n`. */
  data: string;
  /** The last event ID from the `id:` field, if present. */
  id?: string;
}

/**
 * Parse an SSE byte stream into structured events.
 *
 * @remarks
 * Reads from a `ReadableStream<Uint8Array>` (as returned by `fetch`
 * `Response.body`) and yields one {@link SSEEvent} per dispatched event.
 *
 * The generator terminates when:
 * - The stream ends (server closes the connection).
 * - A `data: [DONE]` sentinel is encountered (OpenAI convention).
 * - The optional `signal` is aborted.
 *
 * @param stream - The readable byte stream from a fetch response.
 * @param signal - Optional abort signal to cancel parsing early.
 * @yields Parsed SSE events in the order they arrive.
 */
export async function* parseSSEStream(
  stream: ReadableStream<Uint8Array>,
  signal?: AbortSignal
): AsyncGenerator<SSEEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // Current event being accumulated
  let eventType: string | undefined;
  let dataLines: string[] = [];
  let eventId: string | undefined;

  try {
    while (true) {
      if (signal?.aborted) break;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split('\n');
      // Keep the last (possibly incomplete) line in the buffer
      buffer = lines.pop()!;

      for (const line of lines) {
        if (signal?.aborted) break;

        if (line === '') {
          // Empty line = dispatch event
          if (dataLines.length > 0) {
            const data = dataLines.join('\n');

            // OpenAI-compatible APIs send [DONE] to signal end of stream
            if (data === '[DONE]') return;

            yield {
              ...(eventType !== undefined ? { event: eventType } : {}),
              data,
              ...(eventId !== undefined ? { id: eventId } : {}),
            };
          }
          // Reset for next event
          eventType = undefined;
          dataLines = [];
          eventId = undefined;
        } else if (line.startsWith(':')) {
          // Comment line — ignore
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        } else if (line.startsWith('event:')) {
          eventType = line.slice(6).trimStart();
        } else if (line.startsWith('id:')) {
          eventId = line.slice(3).trimStart();
        }
        // Other fields (retry:, etc.) are ignored — not needed for LLM streaming
      }
    }

    // Flush any remaining buffered event
    if (dataLines.length > 0) {
      const data = dataLines.join('\n');
      if (data !== '[DONE]') {
        yield {
          ...(eventType !== undefined ? { event: eventType } : {}),
          data,
          ...(eventId !== undefined ? { id: eventId } : {}),
        };
      }
    }
  } finally {
    reader.releaseLock();
  }
}
