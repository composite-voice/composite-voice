/**
 * Type definitions for the local voice-activity-detection (VAD) subsystem.
 *
 * @remarks
 * The VAD subsystem gives the pipeline a provider-independent view of when
 * the user is speaking, driven by a local model rather than the STT
 * provider's speech events. It consists of:
 *
 * - {@link VADEngine} — the model contract: raw 16 kHz frames in, speech
 *   probability out. {@link SileroVAD} is the built-in implementation.
 * - {@link VADProcessor} — format conversion, framing, and the
 *   speech/silence hysteresis state machine on top of an engine.
 *
 * @packageDocumentation
 */

/**
 * Contract for a voice-activity-detection model.
 *
 * @remarks
 * An engine scores fixed-size mono PCM frames at its native sample rate
 * (16 kHz for Silero) and returns a speech probability per frame. Engines
 * are stateful across frames (recurrent models); {@link VADEngine.reset}
 * clears that state between listening sessions.
 *
 * Implement this interface to plug in an alternative model — the
 * {@link VADConfig.engine} option accepts any implementation.
 */
export interface VADEngine {
  /** Samples per frame the engine expects (e.g. 512 at 16 kHz ≈ 32 ms). */
  readonly frameSamples: number;

  /** Sample rate the engine expects, in Hz. */
  readonly sampleRate: number;

  /**
   * Load the model and allocate inference resources.
   *
   * @throws Error if the model cannot be loaded (missing peer dependency,
   *   unreachable model URL, unsupported model format).
   */
  initialize(): Promise<void>;

  /**
   * Score one frame of audio.
   *
   * @param frame - Exactly {@link VADEngine.frameSamples} mono PCM samples
   *   in the range [-1, 1] at {@link VADEngine.sampleRate}.
   * @returns The speech probability for the frame, in [0, 1].
   */
  process(frame: Float32Array): Promise<number>;

  /** Clear recurrent state (call between listening sessions). */
  reset(): void;

  /** Release model resources. */
  dispose(): Promise<void>;
}

/**
 * Payload delivered when the processor detects the start of user speech.
 */
export interface VADSpeechStartInfo {
  /** Speech probability of the frame that confirmed the detection. */
  probability: number;
}

/**
 * Payload delivered when the processor detects the end of user speech.
 */
export interface VADSpeechEndInfo {
  /** How long the speech segment lasted, in milliseconds. */
  durationMs: number;
}
