/**
 * AudioWorklet processor for microphone audio capture.
 *
 * @remarks
 * This module defines the {@link AudioCaptureProcessor} class, which runs in the
 * AudioWorklet thread to capture microphone audio without blocking the main thread.
 * The processor receives raw audio frames from the Web Audio API and forwards them
 * to the main thread via `MessagePort.postMessage`.
 *
 * This file is inlined as a Blob URL at runtime by {@link AudioCapture} — it is
 * **not** loaded as a separate network request. The inline source is kept in sync
 * with this file; this file exists primarily for documentation and type-checking.
 *
 * @packageDocumentation
 *
 * @see {@link AudioCapture} for the main-thread counterpart.
 */

// AudioWorklet globals — these exist in the worklet scope, not the main thread.
declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

/**
 * AudioWorklet processor that captures input audio and posts it to the main thread.
 *
 * @remarks
 * Each call to {@link AudioCaptureProcessor.process | process()} receives a render
 * quantum (typically 128 frames) of audio data. The processor copies the first
 * channel of the first input and sends it as a `Float32Array` message of type
 * `'audio'`. Returning `true` keeps the processor alive until the node is
 * disconnected.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  process(
    inputs: Float32Array[][],
    _outputs: Float32Array[][],
    _parameters: Record<string, Float32Array>
  ): boolean {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      // Copy the input data and post it to the main thread
      this.port.postMessage({
        type: 'audio',
        data: new Float32Array(input[0]),
      });
    }
    return true; // keep processor alive
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
