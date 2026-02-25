/**
 * Browser capability detection utilities for the CompositeVoice SDK.
 *
 * @remarks
 * This module provides functions to detect which browser APIs and audio
 * processing features are available in the current environment. It is used
 * by the SDK to determine provider compatibility, choose turn-taking
 * strategies, and provide diagnostic information.
 *
 * The detection covers two categories:
 * 1. **Browser APIs**: MediaDevices, SpeechRecognition, SpeechSynthesis, AudioContext
 * 2. **Audio constraints**: Echo cancellation, noise suppression, auto gain control
 *
 * @example
 * ```typescript
 * import {
 *   getBrowserAPISupport,
 *   hasGoodAudioProcessing,
 *   logBrowserCapabilities,
 * } from 'composite-voice';
 *
 * const apis = getBrowserAPISupport();
 * if (!apis.mediaDevices) {
 *   console.warn('MediaDevices not available -- DeepgramSTT will not work');
 * }
 *
 * if (hasGoodAudioProcessing()) {
 *   console.log('Full-duplex mode is supported');
 * }
 *
 * // Print a complete diagnostic report to the console
 * logBrowserCapabilities();
 * ```
 *
 * @packageDocumentation
 */

/**
 * Describes which audio processing constraints the browser supports.
 *
 * @remarks
 * These constraints are used with `navigator.mediaDevices.getUserMedia()`
 * to enable browser-level audio processing. All three must be supported
 * for reliable full-duplex (simultaneous capture and playback) operation.
 *
 * @see {@link getAudioConstraintSupport}
 * @see {@link hasGoodAudioProcessing}
 */
export interface AudioConstraintSupport {
  /**
   * Whether the browser supports the `echoCancellation` constraint.
   *
   * @remarks
   * Echo cancellation removes audio output (TTS playback) from the
   * microphone input, preventing the STT provider from transcribing
   * the assistant's own speech.
   */
  echoCancellation: boolean;

  /**
   * Whether the browser supports the `noiseSuppression` constraint.
   *
   * @remarks
   * Noise suppression reduces background noise from the microphone
   * input, improving STT transcription accuracy.
   */
  noiseSuppression: boolean;

  /**
   * Whether the browser supports the `autoGainControl` constraint.
   *
   * @remarks
   * Auto gain control normalizes the microphone input volume,
   * ensuring consistent audio levels regardless of the user's
   * distance from the microphone.
   */
  autoGainControl: boolean;
}

/**
 * Detects which audio processing constraints are supported by the current browser.
 *
 * @remarks
 * Queries `navigator.mediaDevices.getSupportedConstraints()` to determine
 * browser support. If the `MediaDevices` API is not available, all constraints
 * are reported as unsupported.
 *
 * @returns An {@link AudioConstraintSupport} object describing supported constraints.
 *
 * @example
 * ```typescript
 * const support = getAudioConstraintSupport();
 * if (support.echoCancellation) {
 *   console.log('Echo cancellation is available');
 * }
 * ```
 */
export function getAudioConstraintSupport(): AudioConstraintSupport {
  if (!navigator.mediaDevices?.getSupportedConstraints) {
    return {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
  }

  const supported = navigator.mediaDevices.getSupportedConstraints();

  return {
    echoCancellation: Boolean(supported.echoCancellation),
    noiseSuppression: Boolean(supported.noiseSuppression),
    autoGainControl: Boolean(supported.autoGainControl),
  };
}

/**
 * Checks whether the browser supports all three audio processing constraints
 * (echo cancellation, noise suppression, and auto gain control).
 *
 * @remarks
 * Full audio processing support is required for reliable full-duplex mode,
 * where the microphone stays active during TTS playback. Without all three
 * constraints, the SDK should pause capture during playback to prevent echo.
 *
 * @returns `true` if all three audio constraints are supported, `false` otherwise.
 *
 * @example
 * ```typescript
 * if (hasGoodAudioProcessing()) {
 *   // Safe to use full-duplex mode
 *   config.turnTaking.pauseCaptureOnPlayback = false;
 * } else {
 *   // Must pause capture during playback
 *   config.turnTaking.pauseCaptureOnPlayback = true;
 * }
 * ```
 *
 * @see {@link getAudioConstraintSupport}
 */
export function hasGoodAudioProcessing(): boolean {
  const support = getAudioConstraintSupport();
  return support.echoCancellation && support.noiseSuppression && support.autoGainControl;
}

/**
 * Describes which browser APIs are available for the CompositeVoice SDK.
 *
 * @remarks
 * Each property indicates whether a specific API is available in the
 * current browser environment. Provider selection depends on these APIs:
 * - `mediaDevices` is required for {@link DeepgramSTT}
 * - `speechRecognition` is required for {@link NativeSTT}
 * - `speechSynthesis` is required for {@link NativeTTS}
 * - `audioContext` is required for audio playback and processing
 *
 * @see {@link getBrowserAPISupport}
 */
export interface BrowserAPISupport {
  /**
   * Whether `navigator.mediaDevices.getUserMedia` is available.
   *
   * @remarks
   * Required by providers that capture audio via the MediaDevices API
   * (e.g., DeepgramSTT). Not available in insecure contexts (HTTP).
   */
  mediaDevices: boolean;

  /**
   * Whether the Web Speech API `SpeechRecognition` is available.
   *
   * @remarks
   * Checks for both the standard `SpeechRecognition` and the
   * vendor-prefixed `webkitSpeechRecognition` (used by Chrome/Safari).
   * Required by NativeSTT.
   */
  speechRecognition: boolean;

  /**
   * Whether the `window.speechSynthesis` API is available.
   *
   * @remarks
   * Required by NativeTTS for browser-native text-to-speech.
   */
  speechSynthesis: boolean;

  /**
   * Whether the `AudioContext` API is available.
   *
   * @remarks
   * Checks for both the standard `AudioContext` and the vendor-prefixed
   * `webkitAudioContext`. Required for audio playback and processing.
   */
  audioContext: boolean;
}

/**
 * Detects which browser APIs are available for use by the SDK.
 *
 * @remarks
 * Checks for the presence of key browser APIs, including vendor-prefixed
 * variants. This function does not request permissions -- it only checks
 * whether the APIs exist in the global scope.
 *
 * @returns A {@link BrowserAPISupport} object describing available APIs.
 *
 * @example
 * ```typescript
 * const apis = getBrowserAPISupport();
 *
 * if (!apis.mediaDevices) {
 *   console.warn('getUserMedia not available. Are you on HTTPS?');
 * }
 *
 * if (!apis.speechRecognition) {
 *   console.warn('Web Speech API not available. NativeSTT will not work.');
 * }
 * ```
 */
export function getBrowserAPISupport(): BrowserAPISupport {
  return {
    mediaDevices: Boolean(navigator.mediaDevices?.getUserMedia),
    speechRecognition: Boolean(
      (window as Window & { SpeechRecognition?: unknown }).SpeechRecognition ||
        (window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
    ),
    speechSynthesis: Boolean(window.speechSynthesis),
    audioContext: Boolean(
      (window as Window & { AudioContext?: unknown }).AudioContext ||
        (window as Window & { webkitAudioContext?: unknown }).webkitAudioContext
    ),
  };
}

/**
 * Generates a human-readable report of all detected browser capabilities.
 *
 * @remarks
 * The report includes API availability, audio constraint support, and a
 * recommendation for turn-taking mode. Useful for diagnostics and debugging
 * browser compatibility issues.
 *
 * @returns A multi-line formatted string with the capabilities report.
 *
 * @example
 * ```typescript
 * const report = getBrowserCapabilitiesReport();
 * console.log(report);
 * // Output:
 * // Browser Capabilities Report
 * //
 * // APIs:
 * //   - MediaDevices: supported
 * //   - SpeechRecognition: supported
 * //   ...
 * ```
 *
 * @see {@link getBrowserAPISupport}
 * @see {@link getAudioConstraintSupport}
 * @see {@link hasGoodAudioProcessing}
 */
export function getBrowserCapabilitiesReport(): string {
  const apis = getBrowserAPISupport();
  const audio = getAudioConstraintSupport();

  const lines = [
    '🌐 Browser Capabilities Report',
    '',
    '📡 APIs:',
    `  - MediaDevices: ${apis.mediaDevices ? '✅' : '❌'}`,
    `  - SpeechRecognition: ${apis.speechRecognition ? '✅' : '❌'}`,
    `  - SpeechSynthesis: ${apis.speechSynthesis ? '✅' : '❌'}`,
    `  - AudioContext: ${apis.audioContext ? '✅' : '❌'}`,
    '',
    '🎤 Audio Constraints:',
    `  - Echo Cancellation: ${audio.echoCancellation ? '✅' : '❌'}`,
    `  - Noise Suppression: ${audio.noiseSuppression ? '✅' : '❌'}`,
    `  - Auto Gain Control: ${audio.autoGainControl ? '✅' : '❌'}`,
    '',
    '💡 Recommendation:',
    hasGoodAudioProcessing()
      ? '  ✅ Your browser supports full-duplex mode (no pause needed)'
      : '  ⚠️  Your browser should pause during playback to prevent echo',
  ];

  return lines.join('\n');
}

/**
 * Logs the browser capabilities report to the console.
 *
 * @remarks
 * Convenience wrapper around {@link getBrowserCapabilitiesReport} that
 * outputs directly to `console.log`. Useful for quick diagnostics during
 * development.
 *
 * @example
 * ```typescript
 * // Call during app initialization to check browser support
 * logBrowserCapabilities();
 * ```
 *
 * @see {@link getBrowserCapabilitiesReport}
 */
export function logBrowserCapabilities(): void {
  console.log(getBrowserCapabilitiesReport());
}
