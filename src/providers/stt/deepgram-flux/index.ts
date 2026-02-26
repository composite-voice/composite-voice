/**
 * @packageDocumentation
 * Deepgram Flux (V2) Speech-to-Text provider.
 *
 * @remarks
 * Re-exports the {@link DeepgramFlux} class and its configuration types.
 * DeepgramFlux connects to Deepgram's V2 real-time streaming STT service via
 * WebSocket using the `@deepgram/sdk` V5 `listen.v2` API. It supports
 * turn-based transcription with `TurnInfo` events, eager end-of-turn signals
 * for speculative LLM generation, and Flux models (e.g., `flux-general-en`).
 *
 * Requires either a direct API key or a proxy URL for authentication.
 *
 * @example
 * ```typescript
 * import { DeepgramFlux } from '@lukeocodes/composite-voice';
 *
 * const stt = new DeepgramFlux({
 *   proxyUrl: '/api/proxy/deepgram',
 *   options: {
 *     model: 'flux-general-en',
 *     eagerEotThreshold: 0.5,
 *   },
 * });
 * ```
 *
 * @see {@link DeepgramSTT} for the V1 (Nova) Deepgram STT provider
 * @see {@link AssemblyAISTT} for AssemblyAI streaming STT
 */

export { DeepgramFlux, type DeepgramFluxConfig, type DeepgramFluxOptions } from './DeepgramFlux';
