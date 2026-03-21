/**
 * @packageDocumentation
 * Audio input providers for the CompositeVoice SDK.
 *
 * @remarks
 * This module exports input providers that handle the `'input'` role in the
 * 5-role pipeline. Input providers capture or receive audio and deliver it
 * to the STT stage via the input queue.
 *
 * - {@link MicrophoneInput} — Captures microphone audio (browser)
 * - {@link BufferInput} — Accepts pushed audio buffers (Node.js / Bun / Deno)
 *
 * @see {@link AudioInputProvider} for the interface contract
 */

export { MicrophoneInput } from './MicrophoneInput';
export type { MicrophoneInputConfig } from './MicrophoneInput';
export { BufferInput } from './BufferInput';
export { NullInput } from './NullInput';
