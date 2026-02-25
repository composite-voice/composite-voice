/**
 * @packageDocumentation
 * Native browser Speech-to-Text provider.
 *
 * @remarks
 * Re-exports the {@link NativeSTT} class and its configuration type. NativeSTT
 * uses the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`)
 * for zero-dependency, zero-cost speech recognition in modern browsers.
 *
 * @example
 * ```typescript
 * import { NativeSTT } from '@lukeocodes/composite-voice';
 *
 * const stt = new NativeSTT({ language: 'en-US', continuous: true });
 * ```
 *
 * @see {@link DeepgramSTT} for cloud-based streaming STT
 * @see {@link AssemblyAISTT} for AssemblyAI streaming STT
 */

export * from './NativeSTT';
