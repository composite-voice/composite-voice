/**
 * Tests for the DiscordVoice duplex provider.
 *
 * The `@discordjs/voice` and `prism-media` peer dependencies are not
 * installed, so both are mocked as virtual modules. Tests simulate the full
 * receive path (speaking start → subscribe → Opus stream → decoder → PCM
 * chunks with stereo→mono downmix) and the playback path (enqueue →
 * flush → raw 48 kHz stereo resource → player Idle transition).
 */

import { DiscordVoice } from '../../../../src/providers/io/discord/DiscordVoice';
import type { DiscordVoiceConnection } from '../../../../src/providers/io/discord/DiscordVoice';
import { ConfigurationError } from '../../../../src/utils/errors';
import type { AudioChunk } from '../../../../src/core/types/audio';

// ─── @discordjs/voice virtual mock ─────────────────────────────────────────

const mockAudioPlayerStatus = {
  Idle: 'idle',
  Buffering: 'buffering',
  Playing: 'playing',
  AutoPaused: 'autopaused',
  Paused: 'paused',
};

const mockEndBehaviorType = { Manual: 0, AfterSilence: 1, AfterInactivity: 2 };

const mockStreamType = {
  Arbitrary: 'arbitrary',
  Raw: 'raw',
  OggOpus: 'ogg/opus',
  Opus: 'opus',
  WebmOpus: 'webm/opus',
};

interface MockPlayer {
  handlers: Map<string, Array<(...args: unknown[]) => void>>;
  emit(event: string, ...args: unknown[]): void;
  on: jest.Mock;
  play: jest.Mock;
  stop: jest.Mock;
  pause: jest.Mock;
  unpause: jest.Mock;
}

function createMockPlayer(): MockPlayer {
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    handlers,
    emit(event: string, ...args: unknown[]): void {
      for (const handler of handlers.get(event) ?? []) handler(...args);
    },
    on: jest.fn((event: string, cb: (...args: unknown[]) => void) => {
      const list = handlers.get(event) ?? [];
      list.push(cb);
      handlers.set(event, list);
    }),
    play: jest.fn(),
    stop: jest.fn().mockReturnValue(true),
    pause: jest.fn().mockReturnValue(true),
    unpause: jest.fn().mockReturnValue(true),
  };
}

let mockPlayer = createMockPlayer();
const mockCreateAudioPlayer = jest.fn(() => mockPlayer);
const mockCreateAudioResource = jest.fn((stream: unknown, options: unknown) => ({
  __resource: true,
  stream,
  options,
}));

jest.mock(
  '@discordjs/voice',
  () => ({
    createAudioPlayer: (): unknown => mockCreateAudioPlayer(),
    createAudioResource: (stream: unknown, options: unknown): unknown =>
      mockCreateAudioResource(stream, options),
    StreamType: mockStreamType,
    EndBehaviorType: mockEndBehaviorType,
    AudioPlayerStatus: mockAudioPlayerStatus,
  }),
  { virtual: true }
);

// ─── prism-media virtual mock ──────────────────────────────────────────────

class MockOpusDecoder {
  static instances: MockOpusDecoder[] = [];
  /** Simulate prism-media failing to resolve an Opus codec at construction. */
  static constructorError: Error | null = null;
  options: unknown;
  handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  destroy = jest.fn();

  constructor(options: unknown) {
    if (MockOpusDecoder.constructorError) throw MockOpusDecoder.constructorError;
    this.options = options;
    MockOpusDecoder.instances.push(this);
  }

  on(event: string, cb: (...args: unknown[]) => void): this {
    const list = this.handlers.get(event) ?? [];
    list.push(cb);
    this.handlers.set(event, list);
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) handler(...args);
  }
}

jest.mock('prism-media', () => ({ opus: { Decoder: MockOpusDecoder } }), { virtual: true });

// ─── Connection mock ───────────────────────────────────────────────────────

interface MockOpusStream {
  pipe: jest.Mock;
  destroy: jest.Mock;
  on: jest.Mock;
}

function createMockOpusStream(): MockOpusStream {
  return {
    pipe: jest.fn((dest: unknown) => dest),
    destroy: jest.fn(),
    on: jest.fn(),
  };
}

interface MockConnection extends DiscordVoiceConnection {
  speakingHandlers: Array<(userId: string) => void>;
  subscription: { unsubscribe: jest.Mock };
  opusStreams: MockOpusStream[];
}

function createMockConnection(): MockConnection {
  const speakingHandlers: Array<(userId: string) => void> = [];
  const subscription = { unsubscribe: jest.fn() };
  const opusStreams: MockOpusStream[] = [];
  return {
    speakingHandlers,
    subscription,
    opusStreams,
    receiver: {
      speaking: {
        on: jest.fn((event: string, cb: (userId: string) => void) => {
          if (event === 'start') speakingHandlers.push(cb);
        }),
        off: jest.fn((event: string, cb: (userId: string) => void) => {
          if (event === 'start') {
            const idx = speakingHandlers.indexOf(cb);
            if (idx >= 0) speakingHandlers.splice(idx, 1);
          }
        }),
      },
      subscribe: jest.fn(() => {
        const stream = createMockOpusStream();
        opusStreams.push(stream);
        return stream;
      }),
    } as unknown as DiscordVoiceConnection['receiver'],
    subscribe: jest.fn(() => subscription),
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Flush pending microtasks/timers so async flush() reaches player.play(). */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Signal that a user started speaking on the mocked connection. */
function speak(connection: MockConnection, userId: string): void {
  for (const handler of [...connection.speakingHandlers]) handler(userId);
}

/** The most recently constructed mock Opus decoder. */
function lastDecoder(): MockOpusDecoder {
  const decoder = MockOpusDecoder.instances[MockOpusDecoder.instances.length - 1];
  if (!decoder) throw new Error('no decoder constructed');
  return decoder;
}

/** Build interleaved stereo s16le bytes from [L, R, L, R, ...] samples. */
function stereoBytes(samples: number[]): Uint8Array {
  return new Uint8Array(new Int16Array(samples).buffer);
}

/** Read all data from the Readable captured by createAudioResource. */
async function readResourceStream(): Promise<Int16Array> {
  const call = mockCreateAudioResource.mock.calls[mockCreateAudioResource.mock.calls.length - 1];
  if (!call) throw new Error('createAudioResource was not called');
  const stream = call[0] as AsyncIterable<Uint8Array>;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
}

async function createProvider(
  config: ConstructorParameters<typeof DiscordVoice>[0] = {}
): Promise<{ provider: DiscordVoice; connection: MockConnection }> {
  const connection = createMockConnection();
  const provider = new DiscordVoice(config);
  await provider.initialize();
  provider.attach(connection);
  return { provider, connection };
}

describe('DiscordVoice', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlayer = createMockPlayer();
    MockOpusDecoder.instances = [];
    MockOpusDecoder.constructorError = null;
  });

  // ── Lifecycle ────────────────────────────────────────────────────

  describe('Lifecycle', () => {
    it('initializes, creates an audio player, and reports ready', async () => {
      const provider = new DiscordVoice();
      expect(provider.isReady()).toBe(false);

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
      expect(provider.type).toBe('websocket');
      expect(provider.roles).toEqual(['input', 'output']);
    });

    it('is idempotent on repeated initialize()', async () => {
      const provider = new DiscordVoice();
      await provider.initialize();
      await provider.initialize();

      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    });

    it('attaches the connection passed via config at initialize time', async () => {
      const connection = createMockConnection();
      const provider = new DiscordVoice({ connection });

      await provider.initialize();

      expect(connection.subscribe).toHaveBeenCalledWith(mockPlayer);
      expect(connection.receiver.speaking.on).toHaveBeenCalledWith('start', expect.any(Function));
      await provider.dispose();
    });

    it('dispose() detaches, stops the player, and resets state', async () => {
      const { provider, connection } = await createProvider();
      provider.start();

      await provider.dispose();

      expect(provider.isReady()).toBe(false);
      expect(provider.isActive()).toBe(false);
      expect(mockPlayer.stop).toHaveBeenCalledWith(true);
      expect(connection.subscription.unsubscribe).toHaveBeenCalled();
      expect(connection.receiver.speaking.off).toHaveBeenCalledWith('start', expect.any(Function));
    });

    it('can be re-initialized after dispose()', async () => {
      const { provider } = await createProvider();
      await provider.dispose();

      await provider.initialize();

      expect(provider.isReady()).toBe(true);
      expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);
    });

    it('dispose() settles a pending flush()', async () => {
      const { provider } = await createProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 48000, channels: 1 });
      provider.enqueue({ data: new Int16Array([1, 2]).buffer, timestamp: Date.now() });
      const pending = provider.flush();
      await tick();

      await provider.dispose();

      await expect(pending).resolves.toBeUndefined();
    });
  });

  // ── Attach / detach ──────────────────────────────────────────────

  describe('Attach and detach', () => {
    it('attach() subscribes the player and registers the speaking listener', async () => {
      const { connection } = await createProvider();

      expect(connection.subscribe).toHaveBeenCalledWith(mockPlayer);
      expect(connection.receiver.speaking.on).toHaveBeenCalledWith('start', expect.any(Function));
    });

    it('attach() with a new connection detaches the previous one', async () => {
      const { provider, connection } = await createProvider();
      const second = createMockConnection();

      provider.attach(second);

      expect(connection.subscription.unsubscribe).toHaveBeenCalled();
      expect(connection.receiver.speaking.off).toHaveBeenCalledWith('start', expect.any(Function));
      expect(second.subscribe).toHaveBeenCalledWith(mockPlayer);
    });

    it('attach() with the same connection is a no-op', async () => {
      const { provider, connection } = await createProvider();

      provider.attach(connection);

      expect(connection.subscribe).toHaveBeenCalledTimes(1);
    });

    it('detach() destroys active receive streams', async () => {
      const { provider, connection } = await createProvider();
      provider.start();
      speak(connection, 'user-1');
      const opus = connection.opusStreams[0];
      const decoder = lastDecoder();

      provider.detach();

      expect(opus?.destroy).toHaveBeenCalled();
      expect(decoder.destroy).toHaveBeenCalled();
      expect(connection.subscription.unsubscribe).toHaveBeenCalled();
    });
  });

  // ── Input: receive path ──────────────────────────────────────────

  describe('Audio capture', () => {
    it('subscribes with AfterSilence end behavior and default 1000 ms duration', async () => {
      const { provider, connection } = await createProvider();
      provider.start();

      speak(connection, 'user-1');

      expect(connection.receiver.subscribe).toHaveBeenCalledWith('user-1', {
        end: { behavior: mockEndBehaviorType.AfterSilence, duration: 1000 },
      });
    });

    it('honors a custom silenceDurationMs', async () => {
      const { provider, connection } = await createProvider({ silenceDurationMs: 500 });
      provider.start();

      speak(connection, 'user-1');

      expect(connection.receiver.subscribe).toHaveBeenCalledWith('user-1', {
        end: { behavior: mockEndBehaviorType.AfterSilence, duration: 500 },
      });
    });

    it('creates the Opus decoder with rate 48000, 2 channels, frameSize 960', async () => {
      const { provider, connection } = await createProvider();
      provider.start();

      speak(connection, 'user-1');

      expect(lastDecoder().options).toEqual({ rate: 48000, channels: 2, frameSize: 960 });
    });

    it('survives a missing Opus codec instead of crashing the process', async () => {
      // prism-media resolves its codec when the Decoder is constructed, so an
      // unbuilt @discordjs/opus throws inside the speaking handler — which runs
      // on a UDP packet, where an uncaught throw terminates the process.
      const { provider, connection } = await createProvider();
      provider.start();
      MockOpusDecoder.constructorError = new Error("Cannot find module 'opusscript'");

      expect(() => speak(connection, 'user-1')).not.toThrow();
    });

    it('destroys the subscription when the decoder cannot be created', async () => {
      const { provider, connection } = await createProvider();
      provider.start();
      MockOpusDecoder.constructorError = new Error("Cannot find module 'opusscript'");

      speak(connection, 'user-1');

      expect(connection.opusStreams[0]?.destroy).toHaveBeenCalled();
    });

    it('emits no audio and keeps working for other speakers after a codec failure', async () => {
      const { provider, connection } = await createProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();

      MockOpusDecoder.constructorError = new Error("Cannot find module 'opusscript'");
      speak(connection, 'user-1');
      expect(chunks).toHaveLength(0);

      // A later speaker still works once a codec is available.
      MockOpusDecoder.constructorError = null;
      speak(connection, 'user-2');
      lastDecoder().emit('data', stereoBytes([100, 200]));

      expect(chunks).toHaveLength(1);
    });

    it('does not throw when subscribing to a speaker fails', async () => {
      const { provider, connection } = await createProvider();
      provider.start();
      (connection.receiver.subscribe as jest.Mock).mockImplementationOnce(() => {
        throw new Error('receiver is destroyed');
      });

      expect(() => speak(connection, 'user-1')).not.toThrow();
    });

    it('emits a silence tail when a speaker stops, so STT can endpoint', async () => {
      // Discord sends no packets between utterances, so a streaming STT never
      // receives the silence it endpoints on — consecutive utterances splice
      // together into one phrase that never finalizes.
      const { provider, connection } = await createProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      speak(connection, 'user-1');
      lastDecoder().emit('data', stereoBytes([100, 200]));
      chunks.length = 0;

      lastDecoder().emit('end');

      expect(chunks).toHaveLength(1);
      const silence = new Int16Array(chunks[0]!.data);
      // 400 ms of 48 kHz mono, all zeroes.
      expect(silence).toHaveLength(19200);
      expect(silence.every((sample) => sample === 0)).toBe(true);
    });

    it('does not emit a silence tail while another speaker is still active', async () => {
      const { provider, connection } = await createProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      speak(connection, 'user-1');
      const first = lastDecoder();
      speak(connection, 'user-2');
      chunks.length = 0;

      first.emit('end');

      expect(chunks).toHaveLength(0);
    });

    it('pipes the Opus receive stream into the decoder', async () => {
      const { provider, connection } = await createProvider();
      provider.start();

      speak(connection, 'user-1');

      expect(connection.opusStreams[0]?.pipe).toHaveBeenCalledWith(lastDecoder());
    });

    it('downmixes decoded stereo PCM to mono by averaging pairs', async () => {
      const { provider, connection } = await createProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      speak(connection, 'user-1');

      // Interleaved [L, R] pairs: (100,200) (-200,-400) (32767,32767) (-32768,-32768)
      lastDecoder().emit('data', stereoBytes([100, 200, -200, -400, 32767, 32767, -32768, -32768]));

      expect(chunks).toHaveLength(1);
      const mono = new Int16Array(chunks[0]!.data);
      // (l + r) >> 1 for each pair
      expect(Array.from(mono)).toEqual([150, -300, 32767, -32768]);
    });

    it('handles decoder chunks that are views at unaligned byte offsets', async () => {
      const { provider, connection } = await createProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      speak(connection, 'user-1');

      const aligned = stereoBytes([1000, 3000]);
      const padded = new Uint8Array(aligned.byteLength + 1);
      padded.set(aligned, 1);
      const unaligned = new Uint8Array(padded.buffer, 1, aligned.byteLength);

      lastDecoder().emit('data', unaligned);

      expect(Array.from(new Int16Array(chunks[0]!.data))).toEqual([2000]);
    });

    it('stamps chunks with timestamps and increasing sequence numbers', async () => {
      const { provider, connection } = await createProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      speak(connection, 'user-1');

      lastDecoder().emit('data', stereoBytes([1, 1]));
      lastDecoder().emit('data', stereoBytes([2, 2]));

      expect(chunks[0]?.sequence).toBe(0);
      expect(chunks[1]?.sequence).toBe(1);
      expect(typeof chunks[0]?.timestamp).toBe('number');
      expect(chunks[0]!.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('ignores speaking events before start()', async () => {
      const { connection } = await createProvider();

      speak(connection, 'user-1');

      expect(connection.receiver.subscribe).not.toHaveBeenCalled();
    });

    it('drops decoded chunks while paused and resumes cleanly', async () => {
      const { provider, connection } = await createProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      speak(connection, 'user-1');

      provider.pause();
      expect(provider.isActive()).toBe(false);
      lastDecoder().emit('data', stereoBytes([5, 5]));
      expect(chunks).toHaveLength(0);

      provider.resume();
      expect(provider.isActive()).toBe(true);
      lastDecoder().emit('data', stereoBytes([6, 6]));
      expect(chunks).toHaveLength(1);
    });

    it('locks capture to config.userId when provided', async () => {
      const { provider, connection } = await createProvider({ userId: 'target-user' });
      provider.start();

      speak(connection, 'someone-else');
      expect(connection.receiver.subscribe).not.toHaveBeenCalled();

      speak(connection, 'target-user');
      expect(connection.receiver.subscribe).toHaveBeenCalledWith('target-user', expect.anything());
    });

    it('does not double-subscribe a user whose stream is still active', async () => {
      const { provider, connection } = await createProvider();
      provider.start();

      speak(connection, 'user-1');
      speak(connection, 'user-1');

      expect(connection.receiver.subscribe).toHaveBeenCalledTimes(1);
    });

    it('re-subscribes after the receive stream ends on silence', async () => {
      const { provider, connection } = await createProvider();
      provider.start();
      speak(connection, 'user-1');

      lastDecoder().emit('end');
      speak(connection, 'user-1');

      expect(connection.receiver.subscribe).toHaveBeenCalledTimes(2);
    });

    it('cleans up the subscription on decoder error', async () => {
      const { provider, connection } = await createProvider();
      provider.start();
      speak(connection, 'user-1');
      const opus = connection.opusStreams[0];

      lastDecoder().emit('error', new Error('boom'));

      expect(opus?.destroy).toHaveBeenCalled();
      // A new speaking event can re-subscribe
      speak(connection, 'user-1');
      expect(connection.receiver.subscribe).toHaveBeenCalledTimes(2);
    });

    it('stopCapture() destroys streams and gates emission without stopping playback', async () => {
      const { provider, connection } = await createProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      speak(connection, 'user-1');
      const decoder = lastDecoder();

      provider.stopCapture();

      expect(provider.isActive()).toBe(false);
      expect(decoder.destroy).toHaveBeenCalled();
      expect(mockPlayer.stop).not.toHaveBeenCalled();
      decoder.emit('data', stereoBytes([9, 9]));
      expect(chunks).toHaveLength(0);
    });

    it('getMetadata() reports linear16 mono at 48 kHz', async () => {
      const { provider } = await createProvider();

      expect(provider.getMetadata()).toEqual({
        encoding: 'linear16',
        sampleRate: 48000,
        channels: 1,
        bitDepth: 16,
      });
    });
  });

  // ── Output: playback path ────────────────────────────────────────

  describe('Playback', () => {
    it('configure() rejects non-linear16 encodings with guidance', async () => {
      const { provider } = await createProvider();

      expect(() => provider.configure({ encoding: 'mp3', sampleRate: 44100, channels: 1 })).toThrow(
        ConfigurationError
      );
      expect(() => provider.configure({ encoding: 'mp3', sampleRate: 44100, channels: 1 })).toThrow(
        /linear16/
      );
    });

    it('configure() rejects unsupported channel counts', async () => {
      const { provider } = await createProvider();

      expect(() =>
        provider.configure({ encoding: 'linear16', sampleRate: 48000, channels: 4 })
      ).toThrow(ConfigurationError);
    });

    it('flush() with an empty queue resolves without playing', async () => {
      const { provider } = await createProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 24000, channels: 1 });

      await provider.flush();

      expect(mockPlayer.play).not.toHaveBeenCalled();
      expect(mockCreateAudioResource).not.toHaveBeenCalled();
    });

    it('flush() upsamples 24 kHz mono to a 48 kHz stereo raw resource and plays it', async () => {
      const { provider } = await createProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 24000, channels: 1 });

      const samples = new Int16Array(240).fill(1000); // 10 ms at 24 kHz
      provider.enqueue({ data: samples.buffer, timestamp: Date.now() });
      const flushPromise = provider.flush();
      await tick();

      // Resource created as raw s16le PCM
      expect(mockCreateAudioResource).toHaveBeenCalledWith(expect.anything(), {
        inputType: mockStreamType.Raw,
      });
      expect(mockPlayer.play).toHaveBeenCalledWith(mockCreateAudioResource.mock.results[0]?.value);

      const pcm = await readResourceStream();
      // 240 mono samples at 24 kHz → 480 at 48 kHz → 960 interleaved stereo
      expect(pcm.length).toBe(960);
      for (let i = 0; i < pcm.length; i += 2) {
        // Constant signal survives linear interpolation (±1 for int/float round-trip)
        expect(Math.abs((pcm[i] ?? 0) - 1000)).toBeLessThanOrEqual(1);
        expect(pcm[i]).toBe(pcm[i + 1]); // left === right
      }

      mockPlayer.emit(mockAudioPlayerStatus.Playing);
      mockPlayer.emit(mockAudioPlayerStatus.Idle);
      await flushPromise;
    });

    it('flush() duplicates 48 kHz mono into both channels without altering samples', async () => {
      const { provider } = await createProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 48000, channels: 1 });

      provider.enqueue({ data: new Int16Array([10, -20, 30]).buffer, timestamp: Date.now() });
      const flushPromise = provider.flush();
      await tick();

      const pcm = await readResourceStream();
      expect(Array.from(pcm)).toEqual([10, 10, -20, -20, 30, 30]);

      mockPlayer.emit(mockAudioPlayerStatus.Idle);
      await flushPromise;
    });

    it('flush() passes 48 kHz stereo input through untouched', async () => {
      const { provider } = await createProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 48000, channels: 2 });

      provider.enqueue({
        data: new Int16Array([1, 2, 3, 4]).buffer,
        timestamp: Date.now(),
      });
      const flushPromise = provider.flush();
      await tick();

      const pcm = await readResourceStream();
      expect(Array.from(pcm)).toEqual([1, 2, 3, 4]);

      mockPlayer.emit(mockAudioPlayerStatus.Idle);
      await flushPromise;
    });

    it('flush() concatenates all queued chunks into one resource', async () => {
      const { provider } = await createProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 48000, channels: 1 });

      provider.enqueue({ data: new Int16Array([1]).buffer, timestamp: Date.now() });
      provider.enqueue({ data: new Int16Array([2]).buffer, timestamp: Date.now() });
      const flushPromise = provider.flush();
      await tick();

      const pcm = await readResourceStream();
      expect(Array.from(pcm)).toEqual([1, 1, 2, 2]);
      expect(mockPlayer.play).toHaveBeenCalledTimes(1);

      mockPlayer.emit(mockAudioPlayerStatus.Idle);
      await flushPromise;
    });

    it('flush() resolves only on the Idle state transition', async () => {
      const { provider } = await createProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 48000, channels: 1 });
      provider.enqueue({ data: new Int16Array([1, 2]).buffer, timestamp: Date.now() });

      let resolved = false;
      const flushPromise = provider.flush().then(() => {
        resolved = true;
      });
      await tick();

      expect(mockPlayer.play).toHaveBeenCalled();
      expect(resolved).toBe(false);

      mockPlayer.emit(mockAudioPlayerStatus.Playing);
      await tick();
      expect(resolved).toBe(false);

      mockPlayer.emit(mockAudioPlayerStatus.Idle);
      await flushPromise;
      expect(resolved).toBe(true);
    });

    it('flush() falls back to per-chunk metadata when configure() was not called', async () => {
      const { provider } = await createProvider();

      provider.enqueue({
        data: new Int16Array([7]).buffer,
        timestamp: Date.now(),
        metadata: { encoding: 'linear16', sampleRate: 48000, channels: 1 },
      });
      const flushPromise = provider.flush();
      await tick();

      const pcm = await readResourceStream();
      expect(Array.from(pcm)).toEqual([7, 7]);

      mockPlayer.emit(mockAudioPlayerStatus.Idle);
      await flushPromise;
    });

    it('flush() throws when no format is known', async () => {
      const { provider } = await createProvider();
      provider.enqueue({ data: new Int16Array([1]).buffer, timestamp: Date.now() });

      await expect(provider.flush()).rejects.toThrow(ConfigurationError);
    });

    it('stop() clears the queue and force-stops the player (barge-in)', async () => {
      const { provider } = await createProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 48000, channels: 1 });
      provider.enqueue({ data: new Int16Array([1]).buffer, timestamp: Date.now() });

      provider.stop();

      expect(mockPlayer.stop).toHaveBeenCalledWith(true);
      // Queue was cleared: a subsequent flush has nothing to play
      await provider.flush();
      expect(mockPlayer.play).not.toHaveBeenCalled();
    });

    it('stop() keeps capture open when it interrupts playback (barge-in)', async () => {
      const { provider, connection } = await createProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      speak(connection, 'user-1');
      provider.configure({ encoding: 'linear16', sampleRate: 48000, channels: 1 });
      provider.enqueue({ data: new Int16Array([1]).buffer, timestamp: Date.now() });

      provider.stop(); // audio queued: barge-in, capture survives

      expect(provider.isActive()).toBe(true);
      lastDecoder().emit('data', stereoBytes([4, 4]));
      expect(chunks).toHaveLength(1);
    });

    it('stop() halts capture when nothing is queued or playing', async () => {
      const { provider, connection } = await createProvider();
      const chunks: AudioChunk[] = [];
      provider.onAudio((chunk) => chunks.push(chunk));
      provider.start();
      speak(connection, 'user-1');

      provider.stop(); // idle output: acts on the input role

      expect(provider.isActive()).toBe(false);
      expect(chunks).toHaveLength(0);
    });

    it('a pending flush() settles when stop() forces the Idle transition', async () => {
      const { provider } = await createProvider();
      provider.configure({ encoding: 'linear16', sampleRate: 48000, channels: 1 });
      provider.enqueue({ data: new Int16Array([1]).buffer, timestamp: Date.now() });
      const flushPromise = provider.flush();
      await tick();

      provider.stop();
      // The real player emits Idle when stop(true) succeeds
      mockPlayer.emit(mockAudioPlayerStatus.Idle);

      await expect(flushPromise).resolves.toBeUndefined();
    });

    it('fires onPlaybackStart on Playing and onPlaybackEnd on Idle', async () => {
      const { provider } = await createProvider();
      const started = jest.fn();
      const ended = jest.fn();
      provider.onPlaybackStart(started);
      provider.onPlaybackEnd(ended);

      expect(provider.isPlaying()).toBe(false);

      mockPlayer.emit(mockAudioPlayerStatus.Playing);
      expect(started).toHaveBeenCalledTimes(1);
      expect(provider.isPlaying()).toBe(true);

      mockPlayer.emit(mockAudioPlayerStatus.Idle);
      expect(ended).toHaveBeenCalledTimes(1);
      expect(provider.isPlaying()).toBe(false);
    });

    it('does not fire onPlaybackEnd for Idle transitions that never played', async () => {
      const { provider } = await createProvider();
      const ended = jest.fn();
      provider.onPlaybackEnd(ended);

      mockPlayer.emit(mockAudioPlayerStatus.Idle);

      expect(ended).not.toHaveBeenCalled();
    });

    it('fires onPlaybackError when the player errors', async () => {
      const { provider } = await createProvider();
      const onError = jest.fn();
      provider.onPlaybackError(onError);
      const boom = new Error('resource failed');

      mockPlayer.emit('error', boom);

      expect(onError).toHaveBeenCalledWith(boom);
    });

    it('pause() only pauses the player while audio is playing', async () => {
      const { provider } = await createProvider();
      provider.start();

      provider.pause();
      expect(mockPlayer.pause).not.toHaveBeenCalled();

      mockPlayer.emit(mockAudioPlayerStatus.Playing);
      provider.pause();
      expect(mockPlayer.pause).toHaveBeenCalledTimes(1);

      provider.resume();
      expect(mockPlayer.unpause).toHaveBeenCalled();
    });
  });
});
