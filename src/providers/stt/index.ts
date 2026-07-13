/**
 * @packageDocumentation
 * Speech-to-Text (STT) providers for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports all built-in STT provider implementations:
 *
 * - **NativeSTT** -- Uses the Web Speech API (`SpeechRecognition`). Zero dependencies,
 *   works in modern browsers without an API key. Best for prototyping and demos.
 * - **DeepgramSTT** -- Connects to Deepgram's real-time streaming STT via WebSocket.
 *   Supports features like smart formatting, interim results, and endpointing.
 * - **AssemblyAISTT** -- Connects to AssemblyAI's real-time streaming STT via WebSocket.
 *   Supports features like word-level timestamps and automatic punctuation.
 * - **SonioxSTT** -- Connects to Soniox's real-time streaming STT via WebSocket.
 *   Supports 60+ languages, endpoint detection, and speaker diarization.
 *
 * @example
 * ```typescript
 * import { DeepgramSTT, NativeSTT, AssemblyAISTT } from '@lukeocodes/composite-voice/providers/stt';
 *
 * const stt = new DeepgramSTT({
 *   proxyUrl: '/api/proxy/deepgram',
 *   model: 'nova-3',
 *   language: 'en',
 * });
 * ```
 *
 * @see {@link NativeSTT} for browser-native speech recognition
 * @see {@link DeepgramSTT} for Deepgram streaming STT
 * @see {@link AssemblyAISTT} for AssemblyAI streaming STT
 * @see {@link SonioxSTT} for Soniox streaming STT
 */

export * from './native/index';
export * from './deepgram/index';
export * from './assemblyai/index';
export * from './elevenlabs/index';
export * from './soniox/index';

// Note: Additional providers (OpenAI) are available when peer dependencies are installed
// Import them directly:
// import { OpenAISTT } from '@lukeocodes/composite-voice/providers/stt/openai';
