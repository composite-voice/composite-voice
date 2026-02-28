/**
 * Bounded FIFO audio buffer queue for the 5-role pipeline.
 *
 * @remarks
 * This module provides the {@link AudioBufferQueue} class — the key component
 * that fixes the race condition where Deepgram misses the first audio frames
 * because `stt.connect()` (WebSocket handshake) completes after
 * `audioCapture.start()` (getUserMedia + AudioContext setup).
 *
 * The queue sits between pipeline stages (e.g., between `AudioInputProvider`
 * and the STT provider, or between the TTS provider and `AudioOutputProvider`)
 * and operates in two modes:
 *
 * 1. **Buffering mode** (default) — Incoming chunks are stored in a bounded
 *    FIFO. When the queue is full, the configured overflow strategy determines
 *    whether the oldest or newest chunk is dropped.
 *
 * 2. **Draining mode** — Activated by {@link AudioBufferQueue.startDraining}.
 *    All buffered chunks are flushed immediately to the drain callback, then
 *    subsequent enqueues pass through directly (zero-copy fast path) without
 *    touching the internal buffer.
 *
 * ```
 * ┌──────────────┐   enqueue(chunk)   ┌──────────────────┐   startDraining(cb)
 * │  Input       │ ──────────────────▶ │ AudioBufferQueue  │ ──────────────────▶ STT
 * │  Provider    │                     │                   │
 * └──────────────┘                     │  Buffering mode:  │
 *                                      │  ┌─┬─┬─┬─┬─┬─┐   │
 *                                      │  │1│2│3│4│5│6│   │  (bounded FIFO)
 *                                      │  └─┴─┴─┴─┴─┴─┘   │
 *                                      │                   │
 *                                      │  Draining mode:   │
 *                                      │  enqueue → cb()   │  (zero-copy pass-through)
 *                                      └──────────────────┘
 * ```
 *
 * @example
 * ```typescript
 * import { AudioBufferQueue } from 'composite-voice';
 * import type { AudioChunk } from 'composite-voice';
 *
 * const queue = new AudioBufferQueue({ name: 'input', maxSize: 1000, overflowStrategy: 'drop-oldest' });
 *
 * // Phase 1: buffer while STT connects
 * inputProvider.onAudio((chunk: AudioChunk) => {
 *   queue.enqueue(chunk);
 * });
 *
 * // Phase 2: STT ready — flush buffered chunks and switch to pass-through
 * await stt.connect();
 * queue.startDraining((chunk) => stt.sendAudio(chunk.data));
 *
 * // Phase 3: pause/resume during turn-taking
 * queue.stopDraining();  // back to buffering
 * queue.startDraining((chunk) => stt.sendAudio(chunk.data)); // resume
 * ```
 *
 * @see {@link AudioBufferQueueConfig} for configuration options
 * @see {@link QueueStats} for observability metrics
 * @see {@link AudioHeaderCache} for header caching used alongside the queue
 *
 * @packageDocumentation
 */

import type { AudioChunk } from '../types/audio';
import type { AudioBufferQueueConfig } from '../types/config';

/**
 * Statistics snapshot from an {@link AudioBufferQueue} instance.
 *
 * @remarks
 * Returned by {@link AudioBufferQueue.getStats} for pipeline health monitoring.
 * All counters are cumulative since the queue was created (or since the last
 * {@link AudioBufferQueue.clear} call reset the buffer).
 *
 * @example
 * ```typescript
 * const stats = queue.getStats();
 * console.log(`Queue "${stats.name}": ${stats.size} chunks buffered, ${stats.totalDropped} dropped`);
 * if (stats.oldestChunkAge > 5000) {
 *   console.warn('Queue is backing up — oldest chunk is over 5 seconds old');
 * }
 * ```
 *
 * @see {@link AudioBufferQueue.getStats}
 */
export interface QueueStats {
  /**
   * Diagnostic name of the queue.
   *
   * @remarks
   * Matches the {@link AudioBufferQueueConfig.name} used to construct the queue.
   */
  name: string;

  /**
   * Current number of chunks in the buffer.
   *
   * @remarks
   * Always 0 when the queue is in draining mode (pass-through).
   */
  size: number;

  /**
   * Total number of chunks enqueued since creation.
   *
   * @remarks
   * Includes chunks that were subsequently dropped due to overflow, as well
   * as chunks that passed through directly in draining mode.
   */
  totalEnqueued: number;

  /**
   * Total number of chunks delivered to the drain callback.
   *
   * @remarks
   * Includes both buffered chunks flushed during {@link AudioBufferQueue.startDraining}
   * and chunks that passed through directly in draining mode.
   */
  totalDequeued: number;

  /**
   * Total number of chunks dropped due to overflow.
   *
   * @remarks
   * Only non-zero when the overflow strategy is `'drop-oldest'` or `'drop-newest'`
   * and the queue reached its {@link AudioBufferQueueConfig.maxSize | maxSize}.
   */
  totalDropped: number;

  /**
   * Age of the oldest chunk in the buffer, in milliseconds.
   *
   * @remarks
   * Calculated as `Date.now() - oldestChunk.timestamp`. Returns 0 when the
   * buffer is empty or the queue is in draining mode.
   */
  oldestChunkAge: number;
}

/**
 * Callback type for the drain consumer.
 *
 * @remarks
 * Invoked by {@link AudioBufferQueue} for each chunk when draining — both during
 * the initial flush of buffered chunks and for subsequent pass-through enqueues.
 *
 * @param chunk - The audio chunk to process.
 *
 * @see {@link AudioBufferQueue.startDraining}
 */
export type DrainCallback = (chunk: AudioChunk) => void;

/**
 * Bounded FIFO queue that buffers audio chunks between pipeline stages.
 *
 * @remarks
 * The queue is the primary mechanism for fixing the race condition where the
 * STT WebSocket handshake completes after audio capture has already started.
 * Audio chunks produced by the input provider are enqueued while the STT
 * connects, then flushed in order once the STT is ready.
 *
 * The queue supports three overflow strategies to handle situations where the
 * consumer is slow or disconnected for an extended period:
 *
 * - `'drop-oldest'` — Removes the oldest chunk when full (default). Best for
 *   real-time audio where recent frames are more valuable.
 * - `'drop-newest'` — Discards incoming chunks when full. Preserves the
 *   beginning of the stream.
 * - `'block'` — The enqueue call blocks (via promise) until space is available.
 *   Use with caution as it introduces backpressure.
 *
 * @example
 * ```typescript
 * const queue = new AudioBufferQueue({
 *   name: 'input',
 *   maxSize: 1000,
 *   overflowStrategy: 'drop-oldest',
 * });
 *
 * // Enqueue while waiting for STT
 * queue.enqueue(chunk1);
 * queue.enqueue(chunk2);
 * console.log(queue.size); // 2
 *
 * // STT connected — drain and switch to pass-through
 * queue.startDraining((chunk) => stt.sendAudio(chunk.data));
 * // chunk1 and chunk2 are flushed immediately
 * // subsequent enqueues pass through directly
 *
 * // Pause for turn-taking
 * queue.stopDraining();
 * // chunks buffer again until next startDraining()
 * ```
 *
 * @see {@link AudioBufferQueueConfig} for configuration
 * @see {@link QueueStats} for monitoring
 * @see {@link AudioHeaderCache} for companion header caching
 */
export class AudioBufferQueue {
  /** Internal FIFO buffer. */
  private readonly buffer: AudioChunk[] = [];

  /** Queue configuration. */
  private readonly config: AudioBufferQueueConfig;

  /** Whether the queue is in draining (pass-through) mode. */
  private draining = false;

  /** The drain callback, set by {@link startDraining}. */
  private drainCallback: DrainCallback | null = null;

  /** Cumulative count of chunks enqueued. */
  private enqueuedCount = 0;

  /** Cumulative count of chunks delivered to the drain callback. */
  private dequeuedCount = 0;

  /** Cumulative count of chunks dropped due to overflow. */
  private droppedCount = 0;

  /** Resolver for the `'block'` overflow strategy's pending promise. */
  private blockResolver: (() => void) | null = null;

  /**
   * Creates a new AudioBufferQueue.
   *
   * @param config - Queue configuration specifying name, max size, and overflow strategy.
   *
   * @example
   * ```typescript
   * const queue = new AudioBufferQueue({
   *   name: 'input',
   *   maxSize: 2000,
   *   overflowStrategy: 'drop-oldest',
   * });
   * ```
   *
   * @see {@link AudioBufferQueueConfig}
   */
  constructor(config: AudioBufferQueueConfig) {
    this.config = config;
  }

  /**
   * Enqueues an audio chunk into the buffer.
   *
   * @remarks
   * Behavior depends on the current mode:
   *
   * - **Draining mode:** The chunk is passed directly to the drain callback
   *   (zero-copy fast path) without touching the internal buffer.
   * - **Buffering mode:** The chunk is added to the FIFO buffer. If the buffer
   *   is full, the overflow strategy determines what happens:
   *   - `'drop-oldest'`: The oldest chunk is removed to make room.
   *   - `'drop-newest'`: The incoming chunk is discarded.
   *   - `'block'`: Returns a promise that resolves when space becomes available.
   *
   * @param chunk - The audio chunk to enqueue.
   * @returns `void` for `'drop-oldest'` and `'drop-newest'`; a `Promise<void>`
   *   for `'block'` when the queue is full (resolves when space is available).
   */
  enqueue(chunk: AudioChunk): void | Promise<void> {
    this.enqueuedCount++;

    // Fast path: draining mode — pass through directly
    if (this.draining && this.drainCallback) {
      this.dequeuedCount++;
      this.drainCallback(chunk);
      return;
    }

    // Buffering mode: check overflow
    if (this.buffer.length >= this.config.maxSize) {
      switch (this.config.overflowStrategy) {
        case 'drop-oldest':
          this.buffer.shift();
          this.droppedCount++;
          break;

        case 'drop-newest':
          this.droppedCount++;
          return;

        case 'block':
          return new Promise<void>((resolve) => {
            this.blockResolver = resolve;
          });
      }
    }

    this.buffer.push(chunk);
  }

  /**
   * Starts draining the queue: flushes all buffered chunks, then switches to
   * pass-through mode.
   *
   * @remarks
   * This is the key method for the race condition fix. Call it after the STT
   * WebSocket handshake completes to receive all chunks that were buffered
   * during the connection attempt, followed by real-time pass-through of
   * subsequent chunks.
   *
   * The flush is synchronous — all buffered chunks are delivered to the
   * callback in FIFO order before this method returns. After flushing, the
   * queue enters draining mode where {@link enqueue} passes chunks directly
   * to the callback.
   *
   * If the queue is already draining, calling this method replaces the
   * existing callback.
   *
   * @param callback - Function to call for each chunk (buffered and future).
   *
   * @example
   * ```typescript
   * // Buffer 5 chunks while STT connects
   * for (const chunk of chunks) queue.enqueue(chunk);
   *
   * // STT ready — flush all 5 and switch to pass-through
   * await stt.connect();
   * queue.startDraining((chunk) => stt.sendAudio(chunk.data));
   * ```
   *
   * @see {@link stopDraining} to return to buffering mode
   */
  startDraining(callback: DrainCallback): void {
    this.drainCallback = callback;
    this.draining = true;

    // Flush all buffered chunks synchronously
    while (this.buffer.length > 0) {
      const chunk = this.buffer.shift()!;
      this.dequeuedCount++;
      callback(chunk);
    }

    // Resolve any blocked enqueue
    if (this.blockResolver) {
      this.blockResolver();
      this.blockResolver = null;
    }
  }

  /**
   * Stops draining and returns the queue to buffering mode.
   *
   * @remarks
   * After calling this method, subsequent {@link enqueue} calls will buffer
   * chunks internally instead of passing them to the drain callback. The drain
   * callback is cleared.
   *
   * This is used during turn-taking: when the agent starts speaking, the
   * orchestrator stops draining the input queue (pauses STT) and resumes
   * draining when the agent finishes.
   *
   * @see {@link startDraining} to resume draining
   */
  stopDraining(): void {
    this.draining = false;
    this.drainCallback = null;
  }

  /**
   * Returns the first chunk in the buffer without removing it.
   *
   * @remarks
   * Returns `undefined` if the buffer is empty or the queue is in draining mode
   * (since the buffer is empty in draining mode).
   *
   * @returns The oldest chunk in the buffer, or `undefined`.
   */
  peek(): AudioChunk | undefined {
    return this.buffer[0];
  }

  /**
   * Current number of chunks in the buffer.
   *
   * @remarks
   * Always 0 when the queue is in draining mode (pass-through).
   */
  get size(): number {
    return this.buffer.length;
  }

  /**
   * Removes all chunks from the buffer and resets the block resolver.
   *
   * @remarks
   * Does not affect the draining state or counters. Chunks removed by
   * `clear()` are not counted as dropped — they are simply discarded.
   * Use this when stopping the pipeline to release memory.
   */
  clear(): void {
    this.buffer.length = 0;

    // Resolve any blocked enqueue so it doesn't hang forever
    if (this.blockResolver) {
      this.blockResolver();
      this.blockResolver = null;
    }
  }

  /**
   * Returns a snapshot of queue statistics for monitoring.
   *
   * @remarks
   * The returned {@link QueueStats} object is a snapshot — it does not update
   * as the queue changes. Call this method again for fresh stats.
   *
   * @returns A {@link QueueStats} snapshot.
   *
   * @example
   * ```typescript
   * const stats = queue.getStats();
   * if (stats.totalDropped > 0) {
   *   console.warn(`Queue "${stats.name}" dropped ${stats.totalDropped} chunks`);
   * }
   * ```
   */
  getStats(): QueueStats {
    const oldest = this.buffer[0];
    const oldestChunkAge = oldest ? Date.now() - oldest.timestamp : 0;

    return {
      name: this.config.name,
      size: this.buffer.length,
      totalEnqueued: this.enqueuedCount,
      totalDequeued: this.dequeuedCount,
      totalDropped: this.droppedCount,
      oldestChunkAge,
    };
  }

  /**
   * Whether the queue is currently in draining (pass-through) mode.
   *
   * @returns `true` if {@link startDraining} has been called and
   *   {@link stopDraining} has not been called since.
   */
  isDraining(): boolean {
    return this.draining;
  }
}
