/**
 * Tests for the WebRTCOutput provider
 *
 * WebRTCOutput decodes TTS audio chunks and schedules them gaplessly into an
 * AudioContext MediaStreamDestination, exposing the resulting track/stream
 * for the application to publish on its RTCPeerConnection. These tests mock
 * the AudioContext primitives (jsdom does not implement them) and drive the
 * scheduling timeline manually via each source's `onended` handler.
 */

import { WebRTCOutput } from '../../../../src/providers/output/WebRTCOutput';
import { ProviderInitializationError, InvalidStateError } from '../../../../src/utils/errors';
import type { AudioChunk, AudioMetadata } from '../../../../src/core/types/audio';

// --- Web Audio mocks -------------------------------------------------------

interface MockBufferSource {
  buffer: MockAudioBuffer | null;
  connect: jest.Mock;
  disconnect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  onended: (() => void) | null;
}

interface MockAudioBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  duration: number;
  getChannelData: (channel: number) => Float32Array;
}

let createdSources: MockBufferSource[];
let createdBuffers: MockAudioBuffer[];

function createMockAudioContext(sampleRate = 48000) {
  const destination = {
    stream: {
      getAudioTracks: jest.fn(() => [mockTrack]),
      getTracks: jest.fn(() => [mockTrack]),
    },
  };

  return {
    currentTime: 0,
    sampleRate,
    state: 'running',
    destination: {},
    mockDestinationNode: destination,
    createMediaStreamDestination: jest.fn(() => destination),
    createBufferSource: jest.fn(() => {
      const source: MockBufferSource = {
        buffer: null,
        connect: jest.fn(),
        disconnect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        onended: null,
      };
      createdSources.push(source);
      return source;
    }),
    createBuffer: jest.fn((channels: number, length: number, rate: number) => {
      const channelData = Array.from({ length: channels }, () => new Float32Array(length));
      const buffer: MockAudioBuffer = {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (channel: number) => channelData[channel] as Float32Array,
      };
      createdBuffers.push(buffer);
      return buffer;
    }),
    decodeAudioData: jest.fn(),
    suspend: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

const mockTrack = { kind: 'audio', stop: jest.fn() };

let mockAudioContext: ReturnType<typeof createMockAudioContext>;
let audioContextCtor: jest.Mock;

/** Flush pending microtasks so the async decode/schedule loop settles. */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Fire onended for every scheduled source (simulates playback completing). */
function endAllSources(): void {
  for (const source of createdSources) {
    source.onended?.();
  }
}

const LINEAR16_METADATA: AudioMetadata = {
  sampleRate: 24000,
  encoding: 'linear16',
  channels: 1,
  bitDepth: 16,
};

function pcmChunk(samples: number[], metadata?: AudioMetadata): AudioChunk {
  const chunk: AudioChunk = {
    data: new Int16Array(samples).buffer,
    timestamp: Date.now(),
  };
  if (metadata) chunk.metadata = metadata;
  return chunk;
}

async function initializedOutput(): Promise<WebRTCOutput> {
  const output = new WebRTCOutput();
  await output.initialize();
  output.configure(LINEAR16_METADATA);
  return output;
}

beforeEach(() => {
  createdSources = [];
  createdBuffers = [];
  mockTrack.stop.mockClear();
  mockAudioContext = createMockAudioContext();
  audioContextCtor = jest.fn(() => mockAudioContext);
  (global as Record<string, unknown>).AudioContext = audioContextCtor;
});

afterEach(() => {
  jest.clearAllMocks();
});

// --- Tests -------------------------------------------------------------------

describe('WebRTCOutput', () => {
  describe('provider contract', () => {
    it('declares the output role and rest type', () => {
      const output = new WebRTCOutput();
      expect(output.roles).toEqual(['output']);
      expect(output.type).toBe('rest');
    });
  });

  describe('lifecycle', () => {
    it('initialize creates the AudioContext and destination node', async () => {
      const output = new WebRTCOutput();
      expect(output.isReady()).toBe(false);

      await output.initialize();

      expect(output.isReady()).toBe(true);
      expect(audioContextCtor).toHaveBeenCalledWith({});
      expect(mockAudioContext.createMediaStreamDestination).toHaveBeenCalledTimes(1);
    });

    it('passes a configured sampleRate to the AudioContext', async () => {
      const output = new WebRTCOutput({ sampleRate: 48000 });
      await output.initialize();
      expect(audioContextCtor).toHaveBeenCalledWith({ sampleRate: 48000 });
    });

    it('is a no-op when initialized twice', async () => {
      const output = new WebRTCOutput();
      await output.initialize();
      await output.initialize();
      expect(audioContextCtor).toHaveBeenCalledTimes(1);
    });

    it('throws ProviderInitializationError without AudioContext', async () => {
      delete (global as Record<string, unknown>).AudioContext;
      const output = new WebRTCOutput();
      await expect(output.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('dispose closes the context and allows re-initialization', async () => {
      const output = await initializedOutput();

      await output.dispose();
      expect(output.isReady()).toBe(false);
      expect(mockAudioContext.close).toHaveBeenCalled();

      await output.initialize();
      expect(output.isReady()).toBe(true);
      expect(mockAudioContext.createMediaStreamDestination).toHaveBeenCalledTimes(2);
    });

    it('dispose is a no-op when never initialized', async () => {
      const output = new WebRTCOutput();
      await expect(output.dispose()).resolves.toBeUndefined();
    });
  });

  describe('getTrack / getStream', () => {
    it('returns the destination stream and its audio track after initialize', async () => {
      const output = await initializedOutput();

      expect(output.getStream()).toBe(mockAudioContext.mockDestinationNode.stream);
      expect(output.getTrack()).toBe(mockTrack);
    });

    it('throws InvalidStateError before initialize', () => {
      const output = new WebRTCOutput();
      expect(() => output.getStream()).toThrow(InvalidStateError);
      expect(() => output.getTrack()).toThrow(InvalidStateError);
    });
  });

  describe('linear16 scheduling', () => {
    it('decodes PCM into an AudioBuffer at the metadata rate and schedules it', async () => {
      const output = await initializedOutput();

      output.enqueue(pcmChunk([0, 16383, -16384, 32767]));
      await flushAsync();

      expect(mockAudioContext.createBuffer).toHaveBeenCalledWith(1, 4, 24000);
      const channel = createdBuffers[0]?.getChannelData(0);
      expect(channel?.[0]).toBeCloseTo(0);
      expect(channel?.[1]).toBeCloseTo(0.5, 2);
      expect(channel?.[2]).toBeCloseTo(-0.5, 2);
      expect(channel?.[3]).toBeCloseTo(1);

      expect(createdSources).toHaveLength(1);
      expect(createdSources[0]?.connect).toHaveBeenCalledWith(mockAudioContext.mockDestinationNode);
      expect(createdSources[0]?.start).toHaveBeenCalledWith(0);
    });

    it('schedules consecutive chunks gaplessly on the timeline', async () => {
      const output = await initializedOutput();

      // 24000 samples at 24 kHz = exactly 1 second per chunk
      output.enqueue(pcmChunk(new Array(24000).fill(0)));
      output.enqueue(pcmChunk(new Array(24000).fill(0)));
      await flushAsync();

      expect(createdSources).toHaveLength(2);
      expect(createdSources[0]?.start).toHaveBeenCalledWith(0);
      expect(createdSources[1]?.start).toHaveBeenCalledWith(1);
    });

    it('splits interleaved stereo PCM across two channels', async () => {
      const output = await initializedOutput();
      output.configure({ ...LINEAR16_METADATA, channels: 2 });

      output.enqueue(pcmChunk([32767, -32768, 32767, -32768]));
      await flushAsync();

      expect(mockAudioContext.createBuffer).toHaveBeenCalledWith(2, 2, 24000);
      expect(createdBuffers[0]?.getChannelData(0)[0]).toBeCloseTo(1);
      expect(createdBuffers[0]?.getChannelData(1)[0]).toBeCloseTo(-1);
    });

    it('per-chunk metadata overrides configure()', async () => {
      const output = await initializedOutput();

      output.enqueue(
        pcmChunk([0, 0], { sampleRate: 8000, encoding: 'linear16', channels: 1, bitDepth: 16 })
      );
      await flushAsync();

      expect(mockAudioContext.createBuffer).toHaveBeenCalledWith(1, 2, 8000);
    });

    it('drops chunks enqueued before initialize', async () => {
      const output = new WebRTCOutput();
      expect(() => output.enqueue(pcmChunk([0, 0]))).not.toThrow();
      await flushAsync();
      expect(createdSources).toHaveLength(0);
    });
  });

  describe('odd-length linear16 chunks', () => {
    /** A raw byte chunk, deliberately not 2-byte aligned. */
    function byteChunk(bytes: number[]): AudioChunk {
      return { data: new Uint8Array(bytes).buffer, timestamp: Date.now() };
    }

    it('carries a half-sample into the next chunk instead of throwing', async () => {
      // new Int16Array(oddBuffer) throws RangeError; the chunk used to be
      // dropped entirely and every later one parsed byte-swapped.
      const output = await initializedOutput();
      const errors: Error[] = [];
      output.onPlaybackError((error) => errors.push(error));

      // 0x0100 = 256, then a stray 0x02 held back for the next chunk.
      output.enqueue(byteChunk([0x00, 0x01, 0x02]));
      await flushAsync();

      expect(errors).toHaveLength(0);
      expect(createdBuffers[0]?.getChannelData(0)).toHaveLength(1);

      // 0x03 completes the carried byte into 0x0302.
      output.enqueue(byteChunk([0x03]));
      await flushAsync();

      expect(errors).toHaveLength(0);
      expect(createdBuffers[1]?.getChannelData(0)).toHaveLength(1);
    });

    it('drops the carried byte on stop() so the next utterance stays aligned', async () => {
      const output = await initializedOutput();
      const errors: Error[] = [];
      output.onPlaybackError((error) => errors.push(error));

      output.enqueue(byteChunk([0x00, 0x01, 0x02])); // leaves 0x02 carried
      await flushAsync();

      output.stop(); // barge-in: the cancelled stream must not bleed through

      output.enqueue(byteChunk([0x10, 0x11]));
      await flushAsync();

      expect(errors).toHaveLength(0);
      // One whole sample, not a byte-swapped one built from the stale carry.
      const channel = createdBuffers[createdBuffers.length - 1]?.getChannelData(0);
      expect(channel).toHaveLength(1);
    });
  });

  describe('suspended AudioContext', () => {
    it('resumes before scheduling so flush() cannot hang', async () => {
      // A context created outside a user gesture starts suspended; its
      // currentTime never advances, so onended never fires and the flush the
      // pipeline awaits never resolves.
      mockAudioContext.state = 'suspended';
      const output = await initializedOutput();

      output.enqueue(pcmChunk([1, 2, 3, 4]));
      await flushAsync();

      expect(mockAudioContext.resume).toHaveBeenCalled();
    });
  });

  describe('G.711 decoding', () => {
    it('decodes mulaw chunks to PCM before scheduling', async () => {
      const output = await initializedOutput();
      output.configure({ sampleRate: 8000, encoding: 'mulaw', channels: 1 });

      // 0xFF is mulaw silence (decodes to 0)
      output.enqueue({ data: new Uint8Array([0xff, 0xff]).buffer, timestamp: Date.now() });
      await flushAsync();

      expect(mockAudioContext.createBuffer).toHaveBeenCalledWith(1, 2, 8000);
      expect(createdBuffers[0]?.getChannelData(0)[0]).toBeCloseTo(0);
      expect(createdSources).toHaveLength(1);
    });

    it('decodes alaw chunks to PCM before scheduling', async () => {
      const output = await initializedOutput();
      output.configure({ sampleRate: 8000, encoding: 'alaw', channels: 1 });

      output.enqueue({ data: new Uint8Array([0xd5, 0xd5]).buffer, timestamp: Date.now() });
      await flushAsync();

      expect(mockAudioContext.createBuffer).toHaveBeenCalledWith(1, 2, 8000);
      expect(createdSources).toHaveLength(1);
    });
  });

  describe('compressed formats via decodeAudioData', () => {
    it('decodes mp3 chunks with decodeAudioData', async () => {
      const output = await initializedOutput();
      output.configure({ sampleRate: 44100, encoding: 'mp3', channels: 1 });

      const decoded = { duration: 0.5, sampleRate: 44100 };
      mockAudioContext.decodeAudioData.mockResolvedValueOnce(decoded);

      output.enqueue({ data: new Uint8Array([1, 2, 3]).buffer, timestamp: Date.now() });
      await flushAsync();

      expect(mockAudioContext.decodeAudioData).toHaveBeenCalledTimes(1);
      expect(createdSources[0]?.buffer).toBe(decoded);
    });

    it('reports decode failures via onPlaybackError and continues', async () => {
      const output = await initializedOutput();
      output.configure({ sampleRate: 44100, encoding: 'mp3', channels: 1 });

      const errors: Error[] = [];
      output.onPlaybackError((error) => errors.push(error));
      mockAudioContext.decodeAudioData.mockRejectedValueOnce(new Error('bad frame'));

      output.enqueue({ data: new Uint8Array([1]).buffer, timestamp: Date.now() });
      await flushAsync();

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('decodeAudioData failed');
      expect(errors[0]?.message).toContain('linear16');
      expect(createdSources).toHaveLength(0);
    });
  });

  describe('missing metadata', () => {
    it('reports an error when enqueuing without configure() or chunk metadata', async () => {
      const output = new WebRTCOutput();
      await output.initialize();

      const errors: Error[] = [];
      output.onPlaybackError((error) => errors.push(error));

      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();

      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('configure(metadata)');
    });
  });

  describe('playback lifecycle callbacks', () => {
    it('fires onPlaybackStart once when delivery begins and onPlaybackEnd on drain', async () => {
      const output = await initializedOutput();
      const started = jest.fn();
      const ended = jest.fn();
      output.onPlaybackStart(started);
      output.onPlaybackEnd(ended);

      output.enqueue(pcmChunk([0, 0]));
      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();

      expect(started).toHaveBeenCalledTimes(1);
      expect(ended).not.toHaveBeenCalled();
      expect(output.isPlaying()).toBe(true);

      endAllSources();

      expect(ended).toHaveBeenCalledTimes(1);
      expect(output.isPlaying()).toBe(false);
    });

    it('fires onPlaybackStart again for a new delivery after drain', async () => {
      const output = await initializedOutput();
      const started = jest.fn();
      output.onPlaybackStart(started);

      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();
      endAllSources();

      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();

      expect(started).toHaveBeenCalledTimes(2);
    });
  });

  describe('flush', () => {
    it('resolves immediately when idle', async () => {
      const output = await initializedOutput();
      await expect(output.flush()).resolves.toBeUndefined();
    });

    it('resolves once all scheduled sources have ended', async () => {
      const output = await initializedOutput();

      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();

      let flushed = false;
      const flushPromise = output.flush().then(() => {
        flushed = true;
      });

      await flushAsync();
      expect(flushed).toBe(false);

      endAllSources();
      await flushPromise;
      expect(flushed).toBe(true);
    });

    it('resolves when stop() cancels delivery', async () => {
      const output = await initializedOutput();

      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();

      const flushPromise = output.flush();
      output.stop();

      await expect(flushPromise).resolves.toBeUndefined();
    });
  });

  describe('stop (barge-in)', () => {
    it('stops and disconnects all scheduled sources and clears the queue', async () => {
      const output = await initializedOutput();
      const ended = jest.fn();
      output.onPlaybackEnd(ended);

      output.enqueue(pcmChunk([0, 0]));
      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();

      output.stop();

      for (const source of createdSources) {
        expect(source.stop).toHaveBeenCalled();
        expect(source.disconnect).toHaveBeenCalled();
      }
      expect(ended).toHaveBeenCalledTimes(1);
      expect(output.isPlaying()).toBe(false);
    });

    it('retains configured metadata so the next turn plays without re-configuration', async () => {
      const output = await initializedOutput();

      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();
      output.stop();

      const sourcesBefore = createdSources.length;
      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();

      expect(createdSources.length).toBe(sourcesBefore + 1);
    });

    it('resets the timeline so new audio starts at currentTime', async () => {
      const output = await initializedOutput();

      output.enqueue(pcmChunk(new Array(24000).fill(0)));
      await flushAsync();
      output.stop();

      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();

      expect(createdSources[1]?.start).toHaveBeenCalledWith(0);
    });

    it('does not fire onPlaybackEnd when nothing was playing', async () => {
      const output = await initializedOutput();
      const ended = jest.fn();
      output.onPlaybackEnd(ended);

      output.stop();

      expect(ended).not.toHaveBeenCalled();
    });
  });

  describe('pause / resume', () => {
    it('suspends and resumes the AudioContext', async () => {
      const output = await initializedOutput();

      output.enqueue(pcmChunk([0, 0]));
      await flushAsync();

      output.pause();
      expect(mockAudioContext.suspend).toHaveBeenCalledTimes(1);
      expect(output.isPlaying()).toBe(false);

      output.resume();
      expect(mockAudioContext.resume).toHaveBeenCalledTimes(1);
      expect(output.isPlaying()).toBe(true);
    });

    it('pause is idempotent and resume without pause is a no-op', async () => {
      const output = await initializedOutput();

      output.resume();
      expect(mockAudioContext.resume).not.toHaveBeenCalled();

      output.pause();
      output.pause();
      expect(mockAudioContext.suspend).toHaveBeenCalledTimes(1);
    });
  });
});
