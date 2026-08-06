/**
 * @packageDocumentation
 * Local voice-activity-detection (VAD) subsystem.
 *
 * @remarks
 * Provider-independent speech detection for the pipeline: a local Silero
 * model scores microphone audio directly, giving barge-in and end-of-turn
 * signals that don't depend on any STT vendor's event semantics.
 *
 * @see {@link SileroVAD} for the built-in ONNX engine
 * @see {@link VADProcessor} for framing and segment detection
 */

export { SileroVAD, DEFAULT_SILERO_MODEL_URL } from './SileroVAD';
export type { SileroVADOptions } from './SileroVAD';
export { VADProcessor } from './VADProcessor';
export type { VADProcessorOptions } from './VADProcessor';
export type { VADEngine, VADSpeechStartInfo, VADSpeechEndInfo } from './types';
