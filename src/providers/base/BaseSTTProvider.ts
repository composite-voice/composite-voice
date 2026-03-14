/**
 * Abstract base class for all speech-to-text (STT) providers.
 *
 * @packageDocumentation
 */

import type { STTProviderConfig, TranscriptionResult } from '../../core/types/providers';
import type { ProviderRole } from '../../core/types/roles';
import { BaseProvider } from './BaseProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base class shared by every STT provider in CompositeVoice.
 *
 * @remarks
 * `BaseSTTProvider` sits between {@link BaseProvider} and the two transport-
 * specific bases ({@link LiveSTTProvider} and {@link RestSTTProvider}). It
 * adds the **transcription callback** mechanism that all STT providers use to
 * deliver results back to the SDK core, along with **guard methods** that the
 * orchestrator uses to interpret each transcription result.
 *
 * The handler/guard pattern:
 *
 * 1. **Handler methods** (`processAudio`) receive data and do things.
 * 2. **Guard methods** (`isUtteranceComplete`, `isPreflight`, `isInterim`,
 *    `isFinal`) assert conditions on results and return boolean.
 * 3. **Callbacks** (`onTranscription` / `emitTranscription`) deliver raw
 *    results to the orchestrator.
 *
 * Guard methods have sensible defaults in this base class. Concrete providers
 * override them when they have domain-specific logic (e.g., DeepgramSTT might
 * override `isUtteranceComplete` based on endpointing config).
 *
 * **Inheritance hierarchy:**
 *
 * ```
 * BaseProvider
 *  +-- BaseSTTProvider          <-- you are here
 *       +-- LiveSTTProvider     (WebSocket real-time STT)
 *       +-- RestSTTProvider     (REST file-based STT)
 * ```
 *
 * You typically do **not** extend `BaseSTTProvider` directly. Instead, extend
 * {@link LiveSTTProvider} for streaming/WebSocket providers or
 * {@link RestSTTProvider} for batch/file-based providers.
 *
 * @example
 * ```ts
 * import { BaseSTTProvider } from 'composite-voice';
 * import type { STTProviderConfig, TranscriptionResult } from 'composite-voice';
 *
 * class CustomSTTProvider extends BaseSTTProvider {
 *   constructor(config: STTProviderConfig) {
 *     super('rest', config);
 *   }
 *
 *   protected async onInitialize(): Promise<void> { }
 *   protected async onDispose(): Promise<void> { }
 *
 *   processAudio(chunk: ArrayBuffer): void {
 *     // Process audio data
 *   }
 *
 *   async transcribe(audio: Blob): Promise<void> {
 *     const text = await myCustomEngine.recognize(audio);
 *     this.emitTranscription({ text, isFinal: true, confidence: 1.0 });
 *   }
 * }
 * ```
 *
 * @see {@link LiveSTTProvider} for WebSocket-based real-time STT
 * @see {@link RestSTTProvider} for REST/file-based STT
 * @see {@link BaseProvider} for the root provider lifecycle
 */
export abstract class BaseSTTProvider extends BaseProvider {
  /** STT providers cover the `'stt'` pipeline role by default. */
  public override readonly roles: readonly ProviderRole[] = ['stt'];

  /** STT-specific provider configuration. */
  public override config: STTProviderConfig;

  /**
   * Callback registered by the SDK or consumer to receive transcription
   * results. Set via {@link onTranscription}.
   */
  protected transcriptionCallback?: (result: TranscriptionResult) => void;

  /**
   * Create a new STT provider.
   *
   * @param type - Transport type (`'rest'` or `'websocket'`).
   * @param config - STT provider configuration.
   * @param logger - Optional parent logger; a child will be derived.
   */
  constructor(type: 'rest' | 'websocket', config: STTProviderConfig, logger?: Logger) {
    super(type, config, logger);
    this.config = config;
  }

  // === HANDLER METHODS (receive data, do things) ===

  /**
   * Process a raw audio chunk.
   *
   * @remarks
   * Called by the orchestrator to send audio for processing. For live
   * providers this delegates to WebSocket send; for REST providers this
   * is typically a no-op (use `transcribe` instead).
   *
   * @param chunk - Raw audio data as an `ArrayBuffer`.
   *
   * @virtual
   */
  abstract processAudio(chunk: ArrayBuffer): void;

  // === GUARD METHODS (assert conditions, return boolean) ===

  /**
   * Is this result a complete utterance ready for LLM processing?
   *
   * @remarks
   * The orchestrator calls this to decide when to send transcribed text
   * to the LLM. Concrete providers override this when they have domain-
   * specific endpointing logic (e.g., DeepgramSTT checks `speech_final`).
   *
   * @param result - The transcription result to check.
   * @returns `true` when the utterance is complete.
   */
  isUtteranceComplete(result: TranscriptionResult): boolean {
    return result.utteranceComplete === true;
  }

  /**
   * Is this a preflight/eager end-of-turn signal?
   *
   * @remarks
   * Used by the eager LLM pipeline for speculative generation. Only
   * providers with preflight support (e.g., Deepgram Flux) need to
   * override this.
   *
   * @param result - The transcription result to check.
   * @returns `true` when this is a preflight signal.
   */
  isPreflight(result: TranscriptionResult): boolean {
    return result.isPreflight === true;
  }

  /**
   * Is this an interim (partial, non-final) result?
   *
   * @remarks
   * Interim results update as the user speaks and are replaced by
   * subsequent results. Useful for display but not for triggering
   * downstream processing.
   *
   * @param result - The transcription result to check.
   * @returns `true` when this is an interim result.
   */
  isInterim(result: TranscriptionResult): boolean {
    return !result.isFinal;
  }

  /**
   * Is this a final segment (but not necessarily utterance-complete)?
   *
   * @remarks
   * A final segment represents committed text, but multi-segment providers
   * (e.g., Deepgram) may emit several final segments for a single utterance.
   * Only the last one will have `isUtteranceComplete` return `true`.
   *
   * @param result - The transcription result to check.
   * @returns `true` when this is a final segment.
   */
  isFinal(result: TranscriptionResult): boolean {
    return result.isFinal === true;
  }

  // === CALLBACKS (provider -> orchestrator data delivery) ===

  /**
   * Register a callback to receive transcription results.
   *
   * @remarks
   * All STT providers -- regardless of transport -- deliver text through
   * this callback. CompositeVoice registers it during pipeline setup so
   * that transcription results flow into the conversation manager and,
   * ultimately, the LLM provider.
   *
   * @param callback - Function invoked with each {@link TranscriptionResult}.
   */
  onTranscription(callback: (result: TranscriptionResult) => void): void {
    this.logger.debug('Transcription callback registered');
    this.transcriptionCallback = callback;
  }

  /**
   * Emit a transcription result to the registered callback.
   *
   * @remarks
   * Subclasses call this method whenever transcribed text is available.
   * If no callback has been registered via {@link onTranscription}, the
   * result is logged as a warning and dropped.
   *
   * @param result - The transcription result to emit.
   */
  protected emitTranscription(result: TranscriptionResult): void {
    this.logger.debug('Emitting transcription', {
      hasCallback: !!this.transcriptionCallback,
      text: result.text,
      isFinal: result.isFinal,
    });

    if (this.transcriptionCallback) {
      this.transcriptionCallback(result);
    } else {
      this.logger.warn('No transcription callback registered - transcription dropped');
    }
  }

  /**
   * Get a shallow copy of the current STT configuration.
   *
   * @returns A new {@link STTProviderConfig} object.
   */
  override getConfig(): STTProviderConfig {
    return { ...this.config };
  }
}
