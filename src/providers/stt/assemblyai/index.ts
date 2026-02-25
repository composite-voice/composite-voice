/**
 * @packageDocumentation
 * AssemblyAI Speech-to-Text provider.
 *
 * @remarks
 * Re-exports the {@link AssemblyAISTT} class and its configuration type. AssemblyAISTT
 * connects to AssemblyAI's real-time streaming STT service via WebSocket, supporting
 * features like automatic punctuation, word-level timestamps, and multiple languages.
 *
 * Requires either a direct API key or a proxy URL for authentication.
 *
 * @example
 * ```typescript
 * import { AssemblyAISTT } from '@lukeocodes/composite-voice';
 *
 * const stt = new AssemblyAISTT({
 *   proxyUrl: '/api/proxy/assemblyai',
 *   sampleRate: 16000,
 * });
 * ```
 *
 * @see {@link DeepgramSTT} for Deepgram streaming STT
 * @see {@link NativeSTT} for browser-native speech recognition
 */
export * from './AssemblyAISTT';
