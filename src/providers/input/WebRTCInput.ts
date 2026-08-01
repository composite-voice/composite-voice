/**
 * Generic WebRTC audio input provider for browser environments.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link WebRTCInput} class, which implements the
 * {@link AudioInputProvider} interface for audio arriving on a WebRTC
 * `MediaStreamTrack` or `MediaStream`. It is the building block for
 * "join anything WebRTC" scenarios — LiveKit, Daily, Twilio Video, or a
 * custom SFU — where the **application owns the `RTCPeerConnection`** and
 * simply hands the remote audio track to the pipeline.
 *
 * `WebRTCInput` is a single-role provider (`'input'`). It performs the same
 * PCM extraction as {@link MicrophoneInput}/`AudioCapture` (AudioWorklet
 * preferred, `ScriptProcessorNode` fallback), but consumes an **external**
 * track instead of calling `getUserMedia`. Because the application owns the
 * track, `WebRTCInput` never calls `track.stop()` — stopping the provider
 * only disconnects the local processing graph.
 *
 * **Data-flow diagram:**
 *
 * ```
 * RTCPeerConnection ──ontrack──> MediaStreamTrack
 *                                      |
 *                              setTrack()/config
 *                                      |
 *                                      v
 * [WebRTCInput]  AudioContext -> MediaStreamSource -> Worklet/ScriptProcessor
 *                                      |
 *                         Float32 -> (downsample) -> linear16 PCM
 *                                      |
 *                                 onAudio(chunk)
 *                                      |
 *                                      v
 *                              InputQueue -> [STT]
 * ```
 *
 * @example
 * ```typescript
 * import { WebRTCInput, DeepgramSTT, AnthropicLLM, WebRTCOutput } from 'composite-voice';
 *
 * const input = new WebRTCInput({ targetSampleRate: 16000 });
 *
 * // The app owns the peer connection; hand remote audio to the provider
 * const pc = new RTCPeerConnection();
 * pc.ontrack = (event) => {
 *   if (event.track.kind === 'audio') {
 *     input.setTrack(event.track);
 *   }
 * };
 * ```
 *
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link WebRTCOutput} for the corresponding output provider
 * @see {@link MicrophoneInput} for the `getUserMedia`-based counterpart
 */

import type { AudioChunk, AudioMetadata } from '../../core/types/audio';
import type { AudioInputProvider, ProviderType } from '../../core/types/providers';
import type { ProviderRole } from '../../core/types/roles';
import { ProviderInitializationError } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import { floatTo16BitPCM, downsampleAudio } from '../../utils/audio';

/**
 * Inline source code for the AudioWorklet processor used by {@link WebRTCInput}.
 *
 * @remarks
 * Loaded via a Blob URL at runtime so users do not need to serve a separate
 * worklet JS file. It copies each render quantum's first-channel data and
 * posts it to the main thread — identical in spirit to the processor used
 * by `AudioCapture`, registered under a distinct name to avoid collisions
 * when both run in the same page.
 */
const WORKLET_PROCESSOR_SOURCE = `
class WebRTCInputProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage({ type: 'audio', data: new Float32Array(input[0]) });
    }
    return true;
  }
}
registerProcessor('webrtc-input-processor', WebRTCInputProcessor);
`;

/**
 * Configuration for {@link WebRTCInput}.
 *
 * @remarks
 * A source may be supplied up-front via `track` or `stream`, or attached
 * later (and swapped live) with {@link WebRTCInput.setTrack | setTrack()} /
 * {@link WebRTCInput.setStream | setStream()}. If both `track` and `stream`
 * are provided, `track` wins.
 *
 * @example
 * ```typescript
 * import { WebRTCInput } from 'composite-voice';
 *
 * // Source known up-front
 * const input = new WebRTCInput({ track: remoteTrack, targetSampleRate: 16000 });
 *
 * // Source attached later
 * const lateInput = new WebRTCInput();
 * pc.ontrack = (e) => lateInput.setTrack(e.track);
 * ```
 *
 * @see {@link WebRTCInput} for where this config is consumed
 */
export interface WebRTCInputConfig {
  /**
   * Remote audio track to consume.
   *
   * @remarks
   * Typically obtained from `RTCPeerConnection`'s `ontrack` event or from a
   * WebRTC SDK (LiveKit `RemoteAudioTrack.mediaStreamTrack`, Daily, etc.).
   * Takes precedence over {@link WebRTCInputConfig.stream | stream} when
   * both are provided.
   */
  track?: MediaStreamTrack;

  /**
   * Remote media stream to consume.
   *
   * @remarks
   * The stream's audio is mixed by the browser's `MediaStreamAudioSourceNode`;
   * only the first audio track's mix is captured (mono downmix).
   */
  stream?: MediaStream;

  /**
   * Sample rate (Hz) of the PCM emitted to the pipeline.
   *
   * @remarks
   * The provider requests an `AudioContext` at this rate; if the browser
   * cannot honor it, audio is downsampled to this rate before emission.
   * Most STT providers perform best at 16000 Hz.
   *
   * @defaultValue 16000
   */
  targetSampleRate?: number;

  /**
   * Whether to enable debug logging for this provider.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

/**
 * Browser audio input provider that extracts PCM from a WebRTC track.
 *
 * @remarks
 * `WebRTCInput` converts a remote WebRTC audio source into linear16 PCM
 * {@link AudioChunk} objects at a configurable target sample rate. The
 * application owns the `RTCPeerConnection` (or SFU SDK) and provides the
 * source via config or {@link WebRTCInput.setTrack | setTrack()} /
 * {@link WebRTCInput.setStream | setStream()}, which may be called at any
 * time — including while capture is active — to swap sources live (e.g.
 * when the active speaker changes in an SFU room).
 *
 * Extraction mirrors {@link AudioCapture}: an `AudioWorkletNode` is
 * preferred (off-main-thread processing), falling back to the deprecated
 * `ScriptProcessorNode` where worklets are unavailable. Float32 samples are
 * downsampled to the target rate when necessary and converted to 16-bit PCM.
 *
 * `pause()`/`resume()` gate emission without tearing down the graph;
 * `stop()` disconnects all nodes and closes the `AudioContext` (the source
 * track itself is left untouched — the app owns it). The provider uses
 * `type: 'rest'` because it holds no provider-managed network connection;
 * the WebRTC transport belongs to the application.
 *
 * **Data-flow diagram:**
 *
 * ```
 * MediaStreamTrack ──setTrack()──> WebRTCInput
 *                                       |
 *                     AudioContext(targetSampleRate)
 *                                       |
 *              MediaStreamSource -> Worklet | ScriptProcessor
 *                                       |
 *                   Float32 -> downsample -> floatTo16BitPCM
 *                                       |
 *                        active && !paused ? emit : drop
 *                                       |
 *                                       v
 *                              onAudio(AudioChunk)
 * ```
 *
 * @example
 * ```typescript
 * import { CompositeVoice, WebRTCInput, DeepgramSTT, AnthropicLLM, DeepgramTTS, WebRTCOutput } from 'composite-voice';
 *
 * const input = new WebRTCInput();
 * const output = new WebRTCOutput();
 *
 * const voice = new CompositeVoice({
 *   providers: [
 *     input,
 *     new DeepgramSTT({ apiKey: '...' }),
 *     new AnthropicLLM({ apiKey: '...', model: 'claude-haiku-4-5' }),
 *     new DeepgramTTS({ apiKey: '...' }),
 *     output,
 *   ],
 * });
 *
 * await voice.initialize();
 *
 * const pc = new RTCPeerConnection();
 * pc.ontrack = (e) => input.setTrack(e.track);      // remote audio -> pipeline
 * pc.addTrack(output.getTrack(), output.getStream()); // pipeline -> remote peer
 *
 * await voice.startListening();
 * ```
 *
 * @see {@link WebRTCInputConfig} for configuration options
 * @see {@link WebRTCOutput} for the corresponding output provider
 * @see {@link AudioInputProvider} for the interface contract
 */
export class WebRTCInput implements AudioInputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `'rest'` — the provider does not manage a persistent network connection.
   * The WebRTC peer connection is owned by the application; this provider
   * only processes a local `MediaStreamTrack`.
   */
  public readonly type: ProviderType = 'rest';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `WebRTCInput` is a single-role provider covering only the `'input'`
   * slot. It requires a separate STT provider for the `'stt'` role.
   */
  public readonly roles: readonly ProviderRole[] = ['input'];

  /** Logger scoped to this provider. */
  private logger: Logger;

  /** Sample rate (Hz) of emitted PCM. */
  private readonly targetSampleRate: number;

  /** Track supplied via config or setTrack(); wrapped lazily into a stream. */
  private configuredTrack: MediaStreamTrack | null = null;

  /** Stream supplied via config or setStream(). */
  private configuredStream: MediaStream | null = null;

  /** Cached wrapper stream created around {@link configuredTrack}. */
  private wrappedTrackStream: MediaStream | null = null;

  /** Whether this provider has been initialized. */
  private initialized = false;

  /** Whether the provider has been started (between start() and stop()). */
  private active = false;

  /** Whether emission is paused. */
  private paused = false;

  /** Registered callback for audio chunks. */
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;

  /** Monotonically increasing sequence number for emitted chunks. */
  private sequenceNumber = 0;

  /** AudioContext driving the processing graph (created on start). */
  private audioContext: AudioContext | null = null;

  /** Source node wrapping the current stream. */
  private sourceNode: MediaStreamAudioSourceNode | null = null;

  /** AudioWorklet processing node (preferred path). */
  private workletNode: AudioWorkletNode | null = null;

  /** ScriptProcessor processing node (fallback path). */
  private processorNode: ScriptProcessorNode | null = null;

  /** In-flight graph construction, so concurrent builds are deduplicated. */
  private graphPromise: Promise<void> | null = null;

  /**
   * Creates a new `WebRTCInput` instance.
   *
   * @remarks
   * Construction is side-effect free: no browser APIs are touched until
   * {@link WebRTCInput.start | start()}. A source may be supplied here or
   * attached later with {@link WebRTCInput.setTrack | setTrack()} /
   * {@link WebRTCInput.setStream | setStream()}.
   *
   * @param config - Optional configuration. See {@link WebRTCInputConfig}.
   *
   * @example
   * ```typescript
   * const input = new WebRTCInput({ targetSampleRate: 16000, debug: true });
   * ```
   */
  constructor(config: WebRTCInputConfig = {}) {
    this.logger = new Logger('WebRTCInput', { enabled: config.debug ?? false });
    this.targetSampleRate = config.targetSampleRate ?? 16000;
    this.configuredTrack = config.track ?? null;
    this.configuredStream = config.stream ?? null;
  }

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Initialize the provider, verifying the environment supports Web Audio.
   *
   * @remarks
   * Throws if `AudioContext` is unavailable (e.g. Node.js without a DOM) —
   * `WebRTCInput` is a browser-only provider. The processing graph itself is
   * built lazily on {@link WebRTCInput.start | start()}. If already
   * initialized, this is a no-op.
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
        'WebRTCInput',
        new Error(
          'AudioContext is not available. WebRTCInput requires a browser environment with the Web Audio API.'
        )
      );
    }

    this.initialized = true;
    this.logger.info('WebRTCInput initialized');
  }

  /**
   * Dispose of the provider and release all resources.
   *
   * @remarks
   * Stops capture (tearing down the audio graph), clears the callback and
   * configured source references, and resets the sequence counter. The
   * source track itself is **not** stopped — the application owns it.
   * The instance may be re-initialized after disposal.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      this.logger.debug('Already disposed');
      return;
    }

    this.stop();
    this.audioCallback = null;
    this.configuredTrack = null;
    this.configuredStream = null;
    this.wrappedTrackStream = null;
    this.sequenceNumber = 0;
    this.initialized = false;
    this.logger.info('WebRTCInput disposed');
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
   * Start capturing audio from the configured WebRTC source.
   *
   * @remarks
   * Builds the processing graph (AudioContext, source node, worklet or
   * script-processor) if a source is available. If no source has been set
   * yet, the provider becomes active and the graph is built as soon as
   * {@link WebRTCInput.setTrack | setTrack()} or
   * {@link WebRTCInput.setStream | setStream()} supplies one.
   *
   * Graph construction is asynchronous (worklet module loading); errors are
   * logged rather than thrown since this method is synchronous per the
   * {@link AudioInputProvider} contract.
   */
  start(): void {
    this.active = true;
    this.paused = false;
    this.logger.info('Starting WebRTC capture');
    void this.ensureGraph();
  }

  /**
   * Stop capturing audio and tear down the processing graph.
   *
   * @remarks
   * Disconnects all audio nodes and closes the `AudioContext`. The source
   * track/stream is left untouched (the application owns it) and remains
   * configured, so the provider can be restarted with
   * {@link WebRTCInput.start | start()}.
   */
  stop(): void {
    this.active = false;
    this.paused = false;
    this.teardownGraph();
    this.logger.info('WebRTC capture stopped');
  }

  /**
   * Temporarily pause audio emission without tearing down the graph.
   *
   * @remarks
   * While paused, incoming audio is silently dropped. Used by the
   * turn-taking system to mute capture during TTS playback. Resume with
   * {@link WebRTCInput.resume | resume()}.
   */
  pause(): void {
    if (this.active) {
      this.paused = true;
      this.logger.debug('WebRTC capture paused');
    }
  }

  /**
   * Resume audio emission after a pause.
   *
   * @see {@link WebRTCInput.pause | pause}
   */
  resume(): void {
    if (this.active) {
      this.paused = false;
      this.logger.debug('WebRTC capture resumed');
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
   * {@link WebRTCInput.start | start()} so no audio is missed.
   *
   * @param callback - Function invoked with each {@link AudioChunk} while
   *   the provider is active and not paused.
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Get the audio format metadata for the emitted audio.
   *
   * @remarks
   * `WebRTCInput` always emits mono linear16 PCM at the configured
   * {@link WebRTCInputConfig.targetSampleRate | targetSampleRate}. Used by
   * the pipeline to auto-configure the downstream STT provider via
   * `configureSTTFromMetadata()`.
   *
   * @returns The {@link AudioMetadata} describing the emitted audio format.
   */
  getMetadata(): AudioMetadata {
    return {
      sampleRate: this.targetSampleRate,
      encoding: 'linear16',
      channels: 1,
      bitDepth: 16,
    };
  }

  // ── Public API (not part of AudioInputProvider) ──────────────────

  /**
   * Attach a source track or stream — dispatching alias for
   * {@link WebRTCInput.setTrack | setTrack()} /
   * {@link WebRTCInput.setStream | setStream()}.
   *
   * @remarks
   * Implements the {@link AttachableInputProvider} contract so a remote
   * WebRTC source can be passed straight to
   * `CompositeVoice.startListening(trackOrStream)`.
   *
   * @param source - The remote `MediaStreamTrack` or `MediaStream` to consume.
   */
  attach(source: MediaStreamTrack | MediaStream): void {
    if (typeof MediaStream !== 'undefined' && source instanceof MediaStream) {
      this.setStream(source);
    } else {
      this.setTrack(source as MediaStreamTrack);
    }
  }

  /**
   * Set or swap the source audio track.
   *
   * @remarks
   * May be called before or after {@link WebRTCInput.start | start()}. When
   * called while active, the processing graph is rewired to the new track
   * without interrupting the pipeline — useful when the active speaker
   * changes in an SFU room or a reconnect produces a fresh track. Replaces
   * any previously configured track or stream.
   *
   * @param track - The remote audio `MediaStreamTrack` to consume.
   *
   * @example
   * ```typescript
   * pc.ontrack = (event) => {
   *   if (event.track.kind === 'audio') input.setTrack(event.track);
   * };
   * ```
   */
  setTrack(track: MediaStreamTrack): void {
    this.configuredTrack = track;
    this.configuredStream = null;
    this.wrappedTrackStream = null;
    this.logger.debug('Track set');
    this.onSourceChanged();
  }

  /**
   * Set or swap the source media stream.
   *
   * @remarks
   * May be called before or after {@link WebRTCInput.start | start()}. When
   * called while active, the processing graph is rewired to the new stream
   * live. Replaces any previously configured track or stream.
   *
   * @param stream - The remote `MediaStream` to consume.
   */
  setStream(stream: MediaStream): void {
    this.configuredStream = stream;
    this.configuredTrack = null;
    this.wrappedTrackStream = null;
    this.logger.debug('Stream set');
    this.onSourceChanged();
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * React to a source change: rewire a live graph or build one if the
   * provider was started before a source was available.
   */
  private onSourceChanged(): void {
    if (!this.active) return;

    if (this.audioContext) {
      // Graph exists — rewire the source node only.
      this.attachSource();
    } else {
      void this.ensureGraph();
    }
  }

  /**
   * Resolve the effective source stream from the configured track/stream.
   *
   * @remarks
   * A configured track is wrapped in a `MediaStream` (cached so repeated
   * calls reuse the same wrapper). Returns `null` when no source is set.
   *
   * @returns The stream to feed into the audio graph, or `null`.
   */
  private resolveStream(): MediaStream | null {
    if (this.configuredTrack) {
      if (!this.wrappedTrackStream) {
        this.wrappedTrackStream = new MediaStream([this.configuredTrack]);
      }
      return this.wrappedTrackStream;
    }
    return this.configuredStream;
  }

  /**
   * Build the audio graph if a source is available and no graph exists yet.
   *
   * @remarks
   * Deduplicates concurrent builds via {@link graphPromise}. Errors are
   * logged (start() is synchronous per the interface contract).
   */
  private async ensureGraph(): Promise<void> {
    if (!this.active || this.audioContext || !this.resolveStream()) return;

    if (!this.graphPromise) {
      this.graphPromise = this.buildGraph()
        .catch((error: unknown) => {
          this.logger.error('Failed to build WebRTC audio graph', error);
          this.teardownGraph();
        })
        .finally(() => {
          this.graphPromise = null;
        });
    }
    await this.graphPromise;
  }

  /**
   * Create the AudioContext and processing node, then attach the source.
   *
   * @remarks
   * Prefers an `AudioWorkletNode` loaded from an inline Blob URL; falls back
   * to the deprecated `ScriptProcessorNode` when worklets are unavailable
   * (older browsers, jsdom). Mirrors the approach used by `AudioCapture`.
   */
  private async buildGraph(): Promise<void> {
    const ctx = new AudioContext({ sampleRate: this.targetSampleRate });
    this.audioContext = ctx;

    // Autoplay policy starts a context created outside a user gesture in
    // 'suspended', where the graph never runs — capture would be silent with
    // no error to explain it.
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (error) {
        this.logger.warn('Could not resume the AudioContext', error);
      }
    }

    if (ctx.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_PROCESSOR_SOURCE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        try {
          await ctx.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }

        // Bail out if stop() tore the graph down while the module loaded.
        if (this.audioContext !== ctx) {
          void ctx.close();
          return;
        }

        this.workletNode = new AudioWorkletNode(ctx, 'webrtc-input-processor');
        this.workletNode.port.onmessage = (event: MessageEvent) => {
          const message = event.data as { type?: string; data?: Float32Array };
          if (message?.type === 'audio' && message.data) {
            this.handleAudioData(message.data);
          }
        };
        this.logger.info('Using AudioWorkletNode for WebRTC capture');
      } catch {
        this.workletNode = null;
        this.logger.info('AudioWorklet not available, falling back to ScriptProcessorNode');
      }
    }

    // Bail out if stop() tore the graph down during async setup.
    if (this.audioContext !== ctx) {
      void ctx.close();
      return;
    }

    if (!this.workletNode) {
      this.setupScriptProcessor();
    }

    this.attachSource();
  }

  /**
   * Set up the deprecated `ScriptProcessorNode` fallback path.
   *
   * @remarks
   * The processor is connected to the context destination because some
   * browsers do not fire `onaudioprocess` on unconnected ScriptProcessor
   * nodes. The node produces no audible output (it only reads input).
   */
  private setupScriptProcessor(): void {
    if (!this.audioContext) return;

    const bufferSize = this.calculateBufferSize();
    this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    this.processorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      const inputBuffer = event.inputBuffer;
      this.handleAudioData(inputBuffer.getChannelData(0), inputBuffer.sampleRate);
    };
    this.processorNode.connect(this.audioContext.destination);
    this.logger.info('Using ScriptProcessorNode for WebRTC capture (fallback)');
  }

  /**
   * Calculate the ScriptProcessor buffer size for ~100ms chunks.
   *
   * @returns The nearest valid power-of-two buffer size (256–16384).
   */
  private calculateBufferSize(): number {
    const targetSize = (this.targetSampleRate * 100) / 1000;
    const bufferSizes = [256, 512, 1024, 2048, 4096, 8192, 16384];
    return bufferSizes.reduce((prev, curr) =>
      Math.abs(curr - targetSize) < Math.abs(prev - targetSize) ? curr : prev
    );
  }

  /**
   * (Re)connect the source node for the current stream to the processing node.
   *
   * @remarks
   * Disconnects any previous source first, enabling live source swaps via
   * {@link WebRTCInput.setTrack | setTrack()} /
   * {@link WebRTCInput.setStream | setStream()}.
   */
  private attachSource(): void {
    if (!this.audioContext) return;

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    const stream = this.resolveStream();
    if (!stream) return;

    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    const processor = this.workletNode ?? this.processorNode;
    if (processor) {
      this.sourceNode.connect(processor);
    }
    this.logger.debug('Source attached to audio graph');
  }

  /**
   * Handle raw Float32 samples from either processing path.
   *
   * @remarks
   * Downsamples to the target rate when the source rate differs, converts
   * to 16-bit PCM, and emits an {@link AudioChunk}. Emission is gated on
   * `active && !paused` — audio arriving otherwise is silently dropped.
   *
   * @param channelData - Raw Float32 samples (first channel).
   * @param sourceSampleRate - Sample rate of the incoming data. Defaults to
   *   the AudioContext rate (the worklet path runs at context rate).
   */
  private handleAudioData(channelData: Float32Array, sourceSampleRate?: number): void {
    if (!this.active || this.paused || !this.audioCallback) return;

    try {
      const inputRate = sourceSampleRate ?? this.audioContext?.sampleRate ?? this.targetSampleRate;

      let processed: Float32Array = channelData;
      if (inputRate !== this.targetSampleRate) {
        processed = downsampleAudio(channelData, inputRate, this.targetSampleRate);
      }

      const pcm = floatTo16BitPCM(processed);
      const chunk: AudioChunk = {
        data: pcm.buffer as ArrayBuffer,
        timestamp: Date.now(),
        sequence: this.sequenceNumber++,
      };
      this.audioCallback(chunk);
    } catch (error) {
      this.logger.error('Error processing WebRTC audio data', error);
    }
  }

  /**
   * Disconnect all nodes and close the AudioContext.
   *
   * @remarks
   * The configured source track/stream is left untouched — the application
   * owns its lifecycle. Safe to call repeatedly.
   */
  private teardownGraph(): void {
    if (this.workletNode) {
      this.workletNode.port.onmessage = null;
      this.workletNode.disconnect();
      this.workletNode = null;
    }

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      this.processorNode.disconnect();
      this.processorNode = null;
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }

    this.graphPromise = null;
  }
}
