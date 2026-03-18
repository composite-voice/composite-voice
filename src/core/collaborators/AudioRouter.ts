/**
 * Manages audio buffer queues and header cache for the 5-role pipeline,
 * wiring input to STT and TTS to output.
 *
 * @remarks
 * Extracted from CompositeVoice to encapsulate all queue creation, wiring,
 * and drain management in a single, independently testable class.
 * CompositeVoice delegates audio routing to this collaborator.
 *
 * @packageDocumentation
 */

import type { AudioBufferQueueConfig } from '../types/config';
import type {
  AudioInputProvider,
  AudioOutputProvider,
  LiveSTTProvider,
  STTProvider,
} from '../types/providers';
import type { AudioChunk } from '../types/audio';
import { AudioBufferQueue } from '../pipeline/AudioBufferQueue';
import type { QueueStats, OverflowCallback } from '../pipeline/AudioBufferQueue';
import { AudioHeaderCache } from '../pipeline/AudioHeaderCache';
import { configureSTTFromMetadata } from '../pipeline/configureSTTFromMetadata';

/**
 * Type guard that checks whether an STT provider uses a live WebSocket connection.
 */
function isLiveSTT(provider: STTProvider): provider is LiveSTTProvider {
  return provider.type === 'websocket';
}

/**
 * Manages audio buffer queues and header cache wiring for the pipeline.
 *
 * @remarks
 * Creates and owns the input queue, output queue, and header cache.
 * Provides methods for wiring providers to queues, starting/stopping
 * drains, and cleanup.
 */
export class AudioRouter {
  readonly inputQueue: AudioBufferQueue;
  readonly outputQueue: AudioBufferQueue;
  readonly headerCache: AudioHeaderCache;

  constructor(
    inputQueueConfig?: Partial<AudioBufferQueueConfig>,
    outputQueueConfig?: Partial<AudioBufferQueueConfig>
  ) {
    this.inputQueue = new AudioBufferQueue({
      name: 'input',
      maxSize: 1000,
      overflowStrategy: 'drop-oldest',
      ...inputQueueConfig,
    });
    this.outputQueue = new AudioBufferQueue({
      name: 'output',
      maxSize: 1000,
      overflowStrategy: 'drop-oldest',
      ...outputQueueConfig,
    });
    this.headerCache = new AudioHeaderCache();
  }

  /**
   * Register overflow callbacks for both queues.
   *
   * @param inputOverflow - Callback for input queue overflow.
   * @param outputOverflow - Callback for output queue overflow.
   */
  onOverflow(inputOverflow: OverflowCallback, outputOverflow: OverflowCallback): void {
    this.inputQueue.onOverflow(inputOverflow);
    this.outputQueue.onOverflow(outputOverflow);
  }

  /**
   * Wire the input provider to the input queue through the header cache.
   *
   * @remarks
   * Sets up the `onAudio` callback on the input provider to feed chunks
   * through the header cache and into the input queue.
   *
   * @param input - The audio input provider.
   */
  wireInput(input: AudioInputProvider): void {
    input.onAudio((chunk: AudioChunk) => {
      this.headerCache.process(chunk.data);
      this.inputQueue.enqueue(chunk);
    });
  }

  /**
   * Configure STT from input metadata, connect STT, and start draining
   * the input queue into the STT provider.
   *
   * @remarks
   * This implements the race condition fix: audio is buffered in the input
   * queue while the STT WebSocket handshake completes, then flushed in
   * order when draining starts.
   *
   * @param stt - The STT provider.
   * @param input - The audio input provider (for metadata).
   */
  async connectAndDrainInput(stt: STTProvider, input: AudioInputProvider): Promise<void> {
    // Auto-configure STT from input's audio metadata
    configureSTTFromMetadata(stt, input.getMetadata());

    // Connect STT (async - WebSocket handshake happens here)
    if (isLiveSTT(stt)) {
      await stt.connect();
    }

    // Start draining: flush all buffered chunks then switch to pass-through
    if (isLiveSTT(stt)) {
      this.inputQueue.startDraining((chunk: AudioChunk) => {
        stt.sendAudio(chunk.data);
      });
    }
  }

  /**
   * Start draining the output queue to the output provider.
   *
   * @param output - The audio output provider.
   */
  startOutputDrain(output: AudioOutputProvider): void {
    this.outputQueue.startDraining((chunk: AudioChunk) => {
      output.enqueue(chunk);
    });
  }

  /**
   * Stop draining and clear both queues.
   */
  stopAndClear(): void {
    this.inputQueue.stopDraining();
    this.inputQueue.clear();
    this.outputQueue.clear();
  }

  /**
   * Stop input draining and clear the input queue.
   */
  stopInput(): void {
    this.inputQueue.stopDraining();
    this.inputQueue.clear();
  }

  /**
   * Get stats for both queues.
   */
  getStats(): { input: QueueStats; output: QueueStats } {
    return {
      input: this.inputQueue.getStats(),
      output: this.outputQueue.getStats(),
    };
  }

  /**
   * Reset the header cache.
   */
  resetHeaderCache(): void {
    this.headerCache.reset();
  }

  /**
   * Clear both queues without stopping drains.
   */
  clearQueues(): void {
    this.inputQueue.clear();
    this.outputQueue.clear();
  }
}
