/**
 * Tests for GoogleMeetInput provider
 *
 * Tests the Google Meet Media API input provider, which negotiates a
 * receive-only WebRTC session via `RTCPeerConnection` + `fetch` and mixes the
 * received audio tracks through an `AudioContext`.
 *
 * jsdom provides neither RTCPeerConnection nor a functional AudioContext, so
 * both are replaced with instrumented mock classes on `globalThis`.
 */

import { GoogleMeetInput } from '../../../../src/providers/io/meet/GoogleMeetInput';
import type { GoogleMeetSessionStatus } from '../../../../src/providers/io/meet/GoogleMeetInput';
import type { AudioChunk } from '../../../../src/core/types/audio';
import { ProviderConnectionError, ProviderInitializationError } from '../../../../src/utils/errors';

// --- RTCPeerConnection mock ---

class MockRTCDataChannel {
  readonly label: string;
  readonly options: RTCDataChannelInit | undefined;
  readyState = 'open';
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = 'closed';
  });
  onmessage: ((event: { data: string }) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(label: string, options?: RTCDataChannelInit) {
    this.label = label;
    this.options = options;
  }
}

type MockStatsReport = Map<string, Record<string, unknown>>;

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];
  /** Ordered log of SDP-relevant calls, to assert channel-before-offer order. */
  readonly events: string[] = [];
  readonly configuration: RTCConfiguration | undefined;
  readonly transceivers: Array<{ kind: string; init?: RTCRtpTransceiverInit }> = [];
  readonly dataChannels: MockRTCDataChannel[] = [];
  ontrack: ((event: { track: { kind: string } }) => void) | null = null;
  localDescription: unknown = null;
  remoteDescription: unknown = null;
  /** Starts 'new'; tests drive it to 'complete' via completeIceGathering(). */
  /** Set by a test before construction to simulate gathering still running. */
  static nextGatheringState: RTCIceGatheringState = 'complete';
  iceGatheringState: RTCIceGatheringState = 'complete';
  private iceListeners: Array<() => void> = [];
  statsReport: MockStatsReport = new Map();
  close = jest.fn();

  constructor(configuration?: RTCConfiguration) {
    this.configuration = configuration;
    this.iceGatheringState = MockRTCPeerConnection.nextGatheringState;
    MockRTCPeerConnection.nextGatheringState = 'complete';
    MockRTCPeerConnection.instances.push(this);
  }

  addTransceiver(kind: string, init?: RTCRtpTransceiverInit): Record<string, never> {
    this.events.push(`addTransceiver:${kind}`);
    this.transceivers.push(init !== undefined ? { kind, init } : { kind });
    return {};
  }

  createDataChannel(label: string, options?: RTCDataChannelInit): MockRTCDataChannel {
    this.events.push(`createDataChannel:${label}`);
    const channel = new MockRTCDataChannel(label, options);
    this.dataChannels.push(channel);
    return channel;
  }

  async createOffer(): Promise<{ type: string; sdp: string }> {
    this.events.push('createOffer');
    return { type: 'offer', sdp: 'mock-offer-sdp' };
  }

  async setLocalDescription(description: unknown): Promise<void> {
    // A real implementation resolves before candidates are gathered; the SDP
    // stored here gains them later, which is why the provider must read
    // localDescription rather than the original offer.
    this.localDescription = { ...(description as object), sdp: 'mock-offer-sdp-with-candidates' };
  }

  addEventListener(event: string, listener: () => void): void {
    if (event === 'icegatheringstatechange') this.iceListeners.push(listener);
  }

  removeEventListener(_event: string, listener: () => void): void {
    this.iceListeners = this.iceListeners.filter((l) => l !== listener);
  }

  /** Simulate candidates finishing gathering. */
  completeIceGathering(): void {
    this.iceGatheringState = 'complete';
    for (const listener of [...this.iceListeners]) listener();
  }

  async setRemoteDescription(description: unknown): Promise<void> {
    this.remoteDescription = description;
  }

  async getStats(): Promise<MockStatsReport> {
    return this.statsReport;
  }
}

// --- AudioContext / MediaStream mocks ---

interface MockSourceNode {
  stream: unknown;
  connect: jest.Mock;
  disconnect: jest.Mock;
}

interface MockProcessorNode {
  connect: jest.Mock;
  disconnect: jest.Mock;
  onaudioprocess: ((event: MockAudioProcessingEvent) => void) | null;
}

interface MockAudioProcessingEvent {
  inputBuffer: {
    getChannelData: (channel: number) => Float32Array;
    sampleRate: number;
  };
}

class MockAudioContext {
  static instances: MockAudioContext[] = [];
  sampleRate = 48000;
  destination = { __destination: true };
  sources: MockSourceNode[] = [];
  processor: MockProcessorNode | null = null;
  close = jest.fn().mockResolvedValue(undefined);
  // No `audioWorklet` property → the provider falls back to ScriptProcessorNode.

  constructor() {
    MockAudioContext.instances.push(this);
  }

  createMediaStreamSource(stream: unknown): MockSourceNode {
    const source: MockSourceNode = { stream, connect: jest.fn(), disconnect: jest.fn() };
    this.sources.push(source);
    return source;
  }

  createScriptProcessor(): MockProcessorNode {
    const processor: MockProcessorNode = {
      connect: jest.fn(),
      disconnect: jest.fn(),
      onaudioprocess: null,
    };
    this.processor = processor;
    return processor;
  }
}

class MockMediaStream {
  readonly tracks: unknown[];
  constructor(tracks: unknown[] = []) {
    this.tracks = tracks;
  }
  getTracks(): unknown[] {
    return this.tracks;
  }
}

(globalThis as Record<string, unknown>).RTCPeerConnection = MockRTCPeerConnection;
(globalThis as Record<string, unknown>).AudioContext = MockAudioContext;
(globalThis as Record<string, unknown>).MediaStream = MockMediaStream;

// --- fetch mock ---

const mockFetch = jest.fn();
global.fetch = mockFetch;

const SPACE_NAME = 'spaces/XXX';
const CONNECT_URL = `https://meet.googleapis.com/v2beta/${SPACE_NAME}:connectActiveConference`;

function createConnectResponse(overrides: Record<string, unknown> = {}): Partial<Response> {
  const data = { answer: 'mock-answer-sdp', traceId: 'trace-123', ...overrides };
  return {
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

// --- helpers ---

function lastPeerConnection(): MockRTCPeerConnection {
  const pc = MockRTCPeerConnection.instances[MockRTCPeerConnection.instances.length - 1];
  if (!pc) throw new Error('no RTCPeerConnection was created');
  return pc;
}

function getChannel(label: string): MockRTCDataChannel {
  const channel = lastPeerConnection().dataChannels.find((c) => c.label === label);
  if (!channel) throw new Error(`data channel ${label} not found`);
  return channel;
}

/** Deliver a JSON message on a data channel as if sent by the Meet server. */
function receiveOnChannel(label: string, message: unknown): void {
  const channel = getChannel(label);
  channel.onmessage?.({ data: JSON.stringify(message) });
}

async function createInitializedProvider(
  configOverrides: Record<string, unknown> = {}
): Promise<GoogleMeetInput> {
  const provider = new GoogleMeetInput({
    apiKey: 'test-oauth-token',
    spaceName: SPACE_NAME,
    ...configOverrides,
  });
  await provider.initialize();
  return provider;
}

/** Simulate a remote audio track arriving and flush the async graph setup. */
async function emitAudioTrack(kind = 'audio'): Promise<void> {
  lastPeerConnection().ontrack?.({ track: { kind } });
  // attachTrack awaits the (already-resolved) audio graph promise
  await Promise.resolve();
  await Promise.resolve();
}

function currentProcessor(): MockProcessorNode {
  const context = MockAudioContext.instances[MockAudioContext.instances.length - 1];
  if (!context?.processor) throw new Error('no ScriptProcessorNode was created');
  return context.processor;
}

/** Fire a Float32 frame through the ScriptProcessor capture path. */
function processAudioFrame(samples: Float32Array, sampleRate = 48000): void {
  currentProcessor().onaudioprocess?.({
    inputBuffer: { getChannelData: () => samples, sampleRate },
  });
}

/** The media-stats server configuration message used across tests. */
const STATS_CONFIG_MESSAGE = {
  resources: [
    {
      configuration: {
        uploadIntervalSeconds: 10,
        allowlist: {
          'inbound-rtp': { keys: ['packetsReceived', 'jitter', 'kind'] },
          'candidate-pair': { keys: ['currentRoundTripTime'] },
        },
      },
    },
  ],
};

describe('GoogleMeetInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    MockRTCPeerConnection.instances = [];
    MockAudioContext.instances = [];
    mockFetch.mockResolvedValue(createConnectResponse());
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initialization', () => {
    it('should throw ProviderInitializationError when RTCPeerConnection is unavailable', async () => {
      const saved = (globalThis as Record<string, unknown>).RTCPeerConnection;
      delete (globalThis as Record<string, unknown>).RTCPeerConnection;
      try {
        const provider = new GoogleMeetInput({ apiKey: 'token', spaceName: SPACE_NAME });
        await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
      } finally {
        (globalThis as Record<string, unknown>).RTCPeerConnection = saved;
      }
    });

    it('should throw ProviderInitializationError when apiKey is missing', async () => {
      const provider = new GoogleMeetInput({
        apiKey: undefined as unknown as string,
        spaceName: SPACE_NAME,
      });
      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw ProviderInitializationError when spaceName is not in spaces/{id} form', async () => {
      const provider = new GoogleMeetInput({ apiKey: 'token', spaceName: 'abc-mnop-xyz' });
      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
      expect(MockRTCPeerConnection.instances).toHaveLength(0);
    });

    it('should create the peer connection with Google STUN and max-bundle', async () => {
      await createInitializedProvider();
      const pc = lastPeerConnection();
      expect(pc.configuration).toEqual({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle',
      });
    });

    it('should add exactly 3 recvonly audio transceivers', async () => {
      await createInitializedProvider();
      const pc = lastPeerConnection();
      expect(pc.transceivers).toHaveLength(3);
      for (const transceiver of pc.transceivers) {
        expect(transceiver.kind).toBe('audio');
        expect(transceiver.init).toEqual({ direction: 'recvonly' });
      }
    });

    it('should create session-control and media-stats channels with ordered:true before createOffer', async () => {
      await createInitializedProvider();
      const pc = lastPeerConnection();

      expect(getChannel('session-control').options).toEqual({ ordered: true });
      expect(getChannel('media-stats').options).toEqual({ ordered: true });

      const offerIndex = pc.events.indexOf('createOffer');
      expect(offerIndex).toBeGreaterThan(-1);
      expect(pc.events.indexOf('createDataChannel:session-control')).toBeLessThan(offerIndex);
      expect(pc.events.indexOf('createDataChannel:media-stats')).toBeLessThan(offerIndex);
    });

    it('should not create the media-entries channel by default', async () => {
      await createInitializedProvider();
      const labels = lastPeerConnection().dataChannels.map((c) => c.label);
      expect(labels).toEqual(['session-control', 'media-stats']);
    });

    it('should create the optional media-entries channel before createOffer when enabled', async () => {
      await createInitializedProvider({ enableMediaEntries: true });
      const pc = lastPeerConnection();
      expect(getChannel('media-entries').options).toEqual({ ordered: true });
      expect(pc.events.indexOf('createDataChannel:media-entries')).toBeLessThan(
        pc.events.indexOf('createOffer')
      );
    });

    it('should POST the offer to connectActiveConference with a Bearer token', async () => {
      await createInitializedProvider();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(CONNECT_URL);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({
        Authorization: 'Bearer test-oauth-token',
        'Content-Type': 'application/json',
      });
      // The gathered local description, not the bare createOffer() result:
      // Meet accepts one offer and offers no trickle-ICE channel, so an offer
      // without candidates can never connect.
      expect(JSON.parse(init.body as string)).toEqual({
        offer: 'mock-offer-sdp-with-candidates',
      });
    });

    it('waits for ICE gathering before sending the offer', async () => {
      // setLocalDescription resolves before candidates are gathered.
      MockRTCPeerConnection.nextGatheringState = 'gathering';
      const pending = createInitializedProvider();

      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockFetch).not.toHaveBeenCalled();

      const pc = MockRTCPeerConnection.instances[MockRTCPeerConnection.instances.length - 1];
      pc?.completeIceGathering();
      await pending;

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should resolve the token from an async factory', async () => {
      const factory = jest.fn().mockResolvedValue('fresh-token');
      await createInitializedProvider({ apiKey: factory });

      expect(factory).toHaveBeenCalledTimes(1);
      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>).Authorization).toBe('Bearer fresh-token');
    });

    it('should respect a custom endpoint', async () => {
      await createInitializedProvider({ endpoint: 'https://proxy.example.com' });
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe(`https://proxy.example.com/v2beta/${SPACE_NAME}:connectActiveConference`);
    });

    it('should set the answer SDP as the remote description', async () => {
      await createInitializedProvider();
      expect(lastPeerConnection().remoteDescription).toEqual({
        type: 'answer',
        sdp: 'mock-answer-sdp',
      });
    });

    it('should throw ProviderConnectionError with the body on a non-200 response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => 'PERMISSION_DENIED: not enrolled in the Developer Preview',
        json: async () => ({}),
      });
      const provider = new GoogleMeetInput({ apiKey: 'token', spaceName: SPACE_NAME });

      await expect(provider.initialize()).rejects.toThrow(ProviderConnectionError);
      expect(provider.isReady()).toBe(false);
      expect(lastPeerConnection().close).toHaveBeenCalled();
    });

    it('should throw ProviderConnectionError when the response contains no answer', async () => {
      mockFetch.mockResolvedValue(createConnectResponse({ answer: undefined }));
      const provider = new GoogleMeetInput({ apiKey: 'token', spaceName: SPACE_NAME });
      await expect(provider.initialize()).rejects.toThrow(ProviderConnectionError);
    });

    it('should report ready only after initialize', async () => {
      const provider = new GoogleMeetInput({ apiKey: 'token', spaceName: SPACE_NAME });
      expect(provider.isReady()).toBe(false);
      await provider.initialize();
      expect(provider.isReady()).toBe(true);
    });

    it('should treat a second initialize as a no-op', async () => {
      const provider = await createInitializedProvider();
      await provider.initialize();
      expect(MockRTCPeerConnection.instances).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should support re-initialization after dispose', async () => {
      const provider = await createInitializedProvider();
      await provider.dispose();
      expect(provider.isReady()).toBe(false);

      await provider.initialize();
      expect(provider.isReady()).toBe(true);
      expect(MockRTCPeerConnection.instances).toHaveLength(2);
    });
  });

  describe('Audio flow', () => {
    it('should mix each received audio track into a shared ScriptProcessor node', async () => {
      await createInitializedProvider();
      await emitAudioTrack();
      await emitAudioTrack();
      await emitAudioTrack();

      expect(MockAudioContext.instances).toHaveLength(1);
      const context = MockAudioContext.instances[0]!;
      expect(context.sources).toHaveLength(3);
      const processor = currentProcessor();
      for (const source of context.sources) {
        expect(source.connect).toHaveBeenCalledWith(processor);
      }
      // The processor must be pulled by the destination to fire.
      expect(processor.connect).toHaveBeenCalledWith(context.destination);
    });

    it('should ignore non-audio tracks', async () => {
      await createInitializedProvider();
      await emitAudioTrack('video');
      expect(MockAudioContext.instances).toHaveLength(0);
    });

    it('should emit 16kHz mono linear16 chunks downsampled from the context rate', async () => {
      const provider = await createInitializedProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      await emitAudioTrack();

      processAudioFrame(new Float32Array(480).fill(0.5), 48000);

      expect(chunks).toHaveLength(1);
      const chunk = chunks[0]!;
      // 480 samples @48k -> 160 samples @16k -> 320 bytes of int16
      expect(chunk.data.byteLength).toBe(320);
      const samples = new Int16Array(chunk.data);
      // 0.5 * 0x7fff, averaged over constant input
      expect(samples[0]).toBe(Math.floor(0.5 * 0x7fff));
      expect(typeof chunk.timestamp).toBe('number');
      expect(chunk.sequence).toBe(0);
    });

    it('should pass audio through unresampled when the context rate is already 16kHz', async () => {
      const provider = await createInitializedProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      await emitAudioTrack();

      processAudioFrame(new Float32Array(160).fill(0.25), 16000);

      expect(chunks[0]!.data.byteLength).toBe(320);
    });

    it('should increment sequence numbers monotonically', async () => {
      const provider = await createInitializedProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      await emitAudioTrack();

      processAudioFrame(new Float32Array(480));
      processAudioFrame(new Float32Array(480));
      processAudioFrame(new Float32Array(480));

      expect(chunks.map((c) => c.sequence)).toEqual([0, 1, 2]);
    });

    it('should drop audio before start(), while paused, and after stop()', async () => {
      const provider = await createInitializedProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      await emitAudioTrack();

      processAudioFrame(new Float32Array(480)); // not started
      expect(chunks).toHaveLength(0);

      provider.start();
      processAudioFrame(new Float32Array(480));
      expect(chunks).toHaveLength(1);

      provider.pause();
      expect(provider.isActive()).toBe(false);
      processAudioFrame(new Float32Array(480)); // paused
      expect(chunks).toHaveLength(1);

      provider.resume();
      expect(provider.isActive()).toBe(true);
      processAudioFrame(new Float32Array(480));
      expect(chunks).toHaveLength(2);

      provider.stop();
      processAudioFrame(new Float32Array(480)); // stopped
      expect(chunks).toHaveLength(2);
    });

    it('should not activate on pause/resume before start', async () => {
      const provider = await createInitializedProvider();
      provider.pause();
      provider.resume();
      expect(provider.isActive()).toBe(false);
    });

    it('should return linear16/16000/1/16 metadata', async () => {
      const provider = new GoogleMeetInput({ apiKey: 'token', spaceName: SPACE_NAME });
      expect(provider.getMetadata()).toEqual({
        sampleRate: 16000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });
    });
  });

  describe('Session control', () => {
    it('should surface STATE_WAITING and STATE_JOINED to onSessionStatus', async () => {
      const provider = await createInitializedProvider();
      const statuses: GoogleMeetSessionStatus[] = [];
      provider.onSessionStatus((status) => statuses.push(status));

      receiveOnChannel('session-control', {
        resources: [{ sessionStatus: { connectionState: 'STATE_WAITING' } }],
      });
      receiveOnChannel('session-control', {
        resources: [{ sessionStatus: { connectionState: 'STATE_JOINED' } }],
      });

      expect(statuses.map((s) => s.connectionState)).toEqual(['STATE_WAITING', 'STATE_JOINED']);
      expect(provider.getSessionStatus()).toEqual({ connectionState: 'STATE_JOINED' });
      expect(provider.isReady()).toBe(true);
    });

    it('should stop, tear down, and report the reason on STATE_DISCONNECTED', async () => {
      const provider = await createInitializedProvider();
      const statuses: GoogleMeetSessionStatus[] = [];
      provider.onSessionStatus((status) => statuses.push(status));
      provider.start();

      receiveOnChannel('session-control', {
        resources: [
          {
            sessionStatus: {
              connectionState: 'STATE_DISCONNECTED',
              disconnectReason: 'REASON_CONFERENCE_ENDED',
            },
          },
        ],
      });

      expect(statuses[0]).toEqual({
        connectionState: 'STATE_DISCONNECTED',
        disconnectReason: 'REASON_CONFERENCE_ENDED',
      });
      expect(provider.isActive()).toBe(false);
      expect(provider.isReady()).toBe(false);
      expect(lastPeerConnection().close).toHaveBeenCalled();
    });

    it('should ignore malformed session-control messages', async () => {
      await createInitializedProvider();
      const channel = getChannel('session-control');
      expect(() => channel.onmessage?.({ data: 'not-json{{' })).not.toThrow();
    });

    it('should ignore messages without a session status resource', async () => {
      const provider = await createInitializedProvider();
      const callback = jest.fn();
      provider.onSessionStatus(callback);

      receiveOnChannel('session-control', { response: { requestId: 1, leave: {} } });
      receiveOnChannel('session-control', { resources: [] });

      expect(callback).not.toHaveBeenCalled();
      expect(provider.getSessionStatus()).toBeNull();
    });
  });

  describe('Dispose', () => {
    it('should send the exact leave request on dispose', async () => {
      const provider = await createInitializedProvider();
      const channel = getChannel('session-control');

      await provider.dispose();

      expect(channel.send).toHaveBeenCalledTimes(1);
      expect(channel.send).toHaveBeenCalledWith(
        JSON.stringify({ request: { requestId: 1, leave: {} } })
      );
    });

    it('should close the peer connection, channels, and AudioContext on dispose', async () => {
      const provider = await createInitializedProvider();
      await emitAudioTrack();
      const pc = lastPeerConnection();
      const context = MockAudioContext.instances[0]!;

      await provider.dispose();

      expect(pc.close).toHaveBeenCalled();
      expect(getChannel('session-control').close).toHaveBeenCalled();
      expect(getChannel('media-stats').close).toHaveBeenCalled();
      expect(context.close).toHaveBeenCalled();
      expect(context.sources[0]!.disconnect).toHaveBeenCalled();
      expect(provider.isReady()).toBe(false);
      expect(provider.isActive()).toBe(false);
    });

    it('should not send a leave request when the channel is not open', async () => {
      const provider = await createInitializedProvider();
      const channel = getChannel('session-control');
      channel.readyState = 'closed';

      await provider.dispose();

      expect(channel.send).not.toHaveBeenCalled();
      expect(lastPeerConnection().close).toHaveBeenCalled();
    });

    it('should be safe to dispose before initialize and twice', async () => {
      const provider = new GoogleMeetInput({ apiKey: 'token', spaceName: SPACE_NAME });
      await expect(provider.dispose()).resolves.toBeUndefined();

      await provider.initialize();
      await provider.dispose();
      await expect(provider.dispose()).resolves.toBeUndefined();
    });
  });

  describe('Media stats', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('should send nothing until the server config message arrives', async () => {
      await createInitializedProvider();
      const channel = getChannel('media-stats');

      await jest.advanceTimersByTimeAsync(60000);

      expect(channel.send).not.toHaveBeenCalled();
    });

    it('should upload allowlisted, snake_cased stats at the server interval', async () => {
      await createInitializedProvider();
      const pc = lastPeerConnection();
      pc.statsReport = new Map([
        [
          'IR1',
          {
            id: 'IR1',
            type: 'inbound-rtp',
            packetsReceived: 42,
            jitter: 0.007,
            kind: 'audio',
            bytesReceived: 1234, // not allowlisted -> excluded
          },
        ],
        [
          'CP1',
          {
            id: 'CP1',
            type: 'candidate-pair',
            currentRoundTripTime: 0.05,
            packetsSent: 10, // not allowlisted -> excluded
          },
        ],
        ['T1', { id: 'T1', type: 'transport', selectedCandidatePairId: 'CP1' }], // type not allowlisted
      ]);
      const channel = getChannel('media-stats');

      receiveOnChannel('media-stats', STATS_CONFIG_MESSAGE);
      expect(channel.send).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(10000);

      expect(channel.send).toHaveBeenCalledTimes(1);
      const payload = JSON.parse((channel.send.mock.calls[0] as [string])[0]);
      expect(payload).toEqual({
        request: {
          requestId: 1,
          uploadMediaStats: {
            sections: [
              {
                id: 'IR1',
                inbound_rtp: { packets_received: 42, jitter: 0.007, kind: 'audio' },
              },
              {
                id: 'CP1',
                candidate_pair: { current_round_trip_time: 0.05 },
              },
            ],
          },
        },
      });
    });

    it('should increment the requestId on each upload', async () => {
      await createInitializedProvider();
      const pc = lastPeerConnection();
      pc.statsReport = new Map([['IR1', { id: 'IR1', type: 'inbound-rtp', packetsReceived: 1 }]]);
      const channel = getChannel('media-stats');

      receiveOnChannel('media-stats', STATS_CONFIG_MESSAGE);
      await jest.advanceTimersByTimeAsync(20000);

      expect(channel.send).toHaveBeenCalledTimes(2);
      const first = JSON.parse((channel.send.mock.calls[0] as [string])[0]);
      const second = JSON.parse((channel.send.mock.calls[1] as [string])[0]);
      expect(first.request.requestId).toBe(1);
      expect(second.request.requestId).toBe(2);
    });

    it('should accept allowlist entries using the "key" spelling from the published typings', async () => {
      await createInitializedProvider();
      const pc = lastPeerConnection();
      pc.statsReport = new Map([
        ['C1', { id: 'C1', type: 'codec', mimeType: 'audio/opus', payloadType: 111 }],
      ]);
      const channel = getChannel('media-stats');

      receiveOnChannel('media-stats', {
        resources: [
          {
            configuration: {
              uploadIntervalSeconds: 5,
              allowlist: { codec: { key: ['mimeType'] } },
            },
          },
        ],
      });
      await jest.advanceTimersByTimeAsync(5000);

      const payload = JSON.parse((channel.send.mock.calls[0] as [string])[0]);
      expect(payload.request.uploadMediaStats.sections).toEqual([
        { id: 'C1', codec: { mime_type: 'audio/opus' } },
      ]);
    });

    it('should stop uploading when the server sends uploadIntervalSeconds 0', async () => {
      await createInitializedProvider();
      const pc = lastPeerConnection();
      pc.statsReport = new Map([['IR1', { id: 'IR1', type: 'inbound-rtp', packetsReceived: 1 }]]);
      const channel = getChannel('media-stats');

      receiveOnChannel('media-stats', STATS_CONFIG_MESSAGE);
      await jest.advanceTimersByTimeAsync(10000);
      expect(channel.send).toHaveBeenCalledTimes(1);

      receiveOnChannel('media-stats', {
        resources: [{ configuration: { uploadIntervalSeconds: 0, allowlist: {} } }],
      });
      await jest.advanceTimersByTimeAsync(60000);
      expect(channel.send).toHaveBeenCalledTimes(1);
    });

    it('should not send when no report entries match the allowlist', async () => {
      await createInitializedProvider();
      const pc = lastPeerConnection();
      pc.statsReport = new Map([
        ['T1', { id: 'T1', type: 'peer-connection', dataChannelsOpened: 2 }],
      ]);
      const channel = getChannel('media-stats');

      receiveOnChannel('media-stats', STATS_CONFIG_MESSAGE);
      await jest.advanceTimersByTimeAsync(10000);

      expect(channel.send).not.toHaveBeenCalled();
    });

    it('should stop the interval when the channel is no longer open', async () => {
      await createInitializedProvider();
      const pc = lastPeerConnection();
      pc.statsReport = new Map([['IR1', { id: 'IR1', type: 'inbound-rtp', packetsReceived: 1 }]]);
      const channel = getChannel('media-stats');

      receiveOnChannel('media-stats', STATS_CONFIG_MESSAGE);
      channel.readyState = 'closed';
      await jest.advanceTimersByTimeAsync(30000);

      expect(channel.send).not.toHaveBeenCalled();
    });

    it('should clear the interval when the media-stats channel closes', async () => {
      await createInitializedProvider();
      const pc = lastPeerConnection();
      pc.statsReport = new Map([['IR1', { id: 'IR1', type: 'inbound-rtp', packetsReceived: 1 }]]);
      const channel = getChannel('media-stats');

      receiveOnChannel('media-stats', STATS_CONFIG_MESSAGE);
      channel.onclose?.();
      await jest.advanceTimersByTimeAsync(30000);

      expect(channel.send).not.toHaveBeenCalled();
    });

    it('should ignore malformed media-stats messages', async () => {
      await createInitializedProvider();
      const channel = getChannel('media-stats');
      expect(() => channel.onmessage?.({ data: '{{nope' })).not.toThrow();
    });

    it('should log-and-ignore server responses to uploads', async () => {
      await createInitializedProvider();
      expect(() =>
        receiveOnChannel('media-stats', {
          response: {
            requestId: 1,
            status: { code: 200, message: '', details: [] },
            uploadMediaStats: {},
          },
        })
      ).not.toThrow();
    });
  });

  describe('Provider contract', () => {
    it('should declare websocket type and the input role only', () => {
      const provider = new GoogleMeetInput({ apiKey: 'token', spaceName: SPACE_NAME });
      expect(provider.type).toBe('websocket');
      expect(provider.roles).toEqual(['input']);
    });
  });
});
