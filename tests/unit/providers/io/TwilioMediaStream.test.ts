/**
 * Tests for TwilioMediaStream provider
 *
 * Tests the duplex Twilio Media Streams provider: socket attach/detach
 * (Node ws-style and browser-style), the exact Twilio wire shapes in both
 * directions (start/media/mark/clear/stop/dtmf), base64 mu-law payload
 * handling, flush-via-mark semantics, barge-in clear, and the
 * linear16 -> mu-law conversion path via utils/g711.
 */

import { TwilioMediaStream } from '../../../../src/providers/io/twilio/TwilioMediaStream';
import type { AudioChunk } from '../../../../src/core/types/audio';
import { ConfigurationError } from '../../../../src/utils/errors';
import { encodeMulaw } from '../../../../src/utils/g711';
import { downsampleAudio, floatTo16BitPCM, int16ToFloat } from '../../../../src/utils/audio';

// --- Wire fixtures (from the Twilio Media Streams WebSocket message reference) ---

const STREAM_SID = 'MZ18ad3ab5a668481ce02b83e7395059f0';
const CALL_SID = 'CAfc9a82a1b83e02c337cd50259784e2a9';
const ACCOUNT_SID = 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

const CONNECTED_MSG = { event: 'connected', protocol: 'Call', version: '1.0.0' };

function startMsg(customParameters: Record<string, string> = {}): Record<string, unknown> {
  return {
    event: 'start',
    sequenceNumber: '1',
    start: {
      accountSid: ACCOUNT_SID,
      streamSid: STREAM_SID,
      callSid: CALL_SID,
      tracks: ['inbound'],
      mediaFormat: { encoding: 'audio/x-mulaw', sampleRate: 8000, channels: 1 },
      customParameters,
    },
    streamSid: STREAM_SID,
  };
}

function mediaMsg(payload: string, track = 'inbound'): Record<string, unknown> {
  return {
    event: 'media',
    sequenceNumber: '3',
    media: { track, chunk: '1', timestamp: '5', payload },
    streamSid: STREAM_SID,
  };
}

function markMsg(name: string): Record<string, unknown> {
  return { event: 'mark', mark: { name }, streamSid: STREAM_SID };
}

const STOP_MSG = {
  event: 'stop',
  sequenceNumber: '5',
  stop: { accountSid: ACCOUNT_SID, callSid: CALL_SID },
  streamSid: STREAM_SID,
};

const DTMF_MSG = {
  event: 'dtmf',
  dtmf: { track: 'inbound_track', digit: '1' },
  streamSid: STREAM_SID,
};

// --- Base64 helpers ---

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function fromBase64(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

/** 20ms of "caller audio": arbitrary mu-law bytes. */
const MULAW_BYTES = new Uint8Array([0xff, 0x7f, 0x00, 0x80, 0xd5, 0x2a, 0x13, 0xec]);
const MULAW_PAYLOAD = toBase64(MULAW_BYTES);

// --- Mock sockets ---

/** Node `ws`-style socket: on/off + send. */
class MockNodeSocket {
  sent: string[] = [];
  listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  close = jest.fn();

  send(data: string): void {
    this.sent.push(data);
  }

  on(event: string, listener: (...args: unknown[]) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      list.filter((l) => l !== listener)
    );
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...args);
    }
  }

  listenerCount(event: string): number {
    return (this.listeners.get(event) ?? []).length;
  }

  /** Simulate Twilio sending a JSON text frame (ws delivers a Buffer). */
  receive(message: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(message)), false);
  }

  lastSent(): Record<string, unknown> {
    return JSON.parse(this.sent[this.sent.length - 1] as string) as Record<string, unknown>;
  }

  sentJson(): Array<Record<string, unknown>> {
    return this.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
  }
}

/** Browser-style socket: addEventListener/removeEventListener + send. */
class MockDomSocket {
  sent: string[] = [];
  listeners = new Map<string, Array<(event: { data: unknown }) => void>>();

  send(data: string): void {
    this.sent.push(data);
  }

  addEventListener(event: string, listener: (event: { data: unknown }) => void): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  removeEventListener(event: string, listener: (event: { data: unknown }) => void): void {
    const list = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      list.filter((l) => l !== listener)
    );
  }

  receive(message: unknown): void {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data: JSON.stringify(message) });
    }
  }

  emitClose(): void {
    for (const listener of this.listeners.get('close') ?? []) {
      listener({ data: undefined });
    }
  }

  listenerCount(event: string): number {
    return (this.listeners.get(event) ?? []).length;
  }
}

/** Flush the microtask queue so pending promise callbacks run. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Build a started provider with an attached Node-style socket. */
async function createStartedProvider(): Promise<{
  provider: TwilioMediaStream;
  socket: MockNodeSocket;
  chunks: AudioChunk[];
}> {
  const provider = new TwilioMediaStream();
  await provider.initialize();
  const socket = new MockNodeSocket();
  provider.attach(socket);
  const chunks: AudioChunk[] = [];
  provider.onAudio((chunk) => chunks.push(chunk));
  socket.receive(CONNECTED_MSG);
  socket.receive(startMsg());
  provider.start();
  return { provider, socket, chunks };
}

describe('TwilioMediaStream', () => {
  describe('Provider contract', () => {
    it('declares websocket type and duplex input/output roles', () => {
      const provider = new TwilioMediaStream();
      expect(provider.type).toBe('websocket');
      expect(provider.roles).toEqual(['input', 'output']);
    });

    it('initializes and reports ready', async () => {
      const provider = new TwilioMediaStream();
      expect(provider.isReady()).toBe(false);
      await provider.initialize();
      expect(provider.isReady()).toBe(true);
    });

    it('is not ready after dispose and can be re-initialized', async () => {
      const provider = new TwilioMediaStream();
      await provider.initialize();
      await provider.dispose();
      expect(provider.isReady()).toBe(false);
      await provider.initialize();
      expect(provider.isReady()).toBe(true);
    });

    it('implements every method required by the input and output roles', () => {
      const provider = new TwilioMediaStream() as unknown as Record<string, unknown>;
      const required = [
        'start',
        'stop',
        'pause',
        'resume',
        'isActive',
        'onAudio',
        'getMetadata',
        'configure',
        'enqueue',
        'flush',
        'isPlaying',
        'onPlaybackStart',
        'onPlaybackEnd',
        'onPlaybackError',
      ];
      for (const method of required) {
        expect(typeof provider[method]).toBe('function');
      }
    });
  });

  describe('Socket attachment', () => {
    it('subscribes to socket errors so one ECONNRESET cannot kill the server', async () => {
      // A Node ws socket with no 'error' listener re-throws as an uncaught
      // exception, taking the whole process down mid-call.
      const { socket } = await createStartedProvider();

      expect(socket.listenerCount('error')).toBe(1);
      expect(() => socket.emit('error', new Error('ECONNRESET'))).not.toThrow();
    });

    it('treats a socket error as the call ending', async () => {
      const { provider, socket } = await createStartedProvider();
      let ended = false;
      provider.onCallEnded(() => {
        ended = true;
      });

      // 'close' may never arrive after an error, so the error path has to end
      // the call itself or the pipeline is never torn down.
      socket.emit('error', new Error('ECONNRESET'));

      expect(ended).toBe(true);
    });

    it('wires message/close via on() for Node ws-style sockets', async () => {
      const { socket, chunks } = await createStartedProvider();
      expect(socket.listenerCount('message')).toBe(1);
      expect(socket.listenerCount('close')).toBe(1);
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks).toHaveLength(1);
    });

    it('wires message/close via addEventListener() for browser-style sockets', async () => {
      const provider = new TwilioMediaStream();
      await provider.initialize();
      const socket = new MockDomSocket();
      provider.attach(socket);
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      socket.receive(startMsg());
      provider.start();
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks).toHaveLength(1);
      expect(new Uint8Array(chunks[0]!.data)).toEqual(MULAW_BYTES);
    });

    it('throws ConfigurationError for sockets without any listener API', async () => {
      const provider = new TwilioMediaStream();
      await provider.initialize();
      expect(() => provider.attach({ send: () => undefined })).toThrow(ConfigurationError);
    });

    it('detaches the previous socket when attach() is called again', async () => {
      const { provider, socket, chunks } = await createStartedProvider();
      const second = new MockNodeSocket();
      provider.attach(second);

      expect(socket.listenerCount('message')).toBe(0);
      expect(socket.listenerCount('close')).toBe(0);

      // Messages on the old socket are ignored
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks).toHaveLength(0);

      // The new socket feeds the provider after its own start message
      second.receive(startMsg());
      provider.start();
      second.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks).toHaveLength(1);
    });

    it('resets call identifiers on re-attach', async () => {
      const { provider } = await createStartedProvider();
      expect(provider.getStreamSid()).toBe(STREAM_SID);
      provider.attach(new MockNodeSocket());
      expect(provider.getStreamSid()).toBeNull();
      expect(provider.getCallSid()).toBeNull();
      expect(provider.getCustomParameters()).toEqual({});
    });

    it('detach() removes listeners without closing the socket', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.detach();
      expect(socket.listenerCount('message')).toBe(0);
      expect(socket.listenerCount('close')).toBe(0);
      expect(socket.close).not.toHaveBeenCalled();
    });

    it('detach() removes listeners from browser-style sockets', async () => {
      const provider = new TwilioMediaStream();
      await provider.initialize();
      const socket = new MockDomSocket();
      provider.attach(socket);
      provider.detach();
      expect(socket.listenerCount('message')).toBe(0);
      expect(socket.listenerCount('close')).toBe(0);
    });
  });

  describe('Start message handling', () => {
    it('captures streamSid, callSid, and customParameters from the start message', async () => {
      const provider = new TwilioMediaStream();
      await provider.initialize();
      const socket = new MockNodeSocket();
      provider.attach(socket);

      expect(provider.getStreamSid()).toBeNull();
      socket.receive(startMsg({ userId: '42', session: 'abc' }));

      expect(provider.getStreamSid()).toBe(STREAM_SID);
      expect(provider.getCallSid()).toBe(CALL_SID);
      expect(provider.getCustomParameters()).toEqual({ userId: '42', session: 'abc' });
    });

    it('returns a copy of customParameters', async () => {
      const provider = new TwilioMediaStream();
      await provider.initialize();
      const socket = new MockNodeSocket();
      provider.attach(socket);
      socket.receive(startMsg({ userId: '42' }));

      const params = provider.getCustomParameters();
      params['userId'] = 'mutated';
      expect(provider.getCustomParameters()).toEqual({ userId: '42' });
    });
  });

  describe('Input audio flow', () => {
    it('decodes base64 media payloads and emits raw mu-law bytes', async () => {
      const { socket, chunks } = await createStartedProvider();
      socket.receive(mediaMsg(MULAW_PAYLOAD));

      expect(chunks).toHaveLength(1);
      expect(new Uint8Array(chunks[0]!.data)).toEqual(MULAW_BYTES);
      expect(typeof chunks[0]!.timestamp).toBe('number');
      expect(chunks[0]!.sequence).toBe(0);
    });

    it('assigns monotonically increasing sequence numbers', async () => {
      const { socket, chunks } = await createStartedProvider();
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks.map((chunk) => chunk.sequence)).toEqual([0, 1, 2]);
    });

    it('drops media before start() is called', async () => {
      const provider = new TwilioMediaStream();
      await provider.initialize();
      const socket = new MockNodeSocket();
      provider.attach(socket);
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      socket.receive(startMsg());

      socket.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks).toHaveLength(0);
    });

    it('drops media while paused and resumes emission after resume()', async () => {
      const { provider, socket, chunks } = await createStartedProvider();
      provider.pause();
      expect(provider.isActive()).toBe(false);
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks).toHaveLength(0);

      provider.resume();
      expect(provider.isActive()).toBe(true);
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks).toHaveLength(1);
    });

    it('drops media after stop()', async () => {
      const { provider, socket, chunks } = await createStartedProvider();
      provider.stop();
      expect(provider.isActive()).toBe(false);
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks).toHaveLength(0);
    });

    it('ignores non-inbound track media', async () => {
      const { socket, chunks } = await createStartedProvider();
      socket.receive(mediaMsg(MULAW_PAYLOAD, 'outbound'));
      expect(chunks).toHaveLength(0);
    });

    it('ignores malformed JSON and unknown events without throwing', async () => {
      const { socket, chunks } = await createStartedProvider();
      expect(() => socket.emit('message', Buffer.from('not json'), false)).not.toThrow();
      expect(() => socket.receive({ event: 'someFutureEvent' })).not.toThrow();
      expect(chunks).toHaveLength(0);
    });

    it('ignores media payloads with invalid base64', async () => {
      const { socket, chunks } = await createStartedProvider();
      expect(() => socket.receive(mediaMsg('!!!not-base64!!!'))).not.toThrow();
      expect(chunks).toHaveLength(0);
    });
  });

  describe('getMetadata', () => {
    it('reports mu-law 8 kHz mono with no bitDepth', () => {
      const provider = new TwilioMediaStream();
      const metadata = provider.getMetadata();
      expect(metadata).toEqual({
        encoding: 'mulaw',
        sampleRate: 8000,
        channels: 1,
        mimeType: 'audio/basic',
      });
      expect(metadata.bitDepth).toBeUndefined();
    });
  });

  describe('Output: configure', () => {
    it('accepts mulaw @ 8000 Hz (passthrough)', () => {
      const provider = new TwilioMediaStream();
      expect(() =>
        provider.configure({ encoding: 'mulaw', sampleRate: 8000, channels: 1 })
      ).not.toThrow();
    });

    it('accepts linear16 at any sample rate', () => {
      const provider = new TwilioMediaStream();
      expect(() =>
        provider.configure({ encoding: 'linear16', sampleRate: 24000, channels: 1, bitDepth: 16 })
      ).not.toThrow();
    });

    it('throws ConfigurationError for mp3 with TTS reconfiguration guidance', () => {
      const provider = new TwilioMediaStream();
      expect(() => provider.configure({ encoding: 'mp3', sampleRate: 44100, channels: 1 })).toThrow(
        ConfigurationError
      );
      expect(() => provider.configure({ encoding: 'mp3', sampleRate: 44100, channels: 1 })).toThrow(
        /mulaw.*8000|8000.*mulaw/s
      );
    });

    it('throws ConfigurationError for opus', () => {
      const provider = new TwilioMediaStream();
      expect(() =>
        provider.configure({ encoding: 'opus', sampleRate: 48000, channels: 1 })
      ).toThrow(ConfigurationError);
    });

    it('throws ConfigurationError for stereo audio', () => {
      const provider = new TwilioMediaStream();
      expect(() =>
        provider.configure({ encoding: 'linear16', sampleRate: 8000, channels: 2 })
      ).toThrow(ConfigurationError);
    });
  });

  describe('Output: media messages to Twilio', () => {
    it('sends the exact media wire shape with a base64 mu-law payload (passthrough)', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.configure({ encoding: 'mulaw', sampleRate: 8000, channels: 1 });

      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now(), sequence: 0 });

      expect(socket.lastSent()).toEqual({
        event: 'media',
        streamSid: STREAM_SID,
        media: { payload: MULAW_PAYLOAD },
      });
    });

    it('converts linear16 @ 8000 Hz to mu-law via encodeMulaw', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 8000, channels: 1, bitDepth: 16 });

      const pcm = new Int16Array([0, 1000, -1000, 32767, -32768, 12345]);
      provider.enqueue({ data: pcm.buffer.slice(0), timestamp: Date.now(), sequence: 0 });

      const message = socket.lastSent() as { media: { payload: string } };
      expect(fromBase64(message.media.payload)).toEqual(encodeMulaw(pcm));
    });

    it('downsamples linear16 @ 16000 Hz to 8000 Hz before mu-law encoding', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });

      // 320 samples = 20ms at 16 kHz -> expect 160 mu-law bytes (20ms at 8 kHz)
      const pcm = new Int16Array(320);
      for (let i = 0; i < pcm.length; i++) {
        pcm[i] = Math.round(Math.sin(i / 10) * 16000);
      }
      provider.enqueue({ data: pcm.buffer.slice(0), timestamp: Date.now(), sequence: 0 });

      const expected = encodeMulaw(
        floatTo16BitPCM(downsampleAudio(int16ToFloat(pcm), 16000, 8000))
      );
      const message = socket.lastSent() as { media: { payload: string } };
      const sentBytes = fromBase64(message.media.payload);
      expect(sentBytes.length).toBe(160);
      expect(sentBytes).toEqual(expected);
    });

    it('uses per-chunk metadata over the configured format', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 24000, channels: 1 });

      // This chunk announces itself as mu-law 8 kHz: passthrough expected
      provider.enqueue({
        data: MULAW_BYTES.buffer.slice(0),
        metadata: { encoding: 'mulaw', sampleRate: 8000, channels: 1 },
        timestamp: Date.now(),
        sequence: 0,
      });

      const message = socket.lastSent() as { media: { payload: string } };
      expect(message.media.payload).toBe(MULAW_PAYLOAD);
    });

    it('defaults to mu-law passthrough when configure() was never called', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      const message = socket.lastSent() as { media: { payload: string } };
      expect(message.media.payload).toBe(MULAW_PAYLOAD);
    });

    it('drops chunks and does not throw when no stream has started', async () => {
      const provider = new TwilioMediaStream();
      await provider.initialize();
      const socket = new MockNodeSocket();
      provider.attach(socket); // no start message yet -> no streamSid

      expect(() =>
        provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() })
      ).not.toThrow();
      expect(socket.sent).toHaveLength(0);
    });

    it('fires onPlaybackStart once when delivery begins after idle', async () => {
      const { provider, socket } = await createStartedProvider();
      const onStart = jest.fn();
      provider.onPlaybackStart(onStart);

      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });

      expect(onStart).toHaveBeenCalledTimes(1);
      expect(provider.isPlaying()).toBe(true);
      expect(socket.sent).toHaveLength(2);
    });

    it('reports send failures via onPlaybackError', async () => {
      const { provider, socket } = await createStartedProvider();
      const onError = jest.fn();
      provider.onPlaybackError(onError);
      socket.send = () => {
        throw new Error('socket closed');
      };

      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('input pause() does not block output delivery (turn-taking safety)', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.pause(); // TurnTakingController pauses input while the agent speaks
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      expect(socket.sent).toHaveLength(1);
      expect((socket.lastSent() as { event: string }).event).toBe('media');
    });
  });

  describe('Output: flush via mark', () => {
    it('sends the exact mark wire shape with a cv-<n> name', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });

      void provider.flush();

      expect(socket.lastSent()).toEqual({
        event: 'mark',
        streamSid: STREAM_SID,
        mark: { name: 'cv-1' },
      });
    });

    it('keeps flush() pending until Twilio echoes the mark', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });

      let resolved = false;
      const flushPromise = provider.flush().then(() => {
        resolved = true;
      });

      await flushMicrotasks();
      expect(resolved).toBe(false);

      socket.receive(markMsg('cv-1'));
      await flushPromise;
      expect(resolved).toBe(true);
    });

    it('fires onPlaybackEnd and clears isPlaying when the last mark is echoed', async () => {
      const { provider, socket } = await createStartedProvider();
      const onEnd = jest.fn();
      provider.onPlaybackEnd(onEnd);

      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      const flushPromise = provider.flush();

      expect(provider.isPlaying()).toBe(true);
      socket.receive(markMsg('cv-1'));
      await flushPromise;

      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(provider.isPlaying()).toBe(false);
    });

    it('increments the mark name across flushes', async () => {
      const { provider, socket } = await createStartedProvider();

      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      const first = provider.flush();
      socket.receive(markMsg('cv-1'));
      await first;

      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      const second = provider.flush();
      expect(socket.lastSent()).toEqual({
        event: 'mark',
        streamSid: STREAM_SID,
        mark: { name: 'cv-2' },
      });
      socket.receive(markMsg('cv-2'));
      await second;
    });

    it('resolves immediately without sending a mark when nothing is playing', async () => {
      const { provider, socket } = await createStartedProvider();
      await provider.flush();
      expect(socket.sent).toHaveLength(0);
    });

    it('ignores echoes for unknown mark names', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      expect(() => socket.receive(markMsg('someone-elses-mark'))).not.toThrow();
      expect(provider.isPlaying()).toBe(true);
    });
  });

  describe('Barge-in (output stop)', () => {
    it('sends the exact clear wire shape', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });

      provider.stop();

      expect(socket.lastSent()).toEqual({ event: 'clear', streamSid: STREAM_SID });
    });

    it('settles a pending flush as cancelled on stop()', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });

      let resolved = false;
      const flushPromise = provider.flush().then(() => {
        resolved = true;
      });
      await flushMicrotasks();
      expect(resolved).toBe(false);

      provider.stop();
      await flushPromise;
      expect(resolved).toBe(true);
      expect(provider.isPlaying()).toBe(false);
      expect(socket.lastSent()).toEqual({ event: 'clear', streamSid: STREAM_SID });
    });

    it('keeps caller-audio capture alive when stop() is a barge-in', async () => {
      const { provider, socket } = await createStartedProvider();
      const onAudio = jest.fn();
      provider.onAudio(onAudio);
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });

      // Barge-in: playback is active, so stop() must not halt input.
      provider.stop();
      expect(provider.isActive()).toBe(true);
      socket.receive(mediaMsg('AAAA'));
      expect(onAudio).toHaveBeenCalledTimes(1);
    });

    it('halts input when stop() is called with no playback in flight', async () => {
      const { provider, socket } = await createStartedProvider();
      const onAudio = jest.fn();
      provider.onAudio(onAudio);

      // No queued audio, no marks: stop() acts on the input role.
      provider.stop();
      expect(provider.isActive()).toBe(false);
      socket.receive(mediaMsg('AAAA'));
      expect(onAudio).not.toHaveBeenCalled();
    });

    it('fires onPlaybackEnd when stop() interrupts playback', async () => {
      const { provider } = await createStartedProvider();
      const onEnd = jest.fn();
      provider.onPlaybackEnd(onEnd);
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });

      provider.stop();
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('treats mark echoes after clear as cancelled, not completed', async () => {
      const { provider, socket } = await createStartedProvider();
      const onEnd = jest.fn();
      provider.onPlaybackEnd(onEnd);
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      const flushPromise = provider.flush();

      provider.stop();
      await flushPromise;
      expect(onEnd).toHaveBeenCalledTimes(1);

      // Twilio echoes the pending mark after a clear; it must be a no-op now
      expect(() => socket.receive(markMsg('cv-1'))).not.toThrow();
      expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('does not send clear when no stream is active', async () => {
      const provider = new TwilioMediaStream();
      await provider.initialize();
      const socket = new MockNodeSocket();
      provider.attach(socket);
      provider.stop();
      expect(socket.sent).toHaveLength(0);
    });
  });

  describe('Remote hangup (stop event and socket close)', () => {
    it('stops input, settles pending flushes, and fires callbacks on the stop event', async () => {
      const { provider, socket, chunks } = await createStartedProvider();
      const onEnd = jest.fn();
      const onCallEnded = jest.fn();
      provider.onPlaybackEnd(onEnd);
      provider.onCallEnded(onCallEnded);

      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      const flushPromise = provider.flush();

      socket.receive(STOP_MSG);
      await flushPromise;

      expect(provider.isActive()).toBe(false);
      expect(provider.isPlaying()).toBe(false);
      expect(onEnd).toHaveBeenCalledTimes(1);
      expect(onCallEnded).toHaveBeenCalledTimes(1);

      // No further input after hangup
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks).toHaveLength(0);
    });

    it('drops output enqueued after the stop event', async () => {
      const { provider, socket } = await createStartedProvider();
      socket.receive(STOP_MSG);
      const sentBefore = socket.sent.length;
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });
      expect(socket.sent).toHaveLength(sentBefore);
    });

    it('treats socket close without a stop event as call ended', async () => {
      const { provider, socket } = await createStartedProvider();
      const onCallEnded = jest.fn();
      provider.onCallEnded(onCallEnded);

      socket.emit('close');

      expect(onCallEnded).toHaveBeenCalledTimes(1);
      expect(provider.isActive()).toBe(false);
    });

    it('fires onCallEnded only once per call', async () => {
      const { provider, socket } = await createStartedProvider();
      const onCallEnded = jest.fn();
      provider.onCallEnded(onCallEnded);

      socket.receive(STOP_MSG);
      socket.emit('close');

      expect(onCallEnded).toHaveBeenCalledTimes(1);
    });
  });

  describe('DTMF', () => {
    it('delivers the digit from the dtmf wire shape to onDtmf', async () => {
      const { provider, socket } = await createStartedProvider();
      const onDtmf = jest.fn();
      provider.onDtmf(onDtmf);

      socket.receive(DTMF_MSG);

      expect(onDtmf).toHaveBeenCalledTimes(1);
      expect(onDtmf).toHaveBeenCalledWith('1');
    });

    it('does not throw when no dtmf callback is registered', async () => {
      const { socket } = await createStartedProvider();
      expect(() => socket.receive(DTMF_MSG)).not.toThrow();
    });
  });

  describe('Dispose', () => {
    it('detaches the socket, settles pending flushes, and resets state', async () => {
      const { provider, socket } = await createStartedProvider();
      provider.enqueue({ data: MULAW_BYTES.buffer.slice(0), timestamp: Date.now() });

      let resolved = false;
      const flushPromise = provider.flush().then(() => {
        resolved = true;
      });

      await provider.dispose();
      await flushPromise;

      expect(resolved).toBe(true);
      expect(provider.isReady()).toBe(false);
      expect(provider.getStreamSid()).toBeNull();
      expect(provider.getCallSid()).toBeNull();
      expect(socket.listenerCount('message')).toBe(0);
      expect(socket.close).not.toHaveBeenCalled();
    });

    it('resets the sequence counter across re-initialization', async () => {
      const { provider, socket, chunks } = await createStartedProvider();
      socket.receive(mediaMsg(MULAW_PAYLOAD));
      expect(chunks[0]!.sequence).toBe(0);

      await provider.dispose();
      await provider.initialize();

      const socket2 = new MockNodeSocket();
      provider.attach(socket2);
      const chunks2: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks2.push(chunk));
      socket2.receive(startMsg());
      provider.start();
      socket2.receive(mediaMsg(MULAW_PAYLOAD));

      expect(chunks2[0]!.sequence).toBe(0);
    });
  });
});
