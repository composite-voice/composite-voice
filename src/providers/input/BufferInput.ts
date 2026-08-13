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
 * The audio format may be declared in the constructor or left to magic-byte
 * detection — see {@link BufferInput.detectFormat | detectFormat()} and
 * {@link BufferInputOptions.autoDetect | autoDetect}.
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
import {
  type DetectedAudioFormat,
  type ParsedAudioMetadata,
  MAX_SNIFF_BYTES,
  MIN_SNIFF_BYTES,
  detectAudioFormat,
  getDetectedFormatMimeType,
  parseAudioMetadata,
} from '../../utils/audioFormat';

/**
 * Fallback audio format used when nothing is declared and nothing is detected.
 *
 * @remarks
 * Raw PCM has no magic bytes, so a buffer that matches no container signature is
 * assumed to be 16 kHz mono linear16 — the format browser capture pipelines and
 * telephony bridges produce, and what most streaming STT services expect.
 *
 * @internal
 */
const DEFAULT_METADATA: AudioMetadata = {
  sampleRate: 16000,
  encoding: 'linear16',
  channels: 1,
  bitDepth: 16,
};

/**
 * Options controlling {@link BufferInput} behaviour beyond the audio format.
 *
 * @see {@link BufferInput} for the provider these configure
 */
export interface BufferInputOptions {
  /**
   * Whether to detect the audio format from the bytes pushed into the provider.
   *
   * @remarks
   * When enabled, `BufferInput` sniffs the start of the stream for a container
   * signature (WAV, OGG, MP3, FLAC, WebM, …) and fills in any format fields the
   * constructor did not declare. Explicitly declared fields always win, so
   * detection can only add information, never override it.
   *
   * Disable it to keep {@link BufferInput.getMetadata | getMetadata()} fixed at
   * the declared values regardless of what is pushed.
   *
   * @defaultValue true
   */
  autoDetect?: boolean;
}

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
 * The audio format can be declared up-front in the constructor via
 * {@link AudioMetadata}, letting the pipeline auto-configure STT
 * encoding/sample-rate settings. Anything left undeclared is filled in by
 * magic-byte detection on the pushed bytes, so a pipeline can accept an
 * arbitrary WAV, OGG, or MP3 buffer with no format configuration at all.
 *
 * **Format resolution order** (first defined value wins):
 *
 * 1. Fields declared in the constructor
 * 2. Fields detected from the container header of the pushed audio
 * 3. Raw-PCM defaults — 16 kHz, mono, `linear16`
 *
 * **Detection timing matters.** The pipeline reads
 * {@link BufferInput.getMetadata | getMetadata()} while `startListening()` runs,
 * which is *before* the first {@link BufferInput.push | push()}. To have detected
 * values reach the STT provider, sniff the head of the stream with
 * {@link BufferInput.detectFormat | detectFormat()} before starting the pipeline.
 * Detection during `push()` still updates `getMetadata()` and fires
 * {@link BufferInput.onFormatDetected | onFormatDetected()}, but arrives too late
 * to configure an STT provider that has already connected.
 *
 * **Data-flow diagram:**
 *
 * ```
 * app.push(data) ──> BufferInput ──callback(chunk)──> InputQueue ──> STT
 *                        |
 *                  active=true?
 *                    yes: emit + sniff format
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
 * @example
 * ```typescript
 * // No format declared — sniff the file header, then let the pipeline configure
 * // the STT provider from what was found.
 * import { readFileSync } from 'node:fs';
 *
 * const audio = readFileSync('speech.wav');
 * const input = new BufferInput();
 *
 * input.detectFormat(audio.buffer);
 * // => { sampleRate: 16000, encoding: 'linear16', channels: 1, bitDepth: 16,
 * //      mimeType: 'audio/wav' }
 *
 * await voice.startListening();
 * input.push(audio.buffer);
 * ```
 *
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link BufferInputOptions} for the detection toggle
 * @see {@link detectAudioFormat} for the underlying magic-byte detection
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

  /** Audio format fields explicitly declared at construction time. */
  private readonly declared: Partial<AudioMetadata>;

  /** Whether pushed audio is sniffed for a container signature. */
  private readonly autoDetect: boolean;

  /** Format parameters recovered from the stream, or `null` if none were. */
  private detected: ParsedAudioMetadata | null = null;

  /** Whether detection has run to completion for the current stream. */
  private detectionResolved = false;

  /** Head of the stream, accumulated until it is long enough to parse. */
  private sniffBuffer: Uint8Array | null = null;

  /** Registered callback for format detection. */
  private formatCallback:
    | ((metadata: AudioMetadata, format: DetectedAudioFormat | null) => void)
    | null = null;

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
   * Every field is optional. Undeclared fields are filled in from the container
   * header of the pushed audio, falling back to 16 kHz mono `linear16` when the
   * stream carries no recognizable header. Declared fields are never overwritten
   * by detection, so partial declarations work: declare the sample rate you know
   * and let the container supply the rest.
   *
   * @param metadata - Format description for the audio that will be pushed.
   *   Omit it entirely to rely on detection.
   * @param options - Provider options — see {@link BufferInputOptions}.
   *
   * @example
   * ```typescript
   * // Fully declared — no detection needed
   * const input = new BufferInput({
   *   sampleRate: 16000,
   *   encoding: 'linear16',
   *   channels: 1,
   *   bitDepth: 16,
   * });
   *
   * // Undeclared — format comes from the pushed buffer's header
   * const sniffing = new BufferInput();
   *
   * // Declared format, detection off — pushed headers are ignored
   * const fixed = new BufferInput(
   *   { sampleRate: 8000, encoding: 'mulaw', channels: 1 },
   *   { autoDetect: false }
   * );
   * ```
   */
  constructor(metadata: Partial<AudioMetadata> = {}, options: BufferInputOptions = {}) {
    this.declared = { ...metadata };
    this.autoDetect = options.autoDetect ?? true;
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
   * Stops accepting audio, clears the callback references, discards any
   * detected format, and resets the sequence counter. After disposal the
   * instance should not be reused.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) return;
    this.active = false;
    this.paused = false;
    this.audioCallback = null;
    this.formatCallback = null;
    this.sequenceNumber = 0;
    this.resetDetection();
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
   * Merges three sources, in descending priority: the fields declared in the
   * constructor, the fields detected from the pushed stream's container header,
   * and the raw-PCM defaults (16 kHz mono `linear16`). The result therefore
   * changes once detection resolves, unless every field was declared.
   *
   * Used by the pipeline to auto-configure STT encoding, sample rate, and channel
   * settings via `configureSTTFromMetadata()`. That call happens during
   * `startListening()` — see the class remarks on detection timing.
   *
   * @returns The resolved {@link AudioMetadata} for the current stream.
   *
   * @see {@link BufferInput.detectFormat | detectFormat} to resolve detection early
   */
  getMetadata(): AudioMetadata {
    const detected = this.detected;

    // Detected compressed containers must not inherit the PCM default bit depth —
    // AudioMetadata leaves bitDepth undefined for formats that have no fixed one.
    const metadata: AudioMetadata =
      detected === null
        ? { ...DEFAULT_METADATA }
        : {
            sampleRate: detected.sampleRate ?? DEFAULT_METADATA.sampleRate,
            encoding: detected.encoding ?? DEFAULT_METADATA.encoding,
            channels: detected.channels ?? DEFAULT_METADATA.channels,
            ...(detected.bitDepth !== undefined ? { bitDepth: detected.bitDepth } : {}),
            mimeType: detected.mimeType,
          };

    // Declared fields always win over detected and default ones.
    const declared = this.declared;
    if (declared.sampleRate !== undefined) metadata.sampleRate = declared.sampleRate;
    if (declared.encoding !== undefined) metadata.encoding = declared.encoding;
    if (declared.channels !== undefined) metadata.channels = declared.channels;
    if (declared.bitDepth !== undefined) metadata.bitDepth = declared.bitDepth;
    if (declared.mimeType !== undefined) metadata.mimeType = declared.mimeType;

    return metadata;
  }

  /**
   * Get the container format detected from the pushed audio.
   *
   * @returns The detected {@link DetectedAudioFormat}, or `null` when detection
   *   has not resolved yet or the stream carries no recognizable container
   *   (raw PCM, or an unknown format).
   *
   * @see {@link BufferInput.isFormatResolved | isFormatResolved} to tell the two
   *   `null` cases apart
   */
  getDetectedFormat(): DetectedAudioFormat | null {
    return this.detected?.format ?? null;
  }

  /**
   * Check whether format detection has finished for the current stream.
   *
   * @returns `true` once enough bytes have been seen to settle on a format —
   *   including the raw-PCM fallback, where {@link BufferInput.getDetectedFormat |
   *   getDetectedFormat()} stays `null`.
   */
  isFormatResolved(): boolean {
    return this.detectionResolved;
  }

  /**
   * Register a callback fired when the audio format is detected.
   *
   * @remarks
   * Invoked once per stream, as soon as detection resolves — from either
   * {@link BufferInput.push | push()} or {@link BufferInput.detectFormat |
   * detectFormat()}. Only one callback can be registered at a time; subsequent
   * calls replace the previous one.
   *
   * The callback does not fire when `autoDetect` is disabled and
   * `detectFormat()` is never called.
   *
   * @param callback - Invoked with the resolved {@link AudioMetadata} and the
   *   detected container format, which is `null` for raw PCM and unknown formats.
   *
   * @example
   * ```typescript
   * input.onFormatDetected((metadata, format) => {
   *   console.log(`Detected ${format ?? 'raw pcm'} at ${metadata.sampleRate} Hz`);
   * });
   * ```
   */
  onFormatDetected(
    callback: (metadata: AudioMetadata, format: DetectedAudioFormat | null) => void
  ): void {
    this.formatCallback = callback;
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
   * Unless detection is disabled, the head of the stream is also sniffed for a
   * container signature, updating {@link BufferInput.getMetadata | getMetadata()}
   * and firing {@link BufferInput.onFormatDetected | onFormatDetected()}. Sniffing
   * copies at most {@link MAX_SNIFF_BYTES} bytes and never delays or alters the
   * emitted chunk — headers are passed through to the STT provider intact, since
   * that is what {@link AudioHeaderCache} re-injects on reconnect.
   *
   * @param data - Raw audio bytes matching the format declared in the
   *   constructor's {@link AudioMetadata}, or any container format listed in
   *   {@link DetectedAudioFormat} when relying on detection.
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

    if (this.autoDetect) {
      this.sniff(data);
    }

    const chunk: AudioChunk = {
      data,
      timestamp: Date.now(),
      sequence: this.sequenceNumber++,
    };

    this.audioCallback(chunk);
  }

  /**
   * Detect the audio format from a buffer without pushing it into the pipeline.
   *
   * @remarks
   * Runs the same sniffing {@link BufferInput.push | push()} performs, but emits
   * nothing. Call it before `startListening()` so the detected format reaches the
   * STT provider: the pipeline reads {@link BufferInput.getMetadata | getMetadata()}
   * while starting, before any audio has been pushed.
   *
   * Pass the head of the stream — the first few kilobytes are enough, and the
   * whole file is fine. Detection accumulates across calls, so feeding chunks of
   * a stream one at a time works the same as feeding a single buffer. Once the
   * format resolves, further calls are no-ops until
   * {@link BufferInput.resetDetection | resetDetection()}.
   *
   * Works even when `autoDetect` is disabled — an explicit call is an explicit
   * request. Declared format fields still take precedence in the result.
   *
   * @param data - The start of the audio stream to inspect.
   * @returns The resolved {@link AudioMetadata}, identical to what
   *   {@link BufferInput.getMetadata | getMetadata()} now returns.
   *
   * @example
   * ```typescript
   * const audio = readFileSync('speech.ogg');
   * const input = new BufferInput();
   *
   * const metadata = input.detectFormat(audio.buffer);
   * console.log(metadata.encoding, metadata.sampleRate); // 'opus' 48000
   *
   * await voice.startListening(); // STT is configured from the detected format
   * input.push(audio.buffer);
   * ```
   *
   * @see {@link BufferInput.onFormatDetected | onFormatDetected} for the callback form
   */
  detectFormat(data: ArrayBuffer): AudioMetadata {
    this.sniff(data);
    return this.getMetadata();
  }

  /**
   * Discard the detected format so the next stream is sniffed afresh.
   *
   * @remarks
   * Detection resolves once and then stops inspecting bytes, which is what you
   * want for a single stream. Call this between streams — a new file pushed into
   * the same provider, say — so the next one is detected on its own merits.
   * Declared format fields are unaffected.
   */
  resetDetection(): void {
    this.detected = null;
    this.detectionResolved = false;
    this.sniffBuffer = null;
  }

  // ── Format detection internals ───────────────────────────────────

  /**
   * Feeds bytes into format detection, resolving it once there are enough.
   *
   * @remarks
   * Container parameters can sit past the magic bytes — behind a WAV `LIST`
   * chunk or an ID3v2 tag — so bytes are accumulated until
   * {@link parseAudioMetadata} succeeds or {@link MAX_SNIFF_BYTES} is reached,
   * whichever comes first. A buffer matching no signature resolves immediately
   * to the raw-PCM fallback.
   *
   * @param data - The next bytes of the stream.
   */
  private sniff(data: ArrayBuffer): void {
    if (this.detectionResolved) return;

    const accumulated = this.accumulate(data);
    if (accumulated.byteLength < MIN_SNIFF_BYTES) return;

    const buffer = accumulated.buffer.slice(
      accumulated.byteOffset,
      accumulated.byteOffset + accumulated.byteLength
    ) as ArrayBuffer;

    const format = detectAudioFormat(buffer);
    if (format === null) {
      // No container signature — assume raw PCM and stop looking.
      this.resolveDetection(null);
      return;
    }

    const parsed = parseAudioMetadata(buffer, format);
    if (parsed === null && accumulated.byteLength < MAX_SNIFF_BYTES) {
      return; // parameters not reached yet — wait for more bytes
    }

    this.resolveDetection(parsed ?? { format, mimeType: getDetectedFormatMimeType(format) });
  }

  /**
   * Appends bytes to the sniff buffer, capped at {@link MAX_SNIFF_BYTES}.
   *
   * @param data - The bytes to append.
   * @returns The accumulated stream head.
   */
  private accumulate(data: ArrayBuffer): Uint8Array {
    const existing = this.sniffBuffer;
    const incoming = new Uint8Array(data);

    if (existing === null) {
      this.sniffBuffer = incoming.slice(0, MAX_SNIFF_BYTES);
      return this.sniffBuffer;
    }

    const room = MAX_SNIFF_BYTES - existing.byteLength;
    if (room <= 0) return existing;

    const take = Math.min(room, incoming.byteLength);
    const combined = new Uint8Array(existing.byteLength + take);
    combined.set(existing, 0);
    combined.set(incoming.subarray(0, take), existing.byteLength);
    this.sniffBuffer = combined;
    return combined;
  }

  /**
   * Records the detection outcome and notifies the format callback.
   *
   * @param detected - The parsed container parameters, or `null` for raw PCM.
   */
  private resolveDetection(detected: ParsedAudioMetadata | null): void {
    this.detected = detected;
    this.detectionResolved = true;
    this.sniffBuffer = null; // the stream head is no longer needed
    this.formatCallback?.(this.getMetadata(), detected?.format ?? null);
  }
}
