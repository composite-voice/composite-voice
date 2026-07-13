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
 * - **LMNTTTS** -- Connects to the LMNT TTS API (REST). Supports the Blizzard
 *   model, voice cloning voices, and multiple output formats (mp3, wav, aac,
 *   ulaw, webm, pcm_s16le, pcm_f32le).
 * - **SmallestTTS** -- Connects to the Smallest.ai Waves TTS API (REST). Supports
 *   the Lightning models and multiple output formats (wav, mp3, pcm, ulaw, alaw).
 * - **RimeTTS** -- Connects to the Rime TTS API (REST). Supports the Coda, Arcana,
 *   and Mist model families and multiple output formats (mp3, wav, ogg, webm, pcm, mulaw).
 * - **MiniMaxTTS** -- Connects to the MiniMax TTS API (REST). Supports the Speech
 *   models, 300+ system voices, emotion control, and multiple output formats
 *   (mp3, wav, flac, pcm).
 * - **FishAudioTTS** -- Connects to the Fish Audio TTS API (REST) with
 *   msgpack-encoded requests. Supports catalog voices, instant voice cloning via
 *   inline reference audio, and multiple output formats (mp3, wav, pcm, opus).
 *   Requires the optional peer dependency `@msgpack/msgpack`.
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
 * @see {@link LMNTTTS} for LMNT REST-based TTS
 * @see {@link SmallestTTS} for Smallest.ai Waves REST-based TTS
 * @see {@link RimeTTS} for Rime REST-based TTS
 * @see {@link MiniMaxTTS} for MiniMax REST-based TTS
 * @see {@link FishAudioTTS} for Fish Audio REST-based TTS (msgpack wire format)
 */

export * from './native/index';
export * from './deepgram/index';
export * from './openai/index';
export * from './elevenlabs/index';
export * from './cartesia/index';
export * from './speechify/index';
export * from './murf/index';
export * from './lmnt/index';
export * from './smallest/index';
export * from './rime/index';
export * from './minimax/index';
export * from './fishaudio/index';
