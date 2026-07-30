/**
 * @packageDocumentation
 * Audio output providers for the CompositeVoice SDK.
 *
 * @remarks
 * This module exports output providers that handle the `'output'` role in the
 * 5-role pipeline. Output providers receive audio chunks from the TTS provider
 * (via the output queue) and play them through speakers or discard them.
 *
 * - {@link BrowserAudioOutput} — Plays audio via the Web Audio API (browser)
 * - {@link NullOutput} — Discards audio silently (Node.js / Bun / Deno)
 * - {@link WebRTCOutput} — Renders TTS audio into a publishable WebRTC track (browser)
 *
 * @see {@link AudioOutputProvider} for the interface contract
 */

export { BrowserAudioOutput } from './BrowserAudioOutput';
export type { BrowserAudioOutputConfig } from './BrowserAudioOutput';
export { NullOutput } from './NullOutput';
export { WebRTCOutput } from './WebRTCOutput';
export type { WebRTCOutputConfig } from './WebRTCOutput';
