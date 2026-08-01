/**
 * Generic WebRTC audio output provider for browser environments.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link WebRTCOutput} class, which implements the
 * {@link AudioOutputProvider} interface by rendering TTS audio into a
 * `MediaStreamTrack` instead of the local speakers. The track (obtained via
 * {@link WebRTCOutput.getTrack | getTrack()} or
 * {@link WebRTCOutput.getStream | getStream()}) can be added to any
 * `RTCPeerConnection` — LiveKit, Daily, a custom SFU — making the voice
 * agent audible to remote peers. The **application owns the peer
 * connection**; this provider only produces the local track.
 *
 * Audio is decoded into `AudioBuffer`s and scheduled gaplessly into an
 * `AudioContext.createMediaStreamDestination()` node, mirroring the
 * scheduling/flush/stop semantics of {@link BrowserAudioOutput}.
 *
 * **Data-flow diagram:**
 *
 * ```
 * [TTSProvider] -> OutputQueue -> [WebRTCOutput]
 *                                       |
 *                          decode (PCM / G.711 / decodeAudioData)
 *                                       |
 *                       AudioBufferSourceNodes (gapless schedule)
 *                                       |
 *                                       v
 *                      MediaStreamAudioDestinationNode
 *                                       |
 *                             getTrack()/getStream()
 *                                       |
 *                                       v
 *                  app: pc.addTrack(...) -> remote peers
 * ```
 *
 * @example
 * ```typescript
 * import { WebRTCOutput } from 'composite-voice';
 *
 * const output = new WebRTCOutput();
 * await output.initialize();
 *
 * const pc = new RTCPeerConnection();
 * pc.addTrack(output.getTrack(), output.getStream());
 * ```
 *
 * @see {@link AudioOutputProvider} for the interface contract
 * @see {@link WebRTCInput} for the corresponding input provider
 * @see {@link BrowserAudioOutput} for the speaker-playback counterpart
 */

import type { AudioChunk, AudioMetadata } from '../../core/types/audio';
import type { AudioOutputProvider, ProviderType } from '../../core/types/providers';
import type { ProviderRole } from '../../core/types/roles';
import { ProviderInitializationError, InvalidStateError } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import { decodeMulaw, decodeAlaw } from '../../utils/g711';

/**
 * Configuration for {@link WebRTCOutput}.
 *
 * @example
 * ```typescript
 * import { WebRTCOutput } from 'composite-voice';
 *
 * const output = new WebRTCOutput({ sampleRate: 48000, debug: true });
 * ```
 *
 * @see {@link WebRTCOutput} for where this config is consumed
 */
export interface WebRTCOutputConfig {
  /**
   * Sample rate (Hz) for the underlying `AudioContext`.
   *
   * @remarks
   * WebRTC transports typically run Opus at 48000 Hz, so matching that rate
   * avoids one resampling step in the browser. TTS audio at other rates is
   * resampled automatically by the Web Audio API when the `AudioBuffer`
   * sample rate differs from the context rate. If omitted, the browser's
   * default rate is used.
   */
  sampleRate?: number;

  /**
   * Whether to enable debug logging for this provider.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

/**
 * Browser audio output provider that renders TTS audio into a WebRTC track.
 *
 * @remarks
 * `WebRTCOutput` is a single-role provider (`'output'`). It decodes each
 * enqueued {@link AudioChunk} into an `AudioBuffer` and schedules it as an
 * `AudioBufferSourceNode` on a shared timeline (`nextStartTime`), so
 * consecutive chunks play back-to-back without gaps. All sources connect to
 * a `MediaStreamAudioDestinationNode`; the resulting track is exposed via
 * {@link WebRTCOutput.getTrack | getTrack()} for the application to publish
 * on its `RTCPeerConnection`.
 *
 * Supported input formats (from `configure()` metadata or per-chunk
 * metadata):
 *
 * | Encoding             | Handling                                          |
 * |----------------------|---------------------------------------------------|
 * | `linear16`           | Raw PCM converted directly to an `AudioBuffer`    |
 * | `mulaw` / `alaw`     | G.711-decoded to linear16, then as above          |
 * | `mp3` / `opus`       | Browser `decodeAudioData()` (complete frames only)|
 *
 * Semantics mirror {@link BrowserAudioOutput}: `flush()` resolves once every
 * enqueued chunk has finished playing into the track; `stop()` is barge-in —
 * it halts all scheduled sources immediately and clears the queue;
 * `onPlaybackStart` fires when audio begins after idle and `onPlaybackEnd`
 * when the queue fully drains (or on stop).
 *
 * The provider uses `type: 'rest'` because it holds no provider-managed
 * network connection — the WebRTC transport belongs to the application.
 *
 * **Data-flow diagram:**
 *
 * ```
 * enqueue(chunk) ──> queue ──decode──> AudioBuffer
 *                                          |
 *                              schedule at nextStartTime
 *                                          |
 *                                          v
 *                        MediaStreamAudioDestinationNode
 *                                          |
 *                                     getTrack()
 *                                          |
 *                                          v
 *                              RTCPeerConnection (app-owned)
 * ```
 *
 * @example
 * ```typescript
 * import { CompositeVoice, WebRTCInput, DeepgramSTT, AnthropicLLM, DeepgramTTS, WebRTCOutput } from 'composite-voice';
 *
 * const output = new WebRTCOutput();
 *
 * const voice = new CompositeVoice({
 *   providers: [
 *     new WebRTCInput(),
 *     new DeepgramSTT({ apiKey: '...' }),
 *     new AnthropicLLM({ apiKey: '...', model: 'claude-haiku-4-5' }),
 *     new DeepgramTTS({ apiKey: '...' }),
 *     output,
 *   ],
 * });
 *
 * await voice.initialize();
 *
 * // Publish the agent's voice to the room
 * const pc = new RTCPeerConnection();
 * pc.addTrack(output.getTrack(), output.getStream());
 *
 * output.onPlaybackStart(() => console.log('Agent speaking'));
 * output.onPlaybackEnd(() => console.log('Agent done'));
 * ```
 *
 * @see {@link WebRTCOutputConfig} for configuration options
 * @see {@link WebRTCInput} for the corresponding input provider
 * @see {@link AudioOutputProvider} for the interface contract
 */
export class WebRTCOutput implements AudioOutputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `'rest'` — the provider does not manage a persistent network connection.
   * The WebRTC peer connection is owned by the application; this provider
   * only produces a local `MediaStreamTrack`.
   */
  public readonly type: ProviderType = 'rest';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `WebRTCOutput` is a single-role provider covering only the `'output'`
   * slot. It requires a separate TTS provider for the `'tts'` role.
   */
  public readonly roles: readonly ProviderRole[] = ['output'];

  /** Logger scoped to this provider. */
  private logger: Logger;

  /** Stored configuration. */
  private readonly config: WebRTCOutputConfig;

  /** Whether this provider has been initialized. */
  private initialized = false;

  /** AudioContext driving decoding and scheduling (created at initialize). */
  private audioContext: AudioContext | null = null;

  /**
   * Trailing byte of an odd-length linear16 chunk, waiting for its partner.
   * @see {@link WebRTCOutput.toAlignedInt16}
   */
  private pcmCarry: Uint8Array | null = null;

  /** Destination node whose stream/track is published by the application. */
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  /** Audio format metadata set via configure(). */
  private metadata: AudioMetadata | null = null;

  /** Pending chunks awaiting decode + scheduling. */
  private queue: AudioChunk[] = [];

  /** Whether the queue-processing loop is running. */
  private processing = false;

  /** Monotonic counter bumped on stop() so stale loops bail out. */
  private generation = 0;

  /** Timeline cursor (AudioContext time) for gapless scheduling. */
  private nextStartTime = 0;

  /** Sources scheduled but not yet ended. */
  private activeSources = new Set<AudioBufferSourceNode>();

  /** Whether audio delivery is in progress (between start and drain). */
  private playing = false;

  /** Whether playback is paused (AudioContext suspended). */
  private paused = false;

  /** Resolvers for pending flush() promises. */
  private flushResolvers: Array<() => void> = [];

  /** Stored callback for playback start events. */
  private playbackStartCallback: (() => void) | null = null;

  /** Stored callback for playback end events. */
  private playbackEndCallback: (() => void) | null = null;

  /** Stored callback for playback error events. */
  private playbackErrorCallback: ((error: Error) => void) | null = null;

  /**
   * Creates a new `WebRTCOutput` instance.
   *
   * @remarks
   * Construction is side-effect free: the `AudioContext` and destination
   * node are created in {@link WebRTCOutput.initialize | initialize()}, so
   * the track is only available after initialization.
   *
   * @param config - Optional configuration. See {@link WebRTCOutputConfig}.
   *
   * @example
   * ```typescript
   * const output = new WebRTCOutput({ sampleRate: 48000 });
   * ```
   */
  constructor(config: WebRTCOutputConfig = {}) {
    this.config = config;
    this.logger = new Logger('WebRTCOutput', { enabled: config.debug ?? false });
  }

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Initialize the provider, creating the AudioContext and destination track.
   *
   * @remarks
   * After this resolves, {@link WebRTCOutput.getTrack | getTrack()} and
   * {@link WebRTCOutput.getStream | getStream()} return the live track and
   * stream to publish. If already initialized, this is a no-op.
   *
   * @throws {@link ProviderInitializationError} when the Web Audio API is
   *   not available in the current environment.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Already initialized');
      return;
    }

    if (typeof AudioContext === 'undefined') {
      throw new ProviderInitializationError(
        'WebRTCOutput',
        new Error(
          'AudioContext is not available. WebRTCOutput requires a browser environment with the Web Audio API.'
        )
      );
    }

    const options: AudioContextOptions = {};
    if (this.config.sampleRate !== undefined) {
      options.sampleRate = this.config.sampleRate;
    }
    this.audioContext = new AudioContext(options);
    this.destinationNode = this.audioContext.createMediaStreamDestination();
    this.initialized = true;
    this.logger.info('WebRTCOutput initialized');
  }

  /**
   * Dispose of the provider and release all resources.
   *
   * @remarks
   * Stops playback, closes the `AudioContext` (which ends the destination
   * track), and clears callbacks. Any track previously handed to a peer
   * connection goes silent. The instance may be re-initialized, but a
   * **new** track must then be fetched via
   * {@link WebRTCOutput.getTrack | getTrack()} and re-published.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      this.logger.debug('Already disposed');
      return;
    }

    this.stop();
    if (this.audioContext) {
      await this.audioContext.close();
    }
    this.audioContext = null;
    this.destinationNode = null;
    this.metadata = null;
    this.playbackStartCallback = null;
    this.playbackEndCallback = null;
    this.playbackErrorCallback = null;
    this.initialized = false;
    this.logger.info('WebRTCOutput disposed');
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

  // ── AudioOutputProvider interface ─────────────────────────────────

  /**
   * Configure the output with audio format metadata from the TTS provider.
   *
   * @remarks
   * The metadata describes how enqueued chunks are decoded. All
   * {@link AudioEncoding} values are accepted: `linear16` (recommended),
   * `mulaw`/`alaw` (G.711-decoded via the SDK's codecs), and `mp3`/`opus`
   * (decoded with the browser's `decodeAudioData`, which requires complete
   * frames — prefer `linear16` TTS output for streaming, e.g.
   * `DeepgramTTS({ encoding: 'linear16', sampleRate: 24000 })`).
   *
   * @param metadata - Format description for the incoming audio stream.
   *
   * @see {@link AudioOutputProvider.configure}
   */
  configure(metadata: AudioMetadata): void {
    this.metadata = { ...metadata };
    this.logger.debug('Configured output format', metadata);
  }

  /**
   * Enqueue an audio chunk for delivery into the WebRTC track.
   *
   * @remarks
   * Chunks are decoded and scheduled gaplessly in enqueue order. Per-chunk
   * {@link AudioChunk.metadata | metadata} overrides the format set via
   * {@link WebRTCOutput.configure | configure()}. Chunks enqueued before
   * {@link WebRTCOutput.initialize | initialize()} are dropped with a
   * warning.
   *
   * @param chunk - Audio data to deliver.
   *
   * @see {@link AudioOutputProvider.enqueue}
   */
  enqueue(chunk: AudioChunk): void {
    if (!this.initialized || !this.audioContext) {
      this.logger.warn('enqueue() called before initialize(); dropping chunk');
      return;
    }

    this.queue.push(chunk);
    if (!this.processing) {
      void this.processQueue();
    }
  }

  /**
   * Wait for all enqueued audio to finish playing into the track.
   *
   * @remarks
   * Resolves once every scheduled `AudioBufferSourceNode` has ended and the
   * queue is empty — i.e. everything enqueued has actually been delivered.
   * Also resolves on {@link WebRTCOutput.stop | stop()} (barge-in cancels
   * delivery). Resolves immediately when idle.
   *
   * @see {@link AudioOutputProvider.flush}
   */
  async flush(): Promise<void> {
    if (this.isIdle()) return;

    await new Promise<void>((resolve) => {
      this.flushResolvers.push(resolve);
    });
  }

  /**
   * Stop delivery immediately and clear all buffered audio (barge-in).
   *
   * @remarks
   * Halts every scheduled source, clears the pending queue, resets the
   * scheduling timeline, resolves pending {@link WebRTCOutput.flush | flush()}
   * promises, and fires `onPlaybackEnd` if audio was playing. The configured
   * metadata is retained so subsequent chunks (e.g. the next agent turn)
   * play without re-configuration.
   *
   * @see {@link AudioOutputProvider.stop}
   */
  stop(): void {
    this.generation++;
    this.queue = [];
    this.processing = false;
    this.nextStartTime = 0;
    // Drop any half-sample left over: the next utterance starts a new stream
    // and must not inherit a byte from the one just cancelled.
    this.pcmCarry = null;

    for (const source of this.activeSources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Ignore errors if the source has already stopped
      }
      source.disconnect();
    }
    this.activeSources.clear();

    const wasPlaying = this.playing;
    this.playing = false;
    this.resolveFlushWaiters();

    if (wasPlaying) {
      this.playbackEndCallback?.();
    }
    this.logger.info('Playback stopped');
  }

  /**
   * Temporarily pause delivery by suspending the AudioContext.
   *
   * @remarks
   * While suspended, the destination track emits silence and scheduled
   * sources hold their position. Resume with
   * {@link WebRTCOutput.resume | resume()}.
   *
   * @see {@link AudioOutputProvider.pause}
   */
  pause(): void {
    if (this.paused || !this.audioContext) return;
    this.paused = true;
    void this.audioContext.suspend();
    this.logger.debug('Playback paused');
  }

  /**
   * Resume delivery after a pause.
   *
   * @see {@link AudioOutputProvider.resume}
   * @see {@link WebRTCOutput.pause | pause}
   */
  resume(): void {
    if (!this.paused || !this.audioContext) return;
    this.paused = false;
    void this.audioContext.resume();
    this.logger.debug('Playback resumed');
  }

  /**
   * Check whether audio is currently being delivered into the track.
   *
   * @returns `true` while scheduled audio is playing and not paused.
   *
   * @see {@link AudioOutputProvider.isPlaying}
   */
  isPlaying(): boolean {
    return this.playing && !this.paused;
  }

  /**
   * Register a callback invoked when audio delivery begins after being idle.
   *
   * @remarks
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback.
   *
   * @param callback - Function called when delivery starts.
   *
   * @see {@link AudioOutputProvider.onPlaybackStart}
   */
  onPlaybackStart(callback: () => void): void {
    this.playbackStartCallback = callback;
  }

  /**
   * Register a callback invoked when the queue fully drains (or on stop).
   *
   * @remarks
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback.
   *
   * @param callback - Function called when delivery ends.
   *
   * @see {@link AudioOutputProvider.onPlaybackEnd}
   */
  onPlaybackEnd(callback: () => void): void {
    this.playbackEndCallback = callback;
  }

  /**
   * Register a callback invoked when a decode or playback error occurs.
   *
   * @remarks
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback. A failing chunk is skipped; delivery continues
   * with the next chunk.
   *
   * @param callback - Function called with the error.
   *
   * @see {@link AudioOutputProvider.onPlaybackError}
   */
  onPlaybackError(callback: (error: Error) => void): void {
    this.playbackErrorCallback = callback;
  }

  // ── Public API (not part of AudioOutputProvider) ──────────────────

  /**
   * Get the audio `MediaStreamTrack` carrying the agent's voice.
   *
   * @remarks
   * Add this track to any `RTCPeerConnection` (or SFU SDK publish call) to
   * make the agent audible to remote peers. The track is live for the
   * lifetime of the provider and goes silent between agent turns.
   *
   * @returns The destination node's audio track.
   *
   * @throws {@link InvalidStateError} when called before
   *   {@link WebRTCOutput.initialize | initialize()}.
   *
   * @example
   * ```typescript
   * pc.addTrack(output.getTrack(), output.getStream());
   * ```
   */
  getTrack(): MediaStreamTrack {
    const stream = this.getStream();
    const track = stream.getAudioTracks()[0];
    if (!track) {
      throw new InvalidStateError(
        'initialized',
        'getTrack (destination stream has no audio track)'
      );
    }
    return track;
  }

  /**
   * Get the `MediaStream` containing the agent's audio track.
   *
   * @remarks
   * Some APIs (e.g. `RTCPeerConnection.addTrack`, LiveKit's
   * `localParticipant.publishTrack`) want the stream alongside the track.
   *
   * @returns The destination node's stream.
   *
   * @throws {@link InvalidStateError} when called before
   *   {@link WebRTCOutput.initialize | initialize()}.
   */
  getStream(): MediaStream {
    if (!this.destinationNode) {
      throw new InvalidStateError('uninitialized', 'getStream');
    }
    return this.destinationNode.stream;
  }

  // ── Private helpers ────────────────────────────────────────────────

  /** Whether nothing is queued, decoding, or scheduled. */
  private isIdle(): boolean {
    return this.queue.length === 0 && !this.processing && this.activeSources.size === 0;
  }

  /** Resolve and clear all pending flush() promises. */
  private resolveFlushWaiters(): void {
    const resolvers = this.flushResolvers;
    this.flushResolvers = [];
    for (const resolve of resolvers) resolve();
  }

  /**
   * Sequentially decode queued chunks and schedule them on the timeline.
   *
   * @remarks
   * Generation-guarded so a loop started before {@link WebRTCOutput.stop | stop()}
   * exits without scheduling stale audio. Decode failures invoke
   * `onPlaybackError` and skip the offending chunk.
   */
  /**
   * View a linear16 chunk as samples, carrying any half-sample across chunks.
   *
   * @remarks
   * `new Int16Array(buffer)` throws a RangeError when the byte length is odd,
   * and TTS providers make no 2-byte alignment promise — a stream split
   * mid-sample would otherwise drop the whole chunk and leave every later one
   * byte-swapped, which is audible as loud noise rather than a small gap.
   *
   * Alignment is to a whole interleaved **frame** (`2 * channels` bytes), not
   * merely a sample: a stereo stream split between a left and right sample
   * would otherwise swap the channels for the rest of the utterance.
   *
   * Returns `null` when the carry leaves no complete frame to emit.
   */
  private toAlignedInt16(data: ArrayBuffer, channels: number): Int16Array | null {
    const incoming = new Uint8Array(data);
    const bytes =
      this.pcmCarry === null
        ? incoming
        : (() => {
            const joined = new Uint8Array(this.pcmCarry.length + incoming.length);
            joined.set(this.pcmCarry, 0);
            joined.set(incoming, this.pcmCarry.length);
            return joined;
          })();

    const frameBytes = 2 * Math.max(1, channels);
    const usable = bytes.length - (bytes.length % frameBytes);
    this.pcmCarry = usable === bytes.length ? null : bytes.slice(usable);
    if (usable === 0) return null;

    // Copy rather than view: the source may sit at an odd byteOffset, which
    // Int16Array cannot wrap.
    const aligned = new Uint8Array(usable);
    aligned.set(bytes.subarray(0, usable));
    return new Int16Array(aligned.buffer);
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    const gen = this.generation;

    try {
      // Autoplay policy starts a context created outside a user gesture in
      // 'suspended', where currentTime never advances — scheduled sources
      // would never fire onended and flush() would never resolve.
      if (this.audioContext?.state === 'suspended' && !this.paused) {
        try {
          await this.audioContext.resume();
        } catch (error) {
          // Scheduling into a context that will not run means onended never
          // fires and flush() never resolves — the very hang this guards
          // against. Drop the queue and report instead; maybeFinish() in the
          // finally block settles anyone already awaiting flush().
          const failure =
            error instanceof Error ? error : new Error('AudioContext.resume() failed');
          this.logger.error('Could not resume the AudioContext; dropping queued audio', failure);
          this.queue = [];
          this.playbackErrorCallback?.(failure);
          return;
        }
      }

      while (this.queue.length > 0) {
        if (gen !== this.generation) return;

        const chunk = this.queue.shift();
        if (!chunk) continue;

        try {
          const buffer = await this.decodeChunk(chunk);
          if (gen !== this.generation) return;
          // null means the chunk held only a partial frame, now carried.
          if (buffer !== null) this.scheduleBuffer(buffer);
        } catch (error) {
          this.logger.error('Failed to decode audio chunk', error);
          this.playbackErrorCallback?.(error as Error);
        }
      }
    } finally {
      if (gen === this.generation) {
        this.processing = false;
        this.maybeFinish();
      }
    }
  }

  /**
   * Decode a chunk into an `AudioBuffer` according to its metadata.
   *
   * @param chunk - The chunk to decode. Per-chunk metadata overrides the
   *   provider-level metadata from `configure()`.
   * @returns The decoded `AudioBuffer`, or `null` when a partial linear16
   *   frame was carried forward and there is nothing to schedule yet.
   *
   * @throws Error when no metadata is available or decoding fails.
   */
  private async decodeChunk(chunk: AudioChunk): Promise<AudioBuffer | null> {
    const context = this.audioContext;
    if (!context) {
      throw new Error('WebRTCOutput is not initialized');
    }

    const metadata = chunk.metadata ?? this.metadata;
    if (!metadata) {
      throw new Error(
        'No audio metadata available. Call configure(metadata) before enqueuing chunks ' +
          '(the pipeline does this automatically when the TTS provider emits metadata).'
      );
    }

    switch (metadata.encoding) {
      case 'linear16': {
        const samples = this.toAlignedInt16(chunk.data, metadata.channels ?? 1);
        // Not even one whole frame yet — it is carried into the next chunk.
        if (samples === null) return null;
        return this.pcmToAudioBuffer(samples, metadata, context);
      }
      case 'mulaw':
        return this.pcmToAudioBuffer(decodeMulaw(new Uint8Array(chunk.data)), metadata, context);
      case 'alaw':
        return this.pcmToAudioBuffer(decodeAlaw(new Uint8Array(chunk.data)), metadata, context);
      default:
        // mp3 / opus (containerized) — let the browser decode. Streaming
        // fragments that split frames may fail; prefer linear16 TTS output.
        try {
          return await context.decodeAudioData(chunk.data.slice(0));
        } catch (error) {
          throw new Error(
            `decodeAudioData failed for '${metadata.encoding}' chunk: ${(error as Error).message}. ` +
              `Streamed ${metadata.encoding} fragments may not be independently decodable — ` +
              `configure your TTS for linear16 (e.g. DeepgramTTS({ encoding: 'linear16', sampleRate: 24000 })).`
          );
        }
    }
  }

  /**
   * Convert interleaved 16-bit PCM samples into an `AudioBuffer`.
   *
   * @param samples - Interleaved Int16 samples.
   * @param metadata - Format description (sample rate, channels).
   * @param context - The `AudioContext` used to create the buffer.
   * @returns The resulting `AudioBuffer` at the metadata's sample rate.
   */
  private pcmToAudioBuffer(
    samples: Int16Array,
    metadata: AudioMetadata,
    context: AudioContext
  ): AudioBuffer {
    const channels = Math.max(1, metadata.channels);
    const frameCount = Math.max(1, Math.floor(samples.length / channels));
    const buffer = context.createBuffer(channels, frameCount, metadata.sampleRate);

    for (let channel = 0; channel < channels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        const sample = samples[i * channels + channel];
        if (sample !== undefined) {
          channelData[i] = sample >= 0 ? sample / 0x7fff : sample / 0x8000;
        }
      }
    }

    return buffer;
  }

  /**
   * Schedule a decoded buffer gaplessly after previously scheduled audio.
   *
   * @remarks
   * Uses a running `nextStartTime` cursor so consecutive chunks are
   * scheduled back-to-back on the AudioContext timeline with no gaps.
   * Fires `onPlaybackStart` when delivery begins after idle.
   *
   * @param buffer - The decoded `AudioBuffer` to schedule.
   */
  private scheduleBuffer(buffer: AudioBuffer): void {
    const context = this.audioContext;
    const destination = this.destinationNode;
    if (!context || !destination) return;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);

    const startAt = Math.max(context.currentTime, this.nextStartTime);
    this.nextStartTime = startAt + buffer.duration;

    this.activeSources.add(source);
    source.onended = () => {
      source.disconnect();
      this.activeSources.delete(source);
      this.maybeFinish();
    };

    if (!this.playing) {
      this.playing = true;
      this.playbackStartCallback?.();
      this.logger.info('Playback started');
    }

    source.start(startAt);
  }

  /**
   * Transition to idle when the queue has drained and all sources ended.
   *
   * @remarks
   * Fires `onPlaybackEnd`, resets the scheduling timeline, and resolves
   * pending {@link WebRTCOutput.flush | flush()} promises.
   */
  private maybeFinish(): void {
    if (!this.isIdle()) return;

    this.nextStartTime = 0;
    if (this.playing) {
      this.playing = false;
      this.playbackEndCallback?.();
      this.logger.info('Playback ended');
    }
    this.resolveFlushWaiters();
  }
}
