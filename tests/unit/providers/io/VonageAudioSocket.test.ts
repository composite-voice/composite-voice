/**
 * Tests for the VonageAudioSocket duplex provider.
 *
 * VonageAudioSocket does not open network connections itself — the app
 * attaches an accepted WebSocket — so these tests drive fake Node-`ws`-style
 * and browser-style sockets and assert the exact Vonage wire behaviour:
 * `websocket:connected` content-type parsing, binary linear16 frames in and
 * out, 20 ms paced outbound frames (fake timers), DTMF events, flush timing,
 * and stop()/barge-in clearing the pump.
 */

import { VonageAudioSocket } from '../../../../src/providers/io/vonage/VonageAudioSocket';
import { ConfigurationError } from '../../../../src/utils/errors';
import { encodeMulaw, decodeMulaw } from '../../../../src/utils/g711';
import type { AudioChunk, AudioMetadata } from '../../../../src/core/types/audio';

// --- Fake sockets -----------------------------------------------------------

type Listener = (...args: unknown[]) => void;

interface FakeNodeSocket {
  sent: unknown[];
  binaryType?: string;
  send: jest.Mock;
  on: jest.Mock;
  off: jest.Mock;
  emit(event: string, ...args: unknown[]): void;
}

/** Create a Node `ws`-style socket (`on`/`off`, `(data, isBinary)` messages). */
function createNodeSocket(): FakeNodeSocket {
  const handlers = new Map<string, Listener[]>();
  const sent: unknown[] = [];
  return {
    sent,
    binaryType: 'nodebuffer',
    send: jest.fn((data: unknown) => {
      sent.push(data);
    }),
    on: jest.fn((event: string, listener: Listener) => {
      const list = handlers.get(event) ?? [];
      list.push(listener);
      handlers.set(event, list);
    }),
    off: jest.fn((event: string, listener: Listener) => {
      const list = handlers.get(event) ?? [];
      handlers.set(
        event,
        list.filter((l) => l !== listener)
      );
    }),
    emit(event: string, ...args: unknown[]): void {
      for (const listener of [...(handlers.get(event) ?? [])]) {
        listener(...args);
      }
    },
  };
}

interface FakeBrowserSocket {
  sent: unknown[];
  binaryType?: string;
  send: jest.Mock;
  addEventListener: jest.Mock;
  removeEventListener: jest.Mock;
  emit(event: string, data?: unknown): void;
}

/** Create a browser-style socket (`addEventListener`, MessageEvent-ish). */
function createBrowserSocket(): FakeBrowserSocket {
  const handlers = new Map<string, Array<(event: { data?: unknown }) => void>>();
  const sent: unknown[] = [];
  return {
    sent,
    binaryType: 'blob',
    send: jest.fn((data: unknown) => {
      sent.push(data);
    }),
    addEventListener: jest.fn((event: string, listener: (event: { data?: unknown }) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(listener);
      handlers.set(event, list);
    }),
    removeEventListener: jest.fn((event: string, listener: (event: { data?: unknown }) => void) => {
      const list = handlers.get(event) ?? [];
      handlers.set(
        event,
        list.filter((l) => l !== listener)
      );
    }),
    emit(event: string, data?: unknown): void {
      for (const listener of [...(handlers.get(event) ?? [])]) {
        listener({ data });
      }
    },
  };
}

// --- Wire fixtures ----------------------------------------------------------

/** Send the first-message `websocket:connected` JSON text frame. */
function sendConnected(socket: FakeNodeSocket, contentType?: string): void {
  const message: Record<string, unknown> = { event: 'websocket:connected' };
  if (contentType !== undefined) {
    message['content-type'] = contentType;
  }
  socket.emit('message', JSON.stringify(message), false);
}

/** Create an ArrayBuffer of linear16 samples `start .. start+count-1`. */
function pcmBuffer(count: number, start = 0): ArrayBuffer {
  const pcm = new Int16Array(count);
  for (let i = 0; i < count; i++) pcm[i] = start + i;
  return pcm.buffer;
}

/** Wrap raw audio bytes as an AudioChunk. */
function chunk(data: ArrayBuffer, metadata?: AudioMetadata): AudioChunk {
  const result: AudioChunk = { data, timestamp: Date.now(), sequence: 0 };
  if (metadata) result.metadata = metadata;
  return result;
}

/** View a sent frame as Int16Array samples. */
function frameSamples(frame: unknown): Int16Array {
  const bytes = frame as Uint8Array;
  return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
}

/** Drain the microtask queue so async flush() chains settle. */
async function settleMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

/** Create an initialized provider attached to a fresh node socket. */
async function createAttached(
  contentType = 'audio/l16;rate=16000'
): Promise<{ provider: VonageAudioSocket; socket: FakeNodeSocket }> {
  const provider = new VonageAudioSocket();
  await provider.initialize();
  const socket = createNodeSocket();
  provider.attach(socket);
  sendConnected(socket, contentType);
  return { provider, socket };
}

describe('VonageAudioSocket', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Provider identity & lifecycle ─────────────────────────────────

  describe('Initialization', () => {
    it('declares websocket type and duplex input+output roles', () => {
      const provider = new VonageAudioSocket();
      expect(provider.type).toBe('websocket');
      expect(provider.roles).toEqual(['input', 'output']);
    });

    it('is ready after initialize and not ready after dispose', async () => {
      const provider = new VonageAudioSocket({ debug: false });
      expect(provider.isReady()).toBe(false);
      await provider.initialize();
      expect(provider.isReady()).toBe(true);
      await provider.dispose();
      expect(provider.isReady()).toBe(false);
    });

    it('can be re-initialized after dispose', async () => {
      const provider = new VonageAudioSocket();
      await provider.initialize();
      await provider.dispose();
      await provider.initialize();
      expect(provider.isReady()).toBe(true);
    });

    it('reports default 16 kHz linear16 mono metadata before any connection', () => {
      const provider = new VonageAudioSocket();
      expect(provider.getMetadata()).toEqual({
        sampleRate: 16000,
        encoding: 'linear16',
        channels: 1,
        bitDepth: 16,
        mimeType: 'audio/l16;rate=16000',
      });
    });
  });

  // ── attach() and websocket:connected ──────────────────────────────

  describe('attach() and websocket:connected', () => {
    it.each([[8000], [16000], [24000]])(
      'parses rate=%d from the connected content-type',
      async (rate) => {
        const { provider } = await createAttached(`audio/l16;rate=${rate}`);
        expect(provider.getContentType()).toBe(`audio/l16;rate=${rate}`);
        expect(provider.getMetadata().sampleRate).toBe(rate);
        expect(provider.getMetadata().encoding).toBe('linear16');
      }
    );

    it('defaults to 16000 Hz when the content-type has no rate parameter', async () => {
      const { provider } = await createAttached('audio/l16');
      expect(provider.getMetadata().sampleRate).toBe(16000);
    });

    it('defaults to 16000 Hz when the connected event has no content-type', async () => {
      const provider = new VonageAudioSocket();
      await provider.initialize();
      const socket = createNodeSocket();
      provider.attach(socket);
      sendConnected(socket);
      expect(provider.getContentType()).toBeNull();
      expect(provider.getMetadata().sampleRate).toBe(16000);
    });

    it('falls back to 16000 Hz for unsupported rates', async () => {
      const { provider } = await createAttached('audio/l16;rate=44100');
      expect(provider.getMetadata().sampleRate).toBe(16000);
    });

    it('parses the connected event when delivered as a Node Buffer text frame', async () => {
      const provider = new VonageAudioSocket();
      await provider.initialize();
      const socket = createNodeSocket();
      provider.attach(socket);
      socket.emit(
        'message',
        Buffer.from(
          JSON.stringify({ event: 'websocket:connected', 'content-type': 'audio/l16;rate=8000' })
        ),
        false
      );
      expect(provider.getMetadata().sampleRate).toBe(8000);
    });

    it('sets binaryType to arraybuffer when the socket exposes it', async () => {
      const provider = new VonageAudioSocket();
      await provider.initialize();
      const socket = createNodeSocket();
      provider.attach(socket);
      expect(socket.binaryType).toBe('arraybuffer');
    });

    it('supports browser-style addEventListener sockets', async () => {
      const provider = new VonageAudioSocket();
      await provider.initialize();
      const socket = createBrowserSocket();
      provider.attach(socket);
      socket.emit(
        'message',
        JSON.stringify({ event: 'websocket:connected', 'content-type': 'audio/l16;rate=24000' })
      );
      expect(provider.getMetadata().sampleRate).toBe(24000);

      const received: AudioChunk[] = [];
      provider.onAudio((c) => received.push(c));
      provider.start();
      const audio = pcmBuffer(160);
      socket.emit('message', audio);
      expect(received).toHaveLength(1);
      expect(new Int16Array(received[0]!.data)).toEqual(new Int16Array(audio));
    });

    it('throws ConfigurationError for a socket without event wiring', async () => {
      const provider = new VonageAudioSocket();
      await provider.initialize();
      expect(() => provider.attach({ send: jest.fn() })).toThrow(ConfigurationError);
    });

    it('detaches the previous socket when attach() is called again', async () => {
      const { provider, socket: first } = await createAttached();
      const received: AudioChunk[] = [];
      provider.onAudio((c) => received.push(c));
      provider.start();

      const second = createNodeSocket();
      provider.attach(second);
      expect(first.off).toHaveBeenCalledWith('message', expect.any(Function));
      expect(first.off).toHaveBeenCalledWith('close', expect.any(Function));

      // Frames from the old socket are ignored; the new socket delivers.
      first.emit('message', new Uint8Array(pcmBuffer(160)), true);
      expect(received).toHaveLength(0);
      sendConnected(second, 'audio/l16;rate=16000');
      second.emit('message', new Uint8Array(pcmBuffer(160)), true);
      expect(received).toHaveLength(1);
    });

    it('resets negotiation state for a new call leg', async () => {
      const { provider } = await createAttached('audio/l16;rate=8000');
      expect(provider.getMetadata().sampleRate).toBe(8000);
      const second = createNodeSocket();
      provider.attach(second);
      expect(provider.getContentType()).toBeNull();
      expect(provider.getMetadata().sampleRate).toBe(16000);
    });
  });

  // ── Inbound audio (input role) ─────────────────────────────────────

  describe('Inbound audio', () => {
    it('emits binary frames as AudioChunks with timestamps and sequences', async () => {
      const { provider, socket } = await createAttached();
      const received: AudioChunk[] = [];
      provider.onAudio((c) => received.push(c));
      provider.start();
      expect(provider.isActive()).toBe(true);

      const frame1 = pcmBuffer(320, 0);
      const frame2 = pcmBuffer(320, 1000);
      socket.emit('message', new Uint8Array(frame1), true);
      socket.emit('message', new Uint8Array(frame2), true);

      expect(received).toHaveLength(2);
      expect(new Int16Array(received[0]!.data)).toEqual(new Int16Array(frame1));
      expect(new Int16Array(received[1]!.data)).toEqual(new Int16Array(frame2));
      expect(received[0]!.sequence).toBe(0);
      expect(received[1]!.sequence).toBe(1);
      expect(typeof received[0]!.timestamp).toBe('number');
      expect(received[0]!.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('copies Node Buffer frames into standalone ArrayBuffers', async () => {
      const { provider, socket } = await createAttached();
      const received: AudioChunk[] = [];
      provider.onAudio((c) => received.push(c));
      provider.start();

      // A Buffer view into a larger pool must yield only the view's bytes.
      const pool = new Uint8Array(1000).fill(7);
      const view = Buffer.from(pool.buffer, 100, 4);
      view.set([1, 2, 3, 4]);
      socket.emit('message', view, true);

      expect(received).toHaveLength(1);
      expect(received[0]!.data.byteLength).toBe(4);
      expect(Array.from(new Uint8Array(received[0]!.data))).toEqual([1, 2, 3, 4]);
    });

    it('drops frames before start(), while paused, and resumes cleanly', async () => {
      const { provider, socket } = await createAttached();
      const received: AudioChunk[] = [];
      provider.onAudio((c) => received.push(c));

      socket.emit('message', new Uint8Array(pcmBuffer(160)), true);
      expect(received).toHaveLength(0); // not started

      provider.start();
      provider.pause();
      expect(provider.isActive()).toBe(false);
      socket.emit('message', new Uint8Array(pcmBuffer(160)), true);
      expect(received).toHaveLength(0); // paused

      provider.resume();
      socket.emit('message', new Uint8Array(pcmBuffer(160)), true);
      expect(received).toHaveLength(1);
    });

    it('does not emit text frames as audio', async () => {
      const { provider, socket } = await createAttached();
      const received: AudioChunk[] = [];
      provider.onAudio((c) => received.push(c));
      provider.start();
      socket.emit('message', JSON.stringify({ event: 'websocket:dtmf', digit: '1' }), false);
      expect(received).toHaveLength(0);
    });

    it('stops emitting after the socket closes (remote hangup)', async () => {
      const { provider, socket } = await createAttached();
      const received: AudioChunk[] = [];
      provider.onAudio((c) => received.push(c));
      provider.start();
      socket.emit('close');
      socket.emit('message', new Uint8Array(pcmBuffer(160)), true);
      expect(received).toHaveLength(0);
      expect(provider.isActive()).toBe(false);
    });
  });

  // ── DTMF ───────────────────────────────────────────────────────────

  describe('DTMF', () => {
    it('forwards websocket:dtmf events with digit and duration', async () => {
      const { provider, socket } = await createAttached();
      const dtmf = jest.fn();
      provider.onDtmf(dtmf);
      socket.emit(
        'message',
        JSON.stringify({ event: 'websocket:dtmf', digit: '5', duration: 260 }),
        false
      );
      expect(dtmf).toHaveBeenCalledTimes(1);
      expect(dtmf).toHaveBeenCalledWith('5', 260);
    });

    it('forwards DTMF without duration as undefined', async () => {
      const { provider, socket } = await createAttached();
      const dtmf = jest.fn();
      provider.onDtmf(dtmf);
      socket.emit('message', JSON.stringify({ event: 'websocket:dtmf', digit: '#' }), false);
      expect(dtmf).toHaveBeenCalledWith('#', undefined);
    });
  });

  // ── Outbound audio (output role) ───────────────────────────────────

  describe('Outbound audio pacing', () => {
    it('sends 640-byte 20 ms frames at 16 kHz, paced every 20 ms', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached('audio/l16;rate=16000');
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });

      provider.enqueue(chunk(pcmBuffer(640))); // 1280 bytes = 2 frames
      expect(socket.sent).toHaveLength(0); // nothing before the first tick

      jest.advanceTimersByTime(19);
      expect(socket.sent).toHaveLength(0);

      jest.advanceTimersByTime(1); // t = 20 ms
      expect(socket.sent).toHaveLength(1);
      expect((socket.sent[0] as Uint8Array).byteLength).toBe(640);
      expect(frameSamples(socket.sent[0])).toEqual(new Int16Array(pcmBuffer(320, 0)));

      jest.advanceTimersByTime(20); // t = 40 ms
      expect(socket.sent).toHaveLength(2);
      expect(frameSamples(socket.sent[1])).toEqual(new Int16Array(pcmBuffer(320, 320)));
    });

    it('uses the negotiated rate for frame sizing (8 kHz -> 320 bytes)', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached('audio/l16;rate=8000');
      provider.configure({ encoding: 'linear16', sampleRate: 8000, channels: 1, bitDepth: 16 });
      provider.enqueue(chunk(pcmBuffer(160))); // exactly one 20 ms frame
      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(1);
      expect((socket.sent[0] as Uint8Array).byteLength).toBe(320);
    });

    it('fires onPlaybackStart on the first frame and onPlaybackEnd when drained', async () => {
      jest.useFakeTimers();
      const { provider } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      const started = jest.fn();
      const ended = jest.fn();
      provider.onPlaybackStart(started);
      provider.onPlaybackEnd(ended);

      provider.enqueue(chunk(pcmBuffer(640))); // 2 frames
      expect(provider.isPlaying()).toBe(false);

      jest.advanceTimersByTime(20);
      expect(started).toHaveBeenCalledTimes(1);
      expect(provider.isPlaying()).toBe(true);

      jest.advanceTimersByTime(20); // second frame
      expect(started).toHaveBeenCalledTimes(1); // not re-fired mid-response
      expect(ended).not.toHaveBeenCalled();

      jest.advanceTimersByTime(20); // drain tick
      expect(ended).toHaveBeenCalledTimes(1);
      expect(provider.isPlaying()).toBe(false);
    });

    it('holds a partial tail frame until flush(), then sends it zero-padded', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });

      provider.enqueue(chunk(pcmBuffer(350))); // 700 bytes = 1 frame + 60 bytes
      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(1); // full frame goes out

      // Partial tail waits for more audio while the response is streaming.
      jest.advanceTimersByTime(200);
      expect(socket.sent).toHaveLength(1);

      void provider.flush(); // marks end of response
      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(2);
      const tail = frameSamples(socket.sent[1]);
      expect(tail).toHaveLength(320);
      expect(Array.from(tail.subarray(0, 30))).toEqual(
        Array.from(new Int16Array(pcmBuffer(30, 320)))
      );
      expect(Array.from(tail.subarray(30))).toEqual(new Array(290).fill(0)); // zero padding
    });

    it('coalesces small enqueues into full frames', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });

      provider.enqueue(chunk(pcmBuffer(50, 0))); // 100 bytes
      jest.advanceTimersByTime(100);
      expect(socket.sent).toHaveLength(0); // below one frame, no flush yet

      provider.enqueue(chunk(pcmBuffer(270, 50))); // now exactly 640 bytes
      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(1);
      expect(frameSamples(socket.sent[0])).toEqual(new Int16Array(pcmBuffer(320, 0)));
    });

    it('starts draining audio that was enqueued before the socket attached', async () => {
      jest.useFakeTimers();
      const provider = new VonageAudioSocket();
      await provider.initialize();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      provider.enqueue(chunk(pcmBuffer(320)));

      jest.advanceTimersByTime(100); // no socket: nothing happens

      const socket = createNodeSocket();
      provider.attach(socket);
      sendConnected(socket, 'audio/l16;rate=16000');
      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(1);
    });
  });

  describe('Outbound format conversion', () => {
    it('resamples linear16 TTS audio to the negotiated rate (8 kHz -> 16 kHz)', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached('audio/l16;rate=16000');
      provider.configure({ encoding: 'linear16', sampleRate: 8000, channels: 1, bitDepth: 16 });

      // -16384 = -0.5 exactly, surviving the int16 -> float -> int16 round trip
      const constant = new Int16Array(160).fill(-16384); // 20 ms at 8 kHz
      provider.enqueue(chunk(constant.buffer));
      jest.advanceTimersByTime(20);

      expect(socket.sent).toHaveLength(1);
      const samples = frameSamples(socket.sent[0]);
      expect(samples).toHaveLength(320); // upsampled to 20 ms at 16 kHz
      expect(Array.from(samples)).toEqual(new Array(320).fill(-16384));
    });

    it('decodes mulaw TTS audio via G.711 before sending', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached('audio/l16;rate=8000');
      provider.configure({ encoding: 'mulaw', sampleRate: 8000, channels: 1 });

      const pcm = new Int16Array(160).fill(1000);
      const mulaw = encodeMulaw(pcm);
      provider.enqueue(chunk(mulaw.buffer as ArrayBuffer));
      jest.advanceTimersByTime(20);

      expect(socket.sent).toHaveLength(1);
      expect(frameSamples(socket.sent[0])).toEqual(decodeMulaw(mulaw));
    });

    it('assumes linear16 at the negotiated rate when nothing is configured', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached('audio/l16;rate=16000');
      provider.enqueue(chunk(pcmBuffer(320)));
      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(1);
      expect(frameSamples(socket.sent[0])).toEqual(new Int16Array(pcmBuffer(320)));
    });

    it('honours per-chunk metadata over configure()', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached('audio/l16;rate=8000');
      provider.configure({ encoding: 'linear16', sampleRate: 8000, channels: 1, bitDepth: 16 });

      const pcm = new Int16Array(320).fill(-16384); // 20 ms at 16 kHz
      provider.enqueue(
        chunk(pcm.buffer, { encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 })
      );
      jest.advanceTimersByTime(20);

      expect(socket.sent).toHaveLength(1);
      const samples = frameSamples(socket.sent[0]);
      expect(samples).toHaveLength(160); // downsampled to 20 ms at 8 kHz
      expect(Array.from(samples)).toEqual(new Array(160).fill(-16384));
    });

    it('truncates an odd trailing byte from linear16 chunks', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      provider.enqueue(chunk(new ArrayBuffer(641)));
      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(1);
      expect((socket.sent[0] as Uint8Array).byteLength).toBe(640);
    });

    it('rejects compressed encodings in configure() with TTS guidance', async () => {
      const { provider } = await createAttached();
      expect(() => provider.configure({ encoding: 'mp3', sampleRate: 24000, channels: 1 })).toThrow(
        ConfigurationError
      );
      expect(() =>
        provider.configure({ encoding: 'opus', sampleRate: 48000, channels: 1 })
      ).toThrow(/DeepgramTTS\(\{ encoding: 'linear16', sampleRate: 16000 \}\)/);
    });

    it('rejects non-mono TTS audio in configure()', async () => {
      const { provider } = await createAttached();
      expect(() =>
        provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 2, bitDepth: 16 })
      ).toThrow(ConfigurationError);
    });

    it('reports unsupported per-chunk encodings via onPlaybackError without throwing', async () => {
      const { provider, socket } = await createAttached();
      const onError = jest.fn();
      provider.onPlaybackError(onError);
      expect(() =>
        provider.enqueue(
          chunk(new ArrayBuffer(64), { encoding: 'mp3', sampleRate: 24000, channels: 1 })
        )
      ).not.toThrow();
      expect(onError).toHaveBeenCalledWith(expect.any(ConfigurationError));
      expect(socket.sent).toHaveLength(0);
    });
  });

  describe('flush()', () => {
    it('resolves immediately when nothing is queued or playing', async () => {
      const { provider } = await createAttached();
      await expect(provider.flush()).resolves.toBeUndefined();
    });

    it('resolves one tick after the final frame (total queued duration)', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      provider.enqueue(chunk(pcmBuffer(640))); // 2 frames = 40 ms of audio

      let resolved = false;
      void provider.flush().then(() => {
        resolved = true;
      });

      await jest.advanceTimersByTimeAsync(40); // both frames sent
      expect(socket.sent).toHaveLength(2);
      expect(resolved).toBe(false); // last frame still playing out

      await jest.advanceTimersByTimeAsync(20); // drain tick
      expect(resolved).toBe(true);
    });
  });

  describe('stop() — barge-in', () => {
    it('clears the pump: no further frames are sent after stop()', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      provider.enqueue(chunk(pcmBuffer(1600))); // 5 frames

      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(1);

      provider.stop();
      jest.advanceTimersByTime(200);
      expect(socket.sent).toHaveLength(1); // queue and pump cleared
      expect(provider.isPlaying()).toBe(false);
    });

    it('settles a pending flush and fires onPlaybackEnd', async () => {
      jest.useFakeTimers();
      const { provider } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      const ended = jest.fn();
      provider.onPlaybackEnd(ended);
      provider.enqueue(chunk(pcmBuffer(1600)));

      let resolved = false;
      void provider.flush().then(() => {
        resolved = true;
      });
      await jest.advanceTimersByTimeAsync(20);

      provider.stop();
      await settleMicrotasks();
      expect(resolved).toBe(true);
      expect(ended).toHaveBeenCalledTimes(1);
    });

    it('allows new audio to play after stop()', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      provider.enqueue(chunk(pcmBuffer(1600)));
      jest.advanceTimersByTime(20);
      provider.stop();

      provider.enqueue(chunk(pcmBuffer(320, 9000)));
      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(2);
      expect(frameSamples(socket.sent[1])).toEqual(new Int16Array(pcmBuffer(320, 9000)));
    });

    it('keeps inbound capture alive when stop() interrupts playback (barge-in)', async () => {
      const { provider, socket } = await createAttached();
      const received: AudioChunk[] = [];
      provider.onAudio((c) => received.push(c));
      provider.start();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      provider.enqueue(chunk(pcmBuffer(1600)));

      provider.stop(); // CompositeVoice calls output.stop() on barge-in
      expect(provider.isActive()).toBe(true);
      socket.emit('message', new Uint8Array(pcmBuffer(160)), true);
      expect(received).toHaveLength(1);
    });

    it('halts inbound emission when stop() is called with nothing playing', async () => {
      const { provider, socket } = await createAttached();
      const received: AudioChunk[] = [];
      provider.onAudio((c) => received.push(c));
      provider.start();

      provider.stop(); // CompositeVoice calls input.stop() in stopListening()
      expect(provider.isActive()).toBe(false);
      socket.emit('message', new Uint8Array(pcmBuffer(160)), true);
      expect(received).toHaveLength(0);
    });
  });

  describe('Duplex pause semantics', () => {
    it('pause() gates input only — outbound frames keep flowing', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      provider.start();
      provider.pause(); // turn-taking pauses input, then awaits output.flush()

      provider.enqueue(chunk(pcmBuffer(320)));
      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(1); // playback unaffected by input pause
    });
  });

  // ── Hangup, detach, dispose ────────────────────────────────────────

  describe('Hangup and cleanup', () => {
    it('socket close settles pending flush and ends playback', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      const ended = jest.fn();
      provider.onPlaybackEnd(ended);
      provider.enqueue(chunk(pcmBuffer(1600)));

      let resolved = false;
      void provider.flush().then(() => {
        resolved = true;
      });
      await jest.advanceTimersByTimeAsync(20);

      socket.emit('close');
      await settleMicrotasks();
      expect(resolved).toBe(true);
      expect(ended).toHaveBeenCalledTimes(1);
      expect(provider.isPlaying()).toBe(false);

      jest.advanceTimersByTime(200);
      expect(socket.sent).toHaveLength(1); // pump cleared
    });

    it('detach() removes listeners, stops the pump, and is safe to call twice', async () => {
      jest.useFakeTimers();
      const { provider, socket } = await createAttached();
      provider.configure({ encoding: 'linear16', sampleRate: 16000, channels: 1, bitDepth: 16 });
      provider.enqueue(chunk(pcmBuffer(1600)));
      jest.advanceTimersByTime(20);
      expect(socket.sent).toHaveLength(1);

      provider.detach();
      provider.detach(); // idempotent
      expect(socket.off).toHaveBeenCalledWith('message', expect.any(Function));
      jest.advanceTimersByTime(200);
      expect(socket.sent).toHaveLength(1);
    });

    it('dispose() clears callbacks and state', async () => {
      const { provider, socket } = await createAttached();
      const received: AudioChunk[] = [];
      provider.onAudio((c) => received.push(c));
      provider.start();

      await provider.dispose();
      socket.emit('message', new Uint8Array(pcmBuffer(160)), true);
      expect(received).toHaveLength(0);
      expect(provider.isReady()).toBe(false);
      expect(provider.getContentType()).toBeNull();
    });
  });
});
