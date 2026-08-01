/**
 * Discord voice-channel duplex provider built on `@discordjs/voice`.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link DiscordVoice} class, a duplex
 * (`'input'` + `'output'`) provider that connects the CompositeVoice pipeline
 * to a Discord voice channel. The application owns the discord.js client and
 * joins the channel with `joinVoiceChannel()`; the resulting `VoiceConnection`
 * is handed to the provider via {@link DiscordVoiceConfig.connection} or
 * {@link DiscordVoice.attach | attach()}.
 *
 * The provider is server-side only (it relies on Node streams and the
 * `@discordjs/voice` / `prism-media` peer dependencies, which are loaded
 * dynamically at {@link DiscordVoice.initialize | initialize()} time).
 *
 * **Data-flow diagram:**
 *
 * ```
 *              Discord voice channel
 *                 │            ▲
 *      Opus packets (48k/2ch)  │ raw PCM (48k/2ch, s16le)
 *                 │            │
 *                 ▼            │
 *      receiver.subscribe()  AudioPlayer(StreamType.Raw)
 *                 │            ▲
 *        prism opus.Decoder    │ resample + mono→stereo
 *                 │            │
 *      stereo→mono downmix   flush(): queued TTS chunks
 *                 │            ▲
 *                 ▼            │
 * ──onAudio()──> InputQueue ─> [STT] ─> [LLM] ─> [TTS] ─> OutputQueue ──enqueue()──┘
 * ```
 *
 * Captured audio is emitted as linear16 PCM at 48 kHz mono. Playback accepts
 * linear16 PCM at any sample rate (mono or stereo) and converts it to the
 * 48 kHz stereo s16le PCM Discord requires.
 *
 * @example
 * ```typescript
 * import { Client, GatewayIntentBits } from 'discord.js';
 * import { joinVoiceChannel } from '@discordjs/voice';
 * import { CompositeVoice, DiscordVoice, DeepgramSTT, AnthropicLLM, DeepgramTTS } from 'composite-voice';
 *
 * const discord = new DiscordVoice({ silenceDurationMs: 1000 });
 *
 * const agent = new CompositeVoice({
 *   providers: [
 *     discord,
 *     new DeepgramSTT({ apiKey: process.env.DEEPGRAM_API_KEY }),
 *     new AnthropicLLM({ apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-haiku-4-5' }),
 *     new DeepgramTTS({ apiKey: process.env.DEEPGRAM_API_KEY, encoding: 'linear16', sampleRate: 24000 }),
 *   ],
 * });
 *
 * const connection = joinVoiceChannel({
 *   channelId, guildId, adapterCreator: guild.voiceAdapterCreator,
 *   selfDeaf: false, // required to receive audio
 * });
 * discord.attach(connection);
 *
 * await agent.initialize();
 * await agent.startListening();
 * ```
 *
 * @see {@link DiscordVoice} for the provider class
 * @see {@link AudioInputProvider} and {@link AudioOutputProvider} for the contracts
 */

import type { AudioChunk, AudioMetadata } from '../../../core/types/audio';
import type {
  AudioInputProvider,
  AudioOutputProvider,
  ProviderType,
} from '../../../core/types/providers';
import type { ProviderRole } from '../../../core/types/roles';
import {
  concatenateArrayBuffers,
  floatTo16BitPCM,
  int16ToFloat,
  resamplePcm,
} from '../../../utils/audio';
import { ConfigurationError } from '../../../utils/errors';
import { importPeerDep } from '../../../utils/importPeerDep';
import { Logger } from '../../../utils/logger';

/** Sample rate Discord voice uses for both capture and playback. @internal */
const DISCORD_SAMPLE_RATE = 48000;

/** Channel count of decoded Discord voice audio (interleaved stereo). @internal */
const DISCORD_CHANNELS = 2;

/** Opus frame size for 20 ms of audio at 48 kHz. @internal */
const OPUS_FRAME_SIZE = 960;

/**
 * Milliseconds of silence emitted after a speaker's stream ends.
 *
 * @remarks
 * Discord delivers audio only while someone is actually speaking — between
 * utterances no packets arrive at all. Streaming STT providers endpoint on
 * *received* silence, so without this a pause reaches them as nothing, and
 * consecutive utterances arrive spliced together as one continuous phrase
 * that never finalizes. Telephony inputs never hit this because a phone line
 * streams silence continuously.
 *
 * Long enough to clear the endpointing thresholds of the streaming STT
 * providers this SDK ships, short enough not to add noticeable turn latency.
 * @internal
 */
const SILENCE_TAIL_MS = 400;

// ─── Structural types for the (uninstalled) peer dependencies ─────────────
//
// The `@discordjs/voice` and `prism-media` packages are optional peer
// dependencies loaded dynamically at initialize() time, so their types are
// not available at compile time. These interfaces describe just the surface
// this provider calls. They are intentionally minimal and duck-typed — any
// object with these members (including test mocks) is accepted.

/**
 * Structural subset of `@discordjs/voice`'s `SpeakingMap`.
 *
 * @remarks
 * Emits `'start'` with the Discord user id whenever a user begins speaking.
 * See the `@discordjs/voice` documentation for the full class.
 */
export interface DiscordSpeakingMap {
  /** Register a listener for a speaking event. */
  on(event: 'start', listener: (userId: string) => void): unknown;
  /** Remove a previously registered listener. */
  off(event: 'start', listener: (userId: string) => void): unknown;
}

/**
 * Structural subset of `@discordjs/voice`'s `AudioReceiveStream` — a Node
 * `Readable` of Opus packets for a single speaking user.
 *
 * @remarks
 * Returned by {@link DiscordVoiceReceiver.subscribe}. The provider pipes it
 * through a `prism-media` Opus decoder to obtain PCM audio.
 */
export interface DiscordAudioReceiveStream {
  /**
   * Pipe the Opus packets into a destination stream (the Opus decoder).
   *
   * @remarks
   * Deliberately typed as a loose function member: Node's `Readable.pipe`
   * constrains its generic to `NodeJS.WritableStream`, which a stricter
   * structural signature here cannot mirror without dragging `@types/node`
   * into the SDK's public types — and a mismatch makes a real
   * `AudioReceiveStream` unassignable to this interface. The provider
   * ignores the return value.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipe: (...args: any[]) => unknown;
  /** Destroy the stream, ending the subscription. */
  destroy(error?: Error): unknown;
  /** Register a stream event listener (e.g. `'error'`). */
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

/**
 * Structural subset of `@discordjs/voice`'s `VoiceReceiver`.
 *
 * @remarks
 * Obtained from {@link DiscordVoiceConnection.receiver}. `subscribe()` creates
 * a per-user Opus stream; `speaking` notifies when users start talking.
 */
export interface DiscordVoiceReceiver {
  /** Speaking-state tracker for users in the channel. */
  speaking: DiscordSpeakingMap;
  /**
   * Create an Opus packet subscription for the given user id.
   *
   * @param userId - Discord user id to receive audio from
   * @param options - End-behavior options (`{ end: { behavior, duration } }`)
   */
  subscribe(
    userId: string,
    options?: { end?: { behavior: number; duration?: number } }
  ): DiscordAudioReceiveStream;
}

/**
 * Structural subset of `@discordjs/voice`'s `AudioPlayer`.
 *
 * @remarks
 * Created internally via `createAudioPlayer()` during
 * {@link DiscordVoice.initialize | initialize()}.
 */
export interface DiscordAudioPlayerLike {
  /** Play a new audio resource, replacing any existing one. */
  play(resource: unknown): void;
  /** Stop playback. `force: true` skips silence padding frames. */
  stop(force?: boolean): boolean;
  /** Pause playback. */
  pause(interpolateSilence?: boolean): boolean;
  /** Resume paused playback. */
  unpause(): boolean;
  /** Register a listener for player events (status names, `'error'`). */
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

/**
 * Structural subset of `@discordjs/voice`'s `VoiceConnection`.
 *
 * @remarks
 * The application creates this with `joinVoiceChannel()` from
 * `@discordjs/voice` and passes it to the provider via
 * {@link DiscordVoiceConfig.connection} or {@link DiscordVoice.attach}.
 * Join with `selfDeaf: false` — a self-deafened bot receives no audio.
 */
export interface DiscordVoiceConnection {
  /** Audio receiver for the connection. */
  receiver: DiscordVoiceReceiver;
  /**
   * Subscribe an audio player to this connection so its audio is played
   * into the channel. Returns a subscription handle, if accepted.
   */
  subscribe(player: DiscordAudioPlayerLike): { unsubscribe(): void } | undefined;
}

/**
 * Structural subset of the `@discordjs/voice` module surface used by
 * {@link DiscordVoice}.
 *
 * @internal
 */
interface DiscordVoiceModule {
  /** Create an audio player for playback into voice connections. */
  createAudioPlayer(): DiscordAudioPlayerLike;
  /** Wrap a stream in a playable audio resource. */
  createAudioResource(input: unknown, options?: { inputType?: string }): unknown;
  /** Stream type enum; `Raw` = s16le PCM at 48 kHz stereo. */
  StreamType: { Raw: string };
  /** Receive-stream end behavior enum. */
  EndBehaviorType: { AfterSilence: number };
  /** Audio player status names, usable as event names on the player. */
  AudioPlayerStatus: { Idle: string; Playing: string };
}

/**
 * Structural subset of a `prism-media` Opus decoder stream (a Node
 * `Transform`): Opus packets in, interleaved s16le PCM out.
 *
 * @internal
 */
interface PrismOpusDecoderStream {
  /** PCM output chunks (interleaved stereo s16le). */
  on(event: 'data', listener: (chunk: Uint8Array) => void): unknown;
  /** Stream end (upstream Opus subscription closed after silence). */
  on(event: 'end' | 'close', listener: () => void): unknown;
  /** Decoder error. */
  on(event: 'error', listener: (error: Error) => void): unknown;
  /** Destroy the decoder stream. */
  destroy(): unknown;
}

/**
 * Structural subset of the `prism-media` module surface used by
 * {@link DiscordVoice}.
 *
 * @internal
 */
interface PrismModule {
  opus: {
    Decoder: new (options: {
      rate: number;
      channels: number;
      frameSize: number;
    }) => PrismOpusDecoderStream;
  };
}

/**
 * Structural subset of `node:stream` used to build the playback stream.
 *
 * @internal
 */
interface NodeStreamModule {
  Readable: { from(iterable: Iterable<unknown>): unknown };
}

/** Book-keeping for one active per-user receive subscription. @internal */
interface ActiveReceiveStream {
  opus: DiscordAudioReceiveStream;
  decoder: PrismOpusDecoderStream;
}

/**
 * Configuration options for the {@link DiscordVoice} provider.
 *
 * @remarks
 * There is no `apiKey` — authentication is handled entirely by the
 * discord.js client the application owns. The provider only needs the
 * already-authenticated `VoiceConnection`.
 *
 * @example
 * ```typescript
 * const discord = new DiscordVoice({
 *   userId: '187642154529521664', // optional: lock capture to one speaker
 *   silenceDurationMs: 1000,
 *   debug: true,
 * });
 * ```
 *
 * @see {@link DiscordVoice} for the provider class
 */
export interface DiscordVoiceConfig {
  /**
   * Voice connection to attach at initialize time.
   *
   * @remarks
   * Alternatively call {@link DiscordVoice.attach | attach()} later — useful
   * when the bot joins the channel after the pipeline is initialized.
   */
  connection?: DiscordVoiceConnection;

  /**
   * Lock audio capture to a single Discord user id.
   *
   * @remarks
   * When omitted, the provider subscribes to **every** user who speaks.
   * Overlapping speech from multiple users interleaves in the emitted
   * chunk stream (no mixing is performed), which can confuse STT — set
   * `userId` for one-on-one conversations.
   */
  userId?: string;

  /**
   * Milliseconds of silence after which a user's receive stream ends.
   *
   * @remarks
   * Passed to `receiver.subscribe()` as
   * `{ end: { behavior: EndBehaviorType.AfterSilence, duration } }`.
   * The provider automatically re-subscribes the next time the user speaks.
   *
   * @defaultValue 1000
   */
  silenceDurationMs?: number;

  /**
   * Whether to enable debug logging for this provider.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

/**
 * Duplex Discord voice-channel provider (`'input'` + `'output'`).
 *
 * @remarks
 * `DiscordVoice` captures speech from users in a Discord voice channel and
 * plays synthesized speech back into it, implementing both
 * {@link AudioInputProvider} and {@link AudioOutputProvider} in one class.
 *
 * **Input:** the connection's receiver notifies when a user starts speaking
 * (`receiver.speaking.on('start')`); the provider subscribes to that user's
 * Opus packet stream (ending after {@link DiscordVoiceConfig.silenceDurationMs}
 * of silence), decodes it with `prism-media` (`rate: 48000, channels: 2,
 * frameSize: 960`), downmixes interleaved stereo to mono by averaging each
 * left/right pair, and emits linear16 mono 48 kHz {@link AudioChunk}s.
 *
 * **Output:** TTS chunks are queued by {@link DiscordVoice.enqueue | enqueue()}.
 * {@link DiscordVoice.flush | flush()} concatenates the queue, converts it to
 * 48 kHz stereo s16le PCM (linear-interpolation resampling for other rates,
 * mono duplicated into both channels), wraps it in an audio resource with
 * `StreamType.Raw`, and plays it via a shared `AudioPlayer`. `flush()` resolves
 * when the player transitions back to `AudioPlayerStatus.Idle`. Because the
 * audio is fed as raw PCM, no ffmpeg is required.
 *
 * **Duplex `stop()` semantics:** a duplex provider has a single `stop()`
 * serving both role interfaces. `DiscordVoice.stop()` implements the *output*
 * contract (barge-in): it clears queued audio and calls `player.stop(true)`,
 * leaving capture running so the interrupting user is still heard. To end
 * capture, call {@link DiscordVoice.stopCapture | stopCapture()},
 * {@link DiscordVoice.detach | detach()}, or
 * {@link DiscordVoice.dispose | dispose()}. Likewise `pause()`/`resume()`
 * primarily gate input emission (the turn-taking system uses them to mute
 * capture during agent speech); `pause()` only pauses the player when audio
 * is actually playing.
 *
 * **Data-flow diagram:**
 *
 * ```
 * speaking('start', userId)
 *        │
 *        ▼
 * receiver.subscribe(userId) ──Opus──> prism opus.Decoder ──PCM 48k/2ch──┐
 *                                                                        │
 *              onAudio(chunk: linear16 48k mono) <──stereo→mono downmix──┘
 *
 * enqueue(chunk) ─> queue ─flush()─> 48k stereo s16le ─> createAudioResource(Raw)
 *                                                              │
 *                              player.play(resource) <─────────┘
 *                                    │
 *                    AudioPlayerStatus.Idle ─> flush() resolves, onPlaybackEnd
 * ```
 *
 * @example
 * ```typescript
 * import { DiscordVoice } from 'composite-voice';
 * import { joinVoiceChannel } from '@discordjs/voice';
 *
 * const discord = new DiscordVoice({ debug: true });
 * await discord.initialize();
 *
 * discord.attach(joinVoiceChannel({
 *   channelId, guildId, adapterCreator: guild.voiceAdapterCreator,
 *   selfDeaf: false,
 * }));
 *
 * discord.onAudio((chunk) => {
 *   console.log(`captured ${chunk.data.byteLength} bytes`);
 * });
 * discord.start();
 * ```
 *
 * @see {@link DiscordVoiceConfig} for configuration options
 * @see {@link AudioInputProvider} and {@link AudioOutputProvider} for the contracts
 */
export class DiscordVoice implements AudioInputProvider, AudioOutputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `'websocket'` — the provider operates over Discord's persistent
   * voice gateway connection (owned by the attached `VoiceConnection`).
   */
  public readonly type: ProviderType = 'websocket';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `DiscordVoice` is a duplex provider covering both the `'input'` and
   * `'output'` slots. Separate STT, LLM, and TTS providers are still required.
   */
  public readonly roles: readonly ProviderRole[] = ['input', 'output'];

  /** Provider configuration captured at construction time. */
  private readonly config: DiscordVoiceConfig;

  /** Scoped logger (enabled via `config.debug`). */
  private readonly logger: Logger;

  /** Milliseconds of silence before a per-user receive stream ends. */
  private readonly silenceDurationMs: number;

  /** Whether {@link initialize} has completed. */
  private initialized = false;

  /** Dynamically imported `@discordjs/voice` module surface. */
  private voice: DiscordVoiceModule | null = null;

  /** Dynamically imported `prism-media` module surface. */
  private prism: PrismModule | null = null;

  /** Attached voice connection (from the application's discord.js client). */
  private connection: DiscordVoiceConnection | null = null;

  /** Shared audio player used for playback into the connection. */
  private player: DiscordAudioPlayerLike | null = null;

  /** Player subscription handle for the attached connection. */
  private subscription: { unsubscribe(): void } | null = null;

  /** Bound speaking-start handler (kept for removal on detach). */
  private speakingHandler: ((userId: string) => void) | null = null;

  // ── Input state ──────────────────────────────────────────────────

  /** Whether input capture has been started. */
  private started = false;

  /** Whether input emission is paused. */
  private paused = false;

  /** Registered callback for captured audio chunks. */
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;

  /** Monotonically increasing sequence number for emitted chunks. */
  private sequenceNumber = 0;

  /** Active per-user receive subscriptions, keyed by Discord user id. */
  private readonly activeStreams = new Map<string, ActiveReceiveStream>();

  // ── Output state ─────────────────────────────────────────────────

  /** Audio format of incoming TTS chunks (set by {@link configure}). */
  private outputMetadata: AudioMetadata | null = null;

  /** Chunks queued for the next {@link flush}. */
  private outputQueue: AudioChunk[] = [];

  /** Whether the player is currently delivering audio. */
  private playing = false;

  /** Resolvers for in-flight {@link flush} calls (settled on player Idle). */
  private pendingFlushes: Array<() => void> = [];

  /** Registered playback-start callback. */
  private playbackStartCallback: (() => void) | null = null;

  /** Registered playback-end callback. */
  private playbackEndCallback: (() => void) | null = null;

  /** Registered playback-error callback. */
  private playbackErrorCallback: ((error: Error) => void) | null = null;

  /**
   * Creates a new `DiscordVoice` instance.
   *
   * @remarks
   * Construction is side-effect free. The `@discordjs/voice` and
   * `prism-media` peer dependencies are only imported when
   * {@link DiscordVoice.initialize | initialize()} is called.
   *
   * @param config - Provider configuration. All fields are optional; a
   *   connection can be supplied later via {@link DiscordVoice.attach | attach()}.
   *
   * @example
   * ```typescript
   * const discord = new DiscordVoice({ silenceDurationMs: 800 });
   * ```
   */
  constructor(config: DiscordVoiceConfig = {}) {
    this.config = { ...config };
    this.silenceDurationMs = config.silenceDurationMs ?? 1000;
    this.logger = new Logger(this.constructor.name, {
      enabled: true,
      level: config.debug ? 'debug' : 'warn',
    });
  }

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Initialize the provider: load peer dependencies and create the player.
   *
   * @remarks
   * Dynamically imports `@discordjs/voice` and `prism-media`, creates the
   * shared `AudioPlayer`, wires its status events, and attaches the
   * connection from {@link DiscordVoiceConfig.connection} (or one supplied
   * earlier via {@link DiscordVoice.attach | attach()}). Safe to call again
   * after {@link DiscordVoice.dispose | dispose()}. If already initialized,
   * this is a no-op.
   *
   * @throws {@link ProviderInitializationError} if `@discordjs/voice` or
   *   `prism-media` is not installed (with install instructions).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.voice = await importPeerDep<DiscordVoiceModule>(
      () => import('@discordjs/voice'),
      '@discordjs/voice',
      this.constructor.name
    );
    this.prism = await importPeerDep<PrismModule>(
      () => import('prism-media'),
      'prism-media',
      this.constructor.name
    );

    this.player = this.voice.createAudioPlayer();
    this.wirePlayerEvents(this.player, this.voice);

    const pendingConnection = this.connection ?? this.config.connection ?? null;
    this.connection = null;
    if (pendingConnection) {
      this.attach(pendingConnection);
    }

    this.initialized = true;
    this.logger.info('DiscordVoice initialized');
  }

  /**
   * Dispose of the provider and release all resources.
   *
   * @remarks
   * Detaches the connection (destroying receive streams and unsubscribing
   * the player), stops playback, settles any pending {@link flush} promises,
   * and clears all state. The instance can be re-initialized afterwards.
   */
  async dispose(): Promise<void> {
    this.detach();
    this.player?.stop(true);
    this.resolvePendingFlushes();
    this.outputQueue = [];
    this.outputMetadata = null;
    this.playing = false;
    this.started = false;
    this.paused = false;
    this.audioCallback = null;
    this.sequenceNumber = 0;
    this.playbackStartCallback = null;
    this.playbackEndCallback = null;
    this.playbackErrorCallback = null;
    this.player = null;
    this.voice = null;
    this.prism = null;
    this.initialized = false;
    this.logger.info('DiscordVoice disposed');
  }

  /**
   * Check whether the provider has been initialized.
   *
   * @returns `true` when {@link initialize} has completed and {@link dispose}
   *   has not yet been called.
   */
  isReady(): boolean {
    return this.initialized;
  }

  // ── Public API (not part of the role interfaces) ─────────────────

  /**
   * Attach a Discord `VoiceConnection` to the provider.
   *
   * @remarks
   * The application creates the connection with `joinVoiceChannel()` from
   * `@discordjs/voice` (join with `selfDeaf: false`, or the bot receives no
   * audio). Attaching subscribes the internal audio player to the connection
   * and registers the speaking listener on its receiver. Calling `attach()`
   * again with a different connection detaches the previous one first.
   *
   * May be called before {@link DiscordVoice.initialize | initialize()}; the
   * connection is then wired during initialization.
   *
   * @param connection - The voice connection to attach.
   *
   * @example
   * ```typescript
   * const connection = joinVoiceChannel({
   *   channelId: channel.id,
   *   guildId: guild.id,
   *   adapterCreator: guild.voiceAdapterCreator,
   *   selfDeaf: false,
   * });
   * discord.attach(connection);
   * ```
   */
  attach(connection: DiscordVoiceConnection): void {
    if (this.connection === connection) return;
    if (this.connection) {
      this.detach();
    }

    this.connection = connection;

    // Wiring requires the player + module enums; deferred until initialize()
    // when attach() is called first.
    if (!this.player || !this.voice) return;

    this.subscription = connection.subscribe(this.player) ?? null;
    this.speakingHandler = (userId: string): void => this.handleSpeakingStart(userId);
    connection.receiver.speaking.on('start', this.speakingHandler);
    this.logger.info('Voice connection attached');
  }

  /**
   * Detach the current voice connection, if any.
   *
   * @remarks
   * Destroys all active receive streams, removes the speaking listener,
   * and unsubscribes the audio player from the connection. The provider can
   * be re-attached to the same or a different connection afterwards. The
   * connection itself is left open — destroying it is the application's job.
   */
  detach(): void {
    this.destroyActiveStreams();
    if (this.connection && this.speakingHandler) {
      this.connection.receiver.speaking.off('start', this.speakingHandler);
    }
    this.speakingHandler = null;
    this.subscription?.unsubscribe();
    this.subscription = null;
    if (this.connection) {
      this.logger.info('Voice connection detached');
    }
    this.connection = null;
  }

  /**
   * Stop audio capture without touching playback.
   *
   * @remarks
   * The *input-role* counterpart to the barge-in
   * {@link DiscordVoice.stop | stop()}: destroys all active receive streams
   * and closes the emission gate, while the speaking listener stays attached
   * so {@link DiscordVoice.start | start()} can restart capture at any time.
   *
   * @see {@link DiscordVoice.stop | stop} for the playback (barge-in) stop
   */
  stopCapture(): void {
    this.started = false;
    this.paused = false;
    this.destroyActiveStreams();
    this.logger.info('Capture stopped');
  }

  // ── AudioInputProvider interface ─────────────────────────────────

  /**
   * Start capturing audio from users speaking in the channel.
   *
   * @remarks
   * After calling `start()`, each `speaking('start')` event triggers a
   * per-user Opus subscription and decoded chunks are delivered to the
   * callback registered with {@link DiscordVoice.onAudio | onAudio()}.
   * Requires an attached connection to have any effect.
   */
  start(): void {
    this.started = true;
    this.paused = false;
  }

  /**
   * Stop the provider — barge-in while the agent is speaking, capture halt
   * otherwise.
   *
   * @remarks
   * A duplex provider exposes a single `stop()` for both role interfaces,
   * so `DiscordVoice` dispatches on playback state:
   *
   * - **Barge-in** (`output.stop()`) — while audio is queued or the player
   *   is delivering, the pending output queue is cleared and
   *   `player.stop(true)` forces the player to `Idle`, settling any
   *   in-flight {@link DiscordVoice.flush | flush()}. Capture deliberately
   *   survives: the orchestrator invokes this synchronously when a user
   *   interrupts the agent, and the interrupting speech must be transcribed.
   * - **Stop listening** (`input.stop()`) — with nothing queued or playing,
   *   behaves as {@link DiscordVoice.stopCapture | stopCapture()}.
   *
   * {@link DiscordVoice.detach | detach()} and
   * {@link DiscordVoice.dispose | dispose()} stop both sides unconditionally.
   */
  stop(): void {
    const bargeIn = this.playing || this.outputQueue.length > 0;

    if (bargeIn) {
      this.stopPlayback();
      return;
    }

    this.stopCapture();
  }

  /**
   * Stop playback, leaving capture running.
   *
   * @remarks
   * The pipeline calls this for barge-in, so the provider never has to infer
   * which side was meant. Capture stays open deliberately: barge-in fires
   * because someone started talking, and that speech has to reach STT.
   *
   * Safe when nothing is playing — barge-in is also raised while the agent is
   * still `thinking`, and there is simply no audio to drop yet.
   */
  stopPlayback(): void {
    this.outputQueue = [];
    this.player?.stop(true);
    this.logger.debug('Playback stopped (barge-in)');
  }

  /**
   * Pause audio processing.
   *
   * @remarks
   * Gates input emission (decoded chunks are silently dropped) — the
   * turn-taking system calls this to mute capture while the agent speaks.
   * If audio is currently playing, the player is paused as well.
   * Resume with {@link DiscordVoice.resume | resume()}.
   */
  pause(): void {
    if (this.started) {
      this.paused = true;
    }
    if (this.playing) {
      this.player?.pause();
    }
  }

  /**
   * Resume audio processing after a pause.
   *
   * @remarks
   * Re-opens the input emission gate and unpauses the player.
   *
   * @see {@link DiscordVoice.pause | pause}
   */
  resume(): void {
    if (this.started) {
      this.paused = false;
    }
    this.player?.unpause();
  }

  /**
   * Check whether input capture is active.
   *
   * @returns `true` when started and not paused.
   */
  isActive(): boolean {
    return this.started && !this.paused;
  }

  /**
   * Register a callback to receive captured audio chunks.
   *
   * @remarks
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback. Must be called before
   * {@link DiscordVoice.start | start()}.
   *
   * @param callback - Function invoked with each {@link AudioChunk}
   *   (linear16, 48 kHz, mono) while capture is active.
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Get the audio format metadata for captured audio.
   *
   * @remarks
   * Discord voice is Opus at 48 kHz stereo on the wire; after decoding and
   * downmixing, the provider emits linear16 mono at 48 kHz. The pipeline
   * uses this to auto-configure the STT provider.
   *
   * @returns `{ encoding: 'linear16', sampleRate: 48000, channels: 1, bitDepth: 16 }`
   */
  getMetadata(): AudioMetadata {
    return {
      encoding: 'linear16',
      sampleRate: DISCORD_SAMPLE_RATE,
      channels: 1,
      bitDepth: 16,
    };
  }

  // ── AudioOutputProvider interface ────────────────────────────────

  /**
   * Configure the output with the audio format the TTS will produce.
   *
   * @remarks
   * `DiscordVoice` accepts **linear16 PCM only** (mono or stereo, any sample
   * rate) — the provider resamples to 48 kHz and expands mono to stereo
   * itself. Compressed formats (mp3, opus, mulaw, alaw) are rejected because
   * decoding them server-side would require ffmpeg.
   *
   * @param metadata - Format description of the incoming TTS audio.
   *
   * @throws {@link ConfigurationError} if `metadata.encoding` is not
   *   `'linear16'` — configure your TTS accordingly, e.g.
   *   `new DeepgramTTS({ encoding: 'linear16', sampleRate: 24000 })`.
   */
  configure(metadata: AudioMetadata): void {
    this.assertPlayableMetadata(metadata);
    this.outputMetadata = { ...metadata };
    this.logger.debug('Output configured', {
      sampleRate: metadata.sampleRate,
      channels: metadata.channels,
    });
  }

  /**
   * Enqueue a TTS audio chunk for the next {@link DiscordVoice.flush | flush()}.
   *
   * @remarks
   * Chunks are buffered until `flush()` builds a single playback resource
   * from them. A per-chunk {@link AudioChunk.metadata} is honored as a
   * fallback when {@link DiscordVoice.configure | configure()} was not called.
   *
   * @param chunk - Audio data to queue for playback.
   */
  enqueue(chunk: AudioChunk): void {
    this.outputQueue.push(chunk);
  }

  /**
   * Play all queued audio into the channel and wait for playback to finish.
   *
   * @remarks
   * Concatenates the queued chunks, converts them to 48 kHz stereo s16le PCM
   * (linear-interpolation resampling via {@link resamplePcm} for other rates;
   * mono duplicated into both channels), wraps the result in a `Readable`
   * played as `StreamType.Raw`, and resolves once the player transitions to
   * `AudioPlayerStatus.Idle`. Resolves immediately when nothing is queued.
   * A {@link DiscordVoice.stop | stop()} (barge-in) also settles the promise,
   * because `player.stop(true)` forces the `Idle` transition.
   *
   * @throws {@link ConfigurationError} if no format is known (neither
   *   `configure()` nor per-chunk metadata) or the format is not linear16.
   * @throws {@link ProviderInitializationError} via {@link initialize} rules
   *   if the provider is not initialized.
   */
  async flush(): Promise<void> {
    if (this.outputQueue.length === 0) return;
    if (!this.initialized || !this.player || !this.voice) {
      throw new ConfigurationError(
        'DiscordVoice.flush() called before initialize() — call initialize() first'
      );
    }

    const queued = this.outputQueue;
    this.outputQueue = [];

    const metadata = this.outputMetadata ?? queued[0]?.metadata ?? null;
    if (!metadata) {
      throw new ConfigurationError(
        'DiscordVoice has no audio format: configure() was never called and the ' +
          'queued chunks carry no metadata. Use a TTS provider that emits linear16 ' +
          "PCM, e.g. new DeepgramTTS({ encoding: 'linear16', sampleRate: 24000 })"
      );
    }
    this.assertPlayableMetadata(metadata);

    const pcm = this.toDiscordPcm(
      concatenateArrayBuffers(queued.map((chunk) => chunk.data)),
      metadata
    );

    // Node-only import, deferred so browser bundles never resolve it.
    const { Readable } = (await import('node:stream')) as unknown as NodeStreamModule;
    const stream = Readable.from([pcm]);

    // Register the resolver BEFORE play() so a synchronous Idle transition
    // (e.g. an immediate stop) cannot be missed.
    const done = new Promise<void>((resolve) => this.pendingFlushes.push(resolve));

    const resource = this.voice.createAudioResource(stream, {
      inputType: this.voice.StreamType.Raw,
    });
    this.player.play(resource);
    this.logger.debug('Playing resource', { bytes: pcm.byteLength });

    return done;
  }

  /**
   * Check whether audio is currently being played into the channel.
   *
   * @returns `true` between the player's `Playing` and `Idle` transitions.
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Register a callback fired when audio delivery begins after being idle.
   *
   * @param callback - Invoked on the player's `Idle`/`Buffering` → `Playing`
   *   transition.
   */
  onPlaybackStart(callback: () => void): void {
    this.playbackStartCallback = callback;
  }

  /**
   * Register a callback fired when the queue fully drains.
   *
   * @param callback - Invoked when the player returns to `Idle` after
   *   having played audio.
   */
  onPlaybackEnd(callback: () => void): void {
    this.playbackEndCallback = callback;
  }

  /**
   * Register a callback fired when the player reports an error.
   *
   * @param callback - Invoked with the underlying error.
   */
  onPlaybackError(callback: (error: Error) => void): void {
    this.playbackErrorCallback = callback;
  }

  // ── Internals ────────────────────────────────────────────────────

  /**
   * Wire status and error events on the freshly created audio player.
   *
   * @remarks
   * `@discordjs/voice` re-emits state transitions as per-status events
   * (`player.on(AudioPlayerStatus.Playing, ...)` etc.), which is what the
   * provider listens to.
   *
   * @param player - The player created during {@link initialize}.
   * @param voice - The imported `@discordjs/voice` module surface.
   */
  private wirePlayerEvents(player: DiscordAudioPlayerLike, voice: DiscordVoiceModule): void {
    player.on(voice.AudioPlayerStatus.Playing, () => {
      if (!this.playing) {
        this.playing = true;
        this.playbackStartCallback?.();
      }
    });

    player.on(voice.AudioPlayerStatus.Idle, () => {
      const wasPlaying = this.playing;
      this.playing = false;
      this.resolvePendingFlushes();
      if (wasPlaying) {
        this.playbackEndCallback?.();
      }
    });

    player.on('error', (...args: unknown[]) => {
      const error = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
      this.logger.error('Audio player error', error);
      this.playbackErrorCallback?.(error);
    });
  }

  /**
   * Handle a `speaking('start')` event by subscribing to the user's audio.
   *
   * @remarks
   * Skipped when capture has not been started, when
   * {@link DiscordVoiceConfig.userId} locks capture to a different user, or
   * when a receive stream for this user is already active. The subscription
   * ends automatically after {@link DiscordVoiceConfig.silenceDurationMs} of
   * silence and is re-created on the user's next speaking event.
   *
   * @param userId - Discord user id that started speaking.
   */
  private handleSpeakingStart(userId: string): void {
    if (!this.started) return;
    if (this.config.userId && userId !== this.config.userId) return;
    if (this.activeStreams.has(userId)) return;
    if (!this.connection || !this.voice || !this.prism) return;

    this.logger.debug('Subscribing to speaker', { userId });

    let opus: DiscordAudioReceiveStream;
    let decoder: PrismOpusDecoderStream;

    try {
      opus = this.connection.receiver.subscribe(userId, {
        end: {
          behavior: this.voice.EndBehaviorType.AfterSilence,
          duration: this.silenceDurationMs,
        },
      });
    } catch (error) {
      this.logger.error('Failed to subscribe to speaker', error as Error, { userId });
      return;
    }

    try {
      // prism-media resolves its Opus codec lazily, when a Decoder is first
      // constructed — so a missing or unbuilt native binding surfaces *here*,
      // inside a UDP packet handler, rather than at initialize(). Left
      // uncaught it terminates the process the moment anyone speaks.
      decoder = new this.prism.opus.Decoder({
        rate: DISCORD_SAMPLE_RATE,
        channels: DISCORD_CHANNELS,
        frameSize: OPUS_FRAME_SIZE,
      });
    } catch (error) {
      this.logger.error(
        'Failed to create the Opus decoder — no usable Opus codec is installed. ' +
          'Install @discordjs/opus (and allow its native build to run) or opusscript.',
        error as Error,
        { userId }
      );
      try {
        opus.destroy();
      } catch {
        // The subscription may already be torn down; nothing to recover.
      }
      return;
    }

    opus.pipe(decoder);

    decoder.on('data', (chunk: Uint8Array) => this.emitPcm(chunk));
    decoder.on('end', () => {
      this.cleanupStream(userId);
      this.emitSilenceTail();
    });
    decoder.on('error', (error: Error) => {
      this.logger.error('Opus decode error', error, { userId });
      this.cleanupStream(userId);
    });
    opus.on('error', (...args: unknown[]) => {
      const error = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
      this.logger.error('Receive stream error', error, { userId });
      this.cleanupStream(userId);
    });

    this.activeStreams.set(userId, { opus, decoder });
  }

  /**
   * Downmix a decoded stereo PCM chunk to mono and emit it as an
   * {@link AudioChunk}.
   *
   * @remarks
   * The decoder outputs interleaved s16le stereo (L,R,L,R,…). Each pair is
   * averaged with `(left + right) >> 1`. Chunks are silently dropped while
   * the provider is not active (not started, or paused).
   *
   * @param chunk - Interleaved stereo s16le PCM bytes from the decoder.
   */
  private emitPcm(chunk: Uint8Array): void {
    if (!this.started || this.paused || !this.audioCallback) return;

    // Copy to an aligned buffer — Node stream chunks may be views at odd
    // byte offsets, which Int16Array cannot wrap directly.
    const bytes = new Uint8Array(chunk.byteLength);
    bytes.set(chunk);
    const stereo = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));

    const frames = Math.floor(stereo.length / DISCORD_CHANNELS);
    const mono = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      const left = stereo[i * 2] ?? 0;
      const right = stereo[i * 2 + 1] ?? 0;
      mono[i] = (left + right) >> 1;
    }

    this.audioCallback({
      data: mono.buffer,
      timestamp: Date.now(),
      sequence: this.sequenceNumber++,
    });
  }

  /**
   * Emit {@link SILENCE_TAIL_MS} of silence so downstream STT can endpoint.
   *
   * @remarks
   * Called when a speaker's subscription ends naturally — Discord has told us
   * they went quiet for {@link DiscordVoiceConfig.silenceDurationMs}. Skipped
   * while another speaker is still active, since the stream is not actually
   * idle in that case, and skipped during teardown (the provider is no longer
   * started).
   */
  private emitSilenceTail(): void {
    if (!this.started || this.paused || !this.audioCallback) return;
    if (this.activeStreams.size > 0) return;

    const samples = Math.round((DISCORD_SAMPLE_RATE * SILENCE_TAIL_MS) / 1000);
    this.audioCallback({
      data: new Int16Array(samples).buffer,
      timestamp: Date.now(),
      sequence: this.sequenceNumber++,
    });
    this.logger.debug('Emitted silence tail', { ms: SILENCE_TAIL_MS });
  }

  /**
   * Destroy and forget the receive stream for one user.
   *
   * @param userId - Discord user id whose subscription ended or failed.
   */
  private cleanupStream(userId: string): void {
    const active = this.activeStreams.get(userId);
    if (!active) return;
    this.activeStreams.delete(userId);
    try {
      active.opus.destroy();
      active.decoder.destroy();
    } catch (error) {
      this.logger.debug('Error destroying receive stream', { userId, error });
    }
    this.logger.debug('Receive stream ended', { userId });
  }

  /** Destroy all active receive streams. */
  private destroyActiveStreams(): void {
    for (const userId of [...this.activeStreams.keys()]) {
      this.cleanupStream(userId);
    }
  }

  /** Resolve (and clear) all pending {@link flush} promises. */
  private resolvePendingFlushes(): void {
    const pending = this.pendingFlushes;
    this.pendingFlushes = [];
    for (const resolve of pending) resolve();
  }

  /**
   * Validate that a TTS audio format is playable by this provider.
   *
   * @param metadata - Format description to validate.
   *
   * @throws {@link ConfigurationError} for non-linear16 encodings or channel
   *   counts other than 1 or 2.
   */
  private assertPlayableMetadata(metadata: AudioMetadata): void {
    if (metadata.encoding !== 'linear16') {
      throw new ConfigurationError(
        `DiscordVoice playback requires linear16 PCM, got '${metadata.encoding}'. ` +
          'Configure your TTS provider to emit raw PCM, e.g. ' +
          "new DeepgramTTS({ encoding: 'linear16', sampleRate: 24000 })"
      );
    }
    if (metadata.channels !== 1 && metadata.channels !== 2) {
      throw new ConfigurationError(
        `DiscordVoice playback supports 1 or 2 channels, got ${metadata.channels}`
      );
    }
  }

  /**
   * Convert queued linear16 audio to the 48 kHz interleaved stereo s16le PCM
   * Discord expects for `StreamType.Raw`.
   *
   * @remarks
   * - 48 kHz stereo input passes through untouched.
   * - Stereo at other rates is downmixed to mono first (pair averaging).
   * - Mono is resampled with {@link resamplePcm} (linear interpolation, so
   *   24 kHz TTS output upsamples cleanly) when not already 48 kHz, then
   *   duplicated into both channels. Audio already at 48 kHz skips the
   *   float round-trip entirely.
   *
   * @param data - Concatenated linear16 PCM bytes from the queued chunks.
   * @param metadata - Format of `data`.
   * @returns Interleaved 48 kHz stereo s16le PCM bytes.
   */
  private toDiscordPcm(data: ArrayBuffer, metadata: AudioMetadata): Uint8Array {
    const bytes = new Uint8Array(data.byteLength);
    bytes.set(new Uint8Array(data));
    const samples = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));

    // Passthrough: already in Discord's native playback format.
    if (metadata.channels === 2 && metadata.sampleRate === DISCORD_SAMPLE_RATE) {
      return bytes;
    }

    // Reduce to mono.
    let mono: Int16Array;
    if (metadata.channels === 2) {
      const frames = Math.floor(samples.length / 2);
      mono = new Int16Array(frames);
      for (let i = 0; i < frames; i++) {
        const left = samples[i * 2] ?? 0;
        const right = samples[i * 2 + 1] ?? 0;
        mono[i] = (left + right) >> 1;
      }
    } else {
      mono = samples;
    }

    // Resample to 48 kHz (skips the float round-trip when already there).
    let mono48: Int16Array;
    if (metadata.sampleRate === DISCORD_SAMPLE_RATE) {
      mono48 = mono;
    } else {
      mono48 = floatTo16BitPCM(
        resamplePcm(int16ToFloat(mono), metadata.sampleRate, DISCORD_SAMPLE_RATE)
      );
    }

    // Duplicate mono into both channels.
    const stereo = new Int16Array(mono48.length * 2);
    for (let i = 0; i < mono48.length; i++) {
      const sample = mono48[i] ?? 0;
      stereo[i * 2] = sample;
      stereo[i * 2 + 1] = sample;
    }

    return new Uint8Array(stereo.buffer);
  }
}
