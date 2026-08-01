/**
 * Tests for ZoomRtmsInput provider
 *
 * Tests the Zoom Realtime Media Streams input provider, which drives two
 * WebSocket connections (signaling + media) through the RTMS handshake
 * protocol and emits base64-decoded L16 PCM audio chunks.
 */

// jsdom does not provide crypto.subtle or TextEncoder — install Node's
// implementations (same pattern as the AWS SigV4 tests).
import { webcrypto, createHmac } from 'crypto';
import { TextEncoder, TextDecoder } from 'util';
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
global.TextEncoder = TextEncoder as unknown as typeof global.TextEncoder;
global.TextDecoder = TextDecoder as unknown as typeof global.TextDecoder;

import {
  ZoomRtmsInput,
  ZOOM_RTMS_STATUS_CODES,
} from '../../../../src/providers/io/zoom/ZoomRtmsInput';
import { ProviderInitializationError, ProviderConnectionError } from '../../../../src/utils/errors';
import type { AudioChunk } from '../../../../src/core/types/audio';

// --- WebSocketManager mock (one instance per constructed socket) ---

interface MockSocket {
  options: { url: string; [key: string]: unknown };
  handlers: {
    onMessage?: (event: MessageEvent) => void;
    onClose?: (event: CloseEvent) => void;
    onError?: (error: Error) => void;
  };
  connect: jest.Mock;
  disconnect: jest.Mock;
  send: jest.Mock;
  isConnected: jest.Mock;
  getState: jest.Mock;
  setHandlers: jest.Mock;
  receive: (message: unknown) => void;
}

/** When set, the next socket's connect() rejects with it. */
let mockConnectRejection: Error | null = null;

const mockSockets: MockSocket[] = [];
const mockDisconnectOrder: MockSocket[] = [];

function mockCreateSocket(options: { url: string }): MockSocket {
  const socket: MockSocket = {
    options,
    handlers: {},
    connect: jest.fn().mockImplementation(async () => {
      if (mockConnectRejection) throw mockConnectRejection;
    }),
    disconnect: jest.fn().mockImplementation(async () => {
      mockDisconnectOrder.push(socket);
    }),
    send: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true),
    getState: jest.fn().mockReturnValue('connected'),
    setHandlers: jest.fn((handlers: MockSocket['handlers']) => {
      socket.handlers = { ...socket.handlers, ...handlers };
    }),
    receive: (message: unknown) => {
      socket.handlers.onMessage?.({ data: JSON.stringify(message) } as MessageEvent);
    },
  };
  mockSockets.push(socket);
  return socket;
}

jest.mock('../../../../src/utils/websocket', () => {
  return {
    WebSocketManager: function (this: unknown, options: { url: string }) {
      return mockCreateSocket(options);
    },
    WebSocketState: {
      DISCONNECTED: 'disconnected',
      CONNECTING: 'connecting',
      CONNECTED: 'connected',
      RECONNECTING: 'reconnecting',
      CLOSING: 'closing',
      CLOSED: 'closed',
    },
  };
});

// --- Fixtures ---

const CLIENT_ID = 'test-client-id';
const CLIENT_SECRET = 'test-client-secret';
const SESSION = {
  meetingUuid: 'meeting-uuid-123',
  rtmsStreamId: 'rtms-stream-456',
  serverUrl: 'wss://rtms.zoom.us/signaling',
};
const MEDIA_AUDIO_URL = 'wss://rtms-media.zoom.us/audio';
const MEDIA_ALL_URL = 'wss://rtms-media.zoom.us/all';

/**
 * Golden vector for hex(HMAC-SHA256("clientId,meetingUuid,rtmsStreamId", secret))
 * with the fixtures above, computed with an independent implementation.
 */
const EXPECTED_SIGNATURE = '187de44d0667fd3780a1d51b8590b1522fb8f15b68c6ae8e42d0e6232fb38060';

/** Base64 of the L16 bytes [0x01, 0x02, 0x03, 0x04, 0xfe, 0xff, 0x00, 0x80]. */
const AUDIO_BASE64 = 'AQIDBP7/AIA=';
const AUDIO_BYTES = [0x01, 0x02, 0x03, 0x04, 0xfe, 0xff, 0x00, 0x80];

/** Flush pending promises (including WebCrypto microtasks). */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Poll until a condition holds. The provider awaits WebCrypto operations
 * before creating each socket, and those can span multiple event-loop turns
 * under load, so a single flush is not always enough.
 */
async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition in test');
    }
    await flush();
  }
}

/** Wait until the nth socket exists and has sent its handshake message. */
async function waitForSocket(index: number): Promise<MockSocket> {
  await waitFor(() => mockSockets.length > index && mockSockets[index]!.send.mock.calls.length > 0);
  return mockSockets[index]!;
}

function createProvider(overrides: Record<string, unknown> = {}): ZoomRtmsInput {
  return new ZoomRtmsInput({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    ...overrides,
  });
}

/** Drive the full happy-path connect flow; returns the two mock sockets. */
async function connectProvider(
  provider: ZoomRtmsInput,
  serverUrls: Record<string, string> = { audio: MEDIA_AUDIO_URL, all: MEDIA_ALL_URL }
): Promise<{ signaling: MockSocket; media: MockSocket }> {
  const promise = provider.connect(SESSION);
  const signaling = await waitForSocket(0);
  signaling.receive({
    msg_type: 2,
    status_code: 0,
    media_server: { server_urls: serverUrls },
  });
  const media = await waitForSocket(1);
  media.receive({ msg_type: 4, status_code: 0 });
  await promise;
  return { signaling, media };
}

/** Parse the nth JSON message sent on a socket. */
function sentJson(socket: MockSocket, index = 0): Record<string, unknown> {
  return JSON.parse(socket.send.mock.calls[index]![0] as string) as Record<string, unknown>;
}

describe('ZoomRtmsInput', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSockets.length = 0;
    mockDisconnectOrder.length = 0;
  });

  describe('Initialization', () => {
    it('should initialize with required configuration', async () => {
      const provider = createProvider();
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(provider.type).toBe('websocket');
      expect(provider.roles).toEqual(['input']);
    });

    it('should throw when clientId is missing', async () => {
      const provider = new ZoomRtmsInput({ clientId: '', clientSecret: CLIENT_SECRET });
      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw when clientSecret is missing', async () => {
      const provider = new ZoomRtmsInput({ clientId: CLIENT_ID, clientSecret: '' });
      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should throw on an unsupported sample rate', async () => {
      const provider = createProvider({ sampleRate: 44100 });
      await expect(provider.initialize()).rejects.toThrow(ProviderInitializationError);
    });

    it('should not be ready after dispose', async () => {
      const provider = createProvider();
      await provider.initialize();
      await provider.dispose();

      expect(provider.isReady()).toBe(false);
    });

    it('should support re-initialization after dispose', async () => {
      const provider = createProvider();
      await provider.initialize();
      await provider.dispose();
      await provider.initialize();

      expect(provider.isReady()).toBe(true);
    });
  });

  describe('Signaling handshake', () => {
    it('surfaces a failed connect() without an unhandled rejection', async () => {
      // The handshake waiter is created before connect() so no ack can be
      // missed. If connect() throws, nothing awaits that waiter — teardown
      // rejects it and an unobserved rejection terminates Node by default,
      // killing the whole voice server instead of failing one webhook.
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown): void => {
        rejections.push(reason);
      };
      process.on('unhandledRejection', onUnhandled);

      try {
        const provider = createProvider();
        await provider.initialize();
        mockConnectRejection = new Error('signaling host unreachable');

        await expect(provider.connect(SESSION)).rejects.toThrow();

        // Give any unobserved rejection a turn to surface.
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(rejections).toHaveLength(0);
      } finally {
        process.off('unhandledRejection', onUnhandled);
        mockConnectRejection = null;
      }
    });

    it('should connect the signaling socket to the webhook server URL', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { signaling } = await connectProvider(provider);

      expect(signaling.options.url).toBe(SESSION.serverUrl);
      expect(signaling.connect).toHaveBeenCalled();
      expect(provider.isConnected()).toBe(true);
    });

    it('should send SIGNALING_HAND_SHAKE_REQ with the exact wire shape and HMAC signature', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { signaling } = await connectProvider(provider);

      expect(sentJson(signaling, 0)).toEqual({
        msg_type: 1,
        protocol_version: 1,
        sequence: 0,
        meeting_uuid: SESSION.meetingUuid,
        rtms_stream_id: SESSION.rtmsStreamId,
        signature: EXPECTED_SIGNATURE,
      });

      // Cross-check the golden vector with an independent HMAC implementation
      const independent = createHmac('sha256', CLIENT_SECRET)
        .update(`${CLIENT_ID},${SESSION.meetingUuid},${SESSION.rtmsStreamId}`)
        .digest('hex');
      expect(EXPECTED_SIGNATURE).toBe(independent);
    });

    it('should use session parameters from the constructor config when connect() has no args', async () => {
      const provider = createProvider({ ...SESSION });
      await provider.initialize();

      const promise = provider.connect();
      const signaling = await waitForSocket(0);
      expect(signaling.options.url).toBe(SESSION.serverUrl);
      expect(sentJson(signaling, 0)).toMatchObject({
        msg_type: 1,
        meeting_uuid: SESSION.meetingUuid,
        rtms_stream_id: SESSION.rtmsStreamId,
      });

      signaling.receive({
        msg_type: 2,
        status_code: 0,
        media_server: { server_urls: { all: MEDIA_ALL_URL } },
      });
      (await waitForSocket(1)).receive({ msg_type: 4, status_code: 0 });
      await promise;

      expect(provider.isConnected()).toBe(true);
    });

    it('should reject when connecting before initialization', async () => {
      const provider = createProvider();
      await expect(provider.connect(SESSION)).rejects.toThrow(ProviderConnectionError);
    });

    it('should reject when session parameters are missing', async () => {
      const provider = createProvider();
      await provider.initialize();
      await expect(provider.connect()).rejects.toThrow(ProviderConnectionError);
      expect(mockSockets).toHaveLength(0);
    });

    it('should map a non-zero status code to its symbolic name', async () => {
      const provider = createProvider();
      await provider.initialize();

      const promise = provider.connect(SESSION);
      (await waitForSocket(0)).receive({ msg_type: 2, status_code: 3 });

      const error = (await promise.catch((e) => e)) as ProviderConnectionError;
      expect(error).toBeInstanceOf(ProviderConnectionError);
      expect((error.context?.cause as Error).message).toContain('status 3');
      expect((error.context?.cause as Error).message).toContain('STATUS_INVALID_SIGNATURE');
      expect(provider.isConnected()).toBe(false);
    });

    it('should map STATUS_INVALID_RTMS_STREAM_ID for status code 2', async () => {
      const provider = createProvider();
      await provider.initialize();

      const promise = provider.connect(SESSION);
      (await waitForSocket(0)).receive({ msg_type: 2, status_code: 2 });

      const error = (await promise.catch((e) => e)) as ProviderConnectionError;
      expect((error.context?.cause as Error).message).toContain('STATUS_INVALID_RTMS_STREAM_ID');
    });

    it('should close the signaling socket when the signaling handshake fails', async () => {
      const provider = createProvider();
      await provider.initialize();

      const promise = provider.connect(SESSION);
      (await waitForSocket(0)).receive({ msg_type: 2, status_code: 8 });

      await expect(promise).rejects.toThrow(ProviderConnectionError);
      expect(mockSockets[0]!.disconnect).toHaveBeenCalled();
    });

    it('should reject when the signaling response has no media server URL', async () => {
      const provider = createProvider();
      await provider.initialize();

      const promise = provider.connect(SESSION);
      (await waitForSocket(0)).receive({
        msg_type: 2,
        status_code: 0,
        media_server: { server_urls: {} },
      });

      const error = (await promise.catch((e) => e)) as ProviderConnectionError;
      expect(error).toBeInstanceOf(ProviderConnectionError);
      expect((error.context?.cause as Error).message).toContain('media server URL');
    });

    it('should be a no-op when already connected', async () => {
      const provider = createProvider();
      await provider.initialize();
      await connectProvider(provider);

      await provider.connect(SESSION);

      expect(mockSockets).toHaveLength(2);
    });
  });

  describe('Media handshake', () => {
    it('should connect the media socket to server_urls.audio when present', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { media } = await connectProvider(provider, {
        audio: MEDIA_AUDIO_URL,
        all: MEDIA_ALL_URL,
      });

      expect(media.options.url).toBe(MEDIA_AUDIO_URL);
    });

    it('should fall back to server_urls.all when audio is absent', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { media } = await connectProvider(provider, { all: MEDIA_ALL_URL });

      expect(media.options.url).toBe(MEDIA_ALL_URL);
    });

    it('should send DATA_HAND_SHAKE_REQ with the exact audio media_params constants', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { media } = await connectProvider(provider);

      expect(sentJson(media, 0)).toEqual({
        msg_type: 3,
        protocol_version: 1,
        sequence: 0,
        meeting_uuid: SESSION.meetingUuid,
        rtms_stream_id: SESSION.rtmsStreamId,
        signature: EXPECTED_SIGNATURE,
        media_type: 1,
        media_params: {
          audio: {
            content_type: 2, // RAW_AUDIO
            sample_rate: 1, // SR_16K
            channel: 1, // MONO
            codec: 1, // L16
            data_opt: 1, // AUDIO_MIXED_STREAM
            send_rate: 100,
          },
        },
      });
    });

    it('should map sampleRate and dataOpt config overrides to their wire enums', async () => {
      const provider = createProvider({ sampleRate: 48000, dataOpt: 'per-participant' });
      await provider.initialize();
      const { media } = await connectProvider(provider);

      const params = (sentJson(media, 0).media_params as { audio: Record<string, number> }).audio;
      expect(params.sample_rate).toBe(3); // SR_48K
      expect(params.data_opt).toBe(2); // per-participant streams
    });

    it('should map sampleRate 8000 to enum 0', async () => {
      const provider = createProvider({ sampleRate: 8000 });
      await provider.initialize();
      const { media } = await connectProvider(provider);

      const params = (sentJson(media, 0).media_params as { audio: Record<string, number> }).audio;
      expect(params.sample_rate).toBe(0);
    });

    it('should send CLIENT_READY_ACK on the SIGNALING socket after the media handshake succeeds', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { signaling, media } = await connectProvider(provider);

      // Second message on the signaling socket (after the handshake request)
      expect(sentJson(signaling, 1)).toEqual({
        msg_type: 7,
        rtms_stream_id: SESSION.rtmsStreamId,
      });
      // The ACK never goes on the media socket
      expect(media.send).toHaveBeenCalledTimes(1);
    });

    it('should map media handshake failures and tear down both sockets', async () => {
      const provider = createProvider();
      await provider.initialize();

      const promise = provider.connect(SESSION);
      (await waitForSocket(0)).receive({
        msg_type: 2,
        status_code: 0,
        media_server: { server_urls: { audio: MEDIA_AUDIO_URL } },
      });
      (await waitForSocket(1)).receive({ msg_type: 4, status_code: 23 });

      const error = (await promise.catch((e) => e)) as ProviderConnectionError;
      expect(error).toBeInstanceOf(ProviderConnectionError);
      expect((error.context?.cause as Error).message).toContain(
        'STATUS_INVALID_MEDIA_AUDIO_DATA_OPT'
      );
      expect(mockSockets[0]!.disconnect).toHaveBeenCalled();
      expect(mockSockets[1]!.disconnect).toHaveBeenCalled();
      expect(provider.isConnected()).toBe(false);
    });
  });

  describe('Keep-alive', () => {
    it('should echo KEEP_ALIVE_REQ on the signaling socket with the same timestamp', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { signaling } = await connectProvider(provider);
      signaling.send.mockClear();

      signaling.receive({ msg_type: 12, timestamp: 1752345678901 });

      expect(signaling.send).toHaveBeenCalledWith(
        JSON.stringify({ msg_type: 13, timestamp: 1752345678901 })
      );
    });

    it('should echo KEEP_ALIVE_REQ on the media socket with the same timestamp', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { media } = await connectProvider(provider);
      media.send.mockClear();

      media.receive({ msg_type: 12, timestamp: 42 });

      expect(media.send).toHaveBeenCalledWith(JSON.stringify({ msg_type: 13, timestamp: 42 }));
    });
  });

  describe('Audio flow', () => {
    let provider: ZoomRtmsInput;
    let media: MockSocket;
    let chunks: AudioChunk[];

    beforeEach(async () => {
      provider = createProvider();
      await provider.initialize();
      chunks = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      ({ media } = await connectProvider(provider));
      provider.start();
    });

    it('should decode MEDIA_DATA_AUDIO base64 payloads into AudioChunk bytes', () => {
      media.receive({
        msg_type: 14,
        content: {
          user_id: 16778240,
          user_name: 'Alice',
          data: AUDIO_BASE64,
          timestamp: 1752345678901,
        },
      });

      expect(chunks).toHaveLength(1);
      expect(Array.from(new Uint8Array(chunks[0]!.data))).toEqual(AUDIO_BYTES);
      expect(typeof chunks[0]!.timestamp).toBe('number');
      expect(chunks[0]!.sequence).toBe(0);
    });

    it('should assign monotonically increasing sequence numbers', () => {
      media.receive({ msg_type: 14, content: { data: AUDIO_BASE64 } });
      media.receive({ msg_type: 14, content: { data: AUDIO_BASE64 } });
      media.receive({ msg_type: 14, content: { data: AUDIO_BASE64 } });

      expect(chunks.map((c) => c.sequence)).toEqual([0, 1, 2]);
    });

    it('should accept the flat payload variant (content as base64 string)', () => {
      media.receive({
        msg_type: 14,
        content: AUDIO_BASE64,
        user_id: 123,
        user_name: 'Bob',
      });

      expect(chunks).toHaveLength(1);
      expect(Array.from(new Uint8Array(chunks[0]!.data))).toEqual(AUDIO_BYTES);
    });

    it('should invoke the per-participant callback with attribution', () => {
      const speakers: Array<[number | undefined, string | undefined, AudioChunk]> = [];
      provider.onSpeakerAudio((userId, userName, chunk) =>
        speakers.push([userId, userName, chunk])
      );

      media.receive({
        msg_type: 14,
        content: { user_id: 16778240, user_name: 'Alice', data: AUDIO_BASE64 },
      });

      expect(speakers).toHaveLength(1);
      expect(speakers[0]![0]).toBe(16778240);
      expect(speakers[0]![1]).toBe('Alice');
      expect(Array.from(new Uint8Array(speakers[0]![2].data))).toEqual(AUDIO_BYTES);
    });

    it('should drop audio before start()', () => {
      provider.stop();
      provider.start(); // reset
      provider.stop();

      media.receive({ msg_type: 14, content: { data: AUDIO_BASE64 } });

      expect(chunks).toHaveLength(0);
    });

    it('should drop audio while paused and resume afterwards', () => {
      provider.pause();
      expect(provider.isActive()).toBe(false);
      media.receive({ msg_type: 14, content: { data: AUDIO_BASE64 } });
      expect(chunks).toHaveLength(0);

      provider.resume();
      expect(provider.isActive()).toBe(true);
      media.receive({ msg_type: 14, content: { data: AUDIO_BASE64 } });
      expect(chunks).toHaveLength(1);
    });

    it('should drop audio after stop()', () => {
      provider.stop();
      expect(provider.isActive()).toBe(false);

      media.receive({ msg_type: 14, content: { data: AUDIO_BASE64 } });

      expect(chunks).toHaveLength(0);
    });

    it('should ignore audio messages without a payload', () => {
      media.receive({ msg_type: 14, content: {} });
      media.receive({ msg_type: 14 });

      expect(chunks).toHaveLength(0);
    });

    it('should ignore non-string socket messages', () => {
      media.handlers.onMessage?.({ data: new ArrayBuffer(4) } as MessageEvent);
      expect(chunks).toHaveLength(0);
    });
  });

  describe('Metadata', () => {
    it('should report linear16 mono at the default 16 kHz', async () => {
      const provider = createProvider();
      await provider.initialize();

      expect(provider.getMetadata()).toEqual({
        sampleRate: 16000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
      });
    });

    it('should reflect a configured sample rate', () => {
      const provider = createProvider({ sampleRate: 32000 });
      expect(provider.getMetadata().sampleRate).toBe(32000);
    });
  });

  describe('State updates and shutdown', () => {
    it('should track stream and session states from update messages', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { signaling } = await connectProvider(provider);

      expect(provider.getStreamState()).toBeNull();
      expect(provider.getSessionState()).toBeNull();

      signaling.receive({ msg_type: 8, state: 1 });
      signaling.receive({ msg_type: 9, state: 2 });

      expect(provider.getStreamState()).toBe(1);
      expect(provider.getSessionState()).toBe(2);
      expect(provider.isConnected()).toBe(true);
    });

    it('should close both sockets when the session stops (media before signaling)', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { signaling, media } = await connectProvider(provider);

      signaling.receive({ msg_type: 9, state: 5, stop_reason: 6 });
      await flush();

      expect(media.disconnect).toHaveBeenCalled();
      expect(signaling.disconnect).toHaveBeenCalled();
      expect(mockDisconnectOrder).toEqual([media, signaling]);
      expect(provider.isConnected()).toBe(false);
    });

    it('should close both sockets when the stream terminates', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { signaling, media } = await connectProvider(provider);

      signaling.receive({ msg_type: 8, state: 4, reason: 6 });
      await flush();

      expect(media.disconnect).toHaveBeenCalled();
      expect(signaling.disconnect).toHaveBeenCalled();
      expect(provider.isConnected()).toBe(false);
    });

    it('should disconnect() cleanly, closing media before signaling', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { signaling, media } = await connectProvider(provider);

      await provider.disconnect();

      expect(mockDisconnectOrder).toEqual([media, signaling]);
      expect(provider.isConnected()).toBe(false);
    });

    it('should allow reconnecting after a disconnect', async () => {
      const provider = createProvider();
      await provider.initialize();
      await connectProvider(provider);
      await provider.disconnect();

      const promise = provider.connect(SESSION);
      (await waitForSocket(2)).receive({
        msg_type: 2,
        status_code: 0,
        media_server: { server_urls: { audio: MEDIA_AUDIO_URL } },
      });
      (await waitForSocket(3)).receive({ msg_type: 4, status_code: 0 });
      await promise;

      expect(provider.isConnected()).toBe(true);
    });

    it('should dispose cleanly and stop emitting audio', async () => {
      const provider = createProvider();
      await provider.initialize();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      const { signaling, media } = await connectProvider(provider);
      provider.start();

      await provider.dispose();

      expect(signaling.disconnect).toHaveBeenCalled();
      expect(media.disconnect).toHaveBeenCalled();
      expect(provider.isReady()).toBe(false);
      expect(provider.isActive()).toBe(false);

      media.receive({ msg_type: 14, content: { data: AUDIO_BASE64 } });
      expect(chunks).toHaveLength(0);
    });

    it('should dispose cleanly even when a socket close fails', async () => {
      const provider = createProvider();
      await provider.initialize();
      const { media } = await connectProvider(provider);
      media.disconnect.mockRejectedValueOnce(new Error('close failed'));

      await expect(provider.dispose()).resolves.toBeUndefined();
      expect(provider.isReady()).toBe(false);
    });
  });

  describe('Status code table', () => {
    it('should name the common handshake status codes', () => {
      expect(ZOOM_RTMS_STATUS_CODES[0]).toBe('STATUS_OK');
      expect(ZOOM_RTMS_STATUS_CODES[2]).toBe('STATUS_INVALID_RTMS_STREAM_ID');
      expect(ZOOM_RTMS_STATUS_CODES[3]).toBe('STATUS_INVALID_SIGNATURE');
      expect(ZOOM_RTMS_STATUS_CODES[8]).toBe('STATUS_DUPLICATE_SIGNAL_REQUEST');
      expect(ZOOM_RTMS_STATUS_CODES[20]).toBe('STATUS_INVALID_MEDIA_AUDIO_SAMPLE_RATE');
      expect(ZOOM_RTMS_STATUS_CODES[24]).toBe('STATUS_INVALID_MEDIA_AUDIO_SEND_RATE');
    });
  });
});
