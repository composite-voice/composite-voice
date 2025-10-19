/**
 * Audio processing utilities
 */

import type { AudioFormat } from '../core/types/audio';

/**
 * Convert a Float32Array to Int16Array (PCM 16-bit)
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
 * Convert Int16Array to Float32Array
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
 * Concatenate multiple ArrayBuffers
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
 * Downsample audio data
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
 * Get MIME type for audio format
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
 * Create WAV header for PCM data
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
 * Write string to DataView
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Convert audio blob to ArrayBuffer
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
 * Create audio blob from PCM data
 */
export function createAudioBlob(pcmData: Int16Array, sampleRate: number, numChannels = 1): Blob {
  const wavHeader = createWavHeader(pcmData.byteLength, sampleRate, numChannels, 16);

  const wavData = new Uint8Array(wavHeader.byteLength + pcmData.byteLength);
  wavData.set(new Uint8Array(wavHeader), 0);
  wavData.set(new Uint8Array(pcmData.buffer), wavHeader.byteLength);

  return new Blob([wavData], { type: 'audio/wav' });
}

/**
 * Calculate RMS (Root Mean Square) volume level
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
 * Detect silence in audio buffer
 */
export function isSilent(samples: Float32Array, threshold = 0.01): boolean {
  const rms = calculateRMS(samples);
  return rms < threshold;
}

/**
 * Apply fade in/out to audio samples
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
