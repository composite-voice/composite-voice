/**
 * Pipeline orchestration utilities for the 5-role audio pipeline.
 *
 * @remarks
 * This module exports utilities that wire together the five pipeline stages
 * (input, stt, llm, tts, output). Currently provides:
 *
 * - {@link configureSTTFromMetadata} — auto-fills STT config from input
 *   provider metadata, avoiding manual duplication of encoding/sampleRate/channels.
 * - {@link resolveProviders} — maps a flat provider array to a typed
 *   {@link ResolvedPipeline}, with auto-filling of NativeSTT/NativeTTS defaults.
 *
 * Future stories will add:
 * - `AudioBufferQueue` (US-002) — bounded FIFO queue between pipeline stages
 *
 * @packageDocumentation
 */

export { configureSTTFromMetadata } from './configureSTTFromMetadata';
export { resolveProviders } from './resolveProviders';
export { AudioHeaderCache } from './AudioHeaderCache';
