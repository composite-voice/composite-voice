/**
 * @packageDocumentation
 * Text-to-Speech (TTS) providers for the CompositeVoice SDK.
 *
 * @remarks
 * Re-exports all built-in TTS provider implementations:
 *
 * - **NativeTTS** -- Uses the Web Speech Synthesis API (`SpeechSynthesis`). Zero
 *   dependencies, works in modern browsers without an API key. Best for prototyping.
 * - **DeepgramTTS** -- Connects to Deepgram's real-time streaming TTS via WebSocket.
 *   Supports multiple voices and low-latency audio streaming.
 * - **OpenAITTS** -- Connects to the OpenAI TTS API (REST). Supports multiple voices
 *   and output formats (mp3, opus, aac, flac, wav, pcm).
 * - **ElevenLabsTTS** -- Connects to ElevenLabs' streaming TTS via WebSocket.
 *   Supports voice cloning, multilingual models, and fine-tuned voice settings.
 * - **CartesiaTTS** -- Connects to Cartesia's streaming TTS via WebSocket.
 *   Supports multiple output encodings and low-latency streaming.
 * - **SpeechifyTTS** -- Connects to the Speechify TTS API (REST). Supports the
 *   Simba models, voice cloning voices, and multiple output formats (mp3, wav, ogg, aac).
 * - **MurfTTS** -- Connects to the Murf AI TTS API (REST). Supports the Gen2
 *   model, per-voice speaking styles, and multiple output formats (mp3, wav,
 *   flac, alaw, ulaw).
 *
 * @example
 * ```typescript
 * import { DeepgramTTS, ElevenLabsTTS, OpenAITTS } from '@lukeocodes/composite-voice/providers/tts';
 *
 * const tts = new DeepgramTTS({
 *   proxyUrl: '/api/proxy/deepgram',
 *   model: 'aura-2',
 *   voice: 'aura-asteria-en',
 * });
 * ```
 *
 * @see {@link NativeTTS} for browser-native speech synthesis
 * @see {@link DeepgramTTS} for Deepgram streaming TTS
 * @see {@link OpenAITTS} for OpenAI REST-based TTS
 * @see {@link ElevenLabsTTS} for ElevenLabs streaming TTS
 * @see {@link CartesiaTTS} for Cartesia streaming TTS
 * @see {@link SpeechifyTTS} for Speechify REST-based TTS
 * @see {@link MurfTTS} for Murf AI REST-based TTS
 */

export * from './native/index';
export * from './deepgram/index';
export * from './openai/index';
export * from './elevenlabs/index';
export * from './cartesia/index';
export * from './speechify/index';
export * from './murf/index';
