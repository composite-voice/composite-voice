/**
 * Native browser TTS provider using the Web Speech API.
 *
 * @remarks
 * This module provides a multi-role provider (`'tts'` + `'output'`) that wraps the
 * browser's built-in
 * {@link https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis | SpeechSynthesis API}
 * for text-to-speech conversion and audio playback. Because the Web Speech API
 * manages both synthesis and speaker output internally, NativeTTS fills both the
 * TTS and audio output pipeline slots. It implements the {@link AudioOutputProvider}
 * interface (configure, enqueue, flush, stop, pause, resume, isPlaying, playback
 * callbacks) in addition to the {@link RestTTSProvider} contract (synthesize).
 *
 * When the provider resolution algorithm detects that the same provider covers
 * both `'tts'` and `'output'`, the orchestrator takes a simplified path that
 * calls `synthesize()` directly, without routing audio through an
 * {@link AudioBufferQueue}.
 *
 * Transport: None (browser-managed playback)
 * Audio format: Browser-native (not capturable)
 *
 * @see {@link AudioOutputProvider} for the output role contract
 * @see {@link RestTTSProvider} for the TTS role contract
 *
 * @packageDocumentation
 */

import { RestTTSProvider } from '../../base/RestTTSProvider';
import type { TTSProviderConfig } from '../../../core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../../core/types/audio';
import type { ProviderRole } from '../../../core/types/roles';
import { Logger } from '../../../utils/logger';

/**
 * Configuration options for the {@link NativeTTS} provider.
 *
 * @remarks
 * Extends the base {@link TTSProviderConfig} with options specific to the
 * browser's SpeechSynthesis API, including voice selection by name or language
 * and a preference for local (offline) voices.
 *
 * @example
 * ```typescript
 * const config: NativeTTSConfig = {
 *   voiceName: 'Google US English',
 *   voiceLang: 'en-US',
 *   preferLocal: true,
 *   rate: 1.2,
 *   pitch: 0,
 * };
 * ```
 */
export interface NativeTTSConfig extends TTSProviderConfig {
  /**
   * Voice name or URI to select from available browser voices.
   *
   * @remarks
   * Performs a case-insensitive partial match against available voice names.
   * If no match is found, falls back to language-based or default selection.
   *
   * @defaultValue `undefined` (uses `voice` or falls back to `'default'`)
   */
  voiceName?: string;

  /**
   * BCP 47 language tag to filter available voices (e.g., `'en-US'`, `'fr'`).
   *
   * @remarks
   * Used as a fallback when no voice matches `voiceName` or `voice`.
   * Matches voices whose `lang` property starts with this value.
   *
   * @defaultValue `undefined`
   */
  voiceLang?: string;

  /**
   * Whether to prefer locally-installed voices over network voices.
   *
   * @remarks
   * Local voices are typically lower latency and work offline. When `true`,
   * the provider will prefer voices where `SpeechSynthesisVoice.localService`
   * is `true`, if no voice was matched by name or language.
   *
   * @defaultValue `true`
   */
  preferLocal?: boolean;
}

/**
 * Native browser TTS provider using the Web Speech API (SpeechSynthesis).
 *
 * @remarks
 * This provider uses the browser's built-in speech synthesis capabilities.
 * It plays audio directly through the browser's audio output -- CompositeVoice
 * does NOT receive audio data. The `synthesize()` method returns an empty `Blob`
 * because the Web Speech API does not expose raw audio buffers.
 *
 * Key characteristics:
 * - Zero setup required -- no API keys or external services needed
 * - Audio is played directly by the browser (not routed through the SDK)
 * - Voice selection supports name matching, language filtering, and local preference
 * - Supports pause, resume, and cancel operations
 * - Pitch is normalized from semitones (-20 to 20) to Web Speech range (0 to 2)
 *
 * Audio flow: `Text -> SpeechSynthesis.speak() -> Device Speakers`
 *
 * @example
 * ```typescript
 * import { NativeTTS } from 'composite-voice';
 *
 * const tts = new NativeTTS({
 *   voiceName: 'Google US English',
 *   rate: 1.0,
 *   pitch: 0,
 *   preferLocal: true,
 * });
 *
 * await tts.initialize();
 * await tts.synthesize('Hello, world!');
 * ```
 *
 * @see {@link RestTTSProvider} - The base class this provider extends.
 * @see {@link NativeTTSConfig} - Configuration options for this provider.
 */
export class NativeTTS extends RestTTSProvider {
  declare public config: NativeTTSConfig;
  /**
   * NativeTTS covers both `'tts'` and `'output'` pipeline roles.
   *
   * @remarks
   * The browser's SpeechSynthesis API handles both synthesis and playback
   * internally, so this provider fills both slots in the pipeline.
   * CompositeVoice will not set up a separate `AudioOutputProvider`.
   */
  public override readonly roles: readonly ProviderRole[] = ['tts', 'output'];
  private synthesis: SpeechSynthesis;
  private availableVoices: SpeechSynthesisVoice[] = [];
  private selectedVoice: SpeechSynthesisVoice | null = null;

  /** Registered callback for playback start events. */
  private playbackStartCallback: (() => void) | null = null;
  /** Registered callback for playback end events. */
  private playbackEndCallback: (() => void) | null = null;
  /** Registered callback for playback error events. */
  private playbackErrorCallback: ((error: Error) => void) | null = null;

  /**
   * Creates a new NativeTTS provider instance.
   *
   * @param config - Partial configuration for the native TTS provider.
   *   Missing values are filled with sensible defaults.
   * @param logger - Optional logger instance for debug and diagnostic output.
   *
   * @example
   * ```typescript
   * const tts = new NativeTTS({
   *   voiceName: 'Samantha',
   *   rate: 1.0,
   *   pitch: 0,
   * });
   * ```
   */
  constructor(config: Partial<NativeTTSConfig> = {}, logger?: Logger) {
    const voiceValue = config.voice ?? config.voiceName ?? 'default';
    super(
      {
        voice: voiceValue,
        rate: config.rate ?? 1.0,
        pitch: config.pitch ?? 0, // Will be normalized to 0-2 range
        voiceLang: config.voiceLang,
        preferLocal: config.preferLocal ?? true,
        ...config,
      },
      logger
    );
    this.synthesis = window.speechSynthesis;
  }

  /**
   * Initializes the provider by loading browser voices and selecting the best match.
   *
   * @remarks
   * Waits for the browser to populate the voice list (which may be asynchronous
   * in some browsers), then selects a voice based on the configured preferences.
   *
   * @throws Error if the SpeechSynthesis API is not supported in the current browser.
   */
  protected async onInitialize(): Promise<void> {
    if (!this.synthesis) {
      throw new Error('Speech Synthesis API is not supported in this browser');
    }

    // Load available voices
    await this.loadVoices();

    // Select voice
    this.selectVoice();

    this.logger.info('Native TTS initialized', {
      availableVoices: this.availableVoices.length,
      selectedVoice: this.selectedVoice?.name,
    });
  }

  /**
   * Disposes the provider and cancels any ongoing speech.
   */
  protected async onDispose(): Promise<void> {
    // Cancel any ongoing speech
    this.synthesis.cancel();
  }

  /**
   * Loads available voices from the browser's SpeechSynthesis API.
   *
   * @remarks
   * Some browsers load voices asynchronously. This method first checks if
   * voices are already available, then listens for the `voiceschanged` event,
   * with a 1-second fallback timeout to prevent indefinite waiting.
   *
   * @returns A promise that resolves once voices have been loaded.
   */
  private async loadVoices(): Promise<void> {
    return new Promise((resolve) => {
      // Voices might be loaded already
      let voices = this.synthesis.getVoices();

      if (voices.length > 0) {
        this.availableVoices = voices;
        resolve();
        return;
      }

      // Wait for voices to be loaded
      this.synthesis.onvoiceschanged = () => {
        voices = this.synthesis.getVoices();
        this.availableVoices = voices;
        resolve();
      };

      // Fallback timeout
      setTimeout(() => {
        this.availableVoices = this.synthesis.getVoices();
        resolve();
      }, 1000);
    });
  }

  /**
   * Selects the most appropriate voice based on configuration preferences.
   *
   * @remarks
   * Voice selection follows this priority order:
   * 1. Match by voice name (case-insensitive partial match via `config.voice`)
   * 2. Match by language tag (prefix match via `config.voiceLang`)
   * 3. Prefer local voices if `config.preferLocal` is `true`
   * 4. Fall back to the first available voice
   */
  private selectVoice(): void {
    if (this.availableVoices.length === 0) {
      this.logger.warn('No voices available');
      return;
    }

    // Try to find voice by name
    if (this.config.voice) {
      const voiceToFind = this.config.voice;
      const voiceByName = this.availableVoices.find(
        (v) => v.name === voiceToFind || v.name.toLowerCase().includes(voiceToFind.toLowerCase())
      );
      if (voiceByName) {
        this.selectedVoice = voiceByName;
        this.logger.info(`Selected voice by name: ${voiceByName.name}`);
        return;
      }
    }

    // Try to find voice by language
    if (this.config.voiceLang) {
      const langToFind = this.config.voiceLang;
      const voiceByLang = this.availableVoices.find((v) => v.lang.startsWith(langToFind));
      if (voiceByLang) {
        this.selectedVoice = voiceByLang;
        this.logger.info(`Selected voice by language: ${voiceByLang.name}`);
        return;
      }
    }

    // Prefer local voices if configured
    if (this.config.preferLocal) {
      const localVoice = this.availableVoices.find((v) => v.localService);
      if (localVoice) {
        this.selectedVoice = localVoice;
        this.logger.info(`Selected local voice: ${localVoice.name}`);
        return;
      }
    }

    // Fallback to first available voice
    this.selectedVoice = this.availableVoices[0] ?? null;
    this.logger.info(`Selected default voice: ${this.selectedVoice?.name}`);
  }

  /**
   * Synthesizes text to speech using the browser's SpeechSynthesis API.
   *
   * @remarks
   * Unlike other TTS providers, NativeTTS plays audio directly through the
   * browser's audio output. The returned `Blob` is always empty because the
   * Web Speech API does not expose raw audio buffers. This provider does NOT
   * emit audio via `onAudio()` callbacks.
   *
   * Audio flow: `Text -> SpeechSynthesisUtterance -> SpeechSynthesis.speak() -> Speakers`
   *
   * Pitch is converted from semitones (-20 to 20) to the Web Speech API range
   * (0 to 2) using the formula: `1 + pitch / 20`.
   *
   * @param text - The text to synthesize into speech.
   * @returns An empty `Blob` (audio is played directly by the browser and cannot be captured).
   *
   * @throws Error if the provider is not initialized.
   * @throws Error if the speech synthesis encounters an error (e.g., network or voice failure).
   */
  async synthesize(text: string): Promise<Blob> {
    this.assertReady();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);

      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }

      utterance.rate = this.config.rate ?? 1.0;

      // Convert pitch from semitones (-20 to 20) to Web Speech range (0 to 2)
      const pitch = this.config.pitch ?? 0;
      utterance.pitch = Math.max(0, Math.min(2, 1 + pitch / 20));

      utterance.onstart = () => {
        this.playbackStartCallback?.();
      };

      utterance.onend = () => {
        this.logger.debug('Speech finished');
        this.playbackEndCallback?.();
        // Note: Web Speech API doesn't provide audio data
        // Return empty blob as we can't capture the audio
        resolve(new Blob());
      };

      utterance.onerror = (event) => {
        this.logger.error('Speech error', event);
        const error = new Error(`Speech synthesis error: ${event.error}`);
        this.playbackErrorCallback?.(error);
        reject(error);
      };

      this.synthesis.speak(utterance);
    });
  }

  /**
   * Cancels any ongoing speech synthesis immediately.
   *
   * @remarks
   * Removes all utterances from the utterance queue and stops the
   * currently speaking utterance, if any.
   */
  cancel(): void {
    this.synthesis.cancel();
    this.logger.info('Speech cancelled');
  }

  /**
   * Pauses the currently speaking utterance.
   *
   * @remarks
   * The utterance can be resumed later with {@link NativeTTS.resume}.
   * If nothing is currently being spoken, this is a no-op.
   */
  pause(): void {
    this.synthesis.pause();
    this.logger.info('Speech paused');
  }

  /**
   * Resumes a previously paused utterance.
   *
   * @remarks
   * Has no effect if speech is not currently paused.
   *
   * @see {@link NativeTTS.pause}
   */
  resume(): void {
    this.synthesis.resume();
    this.logger.info('Speech resumed');
  }

  /**
   * Checks whether the browser is currently speaking.
   *
   * @returns `true` if the SpeechSynthesis engine is actively speaking, `false` otherwise.
   */
  isSpeaking(): boolean {
    return this.synthesis.speaking;
  }

  /**
   * Checks whether speech is currently paused.
   *
   * @returns `true` if the SpeechSynthesis engine is paused, `false` otherwise.
   */
  isPaused(): boolean {
    return this.synthesis.paused;
  }

  /**
   * Returns a copy of all voices available in the browser.
   *
   * @remarks
   * The returned array is a shallow copy; modifying it does not affect
   * the provider's internal voice list.
   *
   * @returns An array of {@link SpeechSynthesisVoice} objects available in the browser.
   */
  getAvailableVoices(): SpeechSynthesisVoice[] {
    return [...this.availableVoices];
  }

  /**
   * Returns the currently selected voice, if any.
   *
   * @returns The selected {@link SpeechSynthesisVoice}, or `null` if no voice is selected.
   */
  getSelectedVoice(): SpeechSynthesisVoice | null {
    return this.selectedVoice;
  }

  /**
   * Changes the active voice by name.
   *
   * @remarks
   * Performs a case-insensitive partial match against available voice names.
   * If the voice is found, it becomes the active voice for subsequent
   * `synthesize()` calls.
   *
   * @param voiceName - The name (or partial name) of the voice to select.
   * @returns `true` if a matching voice was found and selected, `false` otherwise.
   *
   * @example
   * ```typescript
   * const success = tts.setVoice('Google US English');
   * if (!success) {
   *   console.warn('Voice not found, using default');
   * }
   * ```
   */
  setVoice(voiceName: string): boolean {
    const voice = this.availableVoices.find(
      (v) => v.name === voiceName || v.name.toLowerCase().includes(voiceName.toLowerCase())
    );

    if (voice) {
      this.selectedVoice = voice;
      this.config.voice = voiceName;
      this.logger.info(`Voice changed to: ${voice.name}`);
      return true;
    }

    this.logger.warn(`Voice not found: ${voiceName}`);
    return false;
  }

  // ── AudioOutputProvider interface (multi-role: tts + output) ────────

  /**
   * No-op — NativeTTS uses the browser's SpeechSynthesis API which manages
   * its own audio format internally.
   *
   * @remarks
   * This method exists to satisfy the {@link AudioOutputProvider} interface
   * for duck-type validation. The browser handles audio format configuration
   * for SpeechSynthesis internally.
   *
   * @param _metadata - Audio metadata (unused).
   *
   * @see {@link AudioOutputProvider.configure}
   */
  configure(_metadata: AudioMetadata): void {
    // No-op: SpeechSynthesis manages its own audio format
  }

  /**
   * No-op — NativeTTS synthesizes and plays audio internally via the
   * browser's SpeechSynthesis API. External audio chunks are not accepted.
   *
   * @remarks
   * This method exists to satisfy the {@link AudioOutputProvider} interface.
   * Audio output is handled entirely by `SpeechSynthesis.speak()` in the
   * {@link NativeTTS.synthesize | synthesize()} method.
   *
   * @param _chunk - Audio chunk (unused).
   *
   * @see {@link AudioOutputProvider.enqueue}
   */
  enqueue(_chunk: AudioChunk): void {
    // No-op: SpeechSynthesis plays audio internally
  }

  /**
   * No-op — resolves immediately since SpeechSynthesis manages playback.
   *
   * @remarks
   * This method exists to satisfy the {@link AudioOutputProvider} interface.
   * The actual wait-for-completion is handled within
   * {@link NativeTTS.synthesize | synthesize()}, which resolves its promise
   * when the utterance finishes.
   *
   * @see {@link AudioOutputProvider.flush}
   */
  async flush(): Promise<void> {
    // No-op: synthesize() already waits for completion
  }

  /**
   * Stop playback immediately by cancelling all speech.
   *
   * @remarks
   * Delegates to {@link NativeTTS.cancel | cancel()}, which calls
   * `SpeechSynthesis.cancel()` to remove all utterances from the queue
   * and stop the currently speaking utterance.
   *
   * @see {@link AudioOutputProvider.stop}
   */
  stop(): void {
    this.cancel();
  }

  /**
   * Check whether the browser is currently playing synthesized speech.
   *
   * @remarks
   * Delegates to {@link NativeTTS.isSpeaking | isSpeaking()}.
   *
   * @returns `true` when the SpeechSynthesis engine is actively speaking.
   *
   * @see {@link AudioOutputProvider.isPlaying}
   */
  isPlaying(): boolean {
    return this.isSpeaking();
  }

  /**
   * Register a callback invoked when speech playback begins.
   *
   * @remarks
   * The callback is fired from the `SpeechSynthesisUtterance.onstart`
   * event within {@link NativeTTS.synthesize | synthesize()}.
   *
   * @param callback - Function called when playback starts.
   *
   * @see {@link AudioOutputProvider.onPlaybackStart}
   */
  onPlaybackStart(callback: () => void): void {
    this.playbackStartCallback = callback;
  }

  /**
   * Register a callback invoked when speech playback finishes.
   *
   * @remarks
   * The callback is fired from the `SpeechSynthesisUtterance.onend`
   * event within {@link NativeTTS.synthesize | synthesize()}.
   *
   * @param callback - Function called when playback ends.
   *
   * @see {@link AudioOutputProvider.onPlaybackEnd}
   */
  onPlaybackEnd(callback: () => void): void {
    this.playbackEndCallback = callback;
  }

  /**
   * Register a callback invoked when a playback error occurs.
   *
   * @remarks
   * The callback is fired from the `SpeechSynthesisUtterance.onerror`
   * event within {@link NativeTTS.synthesize | synthesize()}.
   *
   * @param callback - Function called with the error.
   *
   * @see {@link AudioOutputProvider.onPlaybackError}
   */
  onPlaybackError(callback: (error: Error) => void): void {
    this.playbackErrorCallback = callback;
  }
}
