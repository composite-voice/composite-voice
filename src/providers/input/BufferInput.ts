/**
 * Server-side audio input provider for pushing pre-recorded or streamed audio.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link BufferInput} class, which implements the
 * {@link AudioInputProvider} interface for environments without browser APIs
 * (Node.js, Bun, Deno). Instead of capturing audio from a microphone,
 * `BufferInput` exposes a {@link BufferInput.push | push()} method that allows
 * the application to feed audio data into the pipeline programmatically.
 *
 * `BufferInput` is a single-role provider (`'input'`) and has zero browser
 * dependencies — it does not reference `navigator`, `window`, `AudioContext`,
 * or any Web API.
 *
 * **Data-flow diagram:**
 *
 * ```
 * Application code ──push(data)──> [BufferInput] ──onAudio()──> InputQueue ──> [STT]
 *                                       |
 *                                  getMetadata()
 *                                       |
 *                                       v
 *                              AudioMetadata (user-specified)
 * ```
 *
 * Audio chunks pushed before {@link BufferInput.start | start()} is called are
 * silently dropped. The upstream {@link AudioBufferQueue} handles buffering
 * between the input and STT stages, so double-buffering inside `BufferInput`
 * would be wasteful.
 *
 * @example
 * ```typescript
 * import { BufferInput, DeepgramSTT, AnthropicLLM, NullOutput } from 'composite-voice';
 * import { readFileSync } from 'node:fs';
 *
 * const input = new BufferInput({
 *   sampleRate: 16000,
 *   encoding: 'linear16',
 *   channels: 1,
 *   bitDepth: 16,
 * });
 *
 * const voice = new CompositeVoice({
 *   providers: [input, new DeepgramSTT({ apiKey }), new AnthropicLLM({ apiKey }), new NullOutput()],
 * });
 *
 * await voice.initialize();
 * await voice.startListening();
 *
 * // Push audio from a file, WebSocket, or any other source
 * const pcmData = readFileSync('audio.raw');
 * input.push(pcmData.buffer);
 * ```
 *
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link MicrophoneInput} for the browser-side counterpart
 * @see {@link NullOutput} for the server-side output counterpart
 */

import type { AudioChunk, AudioMetadata } from '../../core/types/audio';
import type { AudioInputProvider, ProviderType } from '../../core/types/providers';
import type { ProviderRole } from '../../core/types/roles';

/**
 * Server-side audio input provider that accepts pushed audio buffers.
 *
 * @remarks
 * `BufferInput` allows server-side applications to feed audio data into the
 * CompositeVoice pipeline without any browser dependencies. The application
 * pushes raw audio via {@link BufferInput.push | push()}, and `BufferInput`
 * wraps each buffer into an {@link AudioChunk} with a timestamp and sequence
 * number before delivering it to the registered callback.
 *
 * The audio format is declared up-front in the constructor via
 * {@link AudioMetadata}, enabling the pipeline to auto-configure STT
 * encoding/sample-rate settings without needing to sniff audio frames.
 *
 * **Data-flow diagram:**
 *
 * ```
 * app.push(data) ──> BufferInput ──callback(chunk)──> InputQueue ──> STT
 *                        |
 *                  active=true?
 *                    yes: emit
 *                    no:  drop
 * ```
 *
 * @example
 * ```typescript
 * import { BufferInput } from 'composite-voice';
 * import { createReadStream } from 'node:fs';
 *
 * const input = new BufferInput({
 *   sampleRate: 16000,
 *   encoding: 'linear16',
 *   channels: 1,
 *   bitDepth: 16,
 * });
 *
 * await input.initialize();
 * input.onAudio((chunk) => {
 *   console.log(`Received ${chunk.data.byteLength} bytes, seq=${chunk.sequence}`);
 * });
 * input.start();
 *
 * // Stream audio from a file
 * const stream = createReadStream('audio.raw', { highWaterMark: 4096 });
 * stream.on('data', (buf: Buffer) => input.push(buf.buffer));
 * ```
 *
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link MicrophoneInput} for the browser-side counterpart
 * @see {@link NullOutput} for the server-side output counterpart
 */
export class BufferInput implements AudioInputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `BufferInput` uses `'rest'` because it does not maintain a persistent
   * connection — audio is pushed imperatively by the application.
   */
  public readonly type: ProviderType = 'rest';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `BufferInput` is a single-role provider covering only the `'input'` slot.
   * It requires a separate STT provider for the `'stt'` role.
   */
  public readonly roles: readonly ProviderRole[] = ['input'];

  /** Audio format metadata provided at construction time. */
  private readonly metadata: AudioMetadata;

  /** Whether this provider has been initialized. */
  private initialized = false;

  /** Whether the provider is actively accepting and emitting audio. */
  private active = false;

  /** Whether the provider is paused. */
  private paused = false;

  /** Registered callback for audio chunks. */
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;

  /** Monotonically increasing sequence number for emitted chunks. */
  private sequenceNumber = 0;

  /**
   * Creates a new `BufferInput` instance.
   *
   * @remarks
   * The `metadata` parameter declares the audio format that will be pushed
   * via {@link BufferInput.push | push()}. This metadata is returned by
   * {@link BufferInput.getMetadata | getMetadata()} and used by the pipeline
   * to auto-configure the downstream STT provider.
   *
   * @param metadata - Format description for the audio that will be pushed.
   *   Must include at least `sampleRate`, `encoding`, and `channels`.
   *
   * @example
   * ```typescript
   * const input = new BufferInput({
   *   sampleRate: 16000,
   *   encoding: 'linear16',
   *   channels: 1,
   *   bitDepth: 16,
   * });
   * ```
   */
  constructor(metadata: AudioMetadata) {
    this.metadata = { ...metadata };
  }

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Initialize the provider, making it ready to accept audio.
   *
   * @remarks
   * A no-op beyond setting the initialized flag, since `BufferInput` has no
   * external resources to acquire. If already initialized, this is a no-op.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  /**
   * Dispose of the provider and release all resources.
   *
   * @remarks
   * Stops accepting audio, clears the callback reference, and resets
   * the sequence counter. After disposal the instance should not be reused.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) return;
    this.active = false;
    this.paused = false;
    this.audioCallback = null;
    this.sequenceNumber = 0;
    this.initialized = false;
  }

  /**
   * Check whether the provider has been initialized.
   *
   * @returns `true` when {@link initialize} has completed and {@link dispose}
   *   has not yet been called.
   */
  isReady(): boolean {
    return this.initialized;
  }

  // ── AudioInputProvider interface ─────────────────────────────────

  /**
   * Start accepting and emitting audio chunks.
   *
   * @remarks
   * After calling `start()`, audio pushed via {@link BufferInput.push | push()}
   * will be delivered to the callback registered with
   * {@link BufferInput.onAudio | onAudio()}. Must be called after
   * {@link BufferInput.initialize | initialize()}.
   */
  start(): void {
    this.active = true;
    this.paused = false;
  }

  /**
   * Stop accepting audio and cease emitting chunks.
   *
   * @remarks
   * Audio pushed after `stop()` is silently dropped. The provider can be
   * restarted with {@link BufferInput.start | start()}.
   */
  stop(): void {
    this.active = false;
    this.paused = false;
  }

  /**
   * Temporarily pause audio emission without stopping the provider.
   *
   * @remarks
   * Audio pushed while paused is silently dropped. Resume with
   * {@link BufferInput.resume | resume()}.
   */
  pause(): void {
    if (this.active) {
      this.paused = true;
    }
  }

  /**
   * Resume audio emission after a pause.
   *
   * @see {@link BufferInput.pause | pause}
   */
  resume(): void {
    if (this.active) {
      this.paused = false;
    }
  }

  /**
   * Check whether the provider is actively emitting audio.
   *
   * @returns `true` when started and not paused.
   */
  isActive(): boolean {
    return this.active && !this.paused;
  }

  /**
   * Register a callback to receive audio chunks.
   *
   * @remarks
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback. Must be called before
   * {@link BufferInput.start | start()}.
   *
   * @param callback - Function invoked with each {@link AudioChunk} when
   *   audio is pushed and the provider is active.
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Get the audio format metadata for the audio being pushed.
   *
   * @remarks
   * Returns the metadata provided at construction time. Used by the pipeline
   * to auto-configure STT encoding, sample rate, and channel settings via
   * `configureSTTFromMetadata()`.
   *
   * @returns A copy of the {@link AudioMetadata} provided to the constructor.
   */
  getMetadata(): AudioMetadata {
    return { ...this.metadata };
  }

  // ── Public API (not part of AudioInputProvider) ──────────────────

  /**
   * Push raw audio data into the pipeline.
   *
   * @remarks
   * Wraps the raw `ArrayBuffer` into an {@link AudioChunk} with a timestamp
   * and monotonically increasing sequence number, then delivers it to the
   * registered callback. If the provider is not active (not started, stopped,
   * or paused), the data is silently dropped.
   *
   * @param data - Raw audio bytes matching the format declared in the
   *   constructor's {@link AudioMetadata}.
   *
   * @example
   * ```typescript
   * // Push PCM audio from a Node.js Buffer
   * const pcmBuffer = Buffer.alloc(3200); // 100ms of 16kHz 16-bit mono
   * input.push(pcmBuffer.buffer);
   *
   * // Push from a WebSocket message
   * ws.on('message', (data: ArrayBuffer) => input.push(data));
   * ```
   */
  push(data: ArrayBuffer): void {
    if (!this.active || this.paused || !this.audioCallback) return;

    const chunk: AudioChunk = {
      data,
      timestamp: Date.now(),
      sequence: this.sequenceNumber++,
    };

    this.audioCallback(chunk);
  }
}
