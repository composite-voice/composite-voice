/**
 * @packageDocumentation
 * Fish Audio TTS provider module.
 *
 * @remarks
 * Re-exports the {@link FishAudioTTS} provider and its configuration types.
 * Requires the optional peer dependency `@msgpack/msgpack` for request encoding.
 */

export { FishAudioTTS } from './FishAudioTTS';
export type {
  FishAudioTTSConfig,
  FishAudioTTSModel,
  FishAudioTTSFormat,
  FishAudioTTSLatency,
  FishAudioReference,
} from './FishAudioTTS';
