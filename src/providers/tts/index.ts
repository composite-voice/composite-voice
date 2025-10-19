/**
 * TTS providers export
 */

export * from './native/index';

// Note: Additional providers (Deepgram, ElevenLabs) are available when peer dependencies are installed
// Import them directly from their subpaths:
//
// Deepgram TTS (WebSocket streaming):
// import { DeepgramTTS } from '@lukeocodes/composite-voice/providers/tts/deepgram';
//
// ElevenLabs TTS (coming soon):
// import { ElevenLabsTTS } from '@lukeocodes/composite-voice/providers/tts/elevenlabs';
