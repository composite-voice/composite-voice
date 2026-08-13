/**
 * Base64 helpers for WebSocket protocols that carry binary audio as JSON.
 *
 * @remarks
 * Several realtime agent APIs (OpenAI Realtime, Gemini Live, ElevenLabs
 * Conversational AI) transport PCM audio as base64 strings inside JSON
 * frames rather than as binary WebSocket frames. These helpers convert
 * between `ArrayBuffer` and base64 using the `btoa`/`atob` globals, which
 * exist in browsers and in Node.js 16+.
 *
 * @packageDocumentation
 */

/**
 * Encode an `ArrayBuffer` as a base64 string.
 *
 * @remarks
 * Processes the buffer in 8 KB chunks to avoid call-stack limits from
 * spreading large arrays into `String.fromCharCode`.
 *
 * @param buffer - The binary data to encode.
 * @returns The base64-encoded string.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)));
  }
  return btoa(parts.join(''));
}

/**
 * Decode a base64 string into an `ArrayBuffer`.
 *
 * @param base64 - The base64-encoded string.
 * @returns The decoded binary data, or `undefined` if `base64` is not valid
 *   base64. Callers should skip the chunk rather than treating a throw as
 *   fatal to the WebSocket message handler.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer | undefined {
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    return undefined;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
