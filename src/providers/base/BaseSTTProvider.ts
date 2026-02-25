/**
 * Abstract base class for all speech-to-text (STT) providers.
 *
 * @packageDocumentation
 */

import type { STTProviderConfig, TranscriptionResult } from '../../core/types/providers';
import { BaseProvider } from './BaseProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base class shared by every STT provider in CompositeVoice.
 *
 * @remarks
 * `BaseSTTProvider` sits between {@link BaseProvider} and the two transport-
 * specific bases ({@link LiveSTTProvider} and {@link RestSTTProvider}). It
 * adds the **transcription callback** mechanism that all STT providers use to
 * deliver results back to the SDK core:
 *
 * 1. The SDK (or consumer) registers a listener via {@link onTranscription}.
 * 2. Subclasses call {@link emitTranscription} whenever a transcription
 *    result is available (interim or final).
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
