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
 * - **GladiaSTT** -- Connects to Gladia's v2 live STT (Solaria models) via an
 *   HTTP session init followed by WebSocket streaming. Supports server-side
 *   endpointing, language pinning, and code switching.
 * - **SpeechmaticsSTT** -- Connects to Speechmatics' real-time streaming STT via WebSocket.
 *   Supports 50+ languages, end-of-utterance detection, and speaker diarization.
 * - **RevAISTT** -- Connects to Rev AI's streaming STT via WebSocket.
 *   Supports 9 languages, profanity filtering, and custom vocabularies.
 * - **OpenAIRealtimeSTT** -- Connects to OpenAI's Realtime API transcription
 *   intent via WebSocket. Supports server/semantic VAD turn detection and
 *   noise reduction.
 * - **GoogleSTT** -- Connects to Google Cloud Speech-to-Text via REST (batch,
 *   per-utterance transcription of complete recordings up to 60 seconds).
 *   Google's streaming API is gRPC-only, so there is no live variant.
 * - **AzureSTT** -- Connects to the Microsoft Azure Speech real-time STT
 *   WebSocket API. Supports 100+ locales, interim hypotheses, and service-side
 *   end-of-utterance detection.
 * - **TranscribeSTT** -- Connects to Amazon Transcribe's streaming STT via a
 *   SigV4-presigned WebSocket. Supports partial-results stabilization, custom
 *   vocabularies, and speaker partitioning.
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
 * @see {@link GladiaSTT} for Gladia streaming STT
 * @see {@link SpeechmaticsSTT} for Speechmatics streaming STT
 * @see {@link RevAISTT} for Rev AI streaming STT
 * @see {@link OpenAIRealtimeSTT} for OpenAI Realtime streaming STT
 * @see {@link GoogleSTT} for Google Cloud batch (REST) STT
 * @see {@link AzureSTT} for Microsoft Azure streaming STT
 * @see {@link TranscribeSTT} for Amazon Transcribe streaming STT
 */

export * from './native/index';
export * from './deepgram/index';
export * from './assemblyai/index';
export * from './elevenlabs/index';
export * from './soniox/index';
export * from './gladia/index';
export * from './speechmatics/index';
export * from './revai/index';
export * from './google/index';
export * from './azure/index';
export * from './transcribe/index';

// Note: Additional providers (OpenAI) are available when peer dependencies are installed
// Import them directly:
// import { OpenAISTT } from '@lukeocodes/composite-voice/providers/stt/openai';
export * from './openai/index';
