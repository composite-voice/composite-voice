/**
 * Turn-taking utilities
 * Determines whether to pause capture during playback based on configuration
 */

import type { TurnTakingConfig } from '../core/types/config';
import type { STTProvider, TTSProvider } from '../core/types/providers';
import type { Logger } from './logger';

/**
 * Provider audio capture method
 * Determines if provider uses MediaDevices (can have echo cancellation) or SpeechRecognition (cannot)
 */
const PROVIDER_CAPTURE_METHOD: Record<string, 'mediadevices' | 'speechrecognition' | 'none'> = {
  // STT Providers
  NativeSTT: 'speechrecognition', // Uses Web Speech API - NO echo cancellation support
  DeepgramSTT: 'mediadevices', // Uses getUserMedia - CAN use echo cancellation

  // TTS Providers (don't capture, but noted for reference)
  NativeTTS: 'none',
  DeepgramTTS: 'none',
};

/**
 * Check if provider uses MediaDevices (and thus can support echo cancellation)
 */
function providerSupportsEchoCancellation(providerName: string): boolean {
  return PROVIDER_CAPTURE_METHOD[providerName] === 'mediadevices';
}

/**
 * Get provider name from provider instance
 */
function getProviderName(provider: STTProvider | TTSProvider): string {
  return provider.constructor.name;
}

/**
 * Check if provider combination requires pause
 */
function checkCombinationRequiresPause(
  sttName: string,
  ttsName: string,
  combinations?: Array<{ stt: string; tts: string }>
): boolean {
  if (!combinations) return false;

  return combinations.some((combo) => {
    const sttMatches = combo.stt === 'any' || combo.stt === sttName;
    const ttsMatches = combo.tts === 'any' || combo.tts === ttsName;
    return sttMatches && ttsMatches;
  });
}

/**
 * Detect echo cancellation support at runtime
 * Checks if the browser supports echo cancellation constraints
 *
 * NOTE: This checks browser capability, not actual configuration.
 * SpeechRecognition API does NOT support echo cancellation regardless of browser capability.
 */
function detectEchoCancellationSupport(sttProvider: STTProvider): boolean {
  const providerName = getProviderName(sttProvider);

  // SpeechRecognition API providers NEVER have echo cancellation
  if (PROVIDER_CAPTURE_METHOD[providerName] === 'speechrecognition') {
    return false;
  }

  // Check if browser supports echo cancellation constraints
  if (!navigator.mediaDevices?.getSupportedConstraints) {
    return false;
  }

  const supported = navigator.mediaDevices.getSupportedConstraints();

  // Return true if browser supports echo cancellation, noise suppression, and auto gain control
  return Boolean(
    supported.echoCancellation && supported.noiseSuppression && supported.autoGainControl
  );
}

/**
 * Determine whether to pause capture during playback
 *
 * @param config Turn-taking configuration
 * @param sttProvider STT provider instance
 * @param ttsProvider TTS provider instance
 * @param logger Optional logger for debugging
 * @returns boolean - true if should pause, false otherwise
 */
export function shouldPauseCaptureOnPlayback(
  config: TurnTakingConfig,
  sttProvider: STTProvider,
  ttsProvider: TTSProvider,
  logger?: Logger
): boolean {
  const { pauseCaptureOnPlayback, autoStrategy = 'conservative', alwaysPauseCombinations } = config;

  // Explicit configuration
  if (pauseCaptureOnPlayback === true) {
    logger?.debug('Turn-taking: Explicitly configured to pause');
    return true;
  }

  if (pauseCaptureOnPlayback === false) {
    logger?.debug('Turn-taking: Explicitly configured to NOT pause (full-duplex)');
    return false;
  }

  // Auto mode - determine based on strategy
  const sttName = getProviderName(sttProvider);
  const ttsName = getProviderName(ttsProvider);

  logger?.debug(`Turn-taking: Auto mode with ${autoStrategy} strategy (${sttName} + ${ttsName})`);

  switch (autoStrategy) {
    case 'conservative':
      // Pause by default, unless STT provider uses MediaDevices with echo cancellation
      const supportsEchoCancellation = providerSupportsEchoCancellation(sttName);
      const captureMethod = PROVIDER_CAPTURE_METHOD[sttName] || 'unknown';
      const shouldPause = !supportsEchoCancellation;
      logger?.debug(
        `Turn-taking: Conservative - ${shouldPause ? 'PAUSE' : 'CONTINUE'} ` +
          `(${sttName} uses ${captureMethod}, ` +
          `echo cancellation: ${supportsEchoCancellation ? 'supported' : 'not supported'})`
      );
      return shouldPause;

    case 'aggressive':
      // Only pause for known problematic combinations
      const requiresPause = checkCombinationRequiresPause(
        sttName,
        ttsName,
        alwaysPauseCombinations
      );
      logger?.debug(`Turn-taking: Aggressive - ${requiresPause ? 'PAUSE' : 'CONTINUE'}`);
      return requiresPause;

    case 'detect':
      // Attempt runtime detection - check if browser supports echo cancellation
      const hasEchoCancellation = detectEchoCancellationSupport(sttProvider);
      const shouldPauseDetect = !hasEchoCancellation;
      logger?.debug(
        `Turn-taking: Detect - ${shouldPauseDetect ? 'PAUSE' : 'CONTINUE'} ` +
          `(echo cancellation: ${hasEchoCancellation ? 'supported' : 'not supported'})`
      );
      return shouldPauseDetect;

    default:
      logger?.warn(`Unknown turn-taking strategy: ${autoStrategy}, defaulting to conservative`);
      return true;
  }
}

/**
 * Get a human-readable explanation of the turn-taking decision
 */
export function explainTurnTakingDecision(
  config: TurnTakingConfig,
  sttProvider: STTProvider,
  ttsProvider: TTSProvider,
  willPause: boolean
): string {
  const { pauseCaptureOnPlayback, autoStrategy } = config;
  const sttName = getProviderName(sttProvider);
  const ttsName = getProviderName(ttsProvider);

  if (pauseCaptureOnPlayback === true) {
    return `Capture will PAUSE during playback (explicitly configured)`;
  }

  if (pauseCaptureOnPlayback === false) {
    return `Capture will CONTINUE during playback (full-duplex mode explicitly enabled)`;
  }

  const action = willPause ? 'PAUSE' : 'CONTINUE';
  const captureMethod = PROVIDER_CAPTURE_METHOD[sttName] || 'unknown';
  const supportsEC = providerSupportsEchoCancellation(sttName);

  return (
    `Capture will ${action} during playback (auto mode, ${autoStrategy} strategy)\n` +
    `STT Provider: ${sttName} (uses ${captureMethod}, echo cancellation: ${supportsEC ? 'supported' : 'not supported'})\n` +
    `TTS Provider: ${ttsName}`
  );
}
