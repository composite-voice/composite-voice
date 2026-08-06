/**
 * Turn-taking logic for managing audio capture during TTS playback.
 *
 * @remarks
 * This module determines whether the SDK should pause microphone capture while
 * the TTS provider is playing audio back to the user. The decision depends on
 * the STT/TTS provider combination, the browser's echo cancellation capabilities,
 * and the configured turn-taking strategy.
 *
 * Without echo cancellation, the TTS audio output can be picked up by the
 * microphone and fed back to the STT provider, causing false transcriptions.
 * The turn-taking system prevents this by pausing capture when necessary.
 *
 * Three auto-detection strategies are supported:
 * - **conservative** (default): Pause unless the STT provider uses MediaDevices
 *   with echo cancellation support
 * - **aggressive**: Only pause for explicitly listed problematic combinations
 * - **detect**: Runtime detection of browser echo cancellation capabilities
 *
 * @example
 * ```typescript
 * import { shouldPauseCaptureOnPlayback } from 'composite-voice';
 *
 * const shouldPause = shouldPauseCaptureOnPlayback(
 *   turnTakingConfig,
 *   sttProvider,
 *   ttsProvider,
 *   logger,
 * );
 *
 * if (shouldPause) {
 *   stt.pause();
 * }
 * ```
 *
 * @packageDocumentation
 */

import type { TurnTakingConfig } from '../core/types/config';
import type { STTProvider, TTSProvider } from '../core/types/providers';
import type { Logger } from './logger';
import { flattenProviderChain } from './providerChain';

/**
 * Maps known provider class names to their audio capture method.
 *
 * @remarks
 * - `'mediadevices'` -- Uses `navigator.mediaDevices.getUserMedia()`, which
 *   supports browser echo cancellation constraints
 * - `'speechrecognition'` -- Uses the Web Speech API `SpeechRecognition`, which
 *   does NOT support echo cancellation
 * - `'none'` -- Does not capture audio (TTS providers)
 *
 * @internal
 */
const PROVIDER_CAPTURE_METHOD: Record<string, 'mediadevices' | 'speechrecognition' | 'none'> = {
  // STT Providers
  NativeSTT: 'speechrecognition', // Uses Web Speech API - NO echo cancellation support
  DeepgramSTT: 'mediadevices', // Uses getUserMedia - CAN use echo cancellation
  DeepgramFlux: 'mediadevices', // Uses getUserMedia - CAN use echo cancellation
  SpeechmaticsSTT: 'mediadevices', // Uses getUserMedia - CAN use echo cancellation

  // TTS Providers (don't capture, but noted for reference)
  NativeTTS: 'none',
  DeepgramTTS: 'none',
  SpeechifyTTS: 'none',
};

/**
 * Resolves the effective audio capture method for a provider instance.
 *
 * @remarks
 * Fallback chains (e.g. `FallbackSTT`) are unwrapped to their members: a
 * failover can land on any member mid-session, so the chain reports
 * `'mediadevices'` only when *every* member does. A member with an unknown
 * capture method makes the chain unknown, which the conservative strategy
 * treats as not supporting echo cancellation.
 *
 * @param provider - The STT or TTS provider instance.
 * @returns The capture method, or `undefined` when unknown.
 *
 * @internal
 */
function getCaptureMethod(
  provider: STTProvider | TTSProvider
): 'mediadevices' | 'speechrecognition' | 'none' | undefined {
  const members = flattenProviderChain(provider);
  if (members.length === 1) {
    return PROVIDER_CAPTURE_METHOD[getProviderName(provider)];
  }
  const methods = members.map((member) => PROVIDER_CAPTURE_METHOD[getProviderName(member)]);
  if (methods.every((method) => method === 'mediadevices')) return 'mediadevices';
  if (methods.some((method) => method === 'speechrecognition')) return 'speechrecognition';
  return undefined;
}

/**
 * Returns every provider class name a combination rule could match: the
 * provider's own name plus, for fallback chains, each member's name.
 *
 * @internal
 */
function getMatchableNames(provider: STTProvider | TTSProvider): string[] {
  const names = flattenProviderChain(provider).map((member) => getProviderName(member));
  const own = getProviderName(provider);
  return names.includes(own) ? names : [own, ...names];
}

/**
 * TTS providers whose audio output bypasses the browser's echo cancellation.
 *
 * @remarks
 * NativeTTS uses the SpeechSynthesis API which plays audio through a separate
 * system audio path, not through the Web Audio API graph. Browser echo
 * cancellation (via getUserMedia constraints) only works reliably when the
 * playback audio goes through the same audio graph — so even though
 * MicrophoneInput requests echoCancellation, NativeTTS audio still leaks
 * through to the microphone.
 *
 * @internal
 */
const TTS_BYPASSES_ECHO_CANCELLATION: Record<string, boolean> = {
  NativeTTS: true,
};

/**
 * Checks whether a provider uses MediaDevices and can therefore support echo cancellation.
 *
 * @param provider - The provider instance to check (fallback chains are unwrapped).
 * @returns `true` if the provider uses `MediaDevices` for audio capture, `false` otherwise.
 *
 * @internal
 */
function providerSupportsEchoCancellation(provider: STTProvider | TTSProvider): boolean {
  return getCaptureMethod(provider) === 'mediadevices';
}

/**
 * Extracts the class name from a provider instance for lookup in
 * the {@link PROVIDER_CAPTURE_METHOD} map.
 *
 * @param provider - The STT or TTS provider instance.
 * @returns The constructor name of the provider.
 *
 * @internal
 */
function getProviderName(provider: STTProvider | TTSProvider): string {
  return provider.constructor.name;
}

/**
 * Checks whether a specific STT/TTS provider combination is listed in the
 * always-pause combinations list.
 *
 * @remarks
 * Supports wildcard matching via the special value `'any'`, which matches
 * any provider name.
 *
 * For fallback chains, both the wrapper name and every member name are
 * matched, so listing a chained provider (e.g. `DeepgramSTT` inside a
 * `FallbackSTT`) still triggers the rule.
 *
 * @param sttNames - The matchable class names of the STT provider.
 * @param ttsNames - The matchable class names of the TTS provider.
 * @param combinations - The list of provider combinations that should always pause.
 * @returns `true` if the combination requires pausing, `false` otherwise.
 *
 * @internal
 */
function checkCombinationRequiresPause(
  sttNames: string[],
  ttsNames: string[],
  combinations?: Array<{ stt: string; tts: string }>
): boolean {
  if (!combinations) return false;

  return combinations.some((combo) => {
    const sttMatches = combo.stt === 'any' || sttNames.includes(combo.stt);
    const ttsMatches = combo.tts === 'any' || ttsNames.includes(combo.tts);
    return sttMatches && ttsMatches;
  });
}

/**
 * Detects echo cancellation support at runtime for the given STT provider.
 *
 * @remarks
 * This checks both:
 * 1. Whether the provider uses MediaDevices (SpeechRecognition API providers
 *    NEVER have echo cancellation, regardless of browser support)
 * 2. Whether the browser supports echo cancellation, noise suppression, and
 *    auto gain control constraints via `MediaDevices.getSupportedConstraints()`
 *
 * NOTE: This checks browser **capability**, not actual configuration. The
 * constraints must still be enabled when calling `getUserMedia()`.
 *
 * @param sttProvider - The STT provider instance to check.
 * @returns `true` if the provider and browser support echo cancellation, `false` otherwise.
 *
 * @internal
 */
function detectEchoCancellationSupport(sttProvider: STTProvider): boolean {
  // SpeechRecognition API providers NEVER have echo cancellation
  if (getCaptureMethod(sttProvider) === 'speechrecognition') {
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
 * Determines whether audio capture should be paused during TTS playback.
 *
 * @remarks
 * This is the primary decision function for turn-taking behavior. It evaluates
 * the configuration and provider capabilities to determine the optimal behavior:
 *
 * 1. **Explicit `true`**: Always pause (prevents echo, safest option)
 * 2. **Explicit `false`**: Never pause (full-duplex, requires good echo cancellation)
 * 3. **`'auto'`**: Decide based on the configured strategy:
 *    - `'conservative'`: Pause unless the STT provider supports echo cancellation
 *    - `'aggressive'`: Only pause for provider combinations in the always-pause list
 *    - `'detect'`: Use runtime browser capability detection
 *
 * @param config - The turn-taking configuration from the SDK options.
 * @param sttProvider - The active STT provider instance.
 * @param ttsProvider - The active TTS provider instance.
 * @param logger - Optional logger for diagnostic output about the decision.
 * @returns `true` if capture should be paused during playback, `false` for full-duplex.
 *
 * @example
 * ```typescript
 * const config: TurnTakingConfig = {
 *   pauseCaptureOnPlayback: 'auto',
 *   autoStrategy: 'conservative',
 * };
 *
 * const shouldPause = shouldPauseCaptureOnPlayback(config, stt, tts, logger);
 * // Returns true for NativeSTT (no echo cancellation)
 * // Returns false for DeepgramSTT (supports echo cancellation)
 * ```
 *
 * @see {@link TurnTakingConfig} for configuration options.
 * @see {@link explainTurnTakingDecision} for a human-readable explanation of the decision.
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
    case 'conservative': {
      // Pause by default, unless STT provider uses MediaDevices with echo cancellation
      // AND the TTS provider doesn't bypass echo cancellation (e.g. NativeTTS)
      const supportsEchoCancellation = providerSupportsEchoCancellation(sttProvider);
      const ttsBypassesEC = TTS_BYPASSES_ECHO_CANCELLATION[ttsName] === true;
      const captureMethod = getCaptureMethod(sttProvider) || 'unknown';
      const shouldPause = !supportsEchoCancellation || ttsBypassesEC;
      logger?.debug(
        `Turn-taking: Conservative - ${shouldPause ? 'PAUSE' : 'CONTINUE'} ` +
          `(${sttName} uses ${captureMethod}, ` +
          `echo cancellation: ${supportsEchoCancellation ? 'supported' : 'not supported'}, ` +
          `TTS bypasses EC: ${ttsBypassesEC})`
      );
      return shouldPause;
    }

    case 'aggressive': {
      // Only pause for known problematic combinations
      const requiresPause = checkCombinationRequiresPause(
        getMatchableNames(sttProvider),
        getMatchableNames(ttsProvider),
        alwaysPauseCombinations
      );
      logger?.debug(`Turn-taking: Aggressive - ${requiresPause ? 'PAUSE' : 'CONTINUE'}`);
      return requiresPause;
    }

    case 'detect': {
      // Attempt runtime detection - check if browser supports echo cancellation
      // Still force pause if TTS bypasses echo cancellation
      const hasEchoCancellation = detectEchoCancellationSupport(sttProvider);
      const ttsBypassesECDetect = TTS_BYPASSES_ECHO_CANCELLATION[ttsName] === true;
      const shouldPauseDetect = !hasEchoCancellation || ttsBypassesECDetect;
      logger?.debug(
        `Turn-taking: Detect - ${shouldPauseDetect ? 'PAUSE' : 'CONTINUE'} ` +
          `(echo cancellation: ${hasEchoCancellation ? 'supported' : 'not supported'}, ` +
          `TTS bypasses EC: ${ttsBypassesECDetect})`
      );
      return shouldPauseDetect;
    }

    default:
      logger?.warn(`Unknown turn-taking strategy: ${autoStrategy}, defaulting to conservative`);
      return true;
  }
}

/**
 * Returns a human-readable explanation of the turn-taking decision.
 *
 * @remarks
 * Useful for debugging and displaying turn-taking behavior to users or
 * in diagnostic logs. Describes the decision reasoning, including the
 * provider combination, capture method, and echo cancellation support.
 *
 * @param config - The turn-taking configuration.
 * @param sttProvider - The active STT provider instance.
 * @param ttsProvider - The active TTS provider instance.
 * @param willPause - The boolean result from {@link shouldPauseCaptureOnPlayback}.
 * @returns A multi-line string explaining the decision and its reasoning.
 *
 * @example
 * ```typescript
 * const willPause = shouldPauseCaptureOnPlayback(config, stt, tts);
 * const explanation = explainTurnTakingDecision(config, stt, tts, willPause);
 * console.log(explanation);
 * // Output:
 * // Capture will PAUSE during playback (auto mode, conservative strategy)
 * // STT Provider: NativeSTT (uses speechrecognition, echo cancellation: not supported)
 * // TTS Provider: NativeTTS
 * ```
 *
 * @see {@link shouldPauseCaptureOnPlayback}
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
  const captureMethod = getCaptureMethod(sttProvider) || 'unknown';
  const supportsEC = providerSupportsEchoCancellation(sttProvider);

  return (
    `Capture will ${action} during playback (auto mode, ${autoStrategy} strategy)\n` +
    `STT Provider: ${sttName} (uses ${captureMethod}, echo cancellation: ${supportsEC ? 'supported' : 'not supported'})\n` +
    `TTS Provider: ${ttsName}`
  );
}
