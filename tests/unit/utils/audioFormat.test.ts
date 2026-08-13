/**
 * Tests for audio format detection and header extraction utilities.
 */

import {
  detectAudioFormat,
  extractHeader,
  getDetectedFormatMimeType,
  parseAudioMetadata,
  MAX_SNIFF_BYTES,
  MIN_SNIFF_BYTES,
} from '../../../src/utils/audioFormat';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates an ArrayBuffer from a Uint8Array of bytes. */
function buf(...bytes: number[]): ArrayBuffer {
  return new Uint8Array(bytes).buffer;
}

// ─── MIN_SNIFF_BYTES ──────────────────────────────────────────────────────────

describe('MIN_SNIFF_BYTES', () => {
  it('is 12', () => {
    expect(MIN_SNIFF_BYTES).toBe(12);
  });
});

// ─── detectAudioFormat ────────────────────────────────────────────────────────

describe('detectAudioFormat', () => {
  describe('undersized buffers', () => {
    it('returns null for empty buffer', () => {
      expect(detectAudioFormat(new ArrayBuffer(0))).toBeNull();
    });

    it('returns null for buffer with fewer than MIN_SNIFF_BYTES', () => {
      expect(detectAudioFormat(new ArrayBuffer(11))).toBeNull();
    });

    it('returns null for buffer with exactly MIN_SNIFF_BYTES - 1', () => {
      expect(detectAudioFormat(new ArrayBuffer(MIN_SNIFF_BYTES - 1))).toBeNull();
    });
  });

  describe('WAV detection', () => {
    it('detects WAV from RIFF+WAVE magic bytes', () => {
      // "RIFF" at 0, arbitrary size at 4–7, "WAVE" at 8
      const wavHeader = buf(
        0x52,
        0x49,
        0x46,
        0x46, // RIFF
        0x00,
        0x00,
        0x00,
        0x00, // file size
        0x57,
        0x41,
        0x56,
        0x45 // WAVE
      );
      expect(detectAudioFormat(wavHeader)).toBe('wav');
    });

    it('detects WAV with non-zero file size', () => {
      const wavHeader = buf(0x52, 0x49, 0x46, 0x46, 0xff, 0xff, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45);
      expect(detectAudioFormat(wavHeader)).toBe('wav');
    });
  });

  describe('OGG detection', () => {
    it('detects OGG from OggS magic bytes', () => {
      const oggHeader = buf(
        0x4f,
        0x67,
        0x67,
        0x53, // OggS
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00
      );
      expect(detectAudioFormat(oggHeader)).toBe('ogg');
    });
  });

  describe('FLAC detection', () => {
    it('detects FLAC from fLaC magic bytes', () => {
      const flacHeader = buf(
        0x66,
        0x4c,
        0x61,
        0x43, // fLaC
        0x00,
        0x00,
        0x00,
        0x22, // STREAMINFO block header (34 bytes)
        0x00,
        0x00,
        0x00,
        0x00
      );
      expect(detectAudioFormat(flacHeader)).toBe('flac');
    });
  });

  describe('WebM detection', () => {
    it('detects WebM from EBML header', () => {
      const webmHeader = buf(
        0x1a,
        0x45,
        0xdf,
        0xa3, // EBML
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00
      );
      expect(detectAudioFormat(webmHeader)).toBe('webm');
    });
  });

  describe('AIFF detection', () => {
    it('detects AIFF from FORM+AIFF magic bytes', () => {
      const aiffHeader = buf(
        0x46,
        0x4f,
        0x52,
        0x4d, // FORM
        0x00,
        0x00,
        0x00,
        0x00, // size
        0x41,
        0x49,
        0x46,
        0x46 // AIFF
      );
      expect(detectAudioFormat(aiffHeader)).toBe('aiff');
    });

    it('detects AIFC variant from FORM+AIFC magic bytes', () => {
      const aifcHeader = buf(
        0x46,
        0x4f,
        0x52,
        0x4d, // FORM
        0x00,
        0x00,
        0x00,
        0x00, // size
        0x41,
        0x49,
        0x46,
        0x43 // AIFC
      );
      expect(detectAudioFormat(aifcHeader)).toBe('aiff');
    });
  });

  describe('MP4 detection', () => {
    it('detects MP4 from ftyp box at offset 4', () => {
      const mp4Header = buf(
        0x00,
        0x00,
        0x00,
        0x18, // box size (24 bytes)
        0x66,
        0x74,
        0x79,
        0x70, // ftyp
        0x69,
        0x73,
        0x6f,
        0x6d // isom brand
      );
      expect(detectAudioFormat(mp4Header)).toBe('mp4');
    });

    it('detects M4A from ftyp box with M4A brand', () => {
      const m4aHeader = buf(
        0x00,
        0x00,
        0x00,
        0x20, // box size (32 bytes)
        0x66,
        0x74,
        0x79,
        0x70, // ftyp
        0x4d,
        0x34,
        0x41,
        0x20 // M4A brand
      );
      expect(detectAudioFormat(m4aHeader)).toBe('mp4');
    });
  });

  describe('MP3 detection', () => {
    it('detects MP3 from ID3 tag', () => {
      const mp3Id3 = buf(
        0x49,
        0x44,
        0x33, // ID3
        0x04,
        0x00,
        0x00, // version + flags
        0x00,
        0x00,
        0x00,
        0x00, // size
        0x00,
        0x00
      );
      expect(detectAudioFormat(mp3Id3)).toBe('mp3');
    });

    it('detects MP3 from raw sync word (0xFFE0+)', () => {
      const mp3Sync = buf(
        0xff,
        0xfb, // sync word + MPEG1 Layer3
        0x90,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00
      );
      expect(detectAudioFormat(mp3Sync)).toBe('mp3');
    });
  });

  describe('AAC ADTS detection', () => {
    it('detects AAC from ADTS sync word', () => {
      // ADTS: 0xFFF1 (MPEG-4, Layer 0, no CRC)
      const aacAdts = buf(
        0xff,
        0xf1, // ADTS sync + flags
        0x50,
        0x80, // profile, sample rate, channels
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00
      );
      expect(detectAudioFormat(aacAdts)).toBe('aac');
    });

    it('detects AAC ADTS with CRC', () => {
      // ADTS: 0xFFF0 (MPEG-4, Layer 0, with CRC)
      const aacAdtsCrc = buf(
        0xff,
        0xf0, // ADTS sync with CRC
        0x50,
        0x80,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00,
        0x00
      );
      expect(detectAudioFormat(aacAdtsCrc)).toBe('aac');
    });
  });

  describe('PCM / unknown fallback', () => {
    it('returns null for raw PCM data (zeros)', () => {
      expect(detectAudioFormat(new ArrayBuffer(64))).toBeNull();
    });

    it('returns null for random binary data', () => {
      const random = buf(0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x11, 0x22, 0x33, 0x44);
      expect(detectAudioFormat(random)).toBeNull();
    });
  });

  describe('priority / ambiguity', () => {
    it('AAC ADTS (0xFFF1) is detected as AAC, not MP3', () => {
      // 0xFFF1 matches both AAC ADTS mask and MP3 sync mask,
      // but AAC is checked first (tighter mask)
      const ambiguous = buf(0xff, 0xf1, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00);
      expect(detectAudioFormat(ambiguous)).toBe('aac');
    });
  });
});

// ─── extractHeader ────────────────────────────────────────────────────────────

describe('extractHeader', () => {
  describe('WAV', () => {
    it('extracts 44-byte WAV header', () => {
      const wavData = new ArrayBuffer(100);
      const view = new Uint8Array(wavData);
      // Write RIFF + WAVE
      [0x52, 0x49, 0x46, 0x46].forEach((b, i) => {
        view[i] = b;
      });
      [0x57, 0x41, 0x56, 0x45].forEach((b, i) => {
        view[8 + i] = b;
      });
      // Fill with recognizable pattern
      for (let i = 12; i < 100; i++) view[i] = i & 0xff;

      const header = extractHeader(wavData, 'wav');
      expect(header).not.toBeNull();
      expect(header!.byteLength).toBe(44);
    });

    it('returns null for WAV buffer smaller than 44 bytes', () => {
      const smallWav = new ArrayBuffer(30);
      expect(extractHeader(smallWav, 'wav')).toBeNull();
    });
  });

  describe('OGG', () => {
    it('extracts first OGG page up to second OggS marker', () => {
      const oggData = new Uint8Array(100);
      // First OggS at offset 0
      [0x4f, 0x67, 0x67, 0x53].forEach((b, i) => {
        oggData[i] = b;
      });
      // Second OggS at offset 28
      [0x4f, 0x67, 0x67, 0x53].forEach((b, i) => {
        oggData[28 + i] = b;
      });

      const header = extractHeader(oggData.buffer, 'ogg');
      expect(header).not.toBeNull();
      expect(header!.byteLength).toBe(28); // bytes 0–27
    });

    it('returns full buffer when only one OGG page', () => {
      const oggData = new Uint8Array(50);
      [0x4f, 0x67, 0x67, 0x53].forEach((b, i) => {
        oggData[i] = b;
      });

      const header = extractHeader(oggData.buffer, 'ogg');
      expect(header).not.toBeNull();
      expect(header!.byteLength).toBe(50);
    });
  });

  describe('FLAC', () => {
    it('extracts STREAMINFO metadata block', () => {
      const flacData = new Uint8Array(50);
      // "fLaC"
      [0x66, 0x4c, 0x61, 0x43].forEach((b, i) => {
        flacData[i] = b;
      });
      // Block header at offset 4: last-block=1, type=0 (STREAMINFO), length=34
      // Binary: 1_0000000 00000000 00000000 00100010 = 0x80000022
      flacData[4] = 0x80; // last-block=1, type=0
      flacData[5] = 0x00;
      flacData[6] = 0x00;
      flacData[7] = 0x22; // length=34

      const header = extractHeader(flacData.buffer, 'flac');
      expect(header).not.toBeNull();
      // 4 (fLaC) + 4 (block header) + 34 (block data) = 42
      expect(header!.byteLength).toBe(42);
    });

    it('returns null when buffer is too small for the metadata block', () => {
      const flacData = new Uint8Array(12);
      [0x66, 0x4c, 0x61, 0x43].forEach((b, i) => {
        flacData[i] = b;
      });
      // Claim block length = 100 but buffer is only 12 bytes
      flacData[4] = 0x00;
      flacData[5] = 0x00;
      flacData[6] = 0x00;
      flacData[7] = 0x64; // length=100

      expect(extractHeader(flacData.buffer, 'flac')).toBeNull();
    });
  });

  describe('AIFF', () => {
    it('extracts 12-byte FORM header', () => {
      const aiffData = new Uint8Array(50);
      [0x46, 0x4f, 0x52, 0x4d].forEach((b, i) => {
        aiffData[i] = b;
      });
      [0x41, 0x49, 0x46, 0x46].forEach((b, i) => {
        aiffData[8 + i] = b;
      });

      const header = extractHeader(aiffData.buffer, 'aiff');
      expect(header).not.toBeNull();
      expect(header!.byteLength).toBe(12);
    });

    it('returns null for AIFF buffer smaller than 12 bytes', () => {
      expect(extractHeader(new ArrayBuffer(8), 'aiff')).toBeNull();
    });
  });

  describe('WebM', () => {
    it('extracts first 64 bytes as WebM header heuristic', () => {
      const webmData = new Uint8Array(200);
      [0x1a, 0x45, 0xdf, 0xa3].forEach((b, i) => {
        webmData[i] = b;
      });

      const header = extractHeader(webmData.buffer, 'webm');
      expect(header).not.toBeNull();
      expect(header!.byteLength).toBe(64);
    });

    it('returns full buffer for WebM shorter than 64 bytes', () => {
      const webmData = new Uint8Array(30);
      [0x1a, 0x45, 0xdf, 0xa3].forEach((b, i) => {
        webmData[i] = b;
      });

      const header = extractHeader(webmData.buffer, 'webm');
      expect(header).not.toBeNull();
      expect(header!.byteLength).toBe(30);
    });
  });

  describe('MP4', () => {
    it('extracts ftyp box using size from first 4 bytes', () => {
      const mp4Data = new Uint8Array(50);
      // Box size = 24 (big-endian)
      mp4Data[0] = 0x00;
      mp4Data[1] = 0x00;
      mp4Data[2] = 0x00;
      mp4Data[3] = 0x18;
      // "ftyp"
      [0x66, 0x74, 0x79, 0x70].forEach((b, i) => {
        mp4Data[4 + i] = b;
      });

      const header = extractHeader(mp4Data.buffer, 'mp4');
      expect(header).not.toBeNull();
      expect(header!.byteLength).toBe(24);
    });

    it('returns null when buffer is smaller than ftyp box size', () => {
      const mp4Data = new Uint8Array(12);
      // Claim box size = 100 but buffer is only 12 bytes
      mp4Data[0] = 0x00;
      mp4Data[1] = 0x00;
      mp4Data[2] = 0x00;
      mp4Data[3] = 0x64;
      [0x66, 0x74, 0x79, 0x70].forEach((b, i) => {
        mp4Data[4 + i] = b;
      });

      expect(extractHeader(mp4Data.buffer, 'mp4')).toBeNull();
    });

    it('returns null when ftyp box size is too small', () => {
      const mp4Data = new Uint8Array(12);
      // Box size = 4 (invalid — minimum is 8)
      mp4Data[0] = 0x00;
      mp4Data[1] = 0x00;
      mp4Data[2] = 0x00;
      mp4Data[3] = 0x04;
      [0x66, 0x74, 0x79, 0x70].forEach((b, i) => {
        mp4Data[4 + i] = b;
      });

      expect(extractHeader(mp4Data.buffer, 'mp4')).toBeNull();
    });
  });

  describe('stream formats (no header)', () => {
    it('returns null for MP3', () => {
      expect(extractHeader(new ArrayBuffer(100), 'mp3')).toBeNull();
    });

    it('returns null for AAC', () => {
      expect(extractHeader(new ArrayBuffer(100), 'aac')).toBeNull();
    });
  });
});

// ─── Container builders ───────────────────────────────────────────────────────

/** Encodes an ASCII string as bytes. */
function ascii(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

/** Encodes a 16-bit little-endian integer. */
function u16(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff];
}

/** Encodes a 32-bit little-endian integer. */
function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

/** Builds a RIFF/WAVE stream around a `fmt ` chunk. */
function wav(options: {
  sampleRate?: number;
  channels?: number;
  bitsPerSample?: number;
  formatTag?: number;
  /** Extra chunks inserted ahead of `fmt `, as raw bytes. */
  leadingChunks?: number[];
  /** Trims the stream to this many bytes, simulating a partial read. */
  truncateTo?: number;
}): ArrayBuffer {
  const {
    sampleRate = 16000,
    channels = 1,
    bitsPerSample = 16,
    formatTag = 0x0001,
    leadingChunks = [],
    truncateTo,
  } = options;

  const blockAlign = (channels * bitsPerSample) / 8;
  let fmtBody = [
    ...u16(formatTag),
    ...u16(channels),
    ...u32(sampleRate),
    ...u32(sampleRate * blockAlign),
    ...u16(blockAlign),
    ...u16(bitsPerSample),
  ];

  if (formatTag === 0xfffe) {
    // WAVE_FORMAT_EXTENSIBLE: cbSize(2) validBits(2) channelMask(4) SubFormat GUID(16),
    // where the GUID opens with the real format tag (PCM here).
    fmtBody = [
      ...fmtBody,
      ...u16(22),
      ...u16(bitsPerSample),
      ...u32(0x3),
      ...u16(0x0001),
      ...new Array<number>(14).fill(0),
    ];
  }

  const body = [
    ...ascii('WAVE'),
    ...leadingChunks,
    ...ascii('fmt '),
    ...u32(fmtBody.length),
    ...fmtBody,
    ...ascii('data'),
    ...u32(0),
  ];

  const bytes = new Uint8Array([...ascii('RIFF'), ...u32(body.length), ...body]);
  return (truncateTo === undefined ? bytes : bytes.slice(0, truncateTo)).buffer;
}

/** Builds a single OGG page carrying the given codec identification payload. */
function ogg(payload: number[]): ArrayBuffer {
  const header = [
    ...ascii('OggS'),
    0x00, // version
    0x02, // header type: beginning of stream
    ...new Array<number>(8).fill(0), // granule position
    ...u32(0x1234), // serial number
    ...u32(0), // page sequence
    ...u32(0), // checksum
    0x01, // one segment
    payload.length, // segment table
  ];
  return new Uint8Array([...header, ...payload]).buffer;
}

/** Builds an `OpusHead` identification packet. */
function opusHead(channels: number, inputSampleRate: number): number[] {
  return [
    ...ascii('OpusHead'),
    0x01, // version
    channels,
    ...u16(312), // pre-skip
    ...u32(inputSampleRate),
    ...u16(0), // output gain
    0x00, // channel mapping family
  ];
}

/** Builds a Vorbis identification packet. */
function vorbisHead(channels: number, sampleRate: number): number[] {
  return [
    0x01,
    ...ascii('vorbis'),
    ...u32(0), // vorbis version
    channels,
    ...u32(sampleRate),
    ...u32(0), // max bitrate
    ...u32(0), // nominal bitrate
  ];
}

/**
 * Builds a 4-byte MPEG audio frame header plus padding.
 *
 * @param version - `1`, `2`, or `2.5`
 * @param rateIndex - Index into the version's sample-rate table
 * @param mono - Whether to use the mono channel mode
 */
function mp3Frame(version: 1 | 2 | 2.5, rateIndex: number, mono: boolean): number[] {
  const versionBits = version === 1 ? 0b11 : version === 2 ? 0b10 : 0b00;
  const byte1 = 0b1110_0000 | (versionBits << 3) | (0b01 << 1) | 0b1; // Layer III, no CRC
  const byte2 = 0b1001_0000 | (rateIndex << 2); // bitrate index 9, no padding
  const byte3 = (mono ? 0b11 : 0b00) << 6;
  return [0xff, byte1, byte2, byte3, ...new Array<number>(16).fill(0)];
}

/** Builds an ID3v2 tag of the given payload size. */
function id3Tag(payloadSize: number): number[] {
  return [
    ...ascii('ID3'),
    0x04,
    0x00, // version 2.4
    0x00, // flags (no footer)
    (payloadSize >>> 21) & 0x7f,
    (payloadSize >>> 14) & 0x7f,
    (payloadSize >>> 7) & 0x7f,
    payloadSize & 0x7f,
    ...new Array<number>(payloadSize).fill(0),
  ];
}

/** Builds a FLAC stream opening with a STREAMINFO metadata block. */
function flac(sampleRate: number, channels: number, bitsPerSample: number): ArrayBuffer {
  const streamInfo = new Array<number>(34).fill(0);
  streamInfo[10] = (sampleRate >>> 12) & 0xff;
  streamInfo[11] = (sampleRate >>> 4) & 0xff;
  streamInfo[12] =
    ((sampleRate & 0xf) << 4) | ((channels - 1) << 1) | (((bitsPerSample - 1) >> 4) & 0x1);
  streamInfo[13] = ((bitsPerSample - 1) & 0xf) << 4;

  return new Uint8Array([
    ...ascii('fLaC'),
    0x00, // metadata block: not last, type 0 (STREAMINFO)
    0x00,
    0x00,
    0x22, // block length: 34
    ...streamInfo,
  ]).buffer;
}

// ─── getDetectedFormatMimeType ────────────────────────────────────────────────

describe('getDetectedFormatMimeType', () => {
  it.each([
    ['wav', 'audio/wav'],
    ['ogg', 'audio/ogg'],
    ['mp3', 'audio/mpeg'],
    ['aac', 'audio/aac'],
    ['webm', 'audio/webm'],
    ['flac', 'audio/flac'],
    ['aiff', 'audio/aiff'],
    ['mp4', 'audio/mp4'],
  ] as const)('maps %s to %s', (format, mimeType) => {
    expect(getDetectedFormatMimeType(format)).toBe(mimeType);
  });
});

// ─── parseAudioMetadata ───────────────────────────────────────────────────────

describe('parseAudioMetadata', () => {
  describe('undetectable input', () => {
    it('returns null for raw PCM', () => {
      expect(parseAudioMetadata(new ArrayBuffer(1024))).toBeNull();
    });

    it('returns null for a buffer below MIN_SNIFF_BYTES', () => {
      expect(parseAudioMetadata(new ArrayBuffer(MIN_SNIFF_BYTES - 1))).toBeNull();
    });
  });

  describe('WAV', () => {
    it('parses sample rate, channels, bit depth, and encoding', () => {
      expect(parseAudioMetadata(wav({ sampleRate: 16000, channels: 1 }))).toEqual({
        format: 'wav',
        mimeType: 'audio/wav',
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
        encoding: 'linear16',
      });
    });

    it('parses stereo 44.1 kHz', () => {
      const parsed = parseAudioMetadata(wav({ sampleRate: 44100, channels: 2 }));
      expect(parsed).toMatchObject({ sampleRate: 44100, channels: 2, encoding: 'linear16' });
    });

    it('parses mu-law as mulaw', () => {
      const parsed = parseAudioMetadata(
        wav({ sampleRate: 8000, bitsPerSample: 8, formatTag: 0x0007 })
      );
      expect(parsed).toMatchObject({ sampleRate: 8000, bitDepth: 8, encoding: 'mulaw' });
    });

    it('parses A-law as alaw', () => {
      const parsed = parseAudioMetadata(
        wav({ sampleRate: 8000, bitsPerSample: 8, formatTag: 0x0006 })
      );
      expect(parsed).toMatchObject({ encoding: 'alaw' });
    });

    it('leaves encoding undefined for IEEE float samples', () => {
      const parsed = parseAudioMetadata(
        wav({ sampleRate: 48000, bitsPerSample: 32, formatTag: 0x0003 })
      );
      expect(parsed).toMatchObject({ sampleRate: 48000, bitDepth: 32 });
      expect(parsed?.encoding).toBeUndefined();
    });

    it('leaves encoding undefined for 24-bit PCM the SDK cannot name', () => {
      const parsed = parseAudioMetadata(wav({ bitsPerSample: 24 }));
      expect(parsed).toMatchObject({ bitDepth: 24 });
      expect(parsed?.encoding).toBeUndefined();
    });

    it('reads the real format tag out of a WAVE_FORMAT_EXTENSIBLE fmt chunk', () => {
      const parsed = parseAudioMetadata(wav({ sampleRate: 48000, formatTag: 0xfffe }));
      expect(parsed).toMatchObject({ sampleRate: 48000, encoding: 'linear16' });
    });

    it('skips chunks preceding fmt', () => {
      // A 40-byte LIST chunk ahead of the fmt chunk
      const list = [...ascii('LIST'), ...u32(40), ...new Array<number>(40).fill(0)];
      const parsed = parseAudioMetadata(wav({ sampleRate: 24000, leadingChunks: list }));
      expect(parsed).toMatchObject({ sampleRate: 24000, encoding: 'linear16' });
    });

    it('honours the pad byte after an odd-sized chunk', () => {
      const junk = [...ascii('JUNK'), ...u32(5), 1, 2, 3, 4, 5, 0];
      const parsed = parseAudioMetadata(wav({ sampleRate: 22050, leadingChunks: junk }));
      expect(parsed).toMatchObject({ sampleRate: 22050 });
    });

    it('returns null when the buffer stops before the fmt chunk', () => {
      const list = [...ascii('LIST'), ...u32(4096), ...new Array<number>(4096).fill(0)];
      expect(parseAudioMetadata(wav({ leadingChunks: list, truncateTo: 64 }))).toBeNull();
    });

    it('returns null when the fmt chunk itself is truncated', () => {
      // 12 RIFF/WAVE bytes + 8 chunk-header bytes + 4 of the 16 fmt body bytes
      expect(parseAudioMetadata(wav({ truncateTo: 24 }))).toBeNull();
    });
  });

  describe('OGG', () => {
    it('parses channels and input sample rate from OpusHead', () => {
      expect(parseAudioMetadata(ogg(opusHead(1, 16000)))).toEqual({
        format: 'ogg',
        mimeType: 'audio/ogg',
        sampleRate: 16000,
        channels: 1,
        encoding: 'opus',
      });
    });

    it('falls back to 48 kHz when OpusHead declares no input rate', () => {
      expect(parseAudioMetadata(ogg(opusHead(2, 0)))).toMatchObject({
        sampleRate: 48000,
        channels: 2,
      });
    });

    it('parses channels and sample rate from a Vorbis identification header', () => {
      const parsed = parseAudioMetadata(ogg(vorbisHead(2, 44100)));
      expect(parsed).toMatchObject({ format: 'ogg', sampleRate: 44100, channels: 2 });
      expect(parsed?.encoding).toBeUndefined();
    });

    it('reports the container alone for an unrecognized OGG codec', () => {
      const parsed = parseAudioMetadata(ogg([...ascii('SpeexUnknownCodecPayload')]));
      expect(parsed).toEqual({ format: 'ogg', mimeType: 'audio/ogg' });
    });

    it('returns null while the identification packet is incomplete', () => {
      const full = new Uint8Array(ogg(opusHead(1, 16000)));
      expect(parseAudioMetadata(full.slice(0, 30).buffer)).toBeNull();
    });
  });

  describe('MP3', () => {
    it('parses MPEG-1 Layer III mono at 44.1 kHz', () => {
      expect(parseAudioMetadata(new Uint8Array(mp3Frame(1, 0, true)).buffer)).toEqual({
        format: 'mp3',
        mimeType: 'audio/mpeg',
        sampleRate: 44100,
        channels: 1,
        encoding: 'mp3',
      });
    });

    it('parses MPEG-2 Layer III stereo at 16 kHz', () => {
      expect(parseAudioMetadata(new Uint8Array(mp3Frame(2, 2, false)).buffer)).toMatchObject({
        sampleRate: 16000,
        channels: 2,
      });
    });

    it('parses MPEG-2.5 at 8 kHz', () => {
      expect(parseAudioMetadata(new Uint8Array(mp3Frame(2.5, 2, true)).buffer)).toMatchObject({
        sampleRate: 8000,
      });
    });

    it('skips an ID3v2 tag to reach the first frame', () => {
      const bytes = new Uint8Array([...id3Tag(200), ...mp3Frame(1, 1, true)]);
      expect(parseAudioMetadata(bytes.buffer)).toMatchObject({
        sampleRate: 48000,
        channels: 1,
        encoding: 'mp3',
      });
    });

    it('returns null when the buffer ends inside the ID3v2 tag', () => {
      const bytes = new Uint8Array([...id3Tag(200)].slice(0, 100));
      expect(parseAudioMetadata(bytes.buffer)).toBeNull();
    });
  });

  describe('FLAC', () => {
    it('parses sample rate, channels, and bit depth from STREAMINFO', () => {
      const parsed = parseAudioMetadata(flac(44100, 2, 16));
      expect(parsed).toMatchObject({
        format: 'flac',
        mimeType: 'audio/flac',
        sampleRate: 44100,
        channels: 2,
        bitDepth: 16,
      });
      expect(parsed?.encoding).toBeUndefined();
    });

    it('parses 24-bit mono', () => {
      expect(parseAudioMetadata(flac(48000, 1, 24))).toMatchObject({
        sampleRate: 48000,
        channels: 1,
        bitDepth: 24,
      });
    });

    it('returns null while STREAMINFO is incomplete', () => {
      const truncated = new Uint8Array(flac(44100, 2, 16)).slice(0, 16);
      expect(parseAudioMetadata(truncated.buffer)).toBeNull();
    });
  });

  describe('containers without parsed parameters', () => {
    it('reports format and MIME type for WebM', () => {
      const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, ...new Array<number>(60).fill(0)]);
      expect(parseAudioMetadata(webm.buffer)).toEqual({ format: 'webm', mimeType: 'audio/webm' });
    });

    it('reports format and MIME type for MP4', () => {
      const mp4 = new Uint8Array([...u32(0), ...ascii('ftyp'), ...new Array<number>(24).fill(0)]);
      expect(parseAudioMetadata(mp4.buffer)).toEqual({ format: 'mp4', mimeType: 'audio/mp4' });
    });
  });

  it('skips redundant detection when the format is supplied', () => {
    expect(parseAudioMetadata(wav({ sampleRate: 8000 }), 'wav')).toMatchObject({
      sampleRate: 8000,
    });
  });
});

// ─── MAX_SNIFF_BYTES ──────────────────────────────────────────────────────────

describe('MAX_SNIFF_BYTES', () => {
  it('leaves room for a WAV chunk list, an OGG page, and a modest ID3 tag', () => {
    expect(MAX_SNIFF_BYTES).toBe(8192);
    expect(MAX_SNIFF_BYTES).toBeGreaterThan(MIN_SNIFF_BYTES);
  });
});
