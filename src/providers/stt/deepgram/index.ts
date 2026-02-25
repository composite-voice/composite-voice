/**
 * @packageDocumentation
 * Deepgram Speech-to-Text provider.
 *
 * @remarks
 * Re-exports the {@link DeepgramSTT} class and its configuration types. DeepgramSTT
 * connects to Deepgram's real-time streaming STT service via WebSocket, supporting
 * features like smart formatting, interim results, endpointing, utterance detection,
 * and multiple language models (e.g., `nova-3`).
 *
 * Requires either a direct API key or a proxy URL for authentication.
 *
 * @example
 * ```typescript
 * import { DeepgramSTT } from '@lukeocodes/composite-voice';
 *
 * const stt = new DeepgramSTT({
 *   proxyUrl: '/api/proxy/deepgram',
 *   model: 'nova-3',
 *   language: 'en',
 *   smartFormat: true,
 *   interimResults: true,
 * });
 * ```
 *
 * @see {@link NativeSTT} for browser-native speech recognition
 * @see {@link AssemblyAISTT} for AssemblyAI streaming STT
 */

export * from './DeepgramSTT';
