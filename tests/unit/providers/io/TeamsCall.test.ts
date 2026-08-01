/**
 * Tests for the TeamsCall duplex provider (Microsoft Teams via Azure
 * Communication Services).
 *
 * The ACS SDK packages (`@azure/communication-calling`,
 * `@azure/communication-common`) are optional peer dependencies that are NOT
 * installed in this repository, so they are mocked with `{ virtual: true }`.
 * The Web Audio API is replaced with a rich fake that records the audio
 * graph so both the capture (input) and playback (output) paths can be
 * asserted end to end.
 */

import { TeamsCall } from '../../../../src/providers/io/teams/TeamsCall';
import type {
  TeamsCallState,
  TeamsTokenCredential,
} from '../../../../src/providers/io/teams/TeamsCall';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';
import { encodeMulaw, decodeMulaw } from '../../../../src/utils/g711';
import { int16ToFloat } from '../../../../src/utils/audio';
import type { AudioChunk } from '../../../../src/core/types/audio';

// ─── Virtual mocks for the ACS peer dependencies ──────────────────────

const mockCreateCallAgent = jest.fn();
const mockCallClientCtor = jest.fn(() => ({ createCallAgent: mockCreateCallAgent }));
const mockLocalAudioStreamCtor = jest.fn(function (this: { source: unknown }, source: unknown) {
  this.source = source;
});
const mockTokenCredentialCtor = jest.fn(function (
  this: { token: string; dispose: jest.Mock },
  token: string
) {
  this.token = token;
  this.dispose = jest.fn();
});

jest.mock(
  '@azure/communication-calling',
  () => ({
    CallClient: mockCallClientCtor,
    LocalAudioStream: mockLocalAudioStreamCtor,
  }),
  { virtual: true }
);

jest.mock(
  '@azure/communication-common',
  () => ({
    AzureCommunicationTokenCredential: mockTokenCredentialCtor,
  }),
  { virtual: true }
);

// ─── Fake ACS Call ────────────────────────────────────────────────────

type Listener = (...args: unknown[]) => void;

interface FakeRemoteAudioStream {
  getMediaStream: jest.Mock;
}

class MockAcsCall {
  state: TeamsCallState = 'Connecting';
  remoteAudioStreams: FakeRemoteAudioStream[] = [];
  hangUp = jest.fn().mockResolvedValue(undefined);
  private listeners = new Map<string, Set<Listener>>();

  on = jest.fn((event: string, listener: Listener) => {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)?.add(listener);
  });

  off = jest.fn((event: string, listener: Listener) => {
    this.listeners.get(event)?.delete(listener);
  });

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  setState(state: TeamsCallState): void {
    this.state = state;
    this.emit('stateChanged');
  }

  addRemoteStream(stream: FakeRemoteAudioStream): void {
    this.remoteAudioStreams.push(stream);
    this.emit('remoteAudioStreamsUpdated', { added: [stream], removed: [] });
  }
}

// ─── Fake Web Audio API ───────────────────────────────────────────────

class FakeAudioBuffer {
  private channelData: Float32Array[];

  constructor(
    public numberOfChannels: number,
    public length: number,
    public sampleRate: number
  ) {
    this.channelData = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    const data = this.channelData[channel];
    if (!data) throw new Error(`No channel ${channel}`);
    return data;
  }
}

class FakeBufferSource {
  buffer: FakeAudioBuffer | null = null;
  onended: (() => void) | null = null;
  connect = jest.fn();
  disconnect = jest.fn();
  stop = jest.fn();
  start = jest.fn(() => {
    // Simulate a short (20 ms) playback so isPlaying() has a window and
    // flush() has something to wait for.
    setTimeout(() => this.onended?.(), 20);
  });
}

interface FakeScriptProcessor {
  bufferSize: number;
  onaudioprocess: ((event: unknown) => void) | null;
  connect: jest.Mock;
  disconnect: jest.Mock;
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  sampleRate = 48000;
  state = 'running';
  destination = { __type: 'speakers' };
  // audioWorklet intentionally undefined → ScriptProcessor capture fallback
  audioWorklet: undefined;

  createdSources: FakeBufferSource[] = [];
  createdBuffers: FakeAudioBuffer[] = [];
  scriptProcessors: FakeScriptProcessor[] = [];
  mediaStreamSources: Array<{ stream: unknown; connect: jest.Mock; disconnect: jest.Mock }> = [];
  mediaStreamDestinations: Array<{ stream: { __type: string } }> = [];

  decodeAudioData = jest.fn().mockRejectedValue(new Error('unsupported format'));
  close = jest.fn().mockResolvedValue(undefined);
  suspend = jest.fn().mockResolvedValue(undefined);
  resume = jest.fn().mockResolvedValue(undefined);

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createMediaStreamDestination(): { stream: { __type: string } } {
    const dest = { stream: { __type: 'outgoing-stream' } };
    this.mediaStreamDestinations.push(dest);
    return dest;
  }

  createMediaStreamSource(stream: unknown): {
    stream: unknown;
    connect: jest.Mock;
    disconnect: jest.Mock;
  } {
    const source = { stream, connect: jest.fn(), disconnect: jest.fn() };
    this.mediaStreamSources.push(source);
    return source;
  }

  createScriptProcessor(bufferSize: number): FakeScriptProcessor {
    const processor: FakeScriptProcessor = {
      bufferSize,
      onaudioprocess: null,
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    this.scriptProcessors.push(processor);
    return processor;
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.createdSources.push(source);
    return source;
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    const buffer = new FakeAudioBuffer(channels, length, sampleRate);
    this.createdBuffers.push(buffer);
    return buffer;
  }
}

// ─── Test helpers ─────────────────────────────────────────────────────

const MEETING_LINK = 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123';

const flushPromises = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function makeRemoteStream(): FakeRemoteAudioStream {
  return { getMediaStream: jest.fn().mockResolvedValue({ __type: 'remote-media-stream' }) };
}

/** The AudioContext created in initialize() for outgoing (playback) audio. */
function playbackCtx(): FakeAudioContext {
  const ctx = FakeAudioContext.instances[0];
  if (!ctx) throw new Error('No playback AudioContext created');
  return ctx;
}

/** The AudioContext created when the remote meeting audio is attached. */
function captureCtx(): FakeAudioContext {
  const ctx = FakeAudioContext.instances[1];
  if (!ctx) throw new Error('No capture AudioContext created');
  return ctx;
}

/** Feed Float32 samples through the capture ScriptProcessor fallback. */
function pushCapturedAudio(samples: Float32Array): void {
  const processor = captureCtx().scriptProcessors[0];
  if (!processor?.onaudioprocess) throw new Error('Capture processor not wired');
  processor.onaudioprocess({
    inputBuffer: { getChannelData: () => samples, sampleRate: captureCtx().sampleRate },
  });
}

/** A linear16 chunk long enough (>=200 ms at 16 kHz) to start playback immediately. */
function bigPcmChunk(sampleCount = 4800, value = 1000): AudioChunk {
  const pcm = new Int16Array(sampleCount).fill(value);
  return { data: pcm.buffer, timestamp: Date.now(), sequence: 0 };
}

describe('TeamsCall', () => {
  let call: MockAcsCall;
  let provider: TeamsCall | null = null;
  const mockCallAgent = {
    join: jest.fn(),
    dispose: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    FakeAudioContext.instances = [];
    global.AudioContext = FakeAudioContext as unknown as typeof AudioContext;

    call = new MockAcsCall();
    mockCallAgent.join.mockImplementation(() => call);
    mockCallAgent.dispose.mockResolvedValue(undefined);
    mockCreateCallAgent.mockResolvedValue(mockCallAgent);
  });

  afterEach(async () => {
    jest.useRealTimers();
    if (provider) {
      try {
        await provider.dispose();
      } catch {
        // ignore teardown errors
      }
      provider = null;
    }
  });

  async function initProvider(overrides: Record<string, unknown> = {}): Promise<TeamsCall> {
    provider = new TeamsCall({
      token: 'acs-token',
      meetingLink: MEETING_LINK,
      ...overrides,
    });
    await provider.initialize();
    return provider;
  }

  async function attachRemoteAudio(): Promise<FakeRemoteAudioStream> {
    const remote = makeRemoteStream();
    call.addRemoteStream(remote);
    await flushPromises();
    return remote;
  }

  // ─── Initialization ─────────────────────────────────────────────────

  describe('Initialization', () => {
    it('throws ProviderInitializationError when meetingLink is missing', async () => {
      provider = new TeamsCall({ token: 'acs-token', meetingLink: '' });
      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('throws ProviderInitializationError when neither token nor tokenCredential is provided', async () => {
      provider = new TeamsCall({ meetingLink: MEETING_LINK });
      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('creates an AzureCommunicationTokenCredential from the token and a CallAgent with the default display name', async () => {
      await initProvider();

      expect(mockTokenCredentialCtor).toHaveBeenCalledTimes(1);
      expect(mockTokenCredentialCtor).toHaveBeenCalledWith('acs-token');
      expect(mockCallClientCtor).toHaveBeenCalledTimes(1);
      expect(mockCreateCallAgent).toHaveBeenCalledTimes(1);
      expect(mockCreateCallAgent).toHaveBeenCalledWith(expect.any(mockTokenCredentialCtor), {
        displayName: 'Voice Agent',
      });
    });

    it('passes a custom displayName to createCallAgent', async () => {
      await initProvider({ displayName: 'Support Bot' });

      expect(mockCreateCallAgent).toHaveBeenCalledWith(expect.any(mockTokenCredentialCtor), {
        displayName: 'Support Bot',
      });
    });

    it('resolves an async token factory before constructing the credential', async () => {
      const factory = jest.fn().mockResolvedValue('fresh-token');
      await initProvider({ token: factory });

      expect(factory).toHaveBeenCalledTimes(1);
      expect(mockTokenCredentialCtor).toHaveBeenCalledWith('fresh-token');
    });

    it('uses a supplied tokenCredential without constructing one', async () => {
      const credential: TeamsTokenCredential = {
        getToken: jest.fn().mockResolvedValue({ token: 't', expiresOnTimestamp: 0 }),
        dispose: jest.fn(),
      };
      await initProvider({ token: undefined, tokenCredential: credential });

      expect(mockTokenCredentialCtor).not.toHaveBeenCalled();
      expect(mockCreateCallAgent).toHaveBeenCalledWith(credential, {
        displayName: 'Voice Agent',
      });
    });

    it('joins with the meeting link and audioOptions carrying the LocalAudioStream unmuted', async () => {
      await initProvider();

      expect(mockCallAgent.join).toHaveBeenCalledTimes(1);
      expect(mockCallAgent.join).toHaveBeenCalledWith(
        { meetingLink: MEETING_LINK },
        {
          audioOptions: {
            localAudioStreams: [expect.any(mockLocalAudioStreamCtor)],
            muted: false,
          },
        }
      );

      // The LocalAudioStream wraps the MediaStreamDestination's stream
      const destination = playbackCtx().mediaStreamDestinations[0];
      expect(mockLocalAudioStreamCtor).toHaveBeenCalledWith(destination?.stream);
    });

    it('exposes websocket type, duplex roles, and readiness after initialize', async () => {
      const teams = await initProvider();

      expect(teams.type).toBe('websocket');
      expect(teams.roles).toEqual(['input', 'output']);
      expect(teams.isReady()).toBe(true);
    });

    it('treats a second initialize() as a no-op', async () => {
      const teams = await initProvider();
      await teams.initialize();

      expect(mockCreateCallAgent).toHaveBeenCalledTimes(1);
      expect(mockCallAgent.join).toHaveBeenCalledTimes(1);
    });

    it('wraps createCallAgent failures in ProviderInitializationError and disposes the owned credential', async () => {
      mockCreateCallAgent.mockRejectedValueOnce(new Error('403 forbidden'));
      provider = new TeamsCall({ token: 'acs-token', meetingLink: MEETING_LINK });

      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);

      const credentialInstance = mockTokenCredentialCtor.mock.instances[0] as unknown as {
        dispose: jest.Mock;
      };
      expect(credentialInstance.dispose).toHaveBeenCalled();
      expect(provider.isReady()).toBe(false);
    });

    it('wraps join failures in ProviderConnectionError and closes the playback context', async () => {
      mockCallAgent.join.mockImplementationOnce(() => {
        throw new Error('invalid meeting link');
      });
      provider = new TeamsCall({ token: 'acs-token', meetingLink: MEETING_LINK });

      await expect(provider.initialize()).rejects.toThrow(ProviderConnectionError);
      expect(playbackCtx().close).toHaveBeenCalled();
      expect(provider.isReady()).toBe(false);
    });
  });

  // ─── Remote audio acquisition ───────────────────────────────────────

  describe('Remote audio acquisition', () => {
    it('attaches the capture graph when remoteAudioStreamsUpdated reports an added stream', async () => {
      await initProvider();
      const remote = await attachRemoteAudio();

      expect(remote.getMediaStream).toHaveBeenCalledTimes(1);
      const capture = captureCtx();
      expect(capture.mediaStreamSources[0]?.stream).toEqual({ __type: 'remote-media-stream' });
      expect(capture.mediaStreamSources[0]?.connect).toHaveBeenCalledWith(
        capture.scriptProcessors[0]
      );
    });

    it('attaches via the documented stateChanged->Connected pattern when no event fires', async () => {
      await initProvider();
      const remote = makeRemoteStream();
      call.remoteAudioStreams.push(remote); // present, but no event
      call.setState('Connected');
      await flushPromises();

      expect(remote.getMediaStream).toHaveBeenCalledTimes(1);
      expect(FakeAudioContext.instances.length).toBe(2);
    });

    it('attaches via the interval poll fallback when neither event nor state change fires', async () => {
      jest.useFakeTimers();
      await initProvider();
      const remote = makeRemoteStream();
      call.remoteAudioStreams.push(remote); // silently appears

      await jest.advanceTimersByTimeAsync(600);

      expect(remote.getMediaStream).toHaveBeenCalledTimes(1);
      expect(FakeAudioContext.instances.length).toBe(2);
      jest.useRealTimers();
    });

    it('only attaches once even when multiple acquisition paths race', async () => {
      await initProvider();
      const remote = makeRemoteStream();
      call.addRemoteStream(remote); // event path
      call.setState('Connected'); // state path, same tick
      await flushPromises();
      await flushPromises();

      expect(remote.getMediaStream).toHaveBeenCalledTimes(1);
      expect(FakeAudioContext.instances.length).toBe(2);
    });

    it('survives a getMediaStream failure and attaches on a later attempt', async () => {
      await initProvider();
      const failing = makeRemoteStream();
      failing.getMediaStream.mockRejectedValueOnce(new Error('not ready'));
      call.addRemoteStream(failing);
      await flushPromises();

      expect(FakeAudioContext.instances.length).toBe(1); // no capture context yet

      call.setState('Connected'); // retry via state change
      await flushPromises();
      expect(failing.getMediaStream).toHaveBeenCalledTimes(2);
      expect(FakeAudioContext.instances.length).toBe(2);
    });
  });

  // ─── Input: PCM emission ────────────────────────────────────────────

  describe('Input audio emission', () => {
    it('emits 16 kHz mono linear16 chunks resampled from the capture context rate', async () => {
      const teams = await initProvider();
      await attachRemoteAudio();

      const chunks: AudioChunk[] = [];
      teams.onAudio((chunk) => chunks.push(chunk));
      teams.start();

      pushCapturedAudio(new Float32Array(480).fill(0.5)); // 10 ms at 48 kHz

      expect(chunks).toHaveLength(1);
      const chunk = chunks[0];
      if (!chunk) throw new Error('no chunk emitted');
      expect(chunk.data.byteLength).toBe(320); // 160 samples at 16 kHz
      const samples = new Int16Array(chunk.data);
      expect(samples.length).toBe(160);
      expect(samples[0]).toBe(16383); // 0.5 * 0x7fff
      expect(typeof chunk.timestamp).toBe('number');
      expect(chunk.sequence).toBe(0);
    });

    it('drops captured audio before start() is called', async () => {
      const teams = await initProvider();
      await attachRemoteAudio();

      const chunks: AudioChunk[] = [];
      teams.onAudio((chunk) => chunks.push(chunk));

      pushCapturedAudio(new Float32Array(480).fill(0.5));
      expect(chunks).toHaveLength(0);
    });

    it('gates emission with pause() and resumes with resume()', async () => {
      const teams = await initProvider();
      await attachRemoteAudio();

      const chunks: AudioChunk[] = [];
      teams.onAudio((chunk) => chunks.push(chunk));
      teams.start();

      teams.pause();
      pushCapturedAudio(new Float32Array(480).fill(0.5));
      expect(chunks).toHaveLength(0);

      teams.resume();
      pushCapturedAudio(new Float32Array(480).fill(0.5));
      expect(chunks).toHaveLength(1);
    });

    it('reports isActive() true only when started and not paused', async () => {
      const teams = await initProvider();

      expect(teams.isActive()).toBe(false);
      teams.start();
      expect(teams.isActive()).toBe(true);
      teams.pause();
      expect(teams.isActive()).toBe(false);
      teams.resume();
      expect(teams.isActive()).toBe(true);
    });

    it('increments sequence numbers monotonically', async () => {
      const teams = await initProvider();
      await attachRemoteAudio();

      const sequences: Array<number | undefined> = [];
      teams.onAudio((chunk) => sequences.push(chunk.sequence));
      teams.start();

      pushCapturedAudio(new Float32Array(480).fill(0.1));
      pushCapturedAudio(new Float32Array(480).fill(0.2));
      pushCapturedAudio(new Float32Array(480).fill(0.3));

      expect(sequences).toEqual([0, 1, 2]);
    });

    it('returns 16 kHz mono linear16 metadata', async () => {
      const teams = await initProvider();

      expect(teams.getMetadata()).toEqual({
        encoding: 'linear16',
        sampleRate: 16000,
        channels: 1,
        bitDepth: 16,
      });
    });
  });

  // ─── Call state ─────────────────────────────────────────────────────

  describe('Call state', () => {
    it('surfaces InLobby and Connected transitions via onCallStateChanged', async () => {
      const teams = await initProvider();
      const states: TeamsCallState[] = [];
      teams.onCallStateChanged((state) => states.push(state));

      call.setState('InLobby');
      call.setState('Connected');

      expect(states).toEqual(['InLobby', 'Connected']);
    });

    it('returns the current call state from getCallState()', async () => {
      provider = new TeamsCall({ token: 'acs-token', meetingLink: MEETING_LINK });
      expect(provider.getCallState()).toBeNull();

      await provider.initialize();
      expect(provider.getCallState()).toBe('Connecting');
      call.setState('Connected');
      expect(provider.getCallState()).toBe('Connected');
    });

    it('stops emission and tears down capture when the call disconnects', async () => {
      const teams = await initProvider();
      await attachRemoteAudio();

      const chunks: AudioChunk[] = [];
      teams.onAudio((chunk) => chunks.push(chunk));
      teams.start();
      pushCapturedAudio(new Float32Array(480).fill(0.5));
      expect(chunks).toHaveLength(1);

      call.setState('Disconnected');

      expect(teams.isActive()).toBe(false);
      expect(captureCtx().close).toHaveBeenCalled();
      expect(captureCtx().scriptProcessors[0]?.onaudioprocess).toBeNull();
    });
  });

  // ─── Output: playback into the meeting ──────────────────────────────

  describe('Output playback', () => {
    it('rejects opus in configure() with reconfiguration instructions', async () => {
      const teams = await initProvider();

      expect(() => teams.configure({ encoding: 'opus', sampleRate: 48000, channels: 1 })).toThrow(
        /cannot play 'opus'.*linear16/s
      );
    });

    it('plays a linear16 chunk into the MediaStream destination (PCM fallback path)', async () => {
      const teams = await initProvider();
      const onStart = jest.fn();
      const onEnd = jest.fn();
      teams.onPlaybackStart(onStart);
      teams.onPlaybackEnd(onEnd);

      teams.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      teams.enqueue(bigPcmChunk(4800, 1000)); // 300 ms at 16 kHz
      await teams.flush();

      const ctx = playbackCtx();
      // decodeAudioData was attempted and rejected → raw PCM fallback used
      expect(ctx.decodeAudioData).toHaveBeenCalled();
      expect(ctx.createdSources).toHaveLength(1);

      const source = ctx.createdSources[0];
      const destination = ctx.mediaStreamDestinations[0];
      if (!source || !destination) throw new Error('missing playback graph nodes');
      expect(source.connect).toHaveBeenCalledWith(destination); // NOT ctx.destination
      expect(source.start).toHaveBeenCalledWith(0);

      const buffer = ctx.createdBuffers[0];
      if (!buffer) throw new Error('no AudioBuffer created');
      expect(buffer.sampleRate).toBe(16000);
      expect(buffer.numberOfChannels).toBe(1);
      expect(buffer.length).toBe(4800);
      expect(buffer.getChannelData(0)[0]).toBeCloseTo(1000 / 0x7fff, 5);

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(teams.isPlaying()).toBe(false);
    });

    it('merges chunks queued during buffering into a single gapless source', async () => {
      const teams = await initProvider();
      teams.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });

      // Three 100 ms chunks — each below the 200 ms minimum buffer, so the
      // scheduler buffers, then drains and merges all three.
      for (let i = 0; i < 3; i++) {
        const pcm = new Int16Array(1600).fill(500);
        teams.enqueue({ data: pcm.buffer, timestamp: Date.now(), sequence: i });
      }
      await teams.flush();

      const ctx = playbackCtx();
      expect(ctx.createdSources).toHaveLength(1);
      expect(ctx.createdBuffers[0]?.length).toBe(4800); // 3 × 1600 samples
    });

    it('decodes G.711 mulaw chunks with the SDK codec', async () => {
      const teams = await initProvider();
      teams.configure({ encoding: 'mulaw', sampleRate: 8000, channels: 1 });

      const pcm = new Int16Array(3200).fill(8000); // 400 ms at 8 kHz
      const mulawBytes = encodeMulaw(pcm);
      teams.enqueue({
        data: mulawBytes.buffer as ArrayBuffer,
        timestamp: Date.now(),
        sequence: 0,
      });
      await teams.flush();

      const ctx = playbackCtx();
      const buffer = ctx.createdBuffers[0];
      if (!buffer) throw new Error('no AudioBuffer created');
      expect(buffer.sampleRate).toBe(8000);
      expect(buffer.length).toBe(3200);

      const expected = int16ToFloat(decodeMulaw(mulawBytes))[0];
      expect(buffer.getChannelData(0)[0]).toBeCloseTo(expected ?? 0, 5);
      // decodeAudioData must not be consulted for headerless G.711
      expect(ctx.decodeAudioData).not.toHaveBeenCalled();
    });

    it('uses decodeAudioData for mp3 chunks', async () => {
      const teams = await initProvider();
      teams.configure({ encoding: 'mp3', sampleRate: 44100, channels: 1, mimeType: 'audio/mpeg' });

      const ctx = playbackCtx();
      const decoded = new FakeAudioBuffer(1, 4410, 44100);
      ctx.decodeAudioData.mockResolvedValueOnce(decoded);

      teams.enqueue({ data: new ArrayBuffer(20000), timestamp: Date.now(), sequence: 0 });
      await teams.flush();

      expect(ctx.decodeAudioData).toHaveBeenCalledTimes(1);
      expect(ctx.createdSources[0]?.buffer).toBe(decoded);
    });

    it('reports decode failures through onPlaybackError when unconfigured', async () => {
      const teams = await initProvider();
      const onError = jest.fn();
      teams.onPlaybackError(onError);

      // No configure() → decodeAudioData rejection cannot fall back to PCM
      teams.enqueue({ data: new ArrayBuffer(6400), timestamp: Date.now(), sequence: 0 });
      await teams.flush();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
      expect(teams.isPlaying()).toBe(false);
    });

    it('stop() halts playback immediately, clears the buffer, and fires onPlaybackEnd', async () => {
      const teams = await initProvider();
      const onEnd = jest.fn();
      teams.onPlaybackEnd(onEnd);
      teams.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });

      teams.enqueue(bigPcmChunk());
      teams.stop();

      expect(onEnd).toHaveBeenCalled();
      expect(teams.isPlaying()).toBe(false);

      const start = Date.now();
      await teams.flush(); // resolves promptly — nothing left to play
      expect(Date.now() - start).toBeLessThan(1000);
    });

    it('stop() halts meeting-audio emission when nothing is playing', async () => {
      const teams = await initProvider();
      await attachRemoteAudio();

      const chunks: AudioChunk[] = [];
      teams.onAudio((chunk) => chunks.push(chunk));
      teams.start();

      teams.stop(); // idle output: acts on the input role (stopListening)

      expect(teams.isActive()).toBe(false);
      pushCapturedAudio(new Float32Array(480).fill(0.5));
      expect(chunks).toHaveLength(0);
    });

    it('stop() (barge-in) does not deactivate meeting-audio capture', async () => {
      const teams = await initProvider();
      await attachRemoteAudio();

      const chunks: AudioChunk[] = [];
      teams.onAudio((chunk) => chunks.push(chunk));
      teams.start();
      teams.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      teams.enqueue(bigPcmChunk());

      teams.stop(); // user interrupted the agent

      expect(teams.isActive()).toBe(true);
      pushCapturedAudio(new Float32Array(480).fill(0.5));
      expect(chunks).toHaveLength(1); // the agent still hears the meeting
    });

    it('accepts new audio after a barge-in stop() once reconfigured', async () => {
      const teams = await initProvider();
      teams.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      teams.enqueue(bigPcmChunk());
      teams.stop();
      await flushPromises();

      teams.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      teams.enqueue(bigPcmChunk(4800, 2000));
      await teams.flush();

      const ctx = playbackCtx();
      const lastBuffer = ctx.createdBuffers[ctx.createdBuffers.length - 1];
      expect(lastBuffer?.getChannelData(0)[0]).toBeCloseTo(2000 / 0x7fff, 5);
    });
  });

  // ─── hangUp + dispose ───────────────────────────────────────────────

  describe('hangUp and dispose', () => {
    it('hangUp() leaves the call but keeps the provider initialized', async () => {
      const teams = await initProvider();
      await attachRemoteAudio();
      teams.start();

      await teams.hangUp();

      expect(call.hangUp).toHaveBeenCalledTimes(1);
      expect(call.off).toHaveBeenCalledWith('stateChanged', expect.any(Function));
      expect(call.off).toHaveBeenCalledWith('remoteAudioStreamsUpdated', expect.any(Function));
      expect(teams.isActive()).toBe(false);
      expect(teams.getCallState()).toBeNull();
      expect(teams.isReady()).toBe(true); // agent still available until dispose()
    });

    it('dispose() hangs up, disposes the agent and owned credential, and closes contexts', async () => {
      const teams = await initProvider();
      await attachRemoteAudio();
      teams.start();

      await teams.dispose();

      expect(call.hangUp).toHaveBeenCalledTimes(1);
      expect(mockCallAgent.dispose).toHaveBeenCalledTimes(1);
      const credentialInstance = mockTokenCredentialCtor.mock.instances[0] as unknown as {
        dispose: jest.Mock;
      };
      expect(credentialInstance.dispose).toHaveBeenCalledTimes(1);
      expect(playbackCtx().close).toHaveBeenCalled();
      expect(captureCtx().close).toHaveBeenCalled();
      expect(teams.isReady()).toBe(false);
      expect(teams.isActive()).toBe(false);
    });

    it('dispose() is a no-op before initialization', async () => {
      provider = new TeamsCall({ token: 'acs-token', meetingLink: MEETING_LINK });
      await provider.dispose();

      expect(mockCallAgent.dispose).not.toHaveBeenCalled();
      expect(provider.isReady()).toBe(false);
    });

    it('dispose() does not dispose a user-supplied tokenCredential', async () => {
      const credential: TeamsTokenCredential = {
        getToken: jest.fn().mockResolvedValue({ token: 't', expiresOnTimestamp: 0 }),
        dispose: jest.fn(),
      };
      const teams = await initProvider({ token: undefined, tokenCredential: credential });

      await teams.dispose();

      expect(credential.dispose).not.toHaveBeenCalled();
    });

    it('can be re-initialized after dispose()', async () => {
      const teams = await initProvider();
      await teams.dispose();

      call = new MockAcsCall();
      await teams.initialize();

      expect(teams.isReady()).toBe(true);
      expect(mockCreateCallAgent).toHaveBeenCalledTimes(2);
      expect(mockCallAgent.join).toHaveBeenCalledTimes(2);
    });
  });
});
