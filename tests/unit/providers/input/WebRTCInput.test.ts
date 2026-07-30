/**
 * Tests for the WebRTCInput provider
 *
 * WebRTCInput consumes an external MediaStreamTrack/MediaStream (owned by the
 * application's RTCPeerConnection) and extracts linear16 PCM via a locally
 * built Web Audio graph. These tests mock the AudioContext / MediaStream
 * primitives (jsdom does not implement them) and drive both the
 * ScriptProcessor fallback and AudioWorklet paths.
 */

import { WebRTCInput } from '../../../../src/providers/input/WebRTCInput';
import { ProviderInitializationError } from '../../../../src/utils/errors';
import type { AudioChunk } from '../../../../src/core/types/audio';

// --- Web Audio / MediaStream mocks --------------------------------------

interface MockScriptProcessor {
  connect: jest.Mock;
  disconnect: jest.Mock;
  onaudioprocess: ((event: unknown) => void) | null;
}

interface MockSourceNode {
  connect: jest.Mock;
  disconnect: jest.Mock;
}

let mockScriptProcessor: MockScriptProcessor;
let sourceNodes: MockSourceNode[];

const mockWorkletPort = {
  onmessage: null as ((event: { data: unknown }) => void) | null,
  postMessage: jest.fn(),
};

const mockWorkletNode = {
  connect: jest.fn(),
  disconnect: jest.fn(),
  port: mockWorkletPort,
};

function createMockAudioContext(sampleRate = 16000) {
  return {
    sampleRate,
    state: 'running',
    destination: {},
    audioWorklet: undefined as { addModule: jest.Mock } | undefined,
    createMediaStreamSource: jest.fn(() => {
      const node: MockSourceNode = { connect: jest.fn(), disconnect: jest.fn() };
      sourceNodes.push(node);
      return node;
    }),
    createScriptProcessor: jest.fn(() => mockScriptProcessor),
    suspend: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
}

let mockAudioContext: ReturnType<typeof createMockAudioContext>;
let audioContextCtor: jest.Mock;

const mockTrack = { kind: 'audio', stop: jest.fn(), enabled: true } as unknown as MediaStreamTrack;

function createMockStream(tracks: MediaStreamTrack[] = [mockTrack]): MediaStream {
  return {
    getTracks: jest.fn(() => tracks),
    getAudioTracks: jest.fn(() => tracks),
  } as unknown as MediaStream;
}

/** Capture the tracks passed to `new MediaStream([track])`. */
let mediaStreamCtorArgs: unknown[][];

/** Flush pending microtasks so the async graph build settles. */
async function flushAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** Drive the ScriptProcessor path with Float32 samples. */
function emitScriptProcessorAudio(samples: Float32Array, sampleRate: number): void {
  mockScriptProcessor.onaudioprocess?.({
    inputBuffer: {
      sampleRate,
      getChannelData: jest.fn(() => samples),
    },
  });
}

beforeEach(() => {
  sourceNodes = [];
  mediaStreamCtorArgs = [];
  mockScriptProcessor = { connect: jest.fn(), disconnect: jest.fn(), onaudioprocess: null };
  mockWorkletPort.onmessage = null;
  mockWorkletPort.postMessage.mockClear();
  mockWorkletNode.connect.mockClear();
  mockWorkletNode.disconnect.mockClear();

  mockAudioContext = createMockAudioContext();
  audioContextCtor = jest.fn(() => mockAudioContext);
  (global as Record<string, unknown>).AudioContext = audioContextCtor;

  (global as Record<string, unknown>).MediaStream = jest.fn((tracks: unknown[]) => {
    mediaStreamCtorArgs.push(tracks);
    return createMockStream(tracks as MediaStreamTrack[]);
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// --- Tests ---------------------------------------------------------------

describe('WebRTCInput', () => {
  describe('provider contract', () => {
    it('declares the input role and rest type', () => {
      const input = new WebRTCInput();
      expect(input.roles).toEqual(['input']);
      expect(input.type).toBe('rest');
    });

    it('returns linear16 mono metadata at the default 16000 Hz', () => {
      const input = new WebRTCInput();
      expect(input.getMetadata()).toEqual({
        sampleRate: 16000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });
    });

    it('reflects a custom targetSampleRate in metadata', () => {
      const input = new WebRTCInput({ targetSampleRate: 24000 });
      expect(input.getMetadata().sampleRate).toBe(24000);
    });
  });

  describe('lifecycle', () => {
    it('initializes and reports ready', async () => {
      const input = new WebRTCInput();
      expect(input.isReady()).toBe(false);
      await input.initialize();
      expect(input.isReady()).toBe(true);
    });

    it('is a no-op when initialized twice', async () => {
      const input = new WebRTCInput();
      await input.initialize();
      await expect(input.initialize()).resolves.toBeUndefined();
      expect(input.isReady()).toBe(true);
    });

    it('throws ProviderInitializationError without AudioContext', async () => {
      delete (global as Record<string, unknown>).AudioContext;
      const input = new WebRTCInput();
      await expect(input.initialize()).rejects.toThrow(ProviderInitializationError);
      expect(input.isReady()).toBe(false);
    });

    it('disposes and can be re-initialized', async () => {
      const input = new WebRTCInput({ stream: createMockStream() });
      await input.initialize();
      await input.dispose();
      expect(input.isReady()).toBe(false);
      await input.initialize();
      expect(input.isReady()).toBe(true);
    });

    it('dispose is a no-op when never initialized', async () => {
      const input = new WebRTCInput();
      await expect(input.dispose()).resolves.toBeUndefined();
    });
  });

  describe('graph construction (ScriptProcessor fallback)', () => {
    it('builds an AudioContext at the target sample rate on start', async () => {
      const input = new WebRTCInput({ stream: createMockStream(), targetSampleRate: 16000 });
      await input.initialize();
      input.start();
      await flushAsync();

      expect(audioContextCtor).toHaveBeenCalledWith({ sampleRate: 16000 });
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledTimes(1);
      expect(mockAudioContext.createScriptProcessor).toHaveBeenCalledWith(2048, 1, 1);
    });

    it('connects source -> processor -> destination', async () => {
      const stream = createMockStream();
      const input = new WebRTCInput({ stream });
      await input.initialize();
      input.start();
      await flushAsync();

      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledWith(stream);
      expect(sourceNodes[0]?.connect).toHaveBeenCalledWith(mockScriptProcessor);
      expect(mockScriptProcessor.connect).toHaveBeenCalledWith(mockAudioContext.destination);
    });

    it('does not build a graph when no source is configured', async () => {
      const input = new WebRTCInput();
      await input.initialize();
      input.start();
      await flushAsync();

      expect(audioContextCtor).not.toHaveBeenCalled();
      expect(input.isActive()).toBe(true);
    });

    it('wraps a configured track in a MediaStream', async () => {
      const input = new WebRTCInput({ track: mockTrack });
      await input.initialize();
      input.start();
      await flushAsync();

      expect(mediaStreamCtorArgs[0]).toEqual([mockTrack]);
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledTimes(1);
    });
  });

  describe('graph construction (AudioWorklet path)', () => {
    let mockAddModule: jest.Mock;

    beforeEach(() => {
      mockAddModule = jest.fn().mockResolvedValue(undefined);
      mockAudioContext.audioWorklet = { addModule: mockAddModule };
      (global as Record<string, unknown>).AudioWorkletNode = jest.fn(() => mockWorkletNode);
      (global as Record<string, unknown>).Blob = jest.fn(() => ({}));
      URL.createObjectURL = jest.fn(() => 'blob:webrtc-input');
      URL.revokeObjectURL = jest.fn();
    });

    afterEach(() => {
      delete (global as Record<string, unknown>).AudioWorkletNode;
    });

    it('registers the worklet module and connects the source to it', async () => {
      const stream = createMockStream();
      const input = new WebRTCInput({ stream });
      await input.initialize();
      input.start();
      await flushAsync();

      expect(mockAddModule).toHaveBeenCalledWith('blob:webrtc-input');
      expect((global as Record<string, unknown>).AudioWorkletNode).toHaveBeenCalledWith(
        mockAudioContext,
        'webrtc-input-processor'
      );
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:webrtc-input');
      expect(sourceNodes[0]?.connect).toHaveBeenCalledWith(mockWorkletNode);
      expect(mockAudioContext.createScriptProcessor).not.toHaveBeenCalled();
    });

    it('emits PCM chunks from worklet port messages', async () => {
      const input = new WebRTCInput({ stream: createMockStream() });
      const chunks: AudioChunk[] = [];
      await input.initialize();
      input.onAudio((chunk) => chunks.push(chunk));
      input.start();
      await flushAsync();

      mockWorkletPort.onmessage?.({
        data: { type: 'audio', data: new Float32Array([0, 0.5, -0.5, 1]) },
      });

      expect(chunks).toHaveLength(1);
      const pcm = new Int16Array(chunks[0]?.data as ArrayBuffer);
      expect(Array.from(pcm)).toEqual([0, 16383, -16384, 32767]);
    });

    it('falls back to ScriptProcessorNode when addModule fails', async () => {
      mockAddModule.mockRejectedValueOnce(new Error('addModule not supported'));
      const input = new WebRTCInput({ stream: createMockStream() });
      await input.initialize();
      input.start();
      await flushAsync();

      expect(mockAudioContext.createScriptProcessor).toHaveBeenCalled();
      expect(sourceNodes[0]?.connect).toHaveBeenCalledWith(mockScriptProcessor);
    });
  });

  describe('audio emission', () => {
    async function startedInput(targetSampleRate = 16000): Promise<{
      input: WebRTCInput;
      chunks: AudioChunk[];
    }> {
      const input = new WebRTCInput({ stream: createMockStream(), targetSampleRate });
      const chunks: AudioChunk[] = [];
      await input.initialize();
      input.onAudio((chunk) => chunks.push(chunk));
      input.start();
      await flushAsync();
      return { input, chunks };
    }

    it('emits linear16 chunks with timestamp and increasing sequence', async () => {
      const { chunks } = await startedInput();

      emitScriptProcessorAudio(new Float32Array([0.5, -0.5]), 16000);
      emitScriptProcessorAudio(new Float32Array([1, -1]), 16000);

      expect(chunks).toHaveLength(2);
      expect(chunks[0]?.sequence).toBe(0);
      expect(chunks[1]?.sequence).toBe(1);
      expect(typeof chunks[0]?.timestamp).toBe('number');
      expect(Array.from(new Int16Array(chunks[1]?.data as ArrayBuffer))).toEqual([32767, -32768]);
    });

    it('downsamples when the source rate differs from the target rate', async () => {
      const { chunks } = await startedInput(16000);

      // 48 kHz source -> 16 kHz target: 6 samples -> 2 samples
      emitScriptProcessorAudio(new Float32Array([0.1, 0.1, 0.1, 0.2, 0.2, 0.2]), 48000);

      expect(chunks).toHaveLength(1);
      expect(new Int16Array(chunks[0]?.data as ArrayBuffer)).toHaveLength(2);
    });

    it('drops audio while paused and resumes emission afterwards', async () => {
      const { input, chunks } = await startedInput();

      input.pause();
      expect(input.isActive()).toBe(false);
      emitScriptProcessorAudio(new Float32Array([0.5]), 16000);
      expect(chunks).toHaveLength(0);

      input.resume();
      expect(input.isActive()).toBe(true);
      emitScriptProcessorAudio(new Float32Array([0.5]), 16000);
      expect(chunks).toHaveLength(1);
    });

    it('drops audio after stop', async () => {
      const { input, chunks } = await startedInput();

      input.stop();
      emitScriptProcessorAudio(new Float32Array([0.5]), 16000);
      expect(chunks).toHaveLength(0);
      expect(input.isActive()).toBe(false);
    });

    it('does not crash when no callback is registered', async () => {
      const input = new WebRTCInput({ stream: createMockStream() });
      await input.initialize();
      input.start();
      await flushAsync();

      expect(() => emitScriptProcessorAudio(new Float32Array([0.5]), 16000)).not.toThrow();
    });

    it('does not pause or resume when not started', () => {
      const input = new WebRTCInput();
      input.pause();
      expect(input.isActive()).toBe(false);
      input.resume();
      expect(input.isActive()).toBe(false);
    });
  });

  describe('source swapping', () => {
    it('setStream while active rewires the source node', async () => {
      const first = createMockStream();
      const input = new WebRTCInput({ stream: first });
      await input.initialize();
      input.start();
      await flushAsync();

      const second = createMockStream();
      input.setStream(second);

      expect(sourceNodes[0]?.disconnect).toHaveBeenCalled();
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenLastCalledWith(second);
      expect(sourceNodes[1]?.connect).toHaveBeenCalledWith(mockScriptProcessor);
    });

    it('setTrack while active wraps the track and rewires', async () => {
      const input = new WebRTCInput({ stream: createMockStream() });
      await input.initialize();
      input.start();
      await flushAsync();

      const newTrack = { kind: 'audio' } as unknown as MediaStreamTrack;
      input.setTrack(newTrack);

      expect(mediaStreamCtorArgs[mediaStreamCtorArgs.length - 1]).toEqual([newTrack]);
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledTimes(2);
    });

    it('builds the graph when a source arrives after start()', async () => {
      const input = new WebRTCInput();
      await input.initialize();
      input.start();
      await flushAsync();
      expect(audioContextCtor).not.toHaveBeenCalled();

      input.setStream(createMockStream());
      await flushAsync();

      expect(audioContextCtor).toHaveBeenCalledTimes(1);
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledTimes(1);
    });

    it('setTrack before start() is used when capture begins', async () => {
      const input = new WebRTCInput();
      await input.initialize();
      input.setTrack(mockTrack);
      input.start();
      await flushAsync();

      expect(mediaStreamCtorArgs[0]).toEqual([mockTrack]);
      expect(mockAudioContext.createMediaStreamSource).toHaveBeenCalledTimes(1);
    });
  });

  describe('teardown', () => {
    it('stop disconnects nodes and closes the context, leaving the track alone', async () => {
      const input = new WebRTCInput({ track: mockTrack });
      await input.initialize();
      input.start();
      await flushAsync();

      input.stop();

      expect(sourceNodes[0]?.disconnect).toHaveBeenCalled();
      expect(mockScriptProcessor.disconnect).toHaveBeenCalled();
      expect(mockAudioContext.close).toHaveBeenCalled();
      // The app owns the track — WebRTCInput must never stop it.
      expect(mockTrack.stop).not.toHaveBeenCalled();
    });

    it('can restart after stop with a fresh graph', async () => {
      const input = new WebRTCInput({ stream: createMockStream() });
      await input.initialize();
      input.start();
      await flushAsync();
      input.stop();

      input.start();
      await flushAsync();

      expect(audioContextCtor).toHaveBeenCalledTimes(2);
      expect(input.isActive()).toBe(true);
    });

    it('dispose tears down the graph and clears the callback', async () => {
      const input = new WebRTCInput({ stream: createMockStream() });
      const chunks: AudioChunk[] = [];
      await input.initialize();
      input.onAudio((chunk) => chunks.push(chunk));
      input.start();
      await flushAsync();

      await input.dispose();

      expect(mockAudioContext.close).toHaveBeenCalled();
      emitScriptProcessorAudio(new Float32Array([0.5]), 16000);
      expect(chunks).toHaveLength(0);
    });
  });
});
