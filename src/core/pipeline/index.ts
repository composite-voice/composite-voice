/**
 * Pipeline orchestration utilities for the 5-role audio pipeline.
 *
 * @remarks
 * This module exports utilities that wire together the five pipeline stages
 * (input, stt, llm, tts, output). Currently provides:
 *
 * - {@link configureSTTFromMetadata} — auto-fills STT config from input
 *   provider metadata, avoiding manual duplication of encoding/sampleRate/channels.
 *
 * Future stories will add:
 * - `AudioBufferQueue` (US-002) — bounded FIFO queue between pipeline stages
 * - `AudioHeaderCache` (US-003) — format detection and header caching
 * - `resolveProviders` (US-007) — maps a provider array to a typed pipeline
 *
 * @packageDocumentation
 */

export { configureSTTFromMetadata } from './configureSTTFromMetadata';
