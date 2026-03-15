/**
 * Lightweight counting semaphore for LLM→TTS backpressure.
 *
 * @remarks
 * Tracks how many text chunks have been sent to a Live TTS provider but not
 * yet acknowledged (via audio or metadata callbacks). When the count reaches
 * {@link maxPendingChunks}, the {@link waitForCapacity} method blocks until
 * a chunk is acknowledged via {@link release}.
 *
 * This is intentionally simple — a counting semaphore, not a queue. No data
 * is stored; only a count is maintained. The LLM streaming loop calls
 * {@link waitForCapacity} before each `sendText()`, and the TTS `onAudio`
 * callback calls {@link release} for each audio chunk received.
 *
 * @example
 * ```typescript
 * const bp = new TTSBackpressure(5);
 *
 * for await (const chunk of llmStream) {
 *   await bp.waitForCapacity();  // blocks if 5 chunks are pending
 *   tts.sendText(chunk);
 *   bp.acquire();                // increment pending count
 * }
 *
 * // In TTS onAudio callback:
 * tts.onAudio(() => bp.release());
 * ```
 *
 * @packageDocumentation
 */

/**
 * A counting semaphore that provides backpressure between the LLM and TTS
 * pipeline stages.
 *
 * @see {@link CompositeVoiceConfig.pipeline} for the `maxPendingChunks` config
 */
export class TTSBackpressure {
  /** Current count of pending (unacknowledged) chunks. */
  private pending = 0;

  /** Resolve function for the current waiter, if any. */
  private waiterResolve: (() => void) | null = null;

  /**
   * Creates a new backpressure controller.
   *
   * @param maxPendingChunks - Maximum number of unacknowledged chunks before
   *   blocking. Must be a positive integer.
   */
  constructor(private readonly maxPendingChunks: number) {}

  /**
   * Increment the pending chunk count.
   *
   * @remarks
   * Call this immediately after sending a text chunk to the TTS provider.
   */
  acquire(): void {
    this.pending++;
  }

  /**
   * Decrement the pending chunk count and unblock any waiting sender.
   *
   * @remarks
   * Call this when the TTS provider acknowledges a chunk (e.g., emits an
   * audio chunk or metadata). If the count drops below the limit and a
   * sender is waiting, the sender is unblocked.
   *
   * Safe to call even when pending is 0 (no-op).
   */
  release(): void {
    if (this.pending > 0) {
      this.pending--;
    }
    if (this.pending < this.maxPendingChunks && this.waiterResolve) {
      const resolve = this.waiterResolve;
      this.waiterResolve = null;
      resolve();
    }
  }

  /**
   * Wait until there is capacity to send another chunk.
   *
   * @remarks
   * If the current pending count is below the limit, resolves immediately.
   * Otherwise, returns a Promise that resolves when {@link release} brings
   * the count below the limit.
   *
   * @returns A Promise that resolves when it is safe to send the next chunk.
   */
  async waitForCapacity(): Promise<void> {
    if (this.pending < this.maxPendingChunks) {
      return;
    }
    return new Promise<void>((resolve) => {
      this.waiterResolve = resolve;
    });
  }

  /**
   * Reset the backpressure state.
   *
   * @remarks
   * Clears the pending count and resolves any waiting sender. Call this
   * when the pipeline is stopped, interrupted (barge-in), or reset.
   */
  reset(): void {
    this.pending = 0;
    if (this.waiterResolve) {
      const resolve = this.waiterResolve;
      this.waiterResolve = null;
      resolve();
    }
  }

  /**
   * Current number of pending (unacknowledged) chunks.
   */
  get pendingCount(): number {
    return this.pending;
  }
}
