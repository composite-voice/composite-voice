/**
 * Pipeline orchestration utilities for the 5-role audio pipeline.
 *
 * @remarks
 * This module exports utilities that wire together the five pipeline stages
 * (input, stt, llm, tts, output). Provides:
 *
 * - {@link AudioBufferQueue} — bounded FIFO queue between pipeline stages
 *   that buffers audio during STT connection and flushes when ready.
 * - {@link AudioHeaderCache} — caches audio container headers for re-injection
 *   on WebSocket reconnection.
 * - {@link configureSTTFromMetadata} — auto-fills STT config from input
 *   provider metadata, avoiding manual duplication of encoding/sampleRate/channels.
 * - {@link resolveProviders} — maps a flat provider array to a typed
 *   {@link ResolvedPipeline}, with auto-filling of NativeSTT/NativeTTS defaults.
 *
 * @packageDocumentation
 */

export { AudioBufferQueue } from './AudioBufferQueue';
export type { QueueStats, DrainCallback } from './AudioBufferQueue';
export { configureSTTFromMetadata } from './configureSTTFromMetadata';
export { resolveProviders } from './resolveProviders';
export { AudioHeaderCache } from './AudioHeaderCache';
