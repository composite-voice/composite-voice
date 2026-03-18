/**
 * Audio header caching for WebSocket reconnection scenarios.
 *
 * @remarks
 * This module provides the {@link AudioHeaderCache} class, which accumulates
 * the first bytes of an audio stream until it has enough data to detect the
 * container format (via {@link detectAudioFormat}) and extract the header
 * (via {@link extractHeader}). The cached header can then be re-injected into
 * a new WebSocket connection after a reconnection, allowing the remote STT
 * service to continue parsing audio frames without losing context.
 *
 * ```
 * ┌────────────┐    process(chunk)    ┌──────────────────┐
 * │  Audio     │ ──────────────────▶  │ AudioHeaderCache  │
 * │  Stream    │                      │                   │
 * └────────────┘                      │  accumulate until │
 *                                     │  ≥12 bytes, then  │
 *       ┌─────────────────────────────│  detect + extract │
 *       │   getHeader()               │  header           │
 *       ▼                             └──────────────────┘
 * ┌────────────┐
 * │  Cached    │  Re-inject on
 * │  Header    │  WebSocket reconnect
 * └────────────┘
 * ```
 *
 * Based on the streaming accumulation pattern described in `magic-frame-detection.md`.
 *
 * @example
 * ```typescript
 * import { AudioHeaderCache } from 'composite-voice';
 *
 * const cache = new AudioHeaderCache();
 *
 * // Feed audio chunks as they arrive
 * inputProvider.onAudio((chunk) => {
 *   cache.process(chunk.data);
 *   stt.sendAudio(chunk.data);
 * });
 *
 * // On reconnection, re-inject the cached header
 * websocket.onReconnect(() => {
 *   const header = cache.getHeader();
 *   if (header) {
 *     websocket.send(header);
 *   }
 * });
 *
 * // Reset when starting a new stream
 * cache.reset();
 * ```
 *
 * @see {@link detectAudioFormat} for format detection via magic bytes
 * @see {@link extractHeader} for format-specific header extraction
 * @see {@link AudioBufferQueue} for the bounded FIFO queue between pipeline stages
 *
 * @packageDocumentation
 */

import {
  type DetectedAudioFormat,
  MIN_SNIFF_BYTES,
  detectAudioFormat,
  extractHeader,
} from '../../utils/audioFormat';

/**
 * Caches the audio container header from a stream for re-injection on reconnect.
 *
 * @remarks
 * The cache operates in two phases:
 *
 * 1. **Accumulation phase** — Chunks are concatenated into an internal buffer
 *    until {@link MIN_SNIFF_BYTES} (12) bytes have been accumulated. During this
 *    phase, {@link getHeader} returns `null`.
 *
 * 2. **Resolved phase** — Once enough bytes are available, the format is detected
 *    and the header is extracted and cached. Subsequent calls to {@link process}
 *    are no-ops (the header is already captured). {@link getHeader} returns the
 *    cached header (or `null` if the format has no extractable header, e.g. MP3).
 *
 * Call {@link reset} to return to the accumulation phase for a new stream.
 *
 * @example
 * ```typescript
 * const cache = new AudioHeaderCache();
 *
 * // Phase 1: accumulate
 * cache.process(smallChunk1); // < 12 bytes total
 * cache.getHeader(); // null (still accumulating)
 *
 * // Phase 2: resolved
 * cache.process(smallChunk2); // ≥ 12 bytes total now
 * cache.getHeader(); // ArrayBuffer (WAV header, etc.) or null (PCM/MP3)
 * cache.getFormat(); // 'wav', 'ogg', etc. or null
 *
 * // Reset for a new stream
 * cache.reset();
 * ```
 *
 * @see {@link detectAudioFormat} for the detection function used internally
 * @see {@link extractHeader} for the extraction function used internally
 */
export class AudioHeaderCache {
  /** Accumulation buffer for the initial bytes of a stream. */
  private accumulationBuffer: Uint8Array | null = null;

  /** The detected audio format, or `null` if not yet resolved / raw PCM. */
  private format: DetectedAudioFormat | null = null;

  /** The extracted container header, or `null` if not extractable. */
  private header: ArrayBuffer | null = null;

  /** Whether the cache has completed format detection. */
  private resolved = false;

  /**
   * Processes an incoming audio chunk.
   *
   * @remarks
   * During the accumulation phase, the chunk's bytes are appended to an internal
   * buffer. Once the buffer reaches {@link MIN_SNIFF_BYTES} bytes, the format is
   * detected and the header is extracted. After resolution, further calls are no-ops.
   *
   * @param chunk - Raw audio data from the input provider.
   */
  process(chunk: ArrayBuffer): void {
    if (this.resolved) {
      return;
    }

    // Append to accumulation buffer
    const incoming = new Uint8Array(chunk);
    if (this.accumulationBuffer === null) {
      this.accumulationBuffer = new Uint8Array(incoming);
    } else {
      const combined = new Uint8Array(this.accumulationBuffer.byteLength + incoming.byteLength);
      combined.set(this.accumulationBuffer, 0);
      combined.set(incoming, this.accumulationBuffer.byteLength);
      this.accumulationBuffer = combined;
    }

    // Check if we have enough bytes to sniff
    if (this.accumulationBuffer.byteLength < MIN_SNIFF_BYTES) {
      return;
    }

    // Resolve: detect format and extract header
    this.resolved = true;
    const accumulated = this.accumulationBuffer.buffer as ArrayBuffer;
    this.format = detectAudioFormat(accumulated);

    if (this.format) {
      this.header = extractHeader(accumulated, this.format);
    }

    // Release the accumulation buffer — no longer needed
    this.accumulationBuffer = null;
  }

  /**
   * Returns the cached container header for re-injection on reconnect.
   *
   * @remarks
   * Returns `null` in these cases:
   * - The cache is still accumulating bytes (not yet resolved)
   * - The detected format has no extractable header (MP3, AAC, raw PCM)
   * - The buffer was too small to contain the header
   *
   * @returns The cached header as an `ArrayBuffer`, or `null`.
   */
  getHeader(): ArrayBuffer | null {
    return this.header;
  }

  /**
   * Returns the detected audio format.
   *
   * @remarks
   * Returns `null` if the cache hasn't resolved yet or the format is raw PCM / unknown.
   *
   * @returns The detected format, or `null`.
   *
   * @see {@link DetectedAudioFormat}
   */
  getFormat(): DetectedAudioFormat | null {
    return this.format;
  }

  /**
   * Returns whether the cache has finished format detection.
   *
   * @returns `true` if the cache has resolved (format detected or PCM fallback).
   */
  isResolved(): boolean {
    return this.resolved;
  }

  /**
   * Resets the cache for a new audio stream.
   *
   * @remarks
   * Clears the accumulated buffer, detected format, and cached header. The cache
   * returns to the accumulation phase and will re-detect the format from the next
   * stream's initial bytes.
   */
  reset(): void {
    this.accumulationBuffer = null;
    this.format = null;
    this.header = null;
    this.resolved = false;
  }
}
