/**
 * Controls turn-taking behavior: deciding whether to pause audio capture
 * during TTS playback, and executing the pause/resume lifecycle.
 *
 * @remarks
 * Extracted from CompositeVoice to encapsulate the repeated pause/resume
 * capture logic that was scattered across processTTS, finalizeLiveTTS,
 * and error recovery paths. CompositeVoice delegates turn-taking decisions
 * and execution to this collaborator.
 *
 * @packageDocumentation
 */

import type { TurnTakingConfig } from '../types/config';
import type {
  STTProvider,
  TTSProvider,
  LiveSTTProvider,
  AudioInputProvider,
} from '../types/providers';
import type { AudioChunk } from '../types/audio';
import { DEFAULT_TURN_TAKING_CONFIG } from '../types/config';
import { shouldPauseCaptureOnPlayback } from '../../utils/turnTaking';
import { AudioBufferQueue } from '../pipeline/AudioBufferQueue';
import { AudioHeaderCache } from '../pipeline/AudioHeaderCache';
import type { Logger } from '../../utils/logger';

/**
 * Type guard that checks whether an STT provider uses a live WebSocket connection.
 */
function isLiveSTT(provider: STTProvider): provider is LiveSTTProvider {
  return provider.type === 'websocket';
}

/**
 * Manages pause/resume of audio capture during TTS playback.
 *
 * @remarks
 * Encapsulates the logic for:
 * - Deciding whether to pause capture based on turn-taking configuration
 * - Executing pause: stop queue draining, pause input, disconnect STT
 * - Executing resume: resume input, reconnect STT, re-inject cached header,
 *   restart queue draining
 */
export class TurnTakingController {
  private readonly turnTakingConfig: TurnTakingConfig;

  constructor(
    config: TurnTakingConfig | undefined,
    private logger: Logger
  ) {
    this.turnTakingConfig = { ...DEFAULT_TURN_TAKING_CONFIG, ...config };
  }

  /**
   * Determine whether audio capture should be paused during playback
   * for the given provider combination.
   *
   * @param stt - The STT provider instance.
   * @param tts - The TTS provider instance.
   * @returns `true` if capture should be paused, `false` for full-duplex.
   */
  shouldPause(stt: STTProvider, tts: TTSProvider): boolean {
    return shouldPauseCaptureOnPlayback(this.turnTakingConfig, stt, tts, this.logger);
  }

  /**
   * Pause audio capture: stop queue draining, pause input, disconnect STT.
   *
   * @param stt - The STT provider.
   * @param input - The audio input provider.
   * @param inputQueue - The input audio buffer queue.
   * @param isMultiRoleInput - Whether input and STT are the same provider instance.
   */
  async pauseCapture(
    stt: STTProvider,
    input: AudioInputProvider,
    inputQueue: AudioBufferQueue,
    isMultiRoleInput: boolean
  ): Promise<void> {
    if (!isMultiRoleInput) {
      inputQueue.stopDraining();
      input.pause();
    }
    if (isLiveSTT(stt)) {
      await stt.disconnect();
    }
  }

  /**
   * Resume audio capture: resume input, reconnect STT, re-inject cached header,
   * restart queue draining.
   *
   * @param stt - The STT provider.
   * @param input - The audio input provider.
   * @param inputQueue - The input audio buffer queue.
   * @param headerCache - The audio header cache for WebSocket reconnection.
   * @param isMultiRoleInput - Whether input and STT are the same provider instance.
   */
  async resumeCapture(
    stt: STTProvider,
    input: AudioInputProvider,
    inputQueue: AudioBufferQueue,
    headerCache: AudioHeaderCache,
    isMultiRoleInput: boolean
  ): Promise<void> {
    if (!isMultiRoleInput) {
      input.resume();
    }
    if (isLiveSTT(stt)) {
      await stt.connect();
      if (!isMultiRoleInput) {
        const header = headerCache.getHeader();
        if (header) {
          stt.sendAudio(header);
        }
        inputQueue.startDraining((chunk: AudioChunk) => {
          (stt as LiveSTTProvider).sendAudio(chunk.data);
        });
      }
    }
  }

  /**
   * Attempt to recover STT capture after an error.
   *
   * @remarks
   * Re-connects STT and restarts queue draining, starting from a clean state.
   * Used in error recovery paths within processTTS and finalizeLiveTTS.
   *
   * @param stt - The STT provider.
   * @param input - The audio input provider.
   * @param inputQueue - The input audio buffer queue.
   * @param headerCache - The audio header cache.
   * @param isMultiRoleInput - Whether input and STT are the same provider instance.
   * @param captureWasPaused - Whether capture was in paused state (needs resume, not restart).
   */
  async recoverCapture(
    stt: STTProvider,
    input: AudioInputProvider,
    inputQueue: AudioBufferQueue,
    headerCache: AudioHeaderCache,
    isMultiRoleInput: boolean,
    captureWasPaused: boolean
  ): Promise<void> {
    if (captureWasPaused && !isMultiRoleInput) {
      input.resume();
    }
    if (isLiveSTT(stt)) {
      await stt.connect();
      if (!isMultiRoleInput) {
        const header = headerCache.getHeader();
        if (header) {
          stt.sendAudio(header);
        }
        inputQueue.startDraining((chunk: AudioChunk) => {
          (stt as LiveSTTProvider).sendAudio(chunk.data);
        });
      }
    }
  }
}
