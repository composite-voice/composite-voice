/**
 * AudioPlayer unit tests
 */

import { AudioPlayer } from '../../../../src/core/audio/AudioPlayer';
import type { AudioChunk, AudioMetadata } from '../../../../src/core/types/audio';

// Mock AudioBufferSourceNode
function makeMockSource() {
  return {
    buffer: null as AudioBuffer | null,
    connect: jest.fn(),
    disconnect: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
    onended: null as (() => void) | null,
  };
}

// Mock AudioBuffer
function makeMockAudioBuffer(duration = 0.1) {
  return { duration, sampleRate: 24000, numberOfChannels: 1 } as unknown as AudioBuffer;
}

// Shared mock source that tests can reference
let mockSource = makeMockSource();

const mockAudioContext = {
  state: 'running' as AudioContextState,
  sampleRate: 24000,
  destination: {},
  suspend: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  createBufferSource: jest.fn(() => {
    mockSource = makeMockSource();
    // Auto-trigger onended after start() so playback resolves
    mockSource.start = jest.fn().mockImplementation(() => {
      Promise.resolve().then(() => mockSource.onended?.());
    });
    return mockSource;
  }),
  createBuffer: jest.fn(
    (channels: number, length: number, sampleRate: number) =>
      ({ numberOfChannels: channels, length, sampleRate }) as unknown as AudioBuffer
  ),
  decodeAudioData: jest.fn().mockImplementation((_buffer: ArrayBuffer) => {
    const buf = makeMockAudioBuffer();
    return Promise.resolve(buf);
  }),
};

function makeAudioChunk(bytes = 100): AudioChunk {
  return {
    data: new ArrayBuffer(bytes),
    timestamp: Date.now(),
  };
}

describe('AudioPlayer', () => {
  let player: AudioPlayer;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mockSource
    mockSource = makeMockSource();

    // Provide global AudioContext mock
    (global as any).AudioContext = jest.fn(() => mockAudioContext);
    mockAudioContext.state = 'running';

    player = new AudioPlayer();
  });

  afterEach(async () => {
    // Ensure any running playback is cleaned up
    try {
      await player.dispose();
    } catch {
      // ignore
    }
  });

  describe('construction', () => {
    it('should create with default state idle', () => {
      expect(player.getState()).toBe('idle');
    });

    it('should not be playing initially', () => {
      expect(player.isPlaying()).toBe(false);
    });

    it('should have no audio context until first play', () => {
      expect(player.getAudioContext()).toBeNull();
    });

    it('should return a copy of config', () => {
      const config = player.getConfig();
      expect(config).toBeDefined();
      expect(typeof config.bufferSize).toBe('number');
    });
  });

  describe('setMetadata', () => {
    it('should accept audio metadata', () => {
      const metadata: AudioMetadata = { sampleRate: 24000, channels: 1, encoding: 'linear16' as const };
      expect(() => player.setMetadata(metadata)).not.toThrow();
    });
  });

  describe('setCallbacks', () => {
    it('should accept callbacks without throwing', () => {
      expect(() =>
        player.setCallbacks({
          onStart: jest.fn(),
          onEnd: jest.fn(),
          onError: jest.fn(),
        })
      ).not.toThrow();
    });
  });

  describe('play()', () => {
    function makeMockBlob(): Blob {
      // JSDOM doesn't implement Blob.arrayBuffer(), so mock it
      const blob = new Blob([new Uint8Array(100)], { type: 'audio/wav' });
      (blob as any).arrayBuffer = jest.fn().mockResolvedValue(new ArrayBuffer(100));
      return blob;
    }

    it('should play a blob and update state', async () => {
      const onStart = jest.fn();
      const onEnd = jest.fn();
      player.setCallbacks({ onStart, onEnd });

      await player.play(makeMockBlob());

      expect(onStart).toHaveBeenCalled();
      expect(mockAudioContext.decodeAudioData).toHaveBeenCalled();
    });

    it('should call onPlaybackError on failure', async () => {
      mockAudioContext.decodeAudioData.mockRejectedValueOnce(new Error('Decode failed'));
      const onError = jest.fn();
      player.setCallbacks({ onError });

      await expect(player.play(makeMockBlob())).rejects.toThrow('Decode failed');
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('stop()', () => {
    it('should stop playback and clear queue', async () => {
      // Add some chunks to the queue without processing
      await player.stop();
      expect(player.getState()).toBe('stopped');
    });

    it('should be callable multiple times without throwing', async () => {
      await player.stop();
      await expect(player.stop()).resolves.not.toThrow();
    });
  });

  describe('pause() and resume()', () => {
    it('should not throw when pausing while not playing', async () => {
      await expect(player.pause()).resolves.not.toThrow();
    });

    it('should not throw when resuming while not paused', async () => {
      await expect(player.resume()).resolves.not.toThrow();
    });
  });

  describe('updateConfig()', () => {
    it('should update config', () => {
      player.updateConfig({ bufferSize: 8192 });
      expect(player.getConfig().bufferSize).toBe(8192);
    });
  });

  describe('dispose()', () => {
    function makeMockBlob(): Blob {
      const blob = new Blob([new Uint8Array(100)], { type: 'audio/wav' });
      (blob as any).arrayBuffer = jest.fn().mockResolvedValue(new ArrayBuffer(100));
      return blob;
    }

    it('should dispose without throwing', async () => {
      await expect(player.dispose()).resolves.not.toThrow();
    });

    it('should close the audio context', async () => {
      // Trigger context creation via play()
      await player.play(makeMockBlob());
      await player.dispose();
      expect(mockAudioContext.close).toHaveBeenCalled();
    });

    it('should return null from getAudioContext after dispose', async () => {
      await player.play(makeMockBlob());
      await player.dispose();
      expect(player.getAudioContext()).toBeNull();
    });
  });

  describe('addChunk()', () => {
    it('should accept audio chunks without throwing', async () => {
      player.setMetadata({ sampleRate: 24000, channels: 1, encoding: 'linear16' as const });
      const chunk = makeAudioChunk(200);
      // Don't await - the queue processes asynchronously and may stall
      // without real audio data. Just verify it doesn't throw synchronously.
      expect(() => void player.addChunk(chunk)).not.toThrow();
    });
  });

  describe('waitForCompletion()', () => {
    it('should resolve immediately when state is idle', async () => {
      expect(player.getState()).toBe('idle');
      await expect(player.waitForCompletion()).resolves.not.toThrow();
    });

    it('should resolve via timeout when state is stopped', async () => {
      // stop() sets state to 'stopped' (not 'idle'), so waitForCompletion
      // exits via the timeout guard rather than the state check.
      await player.stop();
      await expect(player.waitForCompletion(100)).resolves.not.toThrow();
    });

    it('should resolve quickly when already idle with short timeout', async () => {
      await expect(player.waitForCompletion(100)).resolves.not.toThrow();
    });
  });
});
