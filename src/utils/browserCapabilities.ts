/**
 * Browser capabilities detection utilities
 */

/**
 * Audio constraint support
 */
export interface AudioConstraintSupport {
  echoCancellation: boolean;
  noiseSuppression: boolean;
  autoGainControl: boolean;
}

/**
 * Check which audio constraints are supported by the browser
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
 * Check if browser has good audio processing support (all three constraints)
 */
export function hasGoodAudioProcessing(): boolean {
  const support = getAudioConstraintSupport();
  return support.echoCancellation && support.noiseSuppression && support.autoGainControl;
}

/**
 * Browser API support
 */
export interface BrowserAPISupport {
  mediaDevices: boolean;
  speechRecognition: boolean;
  speechSynthesis: boolean;
  audioContext: boolean;
}

/**
 * Check which browser APIs are available
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
 * Get a human-readable report of browser capabilities
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
 * Log browser capabilities to console
 */
export function logBrowserCapabilities(): void {
  console.log(getBrowserCapabilitiesReport());
}
