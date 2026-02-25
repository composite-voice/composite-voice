/**
 * Abstract base class for all text-to-speech (TTS) providers.
 *
 * @packageDocumentation
 */

import type { TTSProviderConfig } from '../../core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../core/types/audio';
import { BaseProvider } from './BaseProvider';
import { Logger } from '../../utils/logger';

/**
 * Abstract base class shared by every TTS provider in CompositeVoice.
 *
 * @remarks
 * `BaseTTSProvider` sits between {@link BaseProvider} and the two transport-
 * specific bases ({@link LiveTTSProvider} and {@link RestTTSProvider}). It
 * adds the **audio callback** and **metadata callback** mechanisms that all
 * TTS providers use to deliver synthesized audio back to the SDK core.
 *
 * The audio delivery pattern mirrors the STT transcription callback:
 *
 * 1. The SDK (or consumer) registers listeners via {@link onAudio} and
 *    optionally {@link onMetadata}.
 * 2. Subclasses call {@link emitAudio} for each chunk of synthesized audio
 *    and {@link emitMetadata} once at the beginning of synthesis (if the
 *    provider can report format details up front).
 *
 * **Inheritance hierarchy:**
 *
 * ```
 * BaseProvider
 *  +-- BaseTTSProvider          <-- you are here
 *       +-- LiveTTSProvider     (WebSocket streaming TTS)
 *       +-- RestTTSProvider     (REST batch TTS)
 * ```
 *
 * You typically do **not** extend `BaseTTSProvider` directly. Instead, extend
 * {@link LiveTTSProvider} for WebSocket/streaming providers or
 * {@link RestTTSProvider} for batch/REST providers.
 *
 * @example
 * ```ts
 * import { BaseTTSProvider } from 'composite-voice';
 * import type { TTSProviderConfig } from 'composite-voice';
 * import type { AudioChunk } from 'composite-voice';
 *
 * class CustomTTSProvider extends BaseTTSProvider {
 *   constructor(config: TTSProviderConfig) {
 *     super('rest', config);
 *   }
 *
 *   protected async onInitialize(): Promise<void> { }
 *   protected async onDispose(): Promise<void> { }
 *
 *   async synthesize(text: string): Promise<Blob> {
 *     const audioBlob = await myEngine.speak(text);
 *     return audioBlob;
 *   }
 * }
 * ```
 *
 * @see {@link LiveTTSProvider} for WebSocket-based streaming TTS
 * @see {@link RestTTSProvider} for REST/batch TTS
 * @see {@link BaseProvider} for the root provider lifecycle
 */
export abstract class BaseTTSProvider extends BaseProvider {
  /** TTS-specific provider configuration. */
  public override config: TTSProviderConfig;

  /**
   * Callback registered by the SDK or consumer to receive audio chunks.
   * Set via {@link onAudio}.
   */
  protected audioCallback?: (chunk: AudioChunk) => void;

  /**
   * Callback registered by the SDK or consumer to receive audio metadata.
   * Set via {@link onMetadata}.
   */
  protected metadataCallback?: (metadata: AudioMetadata) => void;

  /**
   * Create a new TTS provider.
   *
   * @param type - Transport type (`'rest'` or `'websocket'`).
   * @param config - TTS provider configuration (voice, model, rate, etc.).
   * @param logger - Optional parent logger; a child will be derived.
   */
  constructor(type: 'rest' | 'websocket', config: TTSProviderConfig, logger?: Logger) {
    super(type, config, logger);
    this.config = config;
  }

  /**
   * Register a callback to receive synthesized audio chunks.
   *
   * @remarks
   * All TTS providers -- regardless of transport -- deliver audio through
   * this callback. CompositeVoice registers it during pipeline setup so
   * that audio data flows into the `AudioPlayer`.
   *
   * @param callback - Function invoked with each {@link AudioChunk}.
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Register a callback to receive audio metadata.
   *
   * @remarks
   * Metadata (sample rate, encoding, channels, etc.) helps the
   * `AudioPlayer` configure playback correctly. Providers **may** emit
   * metadata once at the start of synthesis but are not required to.
   *
   * @param callback - Function invoked with {@link AudioMetadata} when
   *   available.
   */
  onMetadata(callback: (metadata: AudioMetadata) => void): void {
    this.metadataCallback = callback;
  }

  /**
   * Emit a synthesized audio chunk to the registered callback.
   *
   * @remarks
   * Subclasses call this method for each chunk of audio produced during
   * synthesis. If no callback has been registered the chunk is silently
   * dropped.
   *
   * @param chunk - The audio chunk to emit.
   */
  protected emitAudio(chunk: AudioChunk): void {
    if (this.audioCallback) {
      this.audioCallback(chunk);
    }
  }

  /**
   * Emit audio metadata to the registered callback.
   *
   * @remarks
   * Typically called once at the start of synthesis when the provider
   * knows the output format. If no callback has been registered the
   * metadata is silently dropped.
   *
   * @param metadata - The audio metadata to emit.
   */
  protected emitMetadata(metadata: AudioMetadata): void {
    if (this.metadataCallback) {
      this.metadataCallback(metadata);
    }
  }

  /**
   * Get a shallow copy of the current TTS configuration.
   *
   * @returns A new {@link TTSProviderConfig} object.
   */
  override getConfig(): TTSProviderConfig {
    return { ...this.config };
  }
}
