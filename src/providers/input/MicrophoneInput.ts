/**
 * Browser audio input provider wrapping {@link AudioCapture}.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link MicrophoneInput} class, which adapts the
 * existing {@link AudioCapture} to the {@link AudioInputProvider} interface
 * introduced by the 5-role pipeline architecture.
 *
 * `MicrophoneInput` is a single-role provider (`'input'`) that delegates all
 * capture operations to an internal `AudioCapture` instance. It is the
 * browser-side counterpart to {@link BufferInput} (which accepts pushed audio
 * for server-side pipelines).
 *
 * **Data-flow diagram:**
 *
 * ```
 * [Microphone] -> getUserMedia -> AudioCapture -> MicrophoneInput
 *                                                       |
 *                                                  onAudio(cb)
 *                                                       |
 *                                                       v
 *                                              InputQueue -> [STT]
 * ```
 *
 * When used in a 5-provider pipeline, the orchestrator calls:
 * 1. `onAudio(callback)` to register the chunk handler
 * 2. `start()` to begin microphone capture
 * 3. `pause()` / `resume()` during turn-taking
 * 4. `stop()` to halt capture
 *
 * Raw `ArrayBuffer` chunks from `AudioCapture` are wrapped into
 * {@link AudioChunk} objects with a timestamp and monotonically increasing
 * sequence number before being delivered to the registered callback.
 *
 * @see {@link AudioCapture} for the underlying Web Audio API implementation
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link BufferInput} for the server-side counterpart
 */

import type { AudioChunk, AudioInputConfig, AudioMetadata } from '../../core/types/audio';
import type { AudioInputProvider, ProviderType } from '../../core/types/providers';
import type { ProviderRole } from '../../core/types/roles';
import { AudioCapture } from '../../core/audio/AudioCapture';
import { Logger } from '../../utils/logger';

/**
 * Configuration for {@link MicrophoneInput}.
 *
 * @remarks
 * Extends {@link AudioInputConfig} with an optional debug flag. Provided as a
 * distinct type for forward-compatibility and for consistency with the
 * provider-config-per-class convention used throughout the SDK.
 *
 * @example
 * ```typescript
 * import { MicrophoneInput } from 'composite-voice';
 *
 * const input = new MicrophoneInput({
 *   sampleRate: 16000,
 *   format: 'pcm',
 *   channels: 1,
 *   echoCancellation: true,
 *   noiseSuppression: true,
 * });
 * ```
 *
 * @see {@link AudioInputConfig} for the base configuration fields
 * @see {@link MicrophoneInput} for where this config is consumed
 */
export interface MicrophoneInputConfig extends AudioInputConfig {
  /**
   * Whether to enable debug logging for this provider.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

/**
 * Browser audio input provider that captures audio from the microphone.
 *
 * @remarks
 * `MicrophoneInput` adapts the SDK's existing {@link AudioCapture} to the
 * {@link AudioInputProvider} interface, making microphone capture a first-class
 * pipeline role. It delegates all operations to `AudioCapture`:
 *
 * | AudioInputProvider method | AudioCapture method / behavior       |
 * |--------------------------|--------------------------------------|
 * | `start()`                | `start(callback)`                    |
 * | `stop()`                 | `stop()`                             |
 * | `pause()`                | `pause()`                            |
 * | `resume()`               | `resume()`                           |
 * | `isActive()`             | `isCapturing()`                      |
 * | `onAudio(callback)`      | Stores callback for chunk delivery   |
 * | `getMetadata()`          | Returns metadata from config         |
 *
 * Raw `ArrayBuffer` chunks from `AudioCapture` are wrapped into
 * {@link AudioChunk} objects with timestamps and sequence numbers.
 *
 * **Data-flow diagram:**
 *
 * ```
 * Microphone ──getUserMedia──> AudioCapture ──callback──> MicrophoneInput
 *                                                              |
 *                                                         wrap as AudioChunk
 *                                                              |
 *                                                              v
 *                                                    onAudio callback
 *                                                              |
 *                                                              v
 *                                                      InputQueue -> STT
 * ```
 *
 * @example
 * ```typescript
 * import { MicrophoneInput } from 'composite-voice';
 * import type { AudioChunk } from 'composite-voice';
 *
 * // Create with custom microphone settings
 * const input = new MicrophoneInput({
 *   sampleRate: 16000,
 *   format: 'pcm',
 *   channels: 1,
 *   echoCancellation: true,
 * });
 *
 * // Use in a 5-provider pipeline
 * const voice = new CompositeVoice({
 *   providers: [
 *     input,
 *     new DeepgramSTT({ apiKey: '...' }),
 *     new AnthropicLLM({ model: 'claude-sonnet-4-20250514', apiKey: '...' }),
 *     new DeepgramTTS({ apiKey: '...' }),
 *     new BrowserAudioOutput(),
 *   ],
 * });
 *
 * await voice.initialize();
 * await voice.startListening();
 * ```
 *
 * @see {@link AudioCapture} for the underlying Web Audio API implementation
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link MicrophoneInputConfig} for configuration options
 * @see {@link BufferInput} for the server-side counterpart
 */
export class MicrophoneInput implements AudioInputProvider {
  /** @inheritDoc */
  public readonly type: ProviderType = 'rest';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `MicrophoneInput` is a single-role provider covering only the `'input'`
   * slot. Unlike {@link NativeSTT} (which covers `'input'` + `'stt'`), this
   * provider handles audio capture only and requires a separate STT provider.
   */
  public readonly roles: readonly ProviderRole[] = ['input'];

  /** The underlying AudioCapture instance that handles Web Audio API capture. */
  private capture: AudioCapture;

  /** Logger scoped to this provider. */
  private logger: Logger;

  /** Whether this provider has been initialized. */
  private initialized = false;

  /** Registered callback for audio chunks. */
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;

  /** Monotonically increasing sequence number for emitted chunks. */
  private sequenceNumber = 0;

  /** Audio metadata derived from the configuration. */
  private readonly metadata: AudioMetadata;

  /** Stored configuration for reference. */
  private readonly config: Partial<MicrophoneInputConfig>;

  /**
   * Creates a new `MicrophoneInput` instance.
   *
   * @remarks
   * Instantiates the internal {@link AudioCapture} with the provided
   * configuration. The provider starts in an uninitialized state; call
   * {@link MicrophoneInput.initialize | initialize()} before use.
   *
   * @param config - Optional audio input configuration. Missing fields use
   *   defaults from {@link DEFAULT_AUDIO_INPUT_CONFIG}.
   *
   * @example
   * ```typescript
   * // Default configuration
   * const input = new MicrophoneInput();
   *
   * // Custom microphone settings
   * const input = new MicrophoneInput({
   *   sampleRate: 16000,
   *   format: 'pcm',
   *   channels: 1,
   *   echoCancellation: true,
   *   noiseSuppression: true,
   *   autoGainControl: true,
   * });
   * ```
   */
  constructor(config: Partial<MicrophoneInputConfig> = {}) {
    this.config = config;
    this.logger = new Logger('MicrophoneInput', {
      enabled: config.debug ?? false,
    });
    this.capture = new AudioCapture(config, this.logger);

    // Build metadata from config, using sensible defaults
    this.metadata = {
      sampleRate: config.sampleRate ?? 16000,
      encoding: 'linear16',
      channels: config.channels ?? 1,
      bitDepth: 16,
    };
  }

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Initialize the provider, making it ready for capture.
   *
   * @remarks
   * Sets the initialized flag. If already initialized, this is a no-op.
   * The actual microphone permission and AudioContext setup happen in
   * {@link MicrophoneInput.start | start()}, not here.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Already initialized');
      return;
    }

    this.logger.info('Initializing MicrophoneInput');
    this.initialized = true;
    this.logger.info('MicrophoneInput initialized');
  }

  /**
   * Dispose of the provider and release all resources.
   *
   * @remarks
   * Delegates to {@link AudioCapture.dispose | AudioCapture.dispose()}, which
   * stops capture, closes the AudioContext, and releases the media stream.
   * After disposal the instance should not be reused.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      this.logger.debug('Already disposed');
      return;
    }

    this.logger.info('Disposing MicrophoneInput');
    await this.capture.dispose();
    this.audioCallback = null;
    this.sequenceNumber = 0;
    this.initialized = false;
    this.logger.info('MicrophoneInput disposed');
  }

  /**
   * Check whether the provider has been initialized and is ready for use.
   *
   * @returns `true` when {@link initialize} has completed and {@link dispose}
   *   has not yet been called.
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get a copy of the current audio input configuration.
   *
   * @returns A shallow copy of the current {@link AudioInputConfig} from
   *   the underlying AudioCapture.
   */
  getConfig(): Partial<MicrophoneInputConfig> {
    return { ...this.config };
  }

  /**
   * Update the audio input configuration at runtime.
   *
   * @remarks
   * Delegates to {@link AudioCapture.updateConfig | AudioCapture.updateConfig()}.
   * Configuration changes take effect on the next call to
   * {@link MicrophoneInput.start | start()}. They do not affect an active
   * capture session.
   *
   * @param config - Partial configuration to merge with current settings.
   */
  updateConfig(config: Partial<MicrophoneInputConfig>): void {
    this.capture.updateConfig(config);
  }

  // ── AudioInputProvider interface ─────────────────────────────────

  /**
   * Start capturing audio from the microphone.
   *
   * @remarks
   * Delegates to {@link AudioCapture.start | AudioCapture.start(callback)},
   * providing an internal callback that wraps raw `ArrayBuffer` chunks into
   * {@link AudioChunk} objects with a timestamp and sequence number before
   * forwarding them to the registered callback.
   *
   * A callback must be registered via {@link MicrophoneInput.onAudio | onAudio()}
   * before calling `start()`.
   *
   * @see {@link AudioInputProvider.start}
   */
  start(): void {
    this.logger.info('Starting microphone capture');
    void this.capture.start((audioData: ArrayBuffer) => {
      if (!this.audioCallback) return;

      const chunk: AudioChunk = {
        data: audioData,
        metadata: this.metadata,
        timestamp: Date.now(),
        sequence: this.sequenceNumber++,
      };

      this.audioCallback(chunk);
    });
  }

  /**
   * Stop capturing audio from the microphone.
   *
   * @remarks
   * Delegates to {@link AudioCapture.stop | AudioCapture.stop()}. The
   * provider can be restarted with {@link MicrophoneInput.start | start()}.
   *
   * @see {@link AudioInputProvider.stop}
   */
  stop(): void {
    this.logger.info('Stopping microphone capture');
    void this.capture.stop();
  }

  /**
   * Temporarily pause microphone capture.
   *
   * @remarks
   * Delegates to {@link AudioCapture.pause | AudioCapture.pause()}, which
   * suspends the AudioContext. No audio data is delivered while paused.
   * Resume with {@link MicrophoneInput.resume | resume()}.
   *
   * @see {@link AudioInputProvider.pause}
   */
  pause(): void {
    this.capture.pause();
  }

  /**
   * Resume microphone capture after a pause.
   *
   * @remarks
   * Delegates to {@link AudioCapture.resume | AudioCapture.resume()}, which
   * resumes the suspended AudioContext.
   *
   * @see {@link AudioInputProvider.resume}
   * @see {@link MicrophoneInput.pause | pause}
   */
  resume(): void {
    void this.capture.resume();
  }

  /**
   * Check whether the microphone is actively capturing audio.
   *
   * @remarks
   * Delegates to {@link AudioCapture.isCapturing | AudioCapture.isCapturing()}.
   * Returns `true` only when the capture state is `'active'`.
   *
   * @returns `true` when audio is actively being captured from the microphone.
   *
   * @see {@link AudioInputProvider.isActive}
   */
  isActive(): boolean {
    return this.capture.isCapturing();
  }

  /**
   * Register a callback to receive audio chunks.
   *
   * @remarks
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback. Must be called before
   * {@link MicrophoneInput.start | start()} so chunks are delivered.
   *
   * Each chunk is an {@link AudioChunk} containing the raw audio data,
   * metadata, timestamp, and a monotonically increasing sequence number.
   *
   * @param callback - Function invoked with each {@link AudioChunk} when
   *   audio is captured from the microphone.
   *
   * @see {@link AudioInputProvider.onAudio}
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Get the audio format metadata for the captured audio.
   *
   * @remarks
   * Returns metadata derived from the configuration: `sampleRate` from
   * config (default 16000), `encoding` as `'linear16'` (AudioCapture always
   * outputs 16-bit PCM), `channels` from config (default 1), and `bitDepth`
   * of 16.
   *
   * Used by the pipeline to auto-configure the downstream STT provider via
   * `configureSTTFromMetadata()`.
   *
   * @returns The {@link AudioMetadata} describing the captured audio format.
   *
   * @see {@link AudioInputProvider.getMetadata}
   * @see {@link AudioMetadata}
   */
  getMetadata(): AudioMetadata {
    return { ...this.metadata };
  }
}
