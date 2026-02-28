/**
 * No-op audio output provider for server-side pipelines.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link NullOutput} class, which implements the
 * {@link AudioOutputProvider} interface as a null sink — all methods are
 * no-ops. It is designed for server-side environments (Node.js, Bun, Deno)
 * where TTS audio does not need to be played through speakers.
 *
 * `NullOutput` is a single-role provider (`'output'`) and has zero browser
 * dependencies — it does not reference `navigator`, `window`, `AudioContext`,
 * or any Web API.
 *
 * **Data-flow diagram:**
 *
 * ```
 * [TTSProvider] -> OutputQueue -> [NullOutput]
 *                                      |
 *                                      v
 *                                   /dev/null (audio discarded)
 * ```
 *
 * This implements the Null Object pattern: the orchestrator can call all
 * {@link AudioOutputProvider} methods without null checks, and audio is
 * silently discarded.
 *
 * @example
 * ```typescript
 * import { BufferInput, DeepgramSTT, AnthropicLLM, NullOutput, CompositeVoice } from 'composite-voice';
 *
 * // Server-side pipeline: audio in via BufferInput, discarded at output
 * const voice = new CompositeVoice({
 *   providers: [
 *     new BufferInput({ sampleRate: 16000, encoding: 'linear16', channels: 1, bitDepth: 16 }),
 *     new DeepgramSTT({ apiKey: process.env.DEEPGRAM_API_KEY }),
 *     new AnthropicLLM({ apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-haiku-4-5' }),
 *     new NullOutput(),
 *   ],
 * });
 * ```
 *
 * @see {@link AudioOutputProvider} for the interface contract
 * @see {@link BrowserAudioOutput} for the browser-side counterpart
 * @see {@link BufferInput} for the server-side input counterpart
 */

import type { AudioChunk, AudioMetadata } from '../../core/types/audio';
import type { AudioOutputProvider, ProviderType } from '../../core/types/providers';
import type { ProviderRole } from '../../core/types/roles';

/**
 * No-op audio output provider that discards all audio.
 *
 * @remarks
 * `NullOutput` implements the Null Object pattern for the `'output'` pipeline
 * role. Every method is a no-op, making it safe to use wherever an
 * {@link AudioOutputProvider} is required but audio playback is not needed.
 *
 * Common use cases:
 * - Server-side pipelines where only the transcription/LLM response matters
 * - Testing pipelines without audio playback side-effects
 * - Headless environments without audio hardware
 *
 * @example
 * ```typescript
 * import { NullOutput, CompositeVoice, BufferInput, DeepgramSTT, AnthropicLLM } from 'composite-voice';
 *
 * // Minimal server-side pipeline
 * const voice = new CompositeVoice({
 *   providers: [
 *     new BufferInput({ sampleRate: 16000, encoding: 'linear16', channels: 1 }),
 *     new DeepgramSTT({ apiKey: '...' }),
 *     new AnthropicLLM({ apiKey: '...', model: 'claude-haiku-4-5' }),
 *     new NullOutput(),
 *   ],
 * });
 *
 * // Audio from TTS is silently discarded
 * await voice.initialize();
 * ```
 *
 * @see {@link AudioOutputProvider} for the interface contract
 * @see {@link BrowserAudioOutput} for the browser-side counterpart
 * @see {@link BufferInput} for the server-side input counterpart
 */
export class NullOutput implements AudioOutputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `NullOutput` uses `'rest'` because it does not maintain any connection.
   */
  public readonly type: ProviderType = 'rest';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `NullOutput` is a single-role provider covering only the `'output'` slot.
   * It requires a separate TTS provider for the `'tts'` role.
   */
  public readonly roles: readonly ProviderRole[] = ['output'];

  /** Whether this provider has been initialized. */
  private initialized = false;

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Initialize the provider.
   *
   * @remarks
   * Sets the initialized flag. No resources are acquired since all operations
   * are no-ops. If already initialized, this is a no-op.
   */
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  /**
   * Dispose of the provider.
   *
   * @remarks
   * Clears the initialized flag. No resources need to be released.
   */
  async dispose(): Promise<void> {
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

  // ── AudioOutputProvider interface (all no-ops) ───────────────────

  /**
   * Configure the output format. No-op — audio is discarded.
   *
   * @param _metadata - Ignored.
   */
  configure(_metadata: AudioMetadata): void {
    // No-op: audio is discarded
  }

  /**
   * Enqueue an audio chunk. No-op — audio is discarded.
   *
   * @param _chunk - Ignored.
   */
  enqueue(_chunk: AudioChunk): void {
    // No-op: audio is discarded
  }

  /**
   * Wait for playback completion. Resolves immediately — nothing to play.
   */
  async flush(): Promise<void> {
    // No-op: nothing queued
  }

  /**
   * Stop playback. No-op — nothing is playing.
   */
  stop(): void {
    // No-op: nothing to stop
  }

  /**
   * Pause playback. No-op — nothing is playing.
   */
  pause(): void {
    // No-op: nothing to pause
  }

  /**
   * Resume playback. No-op — nothing is paused.
   */
  resume(): void {
    // No-op: nothing to resume
  }

  /**
   * Check whether audio is playing. Always returns `false`.
   *
   * @returns `false` — `NullOutput` never plays audio.
   */
  isPlaying(): boolean {
    return false;
  }

  /**
   * Register a playback-start callback. No-op — playback never starts.
   *
   * @param _callback - Ignored.
   */
  onPlaybackStart(_callback: () => void): void {
    // No-op: playback never starts
  }

  /**
   * Register a playback-end callback. No-op — playback never ends.
   *
   * @param _callback - Ignored.
   */
  onPlaybackEnd(_callback: () => void): void {
    // No-op: playback never ends
  }

  /**
   * Register a playback-error callback. No-op — no errors can occur.
   *
   * @param _callback - Ignored.
   */
  onPlaybackError(_callback: (error: Error) => void): void {
    // No-op: no errors can occur
  }
}
