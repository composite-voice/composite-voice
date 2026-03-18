/**
 * Tests for audio format detection and header extraction utilities.
 */

import { detectAudioFormat, extractHeader, MIN_SNIFF_BYTES } from '../../../src/utils/audioFormat';

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
