/**
 * Browser audio output provider wrapping {@link AudioPlayer}.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link BrowserAudioOutput} class, which adapts the
 * existing {@link AudioPlayer} to the {@link AudioOutputProvider} interface
 * introduced by the 5-role pipeline architecture.
 *
 * `BrowserAudioOutput` is a single-role provider (`'output'`) that delegates
 * all playback operations to an internal `AudioPlayer` instance. It is the
 * browser-side counterpart to {@link NullOutput} (which discards audio for
 * server-side pipelines).
 *
 * **Data-flow diagram:**
 *
 * ```
 * [TTSProvider] -> OutputQueue -> [BrowserAudioOutput]
 *                                        |
 *                                        v
 *                                   AudioPlayer
 *                                        |
 *                                        v
 *                                 AudioContext -> speakers
 * ```
 *
 * When used in a 5-provider pipeline, the orchestrator calls:
 * 1. `configure(metadata)` when the TTS emits format metadata
 * 2. `enqueue(chunk)` for each audio chunk from the TTS (via the output queue)
 * 3. `flush()` after the TTS signals completion
 * 4. `stop()` to halt playback immediately (e.g. on interruption)
 *
 * @see {@link AudioPlayer} for the underlying playback implementation
 * @see {@link AudioOutputProvider} for the interface contract
 * @see {@link NullOutput} for the server-side no-op counterpart
 */

import type { AudioChunk, AudioMetadata, AudioOutputConfig } from '../../core/types/audio';
import type { AudioOutputProvider, ProviderType } from '../../core/types/providers';
import type { ProviderRole } from '../../core/types/roles';
import { AudioPlayer } from '../../core/audio/AudioPlayer';
import { Logger } from '../../utils/logger';

/**
 * Configuration for {@link BrowserAudioOutput}.
 *
 * @remarks
 * Extends {@link AudioOutputConfig} with no additional fields. Provided as a
 * distinct type for forward-compatibility and for consistency with the
 * provider-config-per-class convention used throughout the SDK.
 *
 * @example
 * ```typescript
 * import { BrowserAudioOutput } from 'composite-voice';
 *
 * const output = new BrowserAudioOutput({
 *   bufferSize: 4096,
 *   minBufferDuration: 200,
 *   enableSmoothing: true,
 * });
 * ```
 *
 * @see {@link AudioOutputConfig} for the base configuration fields
 * @see {@link BrowserAudioOutput} for where this config is consumed
 */
export interface BrowserAudioOutputConfig extends AudioOutputConfig {
  /**
   * Whether to enable debug logging for this provider.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

/**
 * Browser audio output provider that plays audio through the Web Audio API.
 *
 * @remarks
 * `BrowserAudioOutput` adapts the SDK's existing {@link AudioPlayer} to the
 * {@link AudioOutputProvider} interface, making speaker playback a first-class
 * pipeline role. It delegates all operations to `AudioPlayer`:
 *
 * | AudioOutputProvider method | AudioPlayer method         |
 * |---------------------------|----------------------------|
 * | `configure(metadata)`     | `setMetadata(metadata)`    |
 * | `enqueue(chunk)`          | `addChunk(chunk)`          |
 * | `flush()`                 | `waitForCompletion()`      |
 * | `stop()`                  | `stop()`                   |
 * | `pause()`                 | `pause()`                  |
 * | `resume()`                | `resume()`                 |
 * | `isPlaying()`             | `isPlaying()`              |
 *
 * Playback callbacks (`onPlaybackStart`, `onPlaybackEnd`, `onPlaybackError`)
 * are wired through to `AudioPlayer.setCallbacks()`.
 *
 * **Data-flow diagram:**
 *
 * ```
 * OutputQueue ──enqueue()──> BrowserAudioOutput ──addChunk()──> AudioPlayer
 *                                  |                                |
 *                            configure()                      setMetadata()
 *                              flush()                     waitForCompletion()
 *                               stop()                          stop()
 * ```
 *
 * @example
 * ```typescript
 * import { BrowserAudioOutput } from 'composite-voice';
 * import type { AudioChunk, AudioMetadata } from 'composite-voice';
 *
 * // Create with custom buffer settings
 * const output = new BrowserAudioOutput({
 *   minBufferDuration: 150,
 *   enableSmoothing: true,
 * });
 *
 * // Use in a 5-provider pipeline
 * const voice = new CompositeVoice({
 *   providers: [
 *     new MicrophoneInput(),
 *     new DeepgramSTT({ apiKey: '...' }),
 *     new AnthropicLLM({ model: 'claude-sonnet-4-20250514', apiKey: '...' }),
 *     new DeepgramTTS({ apiKey: '...' }),
 *     output,
 *   ],
 * });
 *
 * // Register playback lifecycle callbacks
 * output.onPlaybackStart(() => console.log('Speaking...'));
 * output.onPlaybackEnd(() => console.log('Done speaking'));
 * output.onPlaybackError((err) => console.error('Playback error:', err));
 * ```
 *
 * @see {@link AudioPlayer} for the underlying Web Audio API implementation
 * @see {@link AudioOutputProvider} for the interface contract
 * @see {@link BrowserAudioOutputConfig} for configuration options
 * @see {@link NullOutput} for the server-side no-op counterpart
 */
export class BrowserAudioOutput implements AudioOutputProvider {
  /** @inheritDoc */
  public readonly type: ProviderType = 'rest';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `BrowserAudioOutput` is a single-role provider covering only the `'output'`
   * slot. Unlike {@link NativeTTS} (which covers `'tts'` + `'output'`), this
   * provider handles playback only and requires a separate TTS provider.
   */
  public readonly roles: readonly ProviderRole[] = ['output'];

  /** The underlying AudioPlayer instance that handles Web Audio API playback. */
  private player: AudioPlayer;

  /** Logger scoped to this provider. */
  private logger: Logger;

  /** Whether this provider has been initialized. */
  private initialized = false;

  /** Stored callback for playback start events. */
  private playbackStartCallback: (() => void) | null = null;

  /** Stored callback for playback end events. */
  private playbackEndCallback: (() => void) | null = null;

  /** Stored callback for playback error events. */
  private playbackErrorCallback: ((error: Error) => void) | null = null;

  /**
   * Creates a new `BrowserAudioOutput` instance.
   *
   * @remarks
   * Instantiates the internal {@link AudioPlayer} with the provided
   * configuration. The provider starts in an uninitialized state; call
   * {@link BrowserAudioOutput.initialize | initialize()} before use.
   *
   * @param config - Optional audio output configuration. Missing fields use
   *   defaults from {@link DEFAULT_AUDIO_OUTPUT_CONFIG}.
   *
   * @example
   * ```typescript
   * // Default configuration
   * const output = new BrowserAudioOutput();
   *
   * // Custom buffer settings
   * const output = new BrowserAudioOutput({
   *   minBufferDuration: 100,
   *   sampleRate: 24000,
   *   enableSmoothing: true,
   * });
   * ```
   */
  constructor(config: Partial<BrowserAudioOutputConfig> = {}) {
    this.logger = new Logger('BrowserAudioOutput', {
      enabled: config.debug ?? false,
    });
    this.player = new AudioPlayer(config, this.logger);
  }

  /**
   * Initialize the provider, making it ready for playback.
   *
   * @remarks
   * Wires up playback lifecycle callbacks to the underlying {@link AudioPlayer}
   * via `setCallbacks()`. If already initialized, this is a no-op.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Already initialized');
      return;
    }

    this.logger.info('Initializing BrowserAudioOutput');
    this.syncCallbacks();
    this.initialized = true;
    this.logger.info('BrowserAudioOutput initialized');
  }

  /**
   * Dispose of the provider and release all resources.
   *
   * @remarks
   * Delegates to {@link AudioPlayer.dispose | AudioPlayer.dispose()}, which
   * stops playback, closes the AudioContext, and clears callback references.
   * After disposal the instance should not be reused.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      this.logger.debug('Already disposed');
      return;
    }

    this.logger.info('Disposing BrowserAudioOutput');
    await this.player.dispose();
    this.playbackStartCallback = null;
    this.playbackEndCallback = null;
    this.playbackErrorCallback = null;
    this.initialized = false;
    this.logger.info('BrowserAudioOutput disposed');
  }

  /**
   * Check whether the provider has been initialized and is ready for playback.
   *
   * @returns `true` when {@link initialize} has completed and {@link dispose}
   *   has not yet been called.
   */
  isReady(): boolean {
    return this.initialized;
  }

  /**
   * Get a copy of the current audio output configuration.
   *
   * @returns A shallow copy of the current {@link AudioOutputConfig}.
   */
  getConfig(): Partial<BrowserAudioOutputConfig> {
    return this.player.getConfig();
  }

  /**
   * Update the audio output configuration at runtime.
   *
   * @remarks
   * Delegates to {@link AudioPlayer.updateConfig | AudioPlayer.updateConfig()}.
   * Some settings (e.g. `sampleRate`) only take effect on the next AudioContext.
   *
   * @param config - Partial configuration to merge with current settings.
   */
  updateConfig(config: Partial<BrowserAudioOutputConfig>): void {
    this.player.updateConfig(config);
  }

  // ── AudioOutputProvider interface ──────────────────────────────────

  /**
   * Configure the output with audio format metadata from the TTS provider.
   *
   * @remarks
   * Delegates to {@link AudioPlayer.setMetadata | AudioPlayer.setMetadata()}.
   * This should be called before enqueuing chunks so the player knows how to
   * decode and buffer the incoming audio data.
   *
   * @param metadata - Format description for the incoming audio stream.
   *
   * @see {@link AudioOutputProvider.configure}
   * @see {@link AudioMetadata}
   */
  configure(metadata: AudioMetadata): void {
    this.player.setMetadata(metadata);
  }

  /**
   * Enqueue an audio chunk for playback.
   *
   * @remarks
   * Delegates to {@link AudioPlayer.addChunk | AudioPlayer.addChunk()}.
   * Chunks are buffered and played sequentially. The player applies minimum
   * buffer duration gating before starting playback.
   *
   * @param chunk - Audio data to play.
   *
   * @see {@link AudioOutputProvider.enqueue}
   * @see {@link AudioChunk}
   */
  enqueue(chunk: AudioChunk): void {
    void this.player.addChunk(chunk);
  }

  /**
   * Wait for all enqueued audio to finish playing.
   *
   * @remarks
   * Delegates to {@link AudioPlayer.waitForCompletion | AudioPlayer.waitForCompletion()}.
   * Resolves when the player's internal queue is drained and the state returns
   * to `'idle'`.
   *
   * @see {@link AudioOutputProvider.flush}
   */
  async flush(): Promise<void> {
    await this.player.waitForCompletion();
  }

  /**
   * Stop playback immediately and clear any buffered audio.
   *
   * @remarks
   * Delegates to {@link AudioPlayer.stop | AudioPlayer.stop()}. This stops
   * the current AudioBufferSourceNode, clears the queue, and invokes the
   * `onPlaybackEnd` callback.
   *
   * @see {@link AudioOutputProvider.stop}
   */
  stop(): void {
    void this.player.stop();
  }

  /**
   * Temporarily pause playback by suspending the AudioContext.
   *
   * @remarks
   * Delegates to {@link AudioPlayer.pause | AudioPlayer.pause()}.
   * Playback can be resumed with {@link BrowserAudioOutput.resume | resume()}.
   *
   * @see {@link AudioOutputProvider.pause}
   */
  pause(): void {
    void this.player.pause();
  }

  /**
   * Resume playback after a pause.
   *
   * @remarks
   * Delegates to {@link AudioPlayer.resume | AudioPlayer.resume()}.
   *
   * @see {@link AudioOutputProvider.resume}
   * @see {@link BrowserAudioOutput.pause | pause}
   */
  resume(): void {
    void this.player.resume();
  }

  /**
   * Check whether audio is currently playing.
   *
   * @remarks
   * Delegates to {@link AudioPlayer.isPlaying | AudioPlayer.isPlaying()}.
   * Returns `true` only when the player is in the `'playing'` state.
   *
   * @returns `true` when audio is actively being played through speakers.
   *
   * @see {@link AudioOutputProvider.isPlaying}
   */
  isPlaying(): boolean {
    return this.player.isPlaying();
  }

  /**
   * Register a callback invoked when audio playback begins.
   *
   * @remarks
   * The callback is forwarded to {@link AudioPlayer} via `setCallbacks()`.
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback.
   *
   * @param callback - Function called when playback starts.
   *
   * @see {@link AudioOutputProvider.onPlaybackStart}
   */
  onPlaybackStart(callback: () => void): void {
    this.playbackStartCallback = callback;
    this.syncCallbacks();
  }

  /**
   * Register a callback invoked when all audio has finished playing.
   *
   * @remarks
   * The callback is forwarded to {@link AudioPlayer} via `setCallbacks()`.
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback.
   *
   * @param callback - Function called when playback ends.
   *
   * @see {@link AudioOutputProvider.onPlaybackEnd}
   */
  onPlaybackEnd(callback: () => void): void {
    this.playbackEndCallback = callback;
    this.syncCallbacks();
  }

  /**
   * Register a callback invoked when a playback error occurs.
   *
   * @remarks
   * The callback is forwarded to {@link AudioPlayer} via `setCallbacks()`.
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback.
   *
   * @param callback - Function called with the error.
   *
   * @see {@link AudioOutputProvider.onPlaybackError}
   */
  onPlaybackError(callback: (error: Error) => void): void {
    this.playbackErrorCallback = callback;
    this.syncCallbacks();
  }

  // ── Private helpers ────────────────────────────────────────────────

  /**
   * Synchronize stored callbacks to the underlying AudioPlayer.
   *
   * @remarks
   * Called whenever a callback is registered or during initialization to
   * ensure the AudioPlayer's callbacks reflect the current state.
   */
  private syncCallbacks(): void {
    const callbacks: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (error: Error) => void;
    } = {};
    if (this.playbackStartCallback) callbacks.onStart = this.playbackStartCallback;
    if (this.playbackEndCallback) callbacks.onEnd = this.playbackEndCallback;
    if (this.playbackErrorCallback) callbacks.onError = this.playbackErrorCallback;
    this.player.setCallbacks(callbacks);
  }
}
