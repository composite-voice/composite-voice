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
 * service can continue parsing audio frames without losing context. It is also used by
 * {@link BufferInput} to derive {@link AudioMetadata} from pushed buffers, so server-side
 * pipelines can accept arbitrary WAV/OGG/MP3 data without declaring its format up front.
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
 * @see {@link parseAudioMetadata} for deriving sample rate / channels / encoding
 *
 * @packageDocumentation
 */

import type { AudioEncoding } from '../core/types/audio';

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
 * Upper bound on the bytes worth accumulating before giving up on parameter parsing.
 *
 * @remarks
 * {@link detectAudioFormat} only needs {@link MIN_SNIFF_BYTES}, but
 * {@link parseAudioMetadata} has to reach further into the stream: past a WAV file's
 * `LIST`/`fact` chunks to its `fmt ` chunk, past an OGG page header to the codec
 * identification packet, or past an ID3v2 tag to the first MPEG frame header. 8 KiB
 * covers all of these in practice.
 *
 * Streams whose parameters sit beyond this point (an MP3 with embedded cover art, say)
 * still get a container format and MIME type — only the numeric parameters are lost.
 *
 * @see {@link parseAudioMetadata}
 */
export const MAX_SNIFF_BYTES = 8192;

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
  const byte1 = view[1] ?? 0;
  if (view[0] === 0xff && (byte1 & 0xf6) === 0xf0) {
    return 'aac';
  }

  // MP3: raw sync word (no ID3 tag)
  if (view[0] === 0xff && (byte1 & 0xe0) === 0xe0) {
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

// ─── Metadata parsing ─────────────────────────────────────────────────────────

/**
 * MIME types for each detectable container format.
 *
 * @internal
 */
const FORMAT_MIME_TYPES: Record<DetectedAudioFormat, string> = {
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  aac: 'audio/aac',
  webm: 'audio/webm',
  flac: 'audio/flac',
  aiff: 'audio/aiff',
  mp4: 'audio/mp4',
};

/**
 * Returns the MIME type for a detected container format.
 *
 * @remarks
 * Complements {@link getAudioMimeType}, which maps the SDK's {@link AudioFormat}
 * type. This function maps the wider {@link DetectedAudioFormat} set returned by
 * {@link detectAudioFormat}.
 *
 * @param format - A format returned by {@link detectAudioFormat}.
 * @returns The corresponding MIME type (e.g. `'audio/wav'`).
 *
 * @example
 * ```typescript
 * getDetectedFormatMimeType('mp3'); // => 'audio/mpeg'
 * getDetectedFormatMimeType('ogg'); // => 'audio/ogg'
 * ```
 *
 * @see {@link detectAudioFormat} for obtaining the format
 */
export function getDetectedFormatMimeType(format: DetectedAudioFormat): string {
  return FORMAT_MIME_TYPES[format];
}

/**
 * Audio format parameters recovered from a container header.
 *
 * @remarks
 * Extends the optional parts of {@link AudioMetadata} with the container
 * {@link DetectedAudioFormat} the values were read from. Numeric fields are optional
 * because not every container declares them in a form this module parses — see
 * {@link parseAudioMetadata} for the per-format coverage table.
 *
 * @see {@link parseAudioMetadata} for the function that produces this type
 */
export interface ParsedAudioMetadata {
  /** The container format the parameters were read from. */
  format: DetectedAudioFormat;

  /** MIME type of the container, e.g. `'audio/wav'`. */
  mimeType: string;

  /** Sample rate in Hz, when the container declares one. */
  sampleRate?: number;

  /** Channel count, when the container declares one. */
  channels?: number;

  /** Bits per sample, for uncompressed or lossless formats. */
  bitDepth?: number;

  /**
   * Sample encoding, when it maps onto the SDK's {@link AudioEncoding} type.
   *
   * @remarks
   * Left undefined for encodings the SDK has no name for (24-bit PCM, IEEE float
   * WAV, Vorbis, FLAC), so callers fall back to their configured default rather
   * than adopting a wrong value.
   */
  encoding?: AudioEncoding;
}

/**
 * Parses audio format parameters out of a container header.
 *
 * @remarks
 * Where {@link detectAudioFormat} answers "which container is this?", this function
 * answers "what audio is inside it?" — enough to fill in {@link AudioMetadata} without
 * the caller declaring the format.
 *
 * **Coverage:**
 *
 * | Format | Sample rate | Channels | Bit depth | Encoding        |
 * | ------ | ----------- | -------- | --------- | --------------- |
 * | WAV    | ✓           | ✓        | ✓         | linear16 / mulaw / alaw / mp3 |
 * | OGG    | ✓           | ✓        | —         | opus (Vorbis: none) |
 * | MP3    | ✓           | ✓        | —         | mp3             |
 * | FLAC   | ✓           | ✓        | ✓         | —               |
 * | Others | —           | —        | —         | —               |
 *
 * **Returns `null` when more bytes are needed.** Container parameters can sit well
 * past {@link MIN_SNIFF_BYTES} — behind a WAV `LIST` chunk or an ID3v2 tag, for
 * instance — so a `null` result on a buffer whose format *is* detectable means
 * "accumulate more data and call again". Callers should stop accumulating at
 * {@link MAX_SNIFF_BYTES} and fall back to the container format alone. `null` is
 * also returned when no format is detected at all.
 *
 * @param buffer - The audio data buffer to parse, starting at the first byte of
 *   the stream.
 * @param format - The already-detected format, if known. Skips a redundant
 *   {@link detectAudioFormat} call.
 * @returns The parsed parameters, or `null` if the format is unknown or the buffer
 *   does not yet reach the parameters.
 *
 * @example
 * ```typescript
 * import { parseAudioMetadata } from 'composite-voice';
 * import { readFileSync } from 'node:fs';
 *
 * const wav = readFileSync('speech.wav');
 * parseAudioMetadata(wav.buffer);
 * // => { format: 'wav', mimeType: 'audio/wav', sampleRate: 16000,
 * //      channels: 1, bitDepth: 16, encoding: 'linear16' }
 * ```
 *
 * @see {@link detectAudioFormat} for container detection
 * @see {@link BufferInput} for the input provider that applies this automatically
 */
export function parseAudioMetadata(
  buffer: ArrayBuffer,
  format?: DetectedAudioFormat
): ParsedAudioMetadata | null {
  const resolvedFormat = format ?? detectAudioFormat(buffer);
  if (resolvedFormat === null) {
    return null;
  }

  const base: ParsedAudioMetadata = {
    format: resolvedFormat,
    mimeType: FORMAT_MIME_TYPES[resolvedFormat],
  };

  switch (resolvedFormat) {
    case 'wav':
      return parseWavMetadata(buffer, base);
    case 'ogg':
      return parseOggMetadata(buffer, base);
    case 'mp3':
      return parseMp3Metadata(buffer, base);
    case 'flac':
      return parseFlacMetadata(buffer, base);
    case 'aac':
    case 'webm':
    case 'aiff':
    case 'mp4':
      // Container is identified, but its parameters live behind codec-specific
      // structures this module does not parse. Nothing more to learn by waiting.
      return base;
  }
}

/**
 * Reads `length` bytes at `offset` as an ASCII string.
 *
 * @internal
 */
function readAscii(view: Uint8Array, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(view[offset + i] ?? 0);
  }
  return out;
}

/** WAVE format tag for uncompressed integer PCM. @internal */
const WAVE_FORMAT_PCM = 0x0001;
/** WAVE format tag for IEEE float samples. @internal */
const WAVE_FORMAT_IEEE_FLOAT = 0x0003;
/** WAVE format tag for A-law companding. @internal */
const WAVE_FORMAT_ALAW = 0x0006;
/** WAVE format tag for mu-law companding. @internal */
const WAVE_FORMAT_MULAW = 0x0007;
/** WAVE format tag for MPEG Layer-3 audio. @internal */
const WAVE_FORMAT_MPEGLAYER3 = 0x0055;
/** WAVE format tag indicating the real tag lives in the SubFormat GUID. @internal */
const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

/**
 * Parses the `fmt ` chunk of a RIFF/WAVE stream.
 *
 * @remarks
 * Walks the RIFF chunk list from offset 12 rather than assuming the canonical
 * 44-byte layout, since encoders routinely insert `LIST`, `JUNK`, or `fact`
 * chunks ahead of `fmt `. Chunks are word-aligned, so odd sizes carry a pad byte.
 *
 * @internal
 */
function parseWavMetadata(
  buffer: ArrayBuffer,
  base: ParsedAudioMetadata
): ParsedAudioMetadata | null {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  let offset = 12;
  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readAscii(bytes, offset, 4);
    const chunkSize = view.getUint32(offset + 4, true);
    const bodyOffset = offset + 8;

    if (chunkId === 'fmt ') {
      // The 16-byte common block covers everything except the extensible GUID.
      if (bodyOffset + 16 > buffer.byteLength) {
        return null; // fmt chunk found but truncated — need more bytes
      }
      return parseWavFmtChunk(view, bodyOffset, chunkSize, base);
    }

    // Word-aligned: an odd-sized chunk is followed by a single pad byte.
    offset = bodyOffset + chunkSize + (chunkSize % 2);
  }

  return null; // fmt chunk not reached yet
}

/**
 * Reads the fields of a located `fmt ` chunk body.
 *
 * @internal
 */
function parseWavFmtChunk(
  view: DataView,
  bodyOffset: number,
  chunkSize: number,
  base: ParsedAudioMetadata
): ParsedAudioMetadata | null {
  let formatTag = view.getUint16(bodyOffset, true);
  const channels = view.getUint16(bodyOffset + 2, true);
  const sampleRate = view.getUint32(bodyOffset + 4, true);
  const bitsPerSample = view.getUint16(bodyOffset + 14, true);

  if (formatTag === WAVE_FORMAT_EXTENSIBLE) {
    // WAVE_FORMAT_EXTENSIBLE: cbSize(2) validBits(2) channelMask(4) SubFormat(16),
    // where the first two bytes of the SubFormat GUID are the real format tag.
    if (chunkSize < 40 || bodyOffset + 26 > view.byteLength) {
      return null; // extension present but truncated — need more bytes
    }
    formatTag = view.getUint16(bodyOffset + 24, true);
  }

  const parsed: ParsedAudioMetadata = { ...base };

  if (sampleRate > 0) {
    parsed.sampleRate = sampleRate;
  }
  if (channels > 0) {
    parsed.channels = channels;
  }
  if (bitsPerSample > 0) {
    parsed.bitDepth = bitsPerSample;
  }

  switch (formatTag) {
    case WAVE_FORMAT_PCM:
      // The SDK names only 16-bit integer PCM; other depths stay unnamed so the
      // caller's configured encoding wins instead of a wrong one.
      if (bitsPerSample === 16) {
        parsed.encoding = 'linear16';
      }
      break;
    case WAVE_FORMAT_ALAW:
      parsed.encoding = 'alaw';
      break;
    case WAVE_FORMAT_MULAW:
      parsed.encoding = 'mulaw';
      break;
    case WAVE_FORMAT_MPEGLAYER3:
      parsed.encoding = 'mp3';
      break;
    case WAVE_FORMAT_IEEE_FLOAT:
    default:
      break;
  }

  return parsed;
}

/** Byte length of the fixed portion of an OGG page header. @internal */
const OGG_PAGE_HEADER_SIZE = 27;

/**
 * Parses the codec identification packet in an OGG stream's first page.
 *
 * @remarks
 * The first page carries the identification header of whichever codec the stream
 * uses — `OpusHead` for Opus, `\x01vorbis` for Vorbis. Both declare channel count
 * and sample rate. Other codecs yield the container format alone.
 *
 * Opus always *decodes* at 48 kHz; the rate in `OpusHead` is the original input
 * rate, which is what downstream STT services expect to be told.
 *
 * @internal
 */
function parseOggMetadata(
  buffer: ArrayBuffer,
  base: ParsedAudioMetadata
): ParsedAudioMetadata | null {
  const bytes = new Uint8Array(buffer);
  if (buffer.byteLength < OGG_PAGE_HEADER_SIZE + 1) {
    return null;
  }

  const segmentCount = bytes[OGG_PAGE_HEADER_SIZE - 1] ?? 0;
  const payload = OGG_PAGE_HEADER_SIZE + segmentCount;
  const view = new DataView(buffer);

  // OpusHead: magic(8) version(1) channels(1) preSkip(2) inputSampleRate(4)
  if (payload + 16 <= buffer.byteLength && readAscii(bytes, payload, 8) === 'OpusHead') {
    const channels = bytes[payload + 9] ?? 0;
    const inputSampleRate = view.getUint32(payload + 12, true);
    const parsed: ParsedAudioMetadata = { ...base, encoding: 'opus' };
    if (channels > 0) {
      parsed.channels = channels;
    }
    // A zero input rate means "unknown"; Opus's own rate is 48 kHz.
    parsed.sampleRate = inputSampleRate > 0 ? inputSampleRate : 48000;
    return parsed;
  }

  // Vorbis identification: type(1) magic(6) version(4) channels(1) sampleRate(4)
  if (
    payload + 16 <= buffer.byteLength &&
    bytes[payload] === 0x01 &&
    readAscii(bytes, payload + 1, 6) === 'vorbis'
  ) {
    const channels = bytes[payload + 11] ?? 0;
    const sampleRate = view.getUint32(payload + 12, true);
    const parsed: ParsedAudioMetadata = { ...base };
    if (channels > 0) {
      parsed.channels = channels;
    }
    if (sampleRate > 0) {
      parsed.sampleRate = sampleRate;
    }
    return parsed;
  }

  // Not enough bytes yet to tell which codec this is.
  if (payload + 16 > buffer.byteLength) {
    return null;
  }

  // A codec this module does not parse — the container is all we can report.
  return base;
}

/**
 * MPEG audio sample rates, indexed by version then by the header's rate index.
 *
 * @internal
 */
const MPEG_SAMPLE_RATES: Record<number, readonly number[]> = {
  0b00: [11025, 12000, 8000], // MPEG 2.5
  0b10: [22050, 24000, 16000], // MPEG 2
  0b11: [44100, 48000, 32000], // MPEG 1
};

/** Maximum bytes scanned for an MPEG sync word after any ID3v2 tag. @internal */
const MP3_SYNC_SCAN_LIMIT = 4096;

/**
 * Parses the first MPEG frame header of an MP3 stream.
 *
 * @remarks
 * Skips an ID3v2 tag when present — its size is a syncsafe 28-bit integer at
 * bytes 6–9, and a footer adds another 10 bytes — then scans forward for the
 * frame sync word and decodes the version, sample-rate index, and channel mode.
 *
 * @internal
 */
function parseMp3Metadata(
  buffer: ArrayBuffer,
  base: ParsedAudioMetadata
): ParsedAudioMetadata | null {
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    if (buffer.byteLength < 10) {
      return null;
    }
    const size =
      ((bytes[6] ?? 0) << 21) | ((bytes[7] ?? 0) << 14) | ((bytes[8] ?? 0) << 7) | (bytes[9] ?? 0);
    const footerSize = ((bytes[5] ?? 0) & 0x10) !== 0 ? 10 : 0;
    offset = 10 + size + footerSize;
  }

  const scanEnd = Math.min(buffer.byteLength - 4, offset + MP3_SYNC_SCAN_LIMIT);
  for (let i = offset; i <= scanEnd; i++) {
    if (bytes[i] !== 0xff || ((bytes[i + 1] ?? 0) & 0xe0) !== 0xe0) {
      continue;
    }
    const parsed = parseMpegFrameHeader(bytes, i, base);
    if (parsed !== null) {
      return parsed;
    }
  }

  if (scanEnd < offset + MP3_SYNC_SCAN_LIMIT) {
    return null; // buffer ended mid-tag or mid-scan — more bytes may still help
  }

  // Scanned the whole window without a valid frame — the container is all we can report.
  return base;
}

/**
 * Decodes a 4-byte MPEG audio frame header.
 *
 * @returns The parsed metadata, or `null` if the header uses reserved field
 *   values (i.e. this was a false sync match).
 *
 * @internal
 */
function parseMpegFrameHeader(
  bytes: Uint8Array,
  offset: number,
  base: ParsedAudioMetadata
): ParsedAudioMetadata | null {
  const b1 = bytes[offset + 1] ?? 0;
  const b2 = bytes[offset + 2] ?? 0;
  const b3 = bytes[offset + 3] ?? 0;

  const version = (b1 >> 3) & 0b11;
  const layer = (b1 >> 1) & 0b11;
  const rateIndex = (b2 >> 2) & 0b11;
  const channelMode = (b3 >> 6) & 0b11;

  // 0b01 is a reserved version and 0b00 a reserved layer — both mean false sync.
  if (version === 0b01 || layer === 0b00 || rateIndex === 0b11) {
    return null;
  }

  const sampleRate = MPEG_SAMPLE_RATES[version]?.[rateIndex];
  if (sampleRate === undefined) {
    return null;
  }

  return {
    ...base,
    encoding: 'mp3',
    sampleRate,
    channels: channelMode === 0b11 ? 1 : 2,
  };
}

/**
 * Parses the STREAMINFO metadata block of a FLAC stream.
 *
 * @remarks
 * STREAMINFO is always the first metadata block. Its sample rate (20 bits),
 * channel count (3 bits) and bit depth (5 bits) are packed across bytes 10–12
 * of the block body, which itself starts at byte 8 of the stream.
 *
 * @internal
 */
function parseFlacMetadata(
  buffer: ArrayBuffer,
  base: ParsedAudioMetadata
): ParsedAudioMetadata | null {
  const streamInfo = 8;
  if (buffer.byteLength < streamInfo + 14) {
    return null;
  }

  const bytes = new Uint8Array(buffer);
  const b10 = bytes[streamInfo + 10] ?? 0;
  const b11 = bytes[streamInfo + 11] ?? 0;
  const b12 = bytes[streamInfo + 12] ?? 0;
  const b13 = bytes[streamInfo + 13] ?? 0;

  const sampleRate = (b10 << 12) | (b11 << 4) | (b12 >> 4);
  const channels = ((b12 >> 1) & 0b111) + 1;
  const bitDepth = (((b12 & 0b1) << 4) | (b13 >> 4)) + 1;

  const parsed: ParsedAudioMetadata = { ...base, channels, bitDepth };
  if (sampleRate > 0) {
    parsed.sampleRate = sampleRate;
  }
  return parsed;
}
