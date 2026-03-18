/**
 * Audio format detection and header extraction utilities.
 *
 * @remarks
 * This module provides magic-byte-based audio format detection and header extraction
 * for the CompositeVoice SDK's 5-role audio pipeline. When audio flows from an
 * {@link AudioInputProvider} through the pipeline, the first bytes of a stream may
 * contain a container header (WAV, OGG, WebM, etc.) that identifies the format.
 *
 * Format detection is used by {@link AudioHeaderCache} to cache the container header
 * so it can be re-injected after a WebSocket reconnection, ensuring the remote STT
 * service can continue parsing audio frames without losing context.
 *
 * Detection requires a minimum of {@link MIN_SNIFF_BYTES} (12) bytes. If the buffer
 * is too small or no known magic bytes match, `null` is returned (indicating raw PCM
 * or an unknown format).
 *
 * Based on the design approach documented in `magic-frame-detection.md`.
 *
 * @example
 * ```typescript
 * import { detectAudioFormat, extractHeader, MIN_SNIFF_BYTES } from 'composite-voice';
 *
 * const chunk = new Uint8Array(audioBuffer);
 * if (chunk.byteLength >= MIN_SNIFF_BYTES) {
 *   const format = detectAudioFormat(audioBuffer);
 *   if (format) {
 *     const header = extractHeader(audioBuffer, format);
 *     console.log(`Detected ${format}, header: ${header?.byteLength ?? 0} bytes`);
 *   }
 * }
 * ```
 *
 * @see {@link AudioHeaderCache} for the streaming cache that uses these utilities
 * @see {@link DetectedAudioFormat} for the set of detectable format values
 *
 * @packageDocumentation
 */

/**
 * Audio container/codec formats detectable via magic byte inspection.
 *
 * @remarks
 * Each value corresponds to a format identifiable from the first 12 bytes of audio
 * data. Formats not in this list (e.g., raw PCM, proprietary codecs) cannot be
 * detected and will return `null` from {@link detectAudioFormat}.
 *
 * - `'wav'` — RIFF WAVE container (magic: `RIFF....WAVE`)
 * - `'ogg'` — OGG container, typically Opus or Vorbis (magic: `OggS`)
 * - `'mp3'` — MP3 with ID3 tag or MPEG sync word (magic: `ID3` or `0xFF 0xE0+`)
 * - `'aac'` — AAC with ADTS framing (magic: `0xFF 0xF0+`)
 * - `'webm'` — WebM/Matroska container (magic: EBML header `0x1A45DFA3`)
 * - `'flac'` — Free Lossless Audio Codec (magic: `fLaC`)
 * - `'aiff'` — Audio Interchange File Format (magic: `FORM....AIFF` or `AIFC`)
 * - `'mp4'` — MP4/M4A container (magic: `ftyp` at offset 4)
 *
 * @see {@link detectAudioFormat} for the detection function
 */
export type DetectedAudioFormat = 'wav' | 'ogg' | 'mp3' | 'aac' | 'webm' | 'flac' | 'aiff' | 'mp4';

/**
 * Minimum number of bytes required for reliable format detection.
 *
 * @remarks
 * Most audio container formats can be identified within the first 12 bytes.
 * WAV requires checking bytes 0–3 (`RIFF`) and 8–11 (`WAVE`), which is the
 * widest span among supported formats. Buffers shorter than this value should
 * not be passed to {@link detectAudioFormat} — the function will return `null`.
 *
 * @see {@link detectAudioFormat}
 */
export const MIN_SNIFF_BYTES = 12;

/**
 * Detects the audio container format from magic bytes in the buffer.
 *
 * @remarks
 * Inspects the first {@link MIN_SNIFF_BYTES} bytes of the given buffer to identify
 * the audio container format. The detection order is chosen to minimize false
 * positives: unambiguous signatures (WAV, OGG, FLAC, EBML) are checked first,
 * followed by more ambiguous sync-word-based formats (MP3, AAC).
 *
 * Returns `null` when:
 * - The buffer has fewer than {@link MIN_SNIFF_BYTES} bytes
 * - No known magic bytes match (likely raw PCM or an unsupported format)
 *
 * @param buffer - The audio data buffer to inspect. Must be at least
 *   {@link MIN_SNIFF_BYTES} bytes for reliable detection.
 * @returns The detected format, or `null` if the format cannot be determined.
 *
 * @example
 * ```typescript
 * // WAV detection
 * const wavHeader = new Uint8Array([
 *   0x52, 0x49, 0x46, 0x46, // "RIFF"
 *   0x00, 0x00, 0x00, 0x00, // file size placeholder
 *   0x57, 0x41, 0x56, 0x45, // "WAVE"
 * ]);
 * detectAudioFormat(wavHeader.buffer); // => 'wav'
 *
 * // Raw PCM (no magic bytes)
 * const pcm = new Uint8Array(64).buffer;
 * detectAudioFormat(pcm); // => null
 * ```
 *
 * @see {@link DetectedAudioFormat} for the set of possible return values
 * @see {@link extractHeader} for extracting the header once the format is known
 */
export function detectAudioFormat(buffer: ArrayBuffer): DetectedAudioFormat | null {
  if (buffer.byteLength < MIN_SNIFF_BYTES) {
    return null;
  }

  const view = new Uint8Array(buffer);

  // WAV: "RIFF" at 0 + "WAVE" at 8
  if (
    view[0] === 0x52 &&
    view[1] === 0x49 &&
    view[2] === 0x46 &&
    view[3] === 0x46 &&
    view[8] === 0x57 &&
    view[9] === 0x41 &&
    view[10] === 0x56 &&
    view[11] === 0x45
  ) {
    return 'wav';
  }

  // OGG: "OggS" at 0
  if (view[0] === 0x4f && view[1] === 0x67 && view[2] === 0x67 && view[3] === 0x53) {
    return 'ogg';
  }

  // FLAC: "fLaC" at 0
  if (view[0] === 0x66 && view[1] === 0x4c && view[2] === 0x61 && view[3] === 0x43) {
    return 'flac';
  }

  // WebM/MKV: EBML header at 0
  if (view[0] === 0x1a && view[1] === 0x45 && view[2] === 0xdf && view[3] === 0xa3) {
    return 'webm';
  }

  // AIFF: "FORM" at 0 + "AI" at 8 (covers both AIFF and AIFC)
  if (
    view[0] === 0x46 &&
    view[1] === 0x4f &&
    view[2] === 0x52 &&
    view[3] === 0x4d &&
    view[8] === 0x41 &&
    view[9] === 0x49
  ) {
    return 'aiff';
  }

  // MP4/M4A: "ftyp" at offset 4
  if (view[4] === 0x66 && view[5] === 0x74 && view[6] === 0x79 && view[7] === 0x70) {
    return 'mp4';
  }

  // MP3: ID3 tag at 0
  if (view[0] === 0x49 && view[1] === 0x44 && view[2] === 0x33) {
    return 'mp3';
  }

  // MP3: MPEG sync word (0xFF followed by 0xE0+ in upper 3 bits)
  // Note: checked AFTER AAC below would cause ambiguity — the ADTS sync is
  // 0xFFF0+ which is a subset of the MP3 sync 0xFFE0+. We check MP3 sync
  // first and then AAC ADTS separately since ADTS has a tighter mask.
  // Actually, ADTS is 0xFFF (12 bits), MP3 sync is 0xFFE (11 bits).
  // ADTS: (view[1] & 0xF6) === 0xF0  means bits: 1111 0xx0 — requires bits 4-7 set + bit 1 clear
  // MP3:  (view[1] & 0xE0) === 0xE0  means bits: 111x xxxx — only requires top 3 bits set
  // ADTS is more specific, so check it first to avoid MP3 false-positive.

  // AAC ADTS: 0xFF followed by 0xF0 with specific bit pattern
  if (view[0] === 0xff && (view[1]! & 0xf6) === 0xf0) {
    return 'aac';
  }

  // MP3: raw sync word (no ID3 tag)
  if (view[0] === 0xff && (view[1]! & 0xe0) === 0xe0) {
    return 'mp3';
  }

  return null;
}

/**
 * WAV header size in bytes.
 *
 * @remarks
 * A standard WAV file has a 44-byte header containing the RIFF chunk descriptor,
 * fmt sub-chunk (audio format, channels, sample rate, etc.), and data sub-chunk
 * header. Some WAV files may have additional sub-chunks, but 44 bytes covers the
 * minimum required header for playback.
 */
const WAV_HEADER_SIZE = 44;

/**
 * Extracts the container header from an audio buffer for a known format.
 *
 * @remarks
 * Different audio formats embed metadata in their initial bytes (the "header").
 * When a WebSocket reconnection occurs, the remote service needs this header
 * re-injected so it can parse the subsequent audio frames correctly.
 *
 * Header extraction is format-specific:
 * - **WAV**: Fixed 44-byte RIFF header
 * - **OGG**: First OGG page (variable length, located by scanning for the next `OggS` sync)
 * - **FLAC**: Everything up to and including the first FLAC metadata block
 * - **AIFF**: Fixed 12-byte FORM header (callers may need more for full format info)
 * - **WebM**: EBML header (variable length, heuristic: first 64 bytes or full buffer)
 * - **MP4**: First `ftyp` box (8 bytes + box length from bytes 0–3)
 * - **MP3/AAC**: No header extraction (stream formats without a fixed header); returns `null`
 *
 * Returns `null` when the buffer is too small to contain the header or the format
 * does not have an extractable header.
 *
 * @param buffer - The audio data buffer containing the header.
 * @param format - The detected audio format.
 * @returns A new `ArrayBuffer` containing just the header, or `null` if the
 *   header cannot be extracted for this format.
 *
 * @example
 * ```typescript
 * const format = detectAudioFormat(audioBuffer);
 * if (format) {
 *   const header = extractHeader(audioBuffer, format);
 *   if (header) {
 *     console.log(`Cached ${header.byteLength}-byte ${format} header`);
 *   }
 * }
 * ```
 *
 * @see {@link detectAudioFormat} for detecting the format first
 * @see {@link AudioHeaderCache} for the streaming cache that calls this function
 */
export function extractHeader(
  buffer: ArrayBuffer,
  format: DetectedAudioFormat
): ArrayBuffer | null {
  switch (format) {
    case 'wav':
      return extractWavHeader(buffer);
    case 'ogg':
      return extractOggHeader(buffer);
    case 'flac':
      return extractFlacHeader(buffer);
    case 'aiff':
      return extractAiffHeader(buffer);
    case 'webm':
      return extractWebmHeader(buffer);
    case 'mp4':
      return extractMp4Header(buffer);
    case 'mp3':
    case 'aac':
      // Stream formats without a fixed container header
      return null;
  }
}

/**
 * Extracts the 44-byte WAV RIFF header.
 */
function extractWavHeader(buffer: ArrayBuffer): ArrayBuffer | null {
  if (buffer.byteLength < WAV_HEADER_SIZE) {
    return null;
  }
  return buffer.slice(0, WAV_HEADER_SIZE);
}

/**
 * Extracts the first OGG page by scanning for the second "OggS" sync marker.
 *
 * @remarks
 * An OGG stream consists of pages, each starting with "OggS". The first page
 * contains stream identification. We return everything from byte 0 up to (but
 * not including) the second "OggS" marker.
 */
function extractOggHeader(buffer: ArrayBuffer): ArrayBuffer | null {
  const view = new Uint8Array(buffer);
  // Find the second "OggS" marker (first is at offset 0)
  for (let i = 4; i <= view.byteLength - 4; i++) {
    if (view[i] === 0x4f && view[i + 1] === 0x67 && view[i + 2] === 0x67 && view[i + 3] === 0x53) {
      return buffer.slice(0, i);
    }
  }
  // Only one page in buffer — return the whole thing as the header
  return buffer.slice(0);
}

/**
 * Extracts the FLAC stream info metadata block.
 *
 * @remarks
 * A FLAC stream starts with "fLaC" (4 bytes) followed by metadata blocks.
 * Each metadata block has a 4-byte header: 1 bit (last-block flag) + 7 bits
 * (block type) + 24 bits (block length). We extract from byte 0 through the
 * end of the first metadata block (STREAMINFO, type 0).
 */
function extractFlacHeader(buffer: ArrayBuffer): ArrayBuffer | null {
  if (buffer.byteLength < 8) {
    return null;
  }
  const view = new DataView(buffer);
  // Metadata block header starts at offset 4
  // Bits: [1 last-block flag][7 block type][24 block length]
  const blockHeader = view.getUint32(4);
  const blockLength = blockHeader & 0x00ffffff;
  const headerEnd = 4 + 4 + blockLength; // "fLaC" + block header + block data
  if (buffer.byteLength < headerEnd) {
    return null;
  }
  return buffer.slice(0, headerEnd);
}

/**
 * Extracts the 12-byte AIFF FORM header.
 */
function extractAiffHeader(buffer: ArrayBuffer): ArrayBuffer | null {
  if (buffer.byteLength < 12) {
    return null;
  }
  return buffer.slice(0, 12);
}

/**
 * Extracts the EBML header from a WebM stream.
 *
 * @remarks
 * WebM uses EBML (Extensible Binary Meta Language) encoding. The EBML header
 * is variable-length and hard to parse without a full EBML decoder. As a
 * practical heuristic, we return the first 64 bytes or the full buffer if
 * shorter — this typically covers the EBML header and DocType declaration.
 */
function extractWebmHeader(buffer: ArrayBuffer): ArrayBuffer | null {
  const headerSize = Math.min(64, buffer.byteLength);
  return buffer.slice(0, headerSize);
}

/**
 * Extracts the MP4 ftyp box.
 *
 * @remarks
 * An MP4 file starts with boxes (atoms). The ftyp box declares the file type.
 * Its size is encoded as a big-endian uint32 in the first 4 bytes of the file.
 */
function extractMp4Header(buffer: ArrayBuffer): ArrayBuffer | null {
  if (buffer.byteLength < 8) {
    return null;
  }
  const view = new DataView(buffer);
  const boxSize = view.getUint32(0);
  if (boxSize < 8 || buffer.byteLength < boxSize) {
    return null;
  }
  return buffer.slice(0, boxSize);
}
