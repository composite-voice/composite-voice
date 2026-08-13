/**
 * Tests for the BufferInput provider.
 *
 * BufferInput accepts pushed audio buffers on the server side. These tests cover
 * the push lifecycle (start/stop/pause gating, chunk shape) and the magic-byte
 * format detection that lets a pipeline accept WAV/OGG/MP3 data with no declared
 * format.
 */

import { BufferInput } from '../../../../src/providers/input/BufferInput';
import type { AudioChunk } from '../../../../src/core/types/audio';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

/** Builds a canonical 44-byte WAV header followed by silent PCM. */
function wavFile(sampleRate = 16000, channels = 1, bitsPerSample = 16): ArrayBuffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  return new Uint8Array([
    ...ascii('RIFF'),
    ...u32(36),
    ...ascii('WAVE'),
    ...ascii('fmt '),
    ...u32(16),
    ...u16(1),
    ...u16(channels),
    ...u32(sampleRate),
    ...u32(sampleRate * blockAlign),
    ...u16(blockAlign),
    ...u16(bitsPerSample),
    ...ascii('data'),
    ...u32(0),
    ...new Array<number>(64).fill(0),
  ]).buffer;
}

/** Builds an OGG page carrying an `OpusHead` identification packet. */
function oggOpusFile(channels = 1, sampleRate = 48000): ArrayBuffer {
  const payload = [
    ...ascii('OpusHead'),
    0x01,
    channels,
    ...u16(312),
    ...u32(sampleRate),
    ...u16(0),
    0x00,
  ];
  return new Uint8Array([
    ...ascii('OggS'),
    0x00,
    0x02,
    ...new Array<number>(8).fill(0),
    ...u32(1),
    ...u32(0),
    ...u32(0),
    0x01,
    payload.length,
    ...payload,
  ]).buffer;
}

/** Builds an MPEG-1 Layer III mono frame header at 44.1 kHz. */
function mp3File(): ArrayBuffer {
  return new Uint8Array([0xff, 0xfb, 0x90, 0xc0, ...new Array<number>(64).fill(0)]).buffer;
}

/** Raw 16-bit PCM with no container header. */
function pcmChunk(bytes = 320): ArrayBuffer {
  return new ArrayBuffer(bytes);
}

/** Creates a started BufferInput wired to a chunk collector. */
async function startedInput(
  ...args: ConstructorParameters<typeof BufferInput>
): Promise<{ input: BufferInput; chunks: AudioChunk[] }> {
  const input = new BufferInput(...args);
  const chunks: AudioChunk[] = [];
  await input.initialize();
  input.onAudio((chunk) => chunks.push(chunk));
  input.start();
  return { input, chunks };
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

describe('BufferInput lifecycle', () => {
  it('declares the input role and rest transport', () => {
    const input = new BufferInput();
    expect(input.roles).toEqual(['input']);
    expect(input.type).toBe('rest');
  });

  it('reports readiness only between initialize and dispose', async () => {
    const input = new BufferInput();
    expect(input.isReady()).toBe(false);
    await input.initialize();
    expect(input.isReady()).toBe(true);
    await input.dispose();
    expect(input.isReady()).toBe(false);
  });

  it('emits pushed chunks with timestamps and increasing sequence numbers', async () => {
    const { input, chunks } = await startedInput();
    const first = pcmChunk();
    const second = pcmChunk();

    input.push(first);
    input.push(second);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.data).toBe(first);
    expect(chunks[0]!.sequence).toBe(0);
    expect(chunks[1]!.sequence).toBe(1);
    expect(typeof chunks[0]!.timestamp).toBe('number');
  });

  it('drops audio pushed before start, after stop, and while paused', async () => {
    const input = new BufferInput();
    const chunks: AudioChunk[] = [];
    await input.initialize();
    input.onAudio((chunk) => chunks.push(chunk));

    input.push(pcmChunk());
    expect(chunks).toHaveLength(0);

    input.start();
    input.pause();
    input.push(pcmChunk());
    expect(chunks).toHaveLength(0);

    input.resume();
    input.push(pcmChunk());
    expect(chunks).toHaveLength(1);

    input.stop();
    input.push(pcmChunk());
    expect(chunks).toHaveLength(1);
  });
});

// ─── Declared metadata ────────────────────────────────────────────────────────

describe('BufferInput declared metadata', () => {
  it('returns the metadata given to the constructor', () => {
    const input = new BufferInput({
      sampleRate: 8000,
      encoding: 'mulaw',
      channels: 1,
      bitDepth: 8,
    });

    expect(input.getMetadata()).toEqual({
      sampleRate: 8000,
      encoding: 'mulaw',
      channels: 1,
      bitDepth: 8,
    });
  });

  it('falls back to 16 kHz mono linear16 when nothing is declared', () => {
    expect(new BufferInput().getMetadata()).toEqual({
      sampleRate: 16000,
      encoding: 'linear16',
      channels: 1,
      bitDepth: 16,
    });
  });

  it('returns a copy, so callers cannot mutate provider state', () => {
    const input = new BufferInput({ sampleRate: 16000 });
    input.getMetadata().sampleRate = 48000;
    expect(input.getMetadata().sampleRate).toBe(16000);
  });
});

// ─── Format detection ─────────────────────────────────────────────────────────

describe('BufferInput format detection', () => {
  it('derives WAV parameters from pushed audio', async () => {
    const { input } = await startedInput();

    input.push(wavFile(44100, 2));

    expect(input.getDetectedFormat()).toBe('wav');
    expect(input.getMetadata()).toEqual({
      sampleRate: 44100,
      encoding: 'linear16',
      channels: 2,
      bitDepth: 16,
      mimeType: 'audio/wav',
    });
  });

  it('derives OGG Opus parameters from pushed audio', async () => {
    const { input } = await startedInput();

    input.push(oggOpusFile(1, 16000));

    expect(input.getDetectedFormat()).toBe('ogg');
    expect(input.getMetadata()).toEqual({
      sampleRate: 16000,
      encoding: 'opus',
      channels: 1,
      mimeType: 'audio/ogg',
    });
  });

  it('derives MP3 parameters from pushed audio', async () => {
    const { input } = await startedInput();

    input.push(mp3File());

    expect(input.getDetectedFormat()).toBe('mp3');
    expect(input.getMetadata()).toMatchObject({
      sampleRate: 44100,
      encoding: 'mp3',
      channels: 1,
      mimeType: 'audio/mpeg',
    });
  });

  it('omits bit depth for compressed containers that have none', async () => {
    const { input } = await startedInput();
    input.push(mp3File());
    expect(input.getMetadata().bitDepth).toBeUndefined();
  });

  it('falls back to raw PCM when no container signature matches', async () => {
    const { input } = await startedInput();

    input.push(pcmChunk());

    expect(input.isFormatResolved()).toBe(true);
    expect(input.getDetectedFormat()).toBeNull();
    expect(input.getMetadata()).toEqual({
      sampleRate: 16000,
      encoding: 'linear16',
      channels: 1,
      bitDepth: 16,
    });
  });

  it('keeps declared fields and fills in only the undeclared ones', async () => {
    const { input } = await startedInput({ sampleRate: 8000 });

    input.push(wavFile(44100, 2));

    expect(input.getMetadata()).toMatchObject({
      sampleRate: 8000, // declared — detection does not override it
      channels: 2, // detected
      encoding: 'linear16',
    });
  });

  it('accumulates across chunks when the signature spans a boundary', async () => {
    const { input } = await startedInput();
    const wav = new Uint8Array(wavFile(24000, 1));

    input.push(wav.slice(0, 6).buffer);
    expect(input.isFormatResolved()).toBe(false);
    expect(input.getMetadata().sampleRate).toBe(16000); // still the default

    input.push(wav.slice(6).buffer);
    expect(input.getDetectedFormat()).toBe('wav');
    expect(input.getMetadata().sampleRate).toBe(24000);
  });

  it('waits for the fmt chunk rather than resolving on the magic bytes alone', async () => {
    const { input } = await startedInput();
    const wav = new Uint8Array(wavFile(32000, 1));

    input.push(wav.slice(0, 12).buffer); // "RIFF....WAVE" and nothing else
    expect(input.isFormatResolved()).toBe(false);

    input.push(wav.slice(12).buffer);
    expect(input.getMetadata().sampleRate).toBe(32000);
  });

  it('does not re-detect once the format is resolved', async () => {
    const { input } = await startedInput();

    input.push(wavFile(44100, 2));
    input.push(mp3File());

    expect(input.getDetectedFormat()).toBe('wav');
    expect(input.getMetadata().sampleRate).toBe(44100);
  });

  it('re-detects after resetDetection', async () => {
    const { input } = await startedInput();

    input.push(wavFile(44100, 2));
    input.resetDetection();
    expect(input.isFormatResolved()).toBe(false);
    expect(input.getDetectedFormat()).toBeNull();

    input.push(mp3File());
    expect(input.getDetectedFormat()).toBe('mp3');
  });

  it('emits pushed data unchanged, headers included', async () => {
    const { input, chunks } = await startedInput();
    const wav = wavFile();

    input.push(wav);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.data).toBe(wav);
    expect(chunks[0]!.data.byteLength).toBe(wav.byteLength);
  });

  it('ignores the format of audio that was dropped before start', async () => {
    const input = new BufferInput();
    await input.initialize();
    input.onAudio(() => {});

    input.push(wavFile(44100, 2));
    expect(input.isFormatResolved()).toBe(false);

    input.start();
    input.push(mp3File());
    expect(input.getDetectedFormat()).toBe('mp3');
  });

  it('skips detection entirely when autoDetect is false', async () => {
    const { input } = await startedInput({ sampleRate: 8000 }, { autoDetect: false });

    input.push(wavFile(44100, 2));

    expect(input.isFormatResolved()).toBe(false);
    expect(input.getDetectedFormat()).toBeNull();
    expect(input.getMetadata()).toEqual({
      sampleRate: 8000,
      encoding: 'linear16',
      channels: 1,
      bitDepth: 16,
    });
  });

  it('clears detection state on dispose', async () => {
    const { input } = await startedInput();

    input.push(wavFile(44100, 2));
    await input.dispose();

    expect(input.isFormatResolved()).toBe(false);
    expect(input.getMetadata().sampleRate).toBe(16000);
  });
});

// ─── detectFormat ─────────────────────────────────────────────────────────────

describe('BufferInput.detectFormat', () => {
  it('resolves the format without emitting a chunk', async () => {
    const { input, chunks } = await startedInput();

    const metadata = input.detectFormat(wavFile(22050, 1));

    expect(chunks).toHaveLength(0);
    expect(metadata.sampleRate).toBe(22050);
    expect(input.getMetadata()).toEqual(metadata);
  });

  it('works before start, so the pipeline can read the detected metadata', async () => {
    const input = new BufferInput();
    await input.initialize();

    expect(input.detectFormat(oggOpusFile(2, 48000))).toMatchObject({
      encoding: 'opus',
      channels: 2,
      sampleRate: 48000,
    });
  });

  it('runs even when autoDetect is disabled', () => {
    const input = new BufferInput({}, { autoDetect: false });
    expect(input.detectFormat(mp3File()).encoding).toBe('mp3');
  });

  it('leaves a later push to be emitted normally', async () => {
    const { input, chunks } = await startedInput();
    const wav = wavFile();

    input.detectFormat(wav);
    input.push(wav);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.sequence).toBe(0);
  });
});

// ─── onFormatDetected ─────────────────────────────────────────────────────────

describe('BufferInput.onFormatDetected', () => {
  it('fires once with the resolved metadata and container format', async () => {
    const { input } = await startedInput();
    const detected = jest.fn();
    input.onFormatDetected(detected);

    input.push(wavFile(44100, 2));
    input.push(wavFile(44100, 2));

    expect(detected).toHaveBeenCalledTimes(1);
    expect(detected).toHaveBeenCalledWith(
      expect.objectContaining({ sampleRate: 44100, channels: 2 }),
      'wav'
    );
  });

  it('reports a null format for raw PCM', async () => {
    const { input } = await startedInput();
    const detected = jest.fn();
    input.onFormatDetected(detected);

    input.push(pcmChunk());

    expect(detected).toHaveBeenCalledWith(expect.objectContaining({ encoding: 'linear16' }), null);
  });

  it('fires from detectFormat as well as push', async () => {
    const input = new BufferInput();
    const detected = jest.fn();
    input.onFormatDetected(detected);

    input.detectFormat(mp3File());

    expect(detected).toHaveBeenCalledWith(expect.objectContaining({ encoding: 'mp3' }), 'mp3');
  });

  it('does not fire while accumulating an incomplete signature', async () => {
    const { input } = await startedInput();
    const detected = jest.fn();
    input.onFormatDetected(detected);

    input.push(new Uint8Array(wavFile()).slice(0, 6).buffer);

    expect(detected).not.toHaveBeenCalled();
  });
});
