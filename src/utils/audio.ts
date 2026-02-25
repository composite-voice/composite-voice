/**
 * Audio processing utilities for the CompositeVoice SDK.
 *
 * @remarks
 * This module provides low-level audio manipulation functions used throughout the SDK
 * for format conversion, resampling, WAV encoding, volume analysis, and silence detection.
 * These utilities operate on typed arrays (`Float32Array`, `Int16Array`) and `ArrayBuffer`
 * instances, which are the standard audio data representations in the Web Audio API.
 *
 * @example
 * ```typescript
 * import {
 *   floatTo16BitPCM,
 *   calculateRMS,
 *   isSilent,
 *   createAudioBlob,
 * } from 'composite-voice';
 *
 * // Convert float samples to 16-bit PCM
 * const pcmData = floatTo16BitPCM(float32Samples);
 *
 * // Check if audio is silent
 * if (isSilent(float32Samples, 0.01)) {
 *   console.log('No speech detected');
 * }
 *
 * // Create a playable WAV blob
 * const wavBlob = createAudioBlob(pcmData, 16000);
 * ```
 *
 * @packageDocumentation
 */

import type { AudioFormat } from '../core/types/audio';

/**
 * Converts a `Float32Array` of audio samples to a 16-bit signed integer PCM `Int16Array`.
 *
 * @remarks
 * Float samples are expected in the range [-1.0, 1.0]. Values outside this range
 * are clamped. The conversion maps:
 * - `-1.0` to `-32768` (0x8000)
 * - `0.0` to `0`
 * - `1.0` to `32767` (0x7FFF)
 *
 * This is the standard conversion used for PCM audio in WAV files and WebSocket
 * streaming to STT/TTS providers.
 *
 * @param float32Array - The input audio samples as 32-bit floats in the range [-1.0, 1.0].
 * @returns A new `Int16Array` containing the converted 16-bit PCM samples.
 *
 * @example
 * ```typescript
 * const floatSamples = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
 * const pcmSamples = floatTo16BitPCM(floatSamples);
 * // pcmSamples: Int16Array [0, 16383, -16384, 32767, -32768]
 * ```
 *
 * @see {@link int16ToFloat} for the inverse conversion.
 */
export function floatTo16BitPCM(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const val = float32Array[i];
    if (val !== undefined) {
      const s = Math.max(-1, Math.min(1, val));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
  }
  return int16Array;
}

/**
 * Converts an `Int16Array` of 16-bit PCM samples to a `Float32Array` of normalized floats.
 *
 * @remarks
 * Performs the inverse of {@link floatTo16BitPCM}. The conversion maps:
 * - `-32768` to `-1.0`
 * - `0` to `0.0`
 * - `32767` to `1.0`
 *
 * Useful when receiving PCM audio from providers and needing to process it
 * with the Web Audio API, which operates on float samples.
 *
 * @param int16Array - The input 16-bit PCM audio samples.
 * @returns A new `Float32Array` containing normalized float samples in the range [-1.0, 1.0].
 *
 * @example
 * ```typescript
 * const pcmSamples = new Int16Array([0, 16383, -16384, 32767, -32768]);
 * const floatSamples = int16ToFloat(pcmSamples);
 * // floatSamples: Float32Array [0.0, ~0.5, ~-0.5, 1.0, -1.0]
 * ```
 *
 * @see {@link floatTo16BitPCM} for the inverse conversion.
 */
export function int16ToFloat(int16Array: Int16Array): Float32Array {
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    const int = int16Array[i];
    if (int !== undefined) {
      float32Array[i] = int >= 0 ? int / 0x7fff : int / 0x8000;
    }
  }
  return float32Array;
}

/**
 * Concatenates multiple `ArrayBuffer` instances into a single contiguous buffer.
 *
 * @remarks
 * Useful for assembling fragmented audio data received from WebSocket streams
 * into a single buffer for processing or playback.
 *
 * @param buffers - An array of `ArrayBuffer` instances to concatenate.
 * @returns A single `ArrayBuffer` containing all input data in order.
 *
 * @example
 * ```typescript
 * const chunk1 = new ArrayBuffer(1024);
 * const chunk2 = new ArrayBuffer(2048);
 * const combined = concatenateArrayBuffers([chunk1, chunk2]);
 * // combined.byteLength === 3072
 * ```
 */
export function concatenateArrayBuffers(buffers: ArrayBuffer[]): ArrayBuffer {
  const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  const result = new Uint8Array(totalLength);

  let offset = 0;
  for (const buffer of buffers) {
    result.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }

  return result.buffer;
}

/**
 * Downsamples audio data from one sample rate to a lower sample rate.
 *
 * @remarks
 * Uses simple averaging of sample windows to reduce the sample rate. This is
 * adequate for speech audio but may introduce aliasing for music or complex
 * audio. For speech applications (STT), this produces acceptable results.
 *
 * If `fromSampleRate` equals `toSampleRate`, the original buffer is returned
 * without copying.
 *
 * @param buffer - The input audio samples as a `Float32Array`.
 * @param fromSampleRate - The current sample rate of the input audio in Hz.
 * @param toSampleRate - The desired output sample rate in Hz.
 * @returns A new `Float32Array` with the downsampled audio data, or the
 *   original buffer if the rates are equal.
 *
 * @example
 * ```typescript
 * // Downsample from 48 kHz to 16 kHz for STT processing
 * const input = new Float32Array(48000); // 1 second at 48 kHz
 * const output = downsampleAudio(input, 48000, 16000);
 * // output.length === 16000
 * ```
 */
export function downsampleAudio(
  buffer: Float32Array,
  fromSampleRate: number,
  toSampleRate: number
): Float32Array {
  if (fromSampleRate === toSampleRate) {
    return buffer;
  }

  const ratio = fromSampleRate / toSampleRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);

  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      const sample = buffer[i];
      if (sample !== undefined) {
        accum += sample;
        count++;
      }
    }

    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

/**
 * Returns the MIME type string corresponding to an {@link AudioFormat}.
 *
 * @param format - The audio format to look up.
 * @returns The MIME type string (e.g., `'audio/mpeg'` for mp3), or
 *   `'application/octet-stream'` if the format is not recognized.
 *
 * @example
 * ```typescript
 * getAudioMimeType('mp3');  // 'audio/mpeg'
 * getAudioMimeType('wav');  // 'audio/wav'
 * getAudioMimeType('opus'); // 'audio/opus'
 * ```
 */
export function getAudioMimeType(format: AudioFormat): string {
  const mimeTypes: Record<AudioFormat, string> = {
    pcm: 'audio/pcm',
    opus: 'audio/opus',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    webm: 'audio/webm',
  };
  return mimeTypes[format] || 'application/octet-stream';
}

/**
 * Creates a standard 44-byte WAV (RIFF) header for raw PCM audio data.
 *
 * @remarks
 * The header conforms to the WAV file format specification with:
 * - RIFF chunk descriptor
 * - `fmt ` sub-chunk (PCM format, AudioFormat = 1)
 * - `data` sub-chunk header
 *
 * This header can be prepended to raw PCM data to create a valid WAV file.
 *
 * @param dataLength - The length of the raw PCM data in bytes (excluding header).
 * @param sampleRate - The audio sample rate in Hz (e.g., 16000, 44100).
 * @param numChannels - The number of audio channels (1 for mono, 2 for stereo).
 * @param bitsPerSample - The bit depth per sample (e.g., 16, 24).
 * @returns A 44-byte `ArrayBuffer` containing the WAV header.
 *
 * @example
 * ```typescript
 * const pcmData = new Int16Array(16000); // 1 second of 16-bit mono at 16 kHz
 * const header = createWavHeader(pcmData.byteLength, 16000, 1, 16);
 * // Concatenate header + data for a valid WAV file
 * ```
 *
 * @see {@link createAudioBlob} for a convenience function that combines header and data.
 */
export function createWavHeader(
  dataLength: number,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): ArrayBuffer {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // "RIFF" chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');

  // "fmt " sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true); // ByteRate
  view.setUint16(32, numChannels * (bitsPerSample / 8), true); // BlockAlign
  view.setUint16(34, bitsPerSample, true);

  // "data" sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  return header;
}

/**
 * Writes an ASCII string into a `DataView` at the specified byte offset.
 *
 * @remarks
 * Used internally by {@link createWavHeader} to write chunk identifiers
 * (e.g., `'RIFF'`, `'WAVE'`, `'fmt '`, `'data'`).
 *
 * @param view - The `DataView` to write into.
 * @param offset - The byte offset at which to begin writing.
 * @param string - The ASCII string to write.
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Converts an audio `Blob` to an `ArrayBuffer`.
 *
 * @remarks
 * Uses the `FileReader` API for broad browser compatibility. This is useful
 * when working with audio `Blob` objects returned from REST TTS providers
 * that need to be processed as raw bytes.
 *
 * @param blob - The audio `Blob` to convert.
 * @returns A promise that resolves to the `ArrayBuffer` representation of the blob.
 *
 * @throws Error if the `FileReader` encounters an error during reading.
 *
 * @example
 * ```typescript
 * const audioBlob = await tts.synthesize('Hello');
 * const buffer = await blobToArrayBuffer(audioBlob);
 * // Process raw audio bytes
 * ```
 */
export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * Creates a WAV audio `Blob` from raw 16-bit PCM data.
 *
 * @remarks
 * Combines a WAV header (via {@link createWavHeader}) with the provided PCM data
 * to produce a complete, playable WAV file as a `Blob`. The resulting blob has
 * MIME type `'audio/wav'` and can be used with `<audio>` elements or the
 * Web Audio API.
 *
 * @param pcmData - The raw 16-bit PCM audio samples.
 * @param sampleRate - The audio sample rate in Hz.
 * @param numChannels - The number of audio channels.
 *
 * @defaultValue numChannels: `1`
 *
 * @returns A `Blob` containing a valid WAV file.
 *
 * @example
 * ```typescript
 * const pcmSamples = floatTo16BitPCM(floatSamples);
 * const wavBlob = createAudioBlob(pcmSamples, 16000);
 *
 * // Play via an audio element
 * const url = URL.createObjectURL(wavBlob);
 * const audio = new Audio(url);
 * audio.play();
 * ```
 *
 * @see {@link createWavHeader}
 * @see {@link floatTo16BitPCM}
 */
export function createAudioBlob(pcmData: Int16Array, sampleRate: number, numChannels = 1): Blob {
  const wavHeader = createWavHeader(pcmData.byteLength, sampleRate, numChannels, 16);

  const wavData = new Uint8Array(wavHeader.byteLength + pcmData.byteLength);
  wavData.set(new Uint8Array(wavHeader), 0);
  wavData.set(new Uint8Array(pcmData.buffer), wavHeader.byteLength);

  return new Blob([wavData], { type: 'audio/wav' });
}

/**
 * Calculates the RMS (Root Mean Square) volume level of audio samples.
 *
 * @remarks
 * RMS is a standard measure of audio signal power. The returned value is
 * in the range [0.0, 1.0] for normalized float samples, where:
 * - `0.0` represents digital silence
 * - Higher values represent louder audio
 *
 * Commonly used for volume metering, silence detection, and voice activity
 * detection (VAD).
 *
 * @param samples - The audio samples as a `Float32Array` (normalized to [-1.0, 1.0]).
 * @returns The RMS volume level as a number in the range [0.0, 1.0].
 *
 * @example
 * ```typescript
 * const rms = calculateRMS(floatSamples);
 * console.log(`Volume: ${(rms * 100).toFixed(1)}%`);
 * ```
 *
 * @see {@link isSilent}
 */
export function calculateRMS(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    if (sample !== undefined) {
      sum += sample * sample;
    }
  }
  return Math.sqrt(sum / samples.length);
}

/**
 * Detects whether an audio buffer contains silence.
 *
 * @remarks
 * Computes the RMS volume via {@link calculateRMS} and compares it against
 * the given threshold. Useful for detecting end-of-speech or filtering out
 * background noise.
 *
 * @param samples - The audio samples as a `Float32Array` (normalized to [-1.0, 1.0]).
 * @param threshold - The RMS threshold below which audio is considered silent.
 *
 * @defaultValue threshold: `0.01`
 *
 * @returns `true` if the RMS volume is below the threshold, `false` otherwise.
 *
 * @example
 * ```typescript
 * if (isSilent(audioBuffer, 0.02)) {
 *   console.log('Silence detected -- end of speech?');
 * }
 * ```
 *
 * @see {@link calculateRMS}
 */
export function isSilent(samples: Float32Array, threshold = 0.01): boolean {
  const rms = calculateRMS(samples);
  return rms < threshold;
}

/**
 * Applies linear fade-in and fade-out effects to audio samples.
 *
 * @remarks
 * Creates a copy of the input samples with linear gain ramps at the beginning
 * (fade-in) and end (fade-out) of the buffer. This is useful for preventing
 * audible clicks or pops when audio chunks are stitched together or when
 * playback starts/stops abruptly.
 *
 * The fade durations are specified in number of samples, not milliseconds.
 * To convert milliseconds to samples: `samples = (ms / 1000) * sampleRate`.
 *
 * @param samples - The input audio samples as a `Float32Array`.
 * @param fadeInSamples - The number of samples for the fade-in ramp.
 * @param fadeOutSamples - The number of samples for the fade-out ramp.
 * @returns A new `Float32Array` with the fade effects applied.
 *
 * @example
 * ```typescript
 * // Apply 10ms fade at 16 kHz (160 samples)
 * const fadeSamples = 160;
 * const smoothed = applyFade(audioBuffer, fadeSamples, fadeSamples);
 * ```
 */
export function applyFade(
  samples: Float32Array,
  fadeInSamples: number,
  fadeOutSamples: number
): Float32Array {
  const result = new Float32Array(samples);

  // Fade in
  for (let i = 0; i < Math.min(fadeInSamples, samples.length); i++) {
    const gain = i / fadeInSamples;
    const sample = samples[i];
    if (sample !== undefined) {
      result[i] = sample * gain;
    }
  }

  // Fade out
  const startFadeOut = samples.length - fadeOutSamples;
  for (let i = startFadeOut; i < samples.length; i++) {
    const gain = (samples.length - i) / fadeOutSamples;
    const sample = samples[i];
    if (sample !== undefined) {
      result[i] = sample * gain;
    }
  }

  return result;
}
