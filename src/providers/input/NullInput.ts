/**
 * No-op audio input provider for text-only pipelines.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link NullInput} class, which implements the
 * {@link AudioInputProvider} interface as a null source — all methods are
 * no-ops. It covers both the `'input'` and `'stt'` pipeline roles, so no
 * microphone or speech-to-text provider is needed.
 *
 * Use `NullInput` when you want a text-only agent where input comes from
 * the application (e.g., a chat UI) rather than from speech. The LLM
 * provider's `generate()` / `generateFromMessages()` methods can still
 * be called directly, and `llm.chunk` / `llm.complete` events fire as
 * usual.
 *
 * `NullInput` has zero browser dependencies — it does not reference
 * `navigator`, `window`, `AudioContext`, or any Web API.
 *
 * @example
 * ```typescript
 * import { CompositeVoice, NullInput, AnthropicLLM, NullOutput } from 'composite-voice';
 *
 * // Text-only agent — no mic, no speakers
 * const voice = new CompositeVoice({
 *   providers: [
 *     new NullInput(),
 *     new AnthropicLLM({ apiKey: '...', model: 'claude-haiku-4-5' }),
 *     new NullOutput(),
 *   ],
 * });
 * ```
 *
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link MicrophoneInput} for the browser-side counterpart
 * @see {@link BufferInput} for the server-side audio counterpart
 * @see {@link NullOutput} for the matching no-op output provider
 */

import type { AudioChunk, AudioMetadata } from '../../core/types/audio';
import type { AudioInputProvider, ProviderType } from '../../core/types/providers';
import type { ProviderRole } from '../../core/types/roles';

/**
 * No-op audio input provider that produces no audio and no transcriptions.
 *
 * @remarks
 * `NullInput` implements the Null Object pattern for the `'input'` + `'stt'`
 * pipeline roles. Every method is a no-op, making it safe to use wherever an
 * {@link AudioInputProvider} is required but audio capture is not needed.
 *
 * Common use cases:
 * - **Text-only agents** — `NullInput` + LLM + `NullOutput` = ChatGPT-style text interface
 * - **Text-in, voice-out** — `NullInput` + LLM + TTS + `BrowserAudioOutput` = user types, agent speaks
 * - Testing pipelines without microphone access
 * - Server-side pipelines where text is injected programmatically
 *
 * @example
 * ```typescript
 * import { CompositeVoice, NullInput, AnthropicLLM, DeepgramTTS, BrowserAudioOutput } from 'composite-voice';
 *
 * // Text-in, voice-out agent
 * const voice = new CompositeVoice({
 *   providers: [
 *     new NullInput(),
 *     new AnthropicLLM({ proxyUrl: '/api/proxy/anthropic', model: 'claude-haiku-4-5' }),
 *     new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
 *     new BrowserAudioOutput(),
 *   ],
 * });
 * ```
 *
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link MicrophoneInput} for the browser-side counterpart
 * @see {@link NullOutput} for the matching no-op output provider
 */
export class NullInput implements AudioInputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `NullInput` uses `'rest'` because it does not maintain any connection.
   */
  public readonly type: ProviderType = 'rest';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `NullInput` covers both `'input'` and `'stt'`, so no separate
   * microphone or STT provider is needed. Text input is handled
   * by calling the LLM provider's methods directly.
   */
  public readonly roles: readonly ProviderRole[] = ['input', 'stt'];

  /** Whether this provider has been initialized. */
  private initialized = false;

  /**
   * Initialize the provider.
   *
   * @remarks
   * Sets the initialized flag. No resources are acquired because there is
   * no microphone or STT engine to set up in text-only mode.
   */
  async initialize(): Promise<void> {
    this.initialized = true;
  }

  /**
   * Dispose of the provider.
   *
   * @remarks
   * Clears the initialized flag. No resources need to be released because
   * none were acquired during initialization.
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

  /**
   * No-op — no audio to capture.
   *
   * @remarks
   * In text-only mode there is no microphone, so starting audio capture
   * is meaningless. This exists to satisfy the {@link AudioInputProvider}
   * interface without side-effects.
   */
  start(): void {
    // No-op: no audio source
  }

  /**
   * No-op — nothing to stop.
   *
   * @remarks
   * No audio capture is running, so there is nothing to stop.
   */
  stop(): void {
    // No-op: no audio source
  }

  /**
   * No-op — nothing to pause.
   *
   * @remarks
   * No audio capture is running, so there is nothing to pause.
   */
  pause(): void {
    // No-op: no audio source
  }

  /**
   * No-op — nothing to resume.
   *
   * @remarks
   * No audio capture was paused, so there is nothing to resume.
   */
  resume(): void {
    // No-op: no audio source
  }

  /**
   * Always returns `false` — no audio is being captured.
   *
   * @remarks
   * There is no microphone, so audio capture is never active.
   *
   * @returns `false` always.
   */
  isActive(): boolean {
    return false;
  }

  /**
   * No-op — no audio chunks will be emitted.
   *
   * @remarks
   * The callback is accepted to satisfy the interface but is never invoked
   * because no microphone audio is produced in text-only mode.
   *
   * @param _callback - Ignored.
   */
  onAudio(_callback: (chunk: AudioChunk) => void): void {
    // No-op: no audio will be produced
  }

  /** Returns minimal metadata. */
  getMetadata(): AudioMetadata {
    return {
      sampleRate: 16000,
      channels: 1,
      encoding: 'linear16' as const,
      bitDepth: 16,
    };
  }

  // ── STTProvider interface (no-ops — satisfies duck-type validation) ──

  /**
   * No-op — no transcription will occur.
   *
   * @remarks
   * There is no STT engine, so audio blobs cannot be transcribed.
   * This exists to satisfy the duck-type validation for the `'stt'` role.
   *
   * @param _audio - Ignored.
   */
  async transcribe(_audio: Blob): Promise<void> {
    // No-op: no STT processing
  }

  /**
   * No-op — no transcription events will be emitted.
   *
   * @remarks
   * The callback is accepted to satisfy the interface but is never invoked
   * because no STT engine is running in text-only mode.
   *
   * @param _callback - Ignored.
   */
  onTranscription(
    _callback: (result: import('../../core/types/providers').TranscriptionResult) => void
  ): void {
    // No-op: no transcription results
  }
}
