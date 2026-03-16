/**
 * @packageDocumentation
 * Deepgram Flux (V2) Speech-to-Text provider.
 *
 * @remarks
 * Connects directly to Deepgram's V2 WebSocket API (`/v2/listen`) using
 * native WebSocket — no `@deepgram/sdk` required. Supports turn-based
 * transcription with eager end-of-turn signals for the eager LLM pipeline.
 *
 * @see {@link DeepgramSTT} for the V1 (Nova) Deepgram STT provider
 */

export { DeepgramFlux, type DeepgramFluxConfig, type DeepgramFluxOptions } from './DeepgramFlux';
