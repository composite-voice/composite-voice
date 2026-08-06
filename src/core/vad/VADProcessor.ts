/**
 * Framing, format conversion, and speech/silence hysteresis on top of a
 * {@link VADEngine}.
 *
 * @remarks
 * `VADProcessor` is the layer between the pipeline's raw input audio and a
 * frame-scoring VAD engine:
 *
 * ```
 * input chunks (any rate/encoding)
 *        │  decode (linear16 / mulaw / alaw) → Float32 → downmix → resample to 16 kHz
 *        ▼
 *   frame buffer (512-sample frames)
 *        │  engine.process(frame) → probability
 *        ▼
 *   hysteresis state machine ──▶ onSpeechStart / onSpeechEnd
 * ```
 *
 * The state machine applies three defenses against false triggers:
 *
 * - **Debounce**: speech is only declared after `minSpeechDurationMs` of
 *   consecutive speech-probability frames — a door slam or a single hot
 *   frame does not start a turn.
 * - **Hysteresis**: once speaking, the segment only ends after
 *   `silenceDurationMs` below a *lower* exit threshold (entry threshold
 *   − 0.15), so natural mid-sentence dips don't chop the segment.
 * - **Threshold override**: the pipeline raises the entry threshold while
 *   the agent is speaking ({@link VADProcessor.setThresholdOverride}), so
 *   TTS echo leaking into the microphone has to clear a higher bar before
 *   it can trigger barge-in.
 *
 * @packageDocumentation
 */

import type { VADEngine, VADSpeechStartInfo, VADSpeechEndInfo } from './types';
import type { AudioMetadata } from '../types/audio';
import { int16ToFloat, resamplePcm } from '../../utils/audio';
import { decodeMulaw, decodeAlaw } from '../../utils/g711';
import type { Logger } from '../../utils/logger';

/**
 * Tuning options for {@link VADProcessor}.
 */
export interface VADProcessorOptions {
  /**
   * Speech-probability entry threshold in [0, 1].
   *
   * @defaultValue 0.5
   */
  threshold?: number;

  /**
   * Consecutive speech required before `onSpeechStart` fires, in ms.
   *
   * @defaultValue 200
   */
  minSpeechDurationMs?: number;

  /**
   * Silence required before `onSpeechEnd` fires, in ms — the end-of-turn
   * sensitivity knob.
   *
   * @defaultValue 800
   */
  silenceDurationMs?: number;
}

/** Hysteresis gap between the entry and exit thresholds. */
const EXIT_THRESHOLD_GAP = 0.15;

/** Floor for the exit threshold. */
const MIN_EXIT_THRESHOLD = 0.05;

/**
 * Converts pipeline audio into VAD frames and tracks speech segments.
 *
 * @remarks
 * Feed it every input chunk via {@link push}; it handles decoding
 * (linear16 / mulaw / alaw), stereo downmix, resampling to the engine's
 * rate, framing, and segment detection. Processing is serialized
 * internally, so `push` can be called synchronously from audio callbacks.
 *
 * @example
 * ```typescript
 * const processor = new VADProcessor(engine, { silenceDurationMs: 600 });
 * processor.configure({ sampleRate: 48000, encoding: 'linear16', channels: 1, bitDepth: 16 });
 * processor.onSpeechStart(({ probability }) => console.log('speech!', probability));
 * processor.onSpeechEnd(({ durationMs }) => console.log(`spoke for ${durationMs}ms`));
 *
 * input.onAudio((chunk) => processor.push(chunk.data));
 * ```
 *
 * @see {@link VADEngine} for the model contract
 * @see {@link SileroVAD} for the built-in Silero engine
 */
export class VADProcessor {
  private readonly engine: VADEngine;
  private readonly options: Required<VADProcessorOptions>;
  private readonly logger: Logger | undefined;

  private metadata: AudioMetadata | null = null;
  private unsupportedEncodingWarned = false;

  /** Buffered mono samples at the engine's rate, awaiting a full frame. */
  private sampleBuffer: Float32Array = new Float32Array(0);

  /** Serializes frame processing so state transitions stay ordered. */
  private processingChain: Promise<void> = Promise.resolve();

  // ─── Hysteresis state ───────────────────────────────────────────────
  private speaking = false;
  private consecutiveSpeechFrames = 0;
  private consecutiveSilenceFrames = 0;
  private speechStartedAt = 0;
  private thresholdOverride: number | null = null;

  private speechStartCallbacks: Array<(info: VADSpeechStartInfo) => void> = [];
  private speechEndCallbacks: Array<(info: VADSpeechEndInfo) => void> = [];

  constructor(engine: VADEngine, options: VADProcessorOptions = {}, logger?: Logger) {
    this.engine = engine;
    this.options = {
      threshold: options.threshold ?? 0.5,
      minSpeechDurationMs: options.minSpeechDurationMs ?? 200,
      silenceDurationMs: options.silenceDurationMs ?? 800,
    };
    this.logger = logger;
  }

  /** Whether a speech segment is currently in progress. */
  get isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * Describe the incoming audio format.
   *
   * @remarks
   * Call before the first {@link push} — typically with the input
   * provider's `getMetadata()`. Chunks pushed before configuration are
   * dropped.
   */
  configure(metadata: AudioMetadata): void {
    this.metadata = metadata;
  }

  /**
   * Temporarily require a different entry threshold.
   *
   * @remarks
   * The pipeline sets this to the configured barge-in threshold while the
   * agent is speaking (echo resistance) and clears it with `null` when
   * playback stops.
   *
   * @param threshold - The replacement entry threshold, or `null` to
   *   restore the configured one.
   */
  setThresholdOverride(threshold: number | null): void {
    this.thresholdOverride = threshold;
  }

  /** Register a callback for confirmed speech starts. */
  onSpeechStart(callback: (info: VADSpeechStartInfo) => void): void {
    this.speechStartCallbacks.push(callback);
  }

  /** Register a callback for confirmed speech ends. */
  onSpeechEnd(callback: (info: VADSpeechEndInfo) => void): void {
    this.speechEndCallbacks.push(callback);
  }

  /**
   * Feed one chunk of input audio.
   *
   * @remarks
   * Non-blocking: decoding, resampling, and inference run on an internal
   * serial queue. Errors are logged and swallowed — VAD is an enhancement
   * and must never take down the audio path.
   *
   * @param data - Raw audio bytes in the configured format.
   */
  push(data: ArrayBuffer): void {
    this.processingChain = this.processingChain
      .then(() => this.processChunk(data))
      .catch((error) => {
        this.logger?.warn('VADProcessor: error processing audio chunk', error);
      });
  }

  /**
   * Wait for all pushed audio to finish processing.
   *
   * @remarks
   * Primarily for tests and orderly shutdown.
   */
  async flush(): Promise<void> {
    await this.processingChain;
  }

  /**
   * Clear buffered audio and segment state (call between sessions).
   *
   * @remarks
   * If a speech segment is open, it is closed silently — no `onSpeechEnd`
   * fires, because the session ending is not an end-of-turn signal.
   */
  reset(): void {
    this.sampleBuffer = new Float32Array(0);
    this.speaking = false;
    this.consecutiveSpeechFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.speechStartedAt = 0;
    this.engine.reset();
  }

  // ─── Internals ───────────────────────────────────────────────────────

  private async processChunk(data: ArrayBuffer): Promise<void> {
    if (!this.metadata) return;

    const samples = this.decodeToEngineRate(data, this.metadata);
    if (!samples || samples.length === 0) return;

    // Append to the frame buffer
    const combined = new Float32Array(this.sampleBuffer.length + samples.length);
    combined.set(this.sampleBuffer, 0);
    combined.set(samples, this.sampleBuffer.length);
    this.sampleBuffer = combined;

    const frameSize = this.engine.frameSamples;
    let offset = 0;
    while (this.sampleBuffer.length - offset >= frameSize) {
      const frame = this.sampleBuffer.subarray(offset, offset + frameSize);
      offset += frameSize;
      const probability = await this.engine.process(new Float32Array(frame));
      this.applyFrame(probability);
    }
    this.sampleBuffer = this.sampleBuffer.slice(offset);
  }

  /** Decode a chunk to mono Float32 at the engine's sample rate. */
  private decodeToEngineRate(data: ArrayBuffer, metadata: AudioMetadata): Float32Array | null {
    let pcm: Float32Array;

    switch (metadata.encoding) {
      case 'linear16': {
        // Drop a trailing odd byte — Int16 views need even lengths.
        const evenLength = data.byteLength - (data.byteLength % 2);
        if (evenLength === 0) return null;
        pcm = int16ToFloat(new Int16Array(data.slice(0, evenLength)));
        break;
      }
      case 'mulaw':
        pcm = int16ToFloat(decodeMulaw(new Uint8Array(data)));
        break;
      case 'alaw':
        pcm = int16ToFloat(decodeAlaw(new Uint8Array(data)));
        break;
      default:
        if (!this.unsupportedEncodingWarned) {
          this.unsupportedEncodingWarned = true;
          this.logger?.warn(
            `VADProcessor: unsupported input encoding "${metadata.encoding}" — ` +
              'local VAD is disabled for this session (supported: linear16, mulaw, alaw)'
          );
        }
        return null;
    }

    // Downmix interleaved multi-channel audio to mono
    const channels = metadata.channels ?? 1;
    if (channels > 1) {
      const mono = new Float32Array(Math.floor(pcm.length / channels));
      for (let i = 0; i < mono.length; i++) {
        let sum = 0;
        for (let ch = 0; ch < channels; ch++) {
          sum += pcm[i * channels + ch] ?? 0;
        }
        mono[i] = sum / channels;
      }
      pcm = mono;
    }

    return resamplePcm(pcm, metadata.sampleRate, this.engine.sampleRate);
  }

  /** Advance the speech/silence state machine by one scored frame. */
  private applyFrame(probability: number): void {
    const frameMs = (this.engine.frameSamples / this.engine.sampleRate) * 1000;
    const entryThreshold = this.thresholdOverride ?? this.options.threshold;
    const exitThreshold = Math.max(MIN_EXIT_THRESHOLD, entryThreshold - EXIT_THRESHOLD_GAP);

    if (!this.speaking) {
      if (probability >= entryThreshold) {
        this.consecutiveSpeechFrames++;
        const speechMs = this.consecutiveSpeechFrames * frameMs;
        if (speechMs >= this.options.minSpeechDurationMs) {
          this.speaking = true;
          this.speechStartedAt = Date.now() - speechMs;
          this.consecutiveSilenceFrames = 0;
          for (const callback of this.speechStartCallbacks) {
            try {
              callback({ probability });
            } catch (error) {
              this.logger?.warn('VADProcessor: onSpeechStart callback threw', error);
            }
          }
        }
      } else {
        this.consecutiveSpeechFrames = 0;
      }
      return;
    }

    // Speaking — look for sustained silence below the exit threshold
    if (probability < exitThreshold) {
      this.consecutiveSilenceFrames++;
      if (this.consecutiveSilenceFrames * frameMs >= this.options.silenceDurationMs) {
        const durationMs = Math.max(0, Math.round(Date.now() - this.speechStartedAt));
        this.speaking = false;
        this.consecutiveSpeechFrames = 0;
        this.consecutiveSilenceFrames = 0;
        for (const callback of this.speechEndCallbacks) {
          try {
            callback({ durationMs });
          } catch (error) {
            this.logger?.warn('VADProcessor: onSpeechEnd callback threw', error);
          }
        }
      }
    } else {
      this.consecutiveSilenceFrames = 0;
    }
  }
}
