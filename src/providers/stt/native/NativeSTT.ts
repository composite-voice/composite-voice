/**
 * Native browser speech-to-text provider using the Web Speech API.
 *
 * @remarks
 * This module provides a multi-role provider (`'input'` + `'stt'`) that wraps the
 * browser's `SpeechRecognition` API. Because the Web Speech API manages microphone
 * access and transcription internally, NativeSTT fills both the audio input and
 * speech-to-text pipeline slots. It implements the {@link AudioInputProvider}
 * interface (start, stop, pause, resume, isActive, onAudio, getMetadata) in
 * addition to the {@link LiveSTTProvider} contract (connect, sendAudio, disconnect).
 *
 * When the provider resolution algorithm detects that the same provider covers
 * both `'input'` and `'stt'`, the orchestrator takes a simplified path that
 * calls `connect()` / `disconnect()` directly, without setting up an
 * {@link AudioBufferQueue} between the two stages.
 *
 * @see {@link AudioInputProvider} for the input role contract
 * @see {@link LiveSTTProvider} for the STT role contract
 *
 * @packageDocumentation
 */

import { LiveSTTProvider } from '../../base/LiveSTTProvider';
import type { STTProviderConfig, TranscriptionResult } from '../../../core/types/providers';
import type { AudioChunk, AudioMetadata } from '../../../core/types/audio';
import type { ProviderRole } from '../../../core/types/roles';
import { ProviderConnectionError } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';

// Browser Speech Recognition types
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

declare const SpeechRecognition: {
  prototype: SpeechRecognition;
  new (): SpeechRecognition;
};

/**
 * Configuration options for the {@link NativeSTT} provider.
 *
 * @remarks
 * Extends {@link STTProviderConfig} with settings specific to the browser's
 * `SpeechRecognition` API.
 *
 * @example
 * ```ts
 * const config: NativeSTTConfig = {
 *   language: 'en-US',
 *   continuous: true,
 *   interimResults: true,
 *   maxAlternatives: 1,
 *   startTimeout: 5000,
 * };
 * ```
 */
export interface NativeSTTConfig extends STTProviderConfig {
  /**
   * Enable continuous recognition so the browser keeps listening after
   * each utterance ends.
   * @defaultValue `true`
   */
  continuous?: boolean;
  /**
   * Maximum number of alternative transcriptions the browser should return
   * per recognition result.
   * @defaultValue `1`
   */
  maxAlternatives?: number;
  /**
   * Maximum milliseconds to wait for the recognition `start` event after calling start().
   * If the browser does not fire `onstart` within this window, connect() rejects.
   * @defaultValue `5000`
   */
  startTimeout?: number;
}

/**
 * Native browser STT provider backed by the Web Speech API (`SpeechRecognition`).
 *
 * @remarks
 * Unlike other STT providers, `NativeSTT` manages its own audio pipeline
 * -- the browser's `SpeechRecognition` API directly accesses the microphone.
 * Because of this, the provider declares `roles: ['input', 'stt']` and
 * CompositeVoice will **not** set up a separate `AudioInputProvider`. The
 * {@link sendAudio} method is a no-op.
 *
 * **Transport:** WebSocket-like (browser-managed, extends {@link LiveSTTProvider})
 *
 * **Browser support:**
 * - Chrome / Edge (Chromium): Full support via `SpeechRecognition`
 * - Safari: Partial support via `webkitSpeechRecognition`
 * - Firefox: Not supported (as of 2025)
 *
 * **Data flow:**
 *
 * ```
 * Microphone -> SpeechRecognition API (browser) -> onresult event
 *                                                      |
 * CompositeVoice <- onTranscription(result) <---------+
 * ```
 *
 * @example
 * ```ts
 * import { NativeSTT } from 'composite-voice';
 *
 * const stt = new NativeSTT({
 *   language: 'en-US',
 *   continuous: true,
 *   interimResults: true,
 *   maxAlternatives: 1,
 * });
 *
 * await stt.initialize();
 *
 * stt.onTranscription((result) => {
 *   console.log(result.text, result.isFinal);
 * });
 *
 * await stt.connect(); // starts listening
 * // ... later ...
 * await stt.disconnect(); // stops listening
 * ```
 *
 * @see {@link LiveSTTProvider} for the base WebSocket STT class
 * @see {@link NativeSTTConfig} for configuration options
 * @see {@link DeepgramSTT} for an alternative real-time STT provider
 */
export class NativeSTT extends LiveSTTProvider {
  declare public config: NativeSTTConfig;

  /**
   * NativeSTT covers both `'input'` and `'stt'` pipeline roles.
   *
   * @remarks
   * The browser's `SpeechRecognition` API handles microphone access
   * and transcription internally, so this provider fills both the input
   * capture and speech-to-text slots in the pipeline.
   */
  public override readonly roles: readonly ProviderRole[] = ['input', 'stt'];

  /** The underlying browser `SpeechRecognition` instance. */
  private recognition: SpeechRecognition | null = null;
  /** Whether the provider should be actively listening (set by connect/disconnect). */
  private shouldBeListening = false;
  /** Consecutive restart count — reset on successful `onstart`, used to cap retries. */
  private restartCount = 0;
  /** Maximum consecutive restarts before giving up. */
  private static readonly MAX_RESTARTS = 5;

  /**
   * Create a new NativeSTT provider.
   *
   * @param config - Partial configuration; unset values receive sensible
   *   defaults (`language: 'en-US'`, `continuous: true`,
   *   `interimResults: true`, `maxAlternatives: 1`).
   * @param logger - Optional parent logger; a child will be derived.
   *
   * @example
   * ```ts
   * const stt = new NativeSTT({ language: 'fr-FR', continuous: false });
   * ```
   */
  constructor(config: Partial<NativeSTTConfig> = {}, logger?: Logger) {
    const finalConfig = {
      language: config.language ?? 'en-US',
      interimResults: config.interimResults ?? true,
      continuous: config.continuous ?? true,
      maxAlternatives: config.maxAlternatives ?? 1,
      ...config,
    };
    super(finalConfig, logger);
  }

  /**
   * Initialize the `SpeechRecognition` instance and configure it.
   *
   * @throws {@link Error}
   * Thrown when the Web Speech API is not available in the current browser.
   */
  protected onInitialize(): Promise<void> {
    this.logger.debug('Starting NativeSTT initialization');

    // Check if Web Speech API is available
    const SpeechRecognitionAPI =
      (window as typeof window & { SpeechRecognition?: typeof SpeechRecognition })
        .SpeechRecognition ||
      (window as typeof window & { webkitSpeechRecognition?: typeof SpeechRecognition })
        .webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      this.logger.error('Web Speech API is not supported in this browser');
      throw new Error('Web Speech API is not supported in this browser');
    }

    this.logger.debug('Creating SpeechRecognition instance');
    this.recognition = new SpeechRecognitionAPI();
    this.recognition.lang = this.config.language ?? 'en-US';
    this.recognition.continuous = this.config.continuous ?? true;
    this.recognition.interimResults = this.config.interimResults ?? true;
    this.recognition.maxAlternatives = this.config.maxAlternatives ?? 1;

    this.logger.debug('Setting up event handlers');
    this.setupEventHandlers();
    this.logger.info('Native STT initialized successfully', {
      hasRecognition: !!this.recognition,
      lang: this.recognition.lang,
      continuous: this.recognition.continuous,
    });
    return Promise.resolve();
  }

  /** Disconnect and release the `SpeechRecognition` instance. */
  protected async onDispose(): Promise<void> {
    this.shouldBeListening = false;
    if (this.recognition) {
      await this.disconnect();
    }
    this.recognition = null;
  }

  /**
   * Wire up `onresult`, `onerror`, `onend`, and `onstart` handlers on the
   * `SpeechRecognition` instance.
   */
  private setupEventHandlers(): void {
    if (!this.recognition) return;

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      const result = event.results[event.results.length - 1];
      if (!result) return;

      const transcript = result[0]?.transcript ?? '';
      const confidence = result[0]?.confidence ?? 0;
      const isFinal = result.isFinal;

      this.logger.debug('Recognition result received', {
        transcript,
        isFinal,
        confidence,
        resultIndex: event.resultIndex,
      });

      const transcriptionResult: TranscriptionResult = {
        text: transcript,
        isFinal,
        // SpeechRecognition emits one result per utterance — isFinal === speechFinal
        speechFinal: isFinal,
        utteranceComplete: isFinal,
        confidence,
        metadata: {
          resultIndex: event.resultIndex,
        },
      };

      this.emitTranscription(transcriptionResult);
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' fires when Chrome detects silence — not a real error.
      // The onend handler will auto-restart recognition.
      if (event.error === 'no-speech') {
        this.logger.debug('No speech detected — recognition will restart via onend');
        return;
      }

      // 'aborted' fires when we call stop()/abort() programmatically — expected during disconnect
      if (event.error === 'aborted') {
        this.logger.debug('Recognition aborted (expected during disconnect)');
        return;
      }

      // Real errors: provide helpful messages and emit
      let errorMessage = event.message || event.error;

      if (event.error === 'not-allowed') {
        errorMessage =
          'Microphone access denied. Please allow microphone permissions in your browser.';
      } else if (event.error === 'audio-capture') {
        errorMessage = 'No microphone found. Please connect a microphone and try again.';
      } else if (event.error === 'network') {
        errorMessage = 'Network error occurred during speech recognition.';
      }

      this.logger.error(`Recognition error: ${event.error}`, errorMessage);

      // Emit error as transcription result for real errors only
      const errorResult: TranscriptionResult = {
        text: '',
        isFinal: true,
        confidence: 0,
        metadata: {
          error: event.error,
          message: errorMessage,
        },
      };

      this.emitTranscription(errorResult);
    };

    this.recognition.onend = () => {
      if (!this.shouldBeListening) {
        this.logger.debug('Recognition ended (expected — disconnect was called)');
        return;
      }

      // Unexpected end while we should still be listening — auto-restart
      if (this.restartCount >= NativeSTT.MAX_RESTARTS) {
        this.logger.error(
          `Recognition ended unexpectedly ${this.restartCount} times — giving up. ` +
            'Call disconnect() then connect() to reset.'
        );
        this.shouldBeListening = false;
        return;
      }

      this.restartCount++;
      this.logger.info(
        `Recognition ended unexpectedly — restarting (attempt ${this.restartCount}/${NativeSTT.MAX_RESTARTS})`
      );

      // Small delay to avoid rapid-fire restart loops
      setTimeout(() => {
        if (!this.shouldBeListening || !this.recognition) return;
        try {
          this.recognition.start();
        } catch (error) {
          this.logger.error('Failed to restart recognition', error);
        }
      }, 200);
    };

    this.recognition.onstart = () => {
      this.restartCount = 0;
      this.logger.info('✅ Recognition started - listening for speech...');
    };
  }

  /**
   * Pre-check microphone permission via `getUserMedia`.
   *
   * @remarks
   * The Web Speech API will request permission automatically when
   * `start()` is called, but pre-checking allows for better error
   * messages when permission is denied or no microphone is available.
   *
   * @returns `true` if microphone access was granted, `false` otherwise.
   */
  private async checkMicrophonePermission(): Promise<boolean> {
    try {
      // Try to get microphone access (will prompt user if needed)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream immediately - we just needed permission
      stream.getTracks().forEach((track) => track.stop());
      this.logger.debug('Microphone permission granted');
      return true;
    } catch (error) {
      this.logger.error('Microphone permission denied or not available', error);
      return false;
    }
  }

  /**
   * Start the browser's speech recognition engine.
   *
   * @remarks
   * Checks microphone permission, then calls `SpeechRecognition.start()`.
   * The returned promise resolves once the browser fires the `onstart`
   * event, or rejects if the start times out or permission is denied.
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized, microphone permission is
   * denied, or the recognition engine does not start within
   * {@link NativeSTTConfig.startTimeout | startTimeout} milliseconds.
   */
  async connect(): Promise<void> {
    this.logger.debug('Attempting to connect NativeSTT', {
      isReady: this.isReady(),
      hasRecognition: !!this.recognition,
      initialized: this.initialized,
    });

    this.assertReady();

    if (!this.recognition) {
      this.logger.error('Recognition object is null even though provider is initialized');
      throw new ProviderConnectionError('NativeSTT', new Error('Recognition not initialized'));
    }

    // Check microphone permission first
    this.logger.debug('Checking microphone permission');
    const hasPermission = await this.checkMicrophonePermission();
    if (!hasPermission) {
      this.logger.error('Microphone permission denied');
      throw new ProviderConnectionError(
        'NativeSTT',
        new Error(
          'Microphone permission denied. Please allow microphone access in your browser settings and try again.'
        )
      );
    }

    const startTimeoutMs = this.config.startTimeout ?? 5000;

    return new Promise<void>((resolve, reject) => {
      if (!this.recognition) {
        reject(new ProviderConnectionError('NativeSTT', new Error('Recognition not initialized')));
        return;
      }

      const timeout = setTimeout(() => {
        // Restore onstart in case it fires late
        if (this.recognition) {
          this.recognition.onstart = () => {
            this.logger.info('Recognition started (late)');
          };
        }
        reject(
          new ProviderConnectionError(
            'NativeSTT',
            new Error(`Recognition did not start within ${startTimeoutMs}ms`)
          )
        );
      }, startTimeoutMs);

      const prevOnStart = this.recognition.onstart;
      this.recognition.onstart = (event: Event) => {
        clearTimeout(timeout);
        // Restore original onstart handler for subsequent calls
        if (this.recognition) {
          this.recognition.onstart = prevOnStart;
        }
        prevOnStart?.call(this.recognition!, event);
        this.logger.info('✅ Started recognition');
        resolve();
      };

      try {
        this.logger.debug('Starting speech recognition');
        this.shouldBeListening = true;
        this.restartCount = 0;
        this.recognition.start();
      } catch (error) {
        clearTimeout(timeout);
        if (this.recognition) {
          this.recognition.onstart = prevOnStart;
        }
        // If already started, that's okay - state machine manages lifecycle
        if (error instanceof Error && error.message.includes('already started')) {
          this.logger.debug('Recognition already started (state machine handles this)');
          resolve();
          return;
        }
        this.logger.error('Failed to start recognition', error);
        reject(new ProviderConnectionError('NativeSTT', error as Error));
      }
    });
  }

  /**
   * Stop the browser's speech recognition engine.
   *
   * @remarks
   * Calls `SpeechRecognition.stop()`. If the recognition instance has
   * already been stopped, the error is silently ignored.
   *
   * @returns Resolves immediately after requesting the stop.
   */
  disconnect(): Promise<void> {
    this.shouldBeListening = false;

    if (!this.recognition) {
      this.logger.debug('No recognition object to disconnect');
      return Promise.resolve();
    }

    try {
      this.recognition.stop();
      this.logger.info('✅ Stopped recognition');
    } catch (error) {
      this.logger.debug('Error stopping recognition (may already be stopped):', error);
    }

    return Promise.resolve();
  }

  /**
   * Check whether the `SpeechRecognition` instance exists and is ready.
   *
   * @returns `true` when the recognition object has been created (after
   *   initialization).
   */
  isConnected(): boolean {
    return this.recognition !== null;
  }

  /**
   * No-op -- NativeSTT directly accesses the microphone via the
   * `SpeechRecognition` API and does not accept external audio data.
   *
   * @remarks
   * CompositeVoice should **not** call this method because NativeSTT
   * covers the `'input'` role internally. Any invocation is silently ignored.
   *
   * @param _chunk - Audio chunk (unused).
   */
  sendAudio(_chunk: ArrayBuffer): void {
    // No-op: Native STT uses SpeechRecognition API which directly accesses the microphone
    // Audio flow: Microphone → SpeechRecognition API → onTranscription callback
    this.logger.debug('sendAudio() called on native STT (no-op - browser manages audio capture)');
  }

  // ── AudioInputProvider interface (multi-role: input + stt) ──────────

  /**
   * Start capturing audio via the browser's SpeechRecognition API.
   *
   * @remarks
   * Delegates to {@link NativeSTT.connect | connect()}. This method exists
   * to satisfy the {@link AudioInputProvider} interface for duck-type
   * validation in the provider resolution algorithm. In the multi-role
   * simplified path, the orchestrator calls `connect()` directly.
   *
   * @see {@link AudioInputProvider.start}
   */
  start(): void {
    this.connect().catch((err) =>
      this.logger.error('Failed to start audio input', err)
    );
  }

  /**
   * Stop capturing audio via the browser's SpeechRecognition API.
   *
   * @remarks
   * Delegates to {@link NativeSTT.disconnect | disconnect()}.
   *
   * @see {@link AudioInputProvider.stop}
   */
  stop(): void {
    this.disconnect().catch((err) =>
      this.logger.error('Failed to stop audio input', err)
    );
  }

  /**
   * Pause audio capture by stopping recognition.
   *
   * @remarks
   * The Web Speech API's `SpeechRecognition` does not support a native
   * pause operation, so this delegates to
   * {@link NativeSTT.disconnect | disconnect()} to halt recognition.
   * Use {@link NativeSTT.resume | resume()} to restart.
   *
   * @see {@link AudioInputProvider.pause}
   */
  pause(): void {
    this.disconnect().catch((err) =>
      this.logger.error('Failed to pause audio input', err)
    );
  }

  /**
   * Resume audio capture after a pause.
   *
   * @remarks
   * Delegates to {@link NativeSTT.connect | connect()} to restart the
   * SpeechRecognition engine after a {@link NativeSTT.pause | pause()}.
   *
   * @see {@link AudioInputProvider.resume}
   */
  resume(): void {
    this.connect().catch((err) =>
      this.logger.error('Failed to resume audio input', err)
    );
  }

  /**
   * Check whether the SpeechRecognition engine is actively listening.
   *
   * @returns `true` when recognition is active (between `connect()` and
   *   `disconnect()`).
   *
   * @see {@link AudioInputProvider.isActive}
   */
  isActive(): boolean {
    return this.shouldBeListening;
  }

  /**
   * No-op — NativeSTT directly accesses the microphone via the browser's
   * SpeechRecognition API and does not emit raw audio chunks.
   *
   * @remarks
   * The browser handles audio capture internally. This method exists
   * solely to satisfy the {@link AudioInputProvider} interface.
   *
   * @param _callback - Audio callback (unused).
   *
   * @see {@link AudioInputProvider.onAudio}
   */
  onAudio(_callback: (chunk: AudioChunk) => void): void {
    // No-op: browser's SpeechRecognition API handles audio internally
  }

  /**
   * Returns sensible audio metadata defaults for the Web Speech API.
   *
   * @remarks
   * The Web Speech API does not expose the actual audio format it uses
   * internally, so this returns reasonable defaults matching the most
   * common browser configuration. These values are used by the pipeline's
   * STT metadata auto-configuration when NativeSTT is the input provider.
   *
   * @returns {@link AudioMetadata} with `sampleRate: 16000`,
   *   `encoding: 'linear16'`, `channels: 1`, `bitDepth: 16`
   *
   * @see {@link AudioInputProvider.getMetadata}
   */
  getMetadata(): AudioMetadata {
    return {
      sampleRate: 16000,
      encoding: 'linear16',
      channels: 1,
      bitDepth: 16,
    };
  }
}
