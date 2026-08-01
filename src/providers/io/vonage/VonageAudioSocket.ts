/**
 * Vonage Voice API WebSocket duplex provider for the CompositeVoice SDK.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link VonageAudioSocket} class, a duplex
 * (`'input'` + `'output'`) provider that connects a CompositeVoice pipeline
 * to a phone call routed through the
 * {@link https://developer.vonage.com/en/voice/voice-api/concepts/websockets | Vonage Voice API WebSocket}
 * feature. Vonage dials OUT to your server: an NCCO `connect` action with a
 * `websocket` endpoint makes Vonage open a WebSocket to your `wss://` URL and
 * stream the caller's audio as raw linear16 PCM binary frames. Audio your
 * application writes back on the same socket is played to the caller.
 *
 * The provider does **not** run a WebSocket server. Your application accepts
 * the connection (e.g. with the `ws` package in Node.js) and hands the socket
 * to the provider via {@link VonageAudioSocket.attach | attach()}. Both Node
 * `ws`-style sockets (`on('message', ...)`) and browser-style sockets
 * (`addEventListener('message', ...)`) are supported. Zero peer dependencies.
 *
 * **Data-flow diagram:**
 *
 * ```
 *  Vonage Voice API ──(NCCO connect: websocket endpoint)──> your WS server
 *        │                                                        │
 *        │ 1. {"event":"websocket:connected","content-type":...}  │ app: attach(socket)
 *        │ 2. binary linear16 frames (~20 ms each)                v
 *        ├─────────────────────────────────────────────> [VonageAudioSocket]
 *        │                                                   │          │
 *        │  binary linear16 frames (20 ms, paced)            │          │ onAudio()
 *        ^───────────────────────────────────────────────────┘          v
 *   caller hears TTS                                          InputQueue ──> [STT]
 * ```
 *
 * **Wire format** (Vonage Voice API WebSocket):
 * - The FIRST message on the socket is a JSON text frame
 *   `{"event":"websocket:connected","content-type":"audio/l16;rate=16000",...}`
 *   plus any custom headers from the NCCO. The provider parses the sample
 *   rate (8000, 16000, or 24000; default 16000) from the `content-type`.
 * - Every subsequent BINARY frame is raw linear16 signed little-endian PCM,
 *   mono, roughly 20 ms per frame (640 bytes at 16 kHz).
 * - DTMF key presses arrive as JSON text frames
 *   `{"event":"websocket:dtmf","digit":"5","duration":260}`.
 * - Audio sent TO Vonage must be binary frames of raw linear16 at the SAME
 *   negotiated rate. The provider chunks outgoing audio into 20 ms frames and
 *   paces them on a 20 ms timer — Vonage requires paced frames rather than a
 *   single large burst.
 *
 * @example
 * ```typescript
 * import { WebSocketServer } from 'ws';
 * import {
 *   CompositeVoice,
 *   VonageAudioSocket,
 *   DeepgramSTT,
 *   AnthropicLLM,
 *   DeepgramTTS,
 * } from '@lukeocodes/composite-voice';
 *
 * const vonage = new VonageAudioSocket();
 * const agent = new CompositeVoice({
 *   providers: [
 *     vonage,
 *     new DeepgramSTT({ apiKey: process.env.DEEPGRAM_API_KEY }),
 *     new AnthropicLLM({ apiKey: process.env.ANTHROPIC_API_KEY, model: 'claude-haiku-4-5' }),
 *     new DeepgramTTS({
 *       apiKey: process.env.DEEPGRAM_API_KEY,
 *       encoding: 'linear16',
 *       sampleRate: 16000,
 *     }),
 *   ],
 * });
 *
 * await agent.initialize();
 *
 * const wss = new WebSocketServer({ port: 3000, path: '/vonage' });
 * wss.on('connection', async (socket) => {
 *   vonage.attach(socket);
 *   await agent.startListening();
 * });
 * ```
 *
 * @see {@link VonageAudioSocket} for the provider class
 * @see {@link https://developer.vonage.com/en/voice/voice-api/concepts/websockets | Vonage WebSockets concept docs}
 */

import type { AudioChunk, AudioEncoding, AudioMetadata } from '../../../core/types/audio';
import type {
  AudioInputProvider,
  AudioOutputProvider,
  ProviderType,
} from '../../../core/types/providers';
import type { ProviderRole } from '../../../core/types/roles';
import { floatTo16BitPCM, int16ToFloat, resamplePcm } from '../../../utils/audio';
import { decodeAlaw, decodeMulaw } from '../../../utils/g711';
import { ConfigurationError } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';

/**
 * Duration of one outbound audio frame in milliseconds.
 *
 * @remarks
 * Vonage delivers inbound audio in ~20 ms binary frames and expects outbound
 * audio to be paced the same way. At 16 kHz linear16 mono this is 640 bytes
 * per frame (16000 samples/s x 2 bytes x 0.02 s).
 */
const FRAME_MS = 20;

/**
 * Sample rate assumed until the `websocket:connected` event negotiates one.
 *
 * @remarks
 * 16 kHz is both the Vonage default (`audio/l16;rate=16000`) and the rate
 * most STT providers prefer.
 */
const DEFAULT_SAMPLE_RATE = 16000;

/** Sample rates the Vonage Voice API WebSocket endpoint supports. */
const SUPPORTED_RATES: readonly number[] = [8000, 16000, 24000];

/** Encodings the output role can convert to linear16 for Vonage. */
const SUPPORTED_OUTPUT_ENCODINGS: readonly AudioEncoding[] = ['linear16', 'mulaw', 'alaw'];

/**
 * Minimal structural type for a WebSocket handed to
 * {@link VonageAudioSocket.attach | attach()}.
 *
 * @remarks
 * The provider is transport-agnostic: it accepts any object that can `send`
 * data and expose `message`/`close` events through EITHER the Node `ws`
 * emitter style (`on`/`off`/`removeListener`) OR the browser
 * `addEventListener` style. A Node `ws` `WebSocket` and a browser `WebSocket`
 * both satisfy this interface without adapters.
 *
 * When the socket exposes a `binaryType` property (both `ws` and browser
 * sockets do), the provider sets it to `'arraybuffer'` so binary frames
 * arrive as `ArrayBuffer` rather than `Blob`/`Buffer` where possible.
 *
 * @see {@link VonageAudioSocket.attach}
 */
/**
 * Loosest-possible event-listener shape for {@link VonageSocket}.
 *
 * @remarks
 * Deliberately `(...args: any[]) => void`: both the DOM `WebSocket` and the
 * `ws` package type `addEventListener`/`on` as generic **properties** with
 * per-event listener types, so any stricter shape here makes real sockets
 * unassignable to {@link VonageSocket} under `strictFunctionTypes`.
 * The provider narrows the event payloads internally.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VonageSocketListener = (...args: any[]) => void;

export interface VonageSocket {
  /** Send a text or binary frame to Vonage. */
  send(data: string | ArrayBufferLike | ArrayBufferView): void;

  /** Optional close method — the provider never calls it; the app owns the socket. */
  close?(code?: number, reason?: string): void;

  /** Node `ws`-style event subscription (`socket.on('message', cb)`). */
  on?(event: string, listener: VonageSocketListener): void;

  /** Node `ws`-style event unsubscription. */
  off?(event: string, listener: VonageSocketListener): void;

  /** Node EventEmitter-style event unsubscription (older `ws` versions). */
  removeListener?(event: string, listener: VonageSocketListener): void;

  /** Browser-style event subscription (`socket.addEventListener('message', cb)`). */
  addEventListener?(event: string, listener: VonageSocketListener): void;

  /** Browser-style event unsubscription. */
  removeEventListener?(event: string, listener: VonageSocketListener): void;

  /** Binary delivery mode — set to `'arraybuffer'` by the provider when present. */
  binaryType?: string;
}

/**
 * Configuration options for {@link VonageAudioSocket}.
 *
 * @remarks
 * The provider needs no credentials: the WebSocket is opened by Vonage
 * directly to your server, and your application authenticates the call
 * (e.g. by validating the NCCO answer webhook) before attaching the socket.
 *
 * @example
 * ```typescript
 * const vonage = new VonageAudioSocket({ debug: true });
 * ```
 */
export interface VonageAudioSocketConfig {
  /**
   * Enable debug logging for wire events and the outbound frame pump.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

/**
 * Callback signature for DTMF digits received during the call.
 *
 * @param digit - The key that was pressed (`'0'`-`'9'`, `'*'`, `'#'`).
 * @param duration - How long the key was held, in milliseconds (when provided
 *   by Vonage).
 *
 * @see {@link VonageAudioSocket.onDtmf}
 */
export type VonageDtmfCallback = (digit: string, duration?: number) => void;

/**
 * Duplex audio provider for the Vonage Voice API WebSocket endpoint.
 *
 * @remarks
 * `VonageAudioSocket` covers BOTH the `'input'` and `'output'` pipeline roles
 * for a phone call bridged to your server via an NCCO `connect` action with a
 * `websocket` endpoint:
 *
 * ```json
 * [
 *   {
 *     "action": "connect",
 *     "endpoint": [
 *       {
 *         "type": "websocket",
 *         "uri": "wss://example.com/vonage",
 *         "content-type": "audio/l16;rate=16000"
 *       }
 *     ]
 *   }
 * ]
 * ```
 *
 * Your application accepts the WebSocket connection and passes the socket to
 * {@link VonageAudioSocket.attach | attach()}. The provider then:
 *
 * - parses the sample rate from the `websocket:connected` JSON event
 *   (8000 / 16000 / 24000 Hz, default 16000),
 * - emits every inbound binary frame as a linear16 {@link AudioChunk},
 * - converts and re-chunks TTS audio into 20 ms linear16 frames at the
 *   negotiated rate, sent on a paced 20 ms timer (Vonage rejects large
 *   unpaced bursts),
 * - surfaces DTMF key presses via {@link VonageAudioSocket.onDtmf | onDtmf()}.
 *
 * **Data-flow diagram:**
 *
 * ```
 *  socket binary frame ──> [input role] ──callback(chunk)──> InputQueue ──> STT
 *  TTS chunk ──enqueue()──> convert to linear16@rate ──> byte queue
 *                                                            │ 20 ms pump
 *                                                            v
 *                                                socket.send(640-byte frame)
 * ```
 *
 * **Duplex semantics — one `stop()`, one `pause()`:** because a single
 * instance fills both the input and output pipeline slots, the shared
 * lifecycle methods follow the semantics CompositeVoice relies on at runtime:
 *
 * - {@link VonageAudioSocket.stop | stop()} implements the OUTPUT contract
 *   (barge-in): it clears the outbound queue and pump and settles any pending
 *   {@link VonageAudioSocket.flush | flush()}. It deliberately does NOT
 *   deactivate inbound capture — CompositeVoice calls `output.stop()` when
 *   the caller interrupts the agent, and silencing the microphone there would
 *   leave the call permanently deaf. Inbound capture ends on
 *   {@link VonageAudioSocket.detach | detach()}, socket close (remote
 *   hangup), or {@link VonageAudioSocket.dispose | dispose()}.
 * - {@link VonageAudioSocket.pause | pause()} /
 *   {@link VonageAudioSocket.resume | resume()} gate the INPUT side only.
 *   The turn-taking controller pauses input while the agent speaks and then
 *   awaits `output.flush()`; pausing the outbound pump too would deadlock
 *   that flush.
 *
 * **Output formats:** linear16 at the negotiated rate passes straight
 * through; linear16 at any other rate is resampled (linear interpolation);
 * `mulaw`/`alaw` are G.711-decoded then resampled. Compressed formats
 * (`opus`, `mp3`) are rejected by {@link VonageAudioSocket.configure |
 * configure()} with instructions to reconfigure the TTS provider — e.g.
 * `new DeepgramTTS({ encoding: 'linear16', sampleRate: 16000 })`.
 *
 * **STT auto-configuration caveat:** {@link VonageAudioSocket.getMetadata |
 * getMetadata()} is read at pipeline initialization, usually before Vonage
 * has connected, so it reports the default 16000 Hz until the
 * `websocket:connected` event arrives. Set `content-type` in your NCCO to
 * `audio/l16;rate=16000` (recommended) or configure your STT provider's
 * sample rate to match your NCCO rate.
 *
 * @example
 * ```typescript
 * import { WebSocketServer } from 'ws';
 * import { VonageAudioSocket } from '@lukeocodes/composite-voice';
 *
 * const vonage = new VonageAudioSocket({ debug: true });
 * await vonage.initialize();
 *
 * vonage.onDtmf((digit, duration) => {
 *   console.log(`Caller pressed ${digit} for ${duration} ms`);
 * });
 *
 * const wss = new WebSocketServer({ port: 3000, path: '/vonage' });
 * wss.on('connection', (socket) => vonage.attach(socket));
 * ```
 *
 * @see {@link AudioInputProvider} and {@link AudioOutputProvider} for the interface contracts
 * @see {@link VonageAudioSocketConfig} for configuration options
 * @see {@link VonageSocket} for the socket duck type
 */
export class VonageAudioSocket implements AudioInputProvider, AudioOutputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `'websocket'` — the provider holds (a reference to) a persistent
   * WebSocket for the duration of the call, even though the connection is
   * accepted by the application rather than dialed by the provider.
   */
  public readonly type: ProviderType = 'websocket';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `VonageAudioSocket` is a duplex provider covering the `'input'` and
   * `'output'` slots. Separate STT, LLM, and TTS providers are still
   * required.
   */
  public readonly roles: readonly ProviderRole[] = ['input', 'output'];

  /** Logger scoped to this provider instance. */
  private readonly logger: Logger;

  /** Whether {@link initialize} has completed. */
  private initialized = false;

  /** The currently attached WebSocket, or `null` when detached. */
  private socket: VonageSocket | null = null;

  /**
   * Whether a socket was attached and has since gone away.
   *
   * @remarks
   * Distinguishes "the call ended" from "audio arrived before attach()",
   * which is legitimate — attach() starts the pump and drains the backlog.
   */
  private socketDetached = false;

  /** Removes the listeners registered on {@link socket}; `null` when detached. */
  private removeSocketListeners: (() => void) | null = null;

  /** Raw `content-type` from the `websocket:connected` event, or `null`. */
  private contentType: string | null = null;

  /** Negotiated sample rate in Hz (from `content-type`; default 16000). */
  private sampleRate = DEFAULT_SAMPLE_RATE;

  // ── Input state ───────────────────────────────────────────────────

  /** Whether the input role has been started. */
  private inputActive = false;

  /** Whether the input role is paused (chunks dropped while `true`). */
  private inputPaused = false;

  /** Registered callback for inbound audio chunks. */
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;

  /** Monotonically increasing sequence number for emitted chunks. */
  private sequenceNumber = 0;

  /** Registered callback for DTMF events. */
  private dtmfCallback: VonageDtmfCallback | null = null;

  // ── Output state ──────────────────────────────────────────────────

  /** Format of incoming TTS chunks, set by {@link configure}. */
  private ttsMetadata: AudioMetadata | null = null;

  /** Outbound byte queue: converted linear16 bytes awaiting the pump. */
  private outboundBuffers: Uint8Array[] = [];

  /** Read offset into the first buffer of {@link outboundBuffers}. */
  private outboundOffset = 0;

  /** Total unsent bytes across {@link outboundBuffers}. */
  private outboundBytes = 0;

  /** Handle for the 20 ms outbound frame pump, or `null` when idle. */
  private pumpTimer: ReturnType<typeof setInterval> | null = null;

  /** Whether audio delivery is in progress (between playback start and end). */
  private delivering = false;

  /** Whether `flush()` has been requested for the currently queued audio. */
  private flushRequested = false;

  /** Resolvers for pending {@link flush} promises. */
  private flushResolvers: Array<() => void> = [];

  /** Registered playback-start callback. */
  private playbackStartCallback: (() => void) | null = null;

  /** Registered playback-end callback. */
  private playbackEndCallback: (() => void) | null = null;

  /** Registered playback-error callback. */
  private playbackErrorCallback: ((error: Error) => void) | null = null;

  /**
   * Creates a new `VonageAudioSocket` instance.
   *
   * @remarks
   * Construction is cheap and performs no I/O. Call {@link initialize} before
   * use and {@link attach} once Vonage has opened its WebSocket to your
   * server.
   *
   * @param config - Optional configuration (see {@link VonageAudioSocketConfig}).
   *
   * @example
   * ```typescript
   * const vonage = new VonageAudioSocket({ debug: true });
   * ```
   */
  constructor(config: VonageAudioSocketConfig = {}) {
    this.logger = new Logger(this.constructor.name, {
      enabled: true,
      level: config.debug ? 'debug' : 'warn',
    });
  }

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Initialize the provider.
   *
   * @remarks
   * No external resources are acquired — the WebSocket is created by Vonage
   * and supplied via {@link attach}. If already initialized, this is a no-op.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.logger.debug('Initialized');
  }

  /**
   * Dispose of the provider and release all resources.
   *
   * @remarks
   * Detaches the socket (listeners removed, pump stopped, queue cleared,
   * pending {@link flush} settled), clears every registered callback, and
   * resets the sequence counter. The instance may be re-initialized
   * afterwards.
   */
  async dispose(): Promise<void> {
    this.detach();
    // detach() is a no-op when nothing is attached, so clear queued audio
    // and settle pending flushes explicitly for the detached case too.
    this.clearOutbound();
    this.settlePlaybackStopped();
    this.inputActive = false;
    this.inputPaused = false;
    this.audioCallback = null;
    this.dtmfCallback = null;
    this.playbackStartCallback = null;
    this.playbackEndCallback = null;
    this.playbackErrorCallback = null;
    this.ttsMetadata = null;
    this.sequenceNumber = 0;
    this.contentType = null;
    this.sampleRate = DEFAULT_SAMPLE_RATE;
    this.initialized = false;
    this.logger.debug('Disposed');
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

  // ── Socket attachment (public extra API) ─────────────────────────

  /**
   * Attach the WebSocket that Vonage opened to your server.
   *
   * @remarks
   * Wires `message` and `close` handlers using whichever event style the
   * socket supports (`on(...)` for Node `ws`, `addEventListener(...)` for
   * browser-style sockets) and resets the per-call negotiation state — the
   * sample rate returns to the 16000 Hz default until the new call's
   * `websocket:connected` event arrives. If another socket is already
   * attached it is detached first (its listeners are removed and any queued
   * outbound audio is dropped).
   *
   * When the socket exposes a `binaryType` property it is set to
   * `'arraybuffer'` so browser-style sockets deliver binary frames as
   * `ArrayBuffer` rather than `Blob`.
   *
   * The provider never closes the socket — your application owns its
   * lifecycle.
   *
   * @param socket - The accepted WebSocket (see {@link VonageSocket}).
   *
   * @throws ConfigurationError if the socket supports neither `on()` nor
   *   `addEventListener()`.
   *
   * @example
   * ```typescript
   * const wss = new WebSocketServer({ port: 3000 });
   * wss.on('connection', (socket) => vonage.attach(socket));
   * ```
   *
   * @see {@link VonageAudioSocket.detach | detach} for the inverse operation
   */
  attach(socket: VonageSocket): void {
    this.detach();

    // Fresh call leg: negotiation state resets until websocket:connected.
    this.socketDetached = false;
    this.contentType = null;
    this.sampleRate = DEFAULT_SAMPLE_RATE;

    if (typeof socket.binaryType === 'string') {
      socket.binaryType = 'arraybuffer';
    }

    if (typeof socket.on === 'function') {
      const onMessage = (data: unknown, isBinary?: unknown): void => {
        this.handleSocketData(data, typeof isBinary === 'boolean' ? isBinary : undefined);
      };
      const onClose = (): void => this.handleSocketClose();
      socket.on('message', onMessage);
      socket.on('close', onClose);
      this.removeSocketListeners = (): void => {
        const off = socket.off ?? socket.removeListener;
        off?.call(socket, 'message', onMessage);
        off?.call(socket, 'close', onClose);
      };
    } else if (typeof socket.addEventListener === 'function') {
      const onMessage = (event: { data?: unknown }): void => {
        this.handleSocketData(event?.data, undefined);
      };
      const onClose = (): void => this.handleSocketClose();
      socket.addEventListener('message', onMessage);
      socket.addEventListener('close', onClose);
      this.removeSocketListeners = (): void => {
        socket.removeEventListener?.('message', onMessage);
        socket.removeEventListener?.('close', onClose);
      };
    } else {
      throw new ConfigurationError(
        'VonageAudioSocket.attach() requires a socket with on() (Node ws) or addEventListener() (browser) event wiring'
      );
    }

    this.socket = socket;
    this.logger.info('Socket attached');

    // Audio enqueued before the socket arrived can start draining now.
    if (this.outboundBytes > 0) {
      this.ensurePump();
    }
  }

  /**
   * Detach the current socket, if any.
   *
   * @remarks
   * Removes the provider's `message`/`close` listeners, stops the outbound
   * frame pump, drops any queued outbound audio, and settles pending
   * {@link flush} promises (they resolve — the audio is cancelled, not
   * failed). The socket itself is NOT closed; the application owns it.
   * Inbound emission naturally ceases because no socket is delivering frames.
   *
   * A no-op when no socket is attached — audio enqueued before the first
   * {@link attach} stays queued and starts draining once a socket arrives.
   *
   * @see {@link VonageAudioSocket.attach | attach}
   */
  detach(): void {
    if (!this.socket && !this.removeSocketListeners) return;
    if (this.removeSocketListeners) {
      this.removeSocketListeners();
      this.removeSocketListeners = null;
    }
    if (this.socket) {
      this.socket = null;
      this.socketDetached = true;
      this.logger.info('Socket detached');
    }
    this.clearOutbound();
    this.settlePlaybackStopped();
  }

  /**
   * Register a callback for DTMF key presses on the call.
   *
   * @remarks
   * Vonage forwards keypad presses as JSON text frames
   * `{"event":"websocket:dtmf","digit":"5","duration":260}`. Only one
   * callback can be registered at a time; subsequent calls replace it.
   *
   * @param callback - Invoked with the digit and (when present) its duration
   *   in milliseconds.
   *
   * @example
   * ```typescript
   * vonage.onDtmf((digit) => {
   *   if (digit === '0') transferToHuman();
   * });
   * ```
   */
  onDtmf(callback: VonageDtmfCallback): void {
    this.dtmfCallback = callback;
  }

  /**
   * Get the raw `content-type` announced by the `websocket:connected` event.
   *
   * @returns The content type (e.g. `'audio/l16;rate=16000'`), or `null` if
   *   the connected event has not arrived yet.
   *
   * @example
   * ```typescript
   * vonage.getContentType(); // 'audio/l16;rate=16000'
   * ```
   */
  getContentType(): string | null {
    return this.contentType;
  }

  // ── AudioInputProvider interface ─────────────────────────────────

  /**
   * Start emitting inbound call audio as {@link AudioChunk} objects.
   *
   * @remarks
   * Binary frames received before `start()` is called are silently dropped.
   * Must be called after {@link initialize}; audio additionally requires an
   * attached socket to flow.
   */
  start(): void {
    this.inputActive = true;
    this.inputPaused = false;
  }

  /**
   * Stop outbound playback immediately and clear buffered audio (barge-in).
   *
   * @remarks
   * This is the shared `stop()` of a duplex provider, and it implements the
   * OUTPUT role's contract: the outbound frame pump is cleared, queued audio
   * is dropped, pending {@link flush} promises resolve (cancelled, not
   * completed), and `onPlaybackEnd` fires if delivery was in progress.
   *
   * As a duplex provider, the same `stop()` is invoked by CompositeVoice for
   * two different reasons, so the provider dispatches on playback state:
   *
   * - **Barge-in** (`output.stop()`) — while outbound audio is queued or
   *   being delivered, only the output side is stopped. Inbound capture is
   *   deliberately kept alive: barge-in happens because the caller is
   *   speaking, and that speech must keep flowing to STT.
   * - **Stop listening** (`input.stop()`) — with no outbound audio in
   *   flight, inbound emission is halted instead (restart with
   *   {@link VonageAudioSocket.start | start()}).
   */
  stop(): void {
    const bargeIn = this.delivering || this.outboundBytes > 0 || this.pumpTimer !== null;

    if (bargeIn) {
      this.stopPlayback();
      return;
    }

    this.stopPlayback();
    this.stopCapture();
  }

  /**
   * Stop outbound delivery, leaving caller audio flowing.
   *
   * @remarks
   * The pipeline calls this for barge-in, so the provider never has to infer
   * which side was meant. Clears the paced queue and settles any pending
   * `flush()` as cancelled, so the pipeline cannot hang waiting on audio that
   * will never be sent.
   *
   * Capture is deliberately untouched: barge-in fires because the caller is
   * speaking, and that speech has to reach STT. Safe when nothing is playing —
   * barge-in is also raised while the agent is still `thinking`.
   */
  stopPlayback(): void {
    this.clearOutbound();
    this.settlePlaybackStopped();
    this.logger.debug('Playback stopped (barge-in)');
  }

  /**
   * Stop emitting caller audio, leaving outbound delivery alone.
   *
   * @remarks
   * The pipeline calls this when it means "stop listening". Restart with
   * {@link VonageAudioSocket.start | start()}.
   */
  stopCapture(): void {
    this.inputActive = false;
    this.inputPaused = false;
    this.logger.debug('Input emission halted');
  }

  /**
   * Pause inbound audio emission without dropping the call.
   *
   * @remarks
   * Used by the turn-taking system to mute capture while the agent speaks.
   * Frames received while paused are silently dropped. Outbound playback is
   * intentionally unaffected — the turn-taking controller awaits
   * {@link VonageAudioSocket.flush | flush()} right after pausing input, and
   * pausing the outbound pump here would deadlock that flush.
   */
  pause(): void {
    if (this.inputActive) {
      this.inputPaused = true;
    }
  }

  /**
   * Resume inbound audio emission after {@link pause}.
   *
   * @see {@link VonageAudioSocket.pause | pause}
   */
  resume(): void {
    if (this.inputActive) {
      this.inputPaused = false;
    }
  }

  /**
   * Check whether inbound audio is actively being emitted.
   *
   * @returns `true` when started and not paused.
   */
  isActive(): boolean {
    return this.inputActive && !this.inputPaused;
  }

  /**
   * Register a callback to receive inbound audio chunks.
   *
   * @remarks
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback. Must be called before {@link start}.
   *
   * @param callback - Invoked with each inbound {@link AudioChunk} (raw
   *   linear16 PCM at the negotiated sample rate).
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Get the format of the audio this provider emits.
   *
   * @remarks
   * Always linear16 mono, 16-bit, at the negotiated sample rate. Until the
   * `websocket:connected` event arrives this reports the 16000 Hz default —
   * the pipeline reads it at initialization time to auto-configure STT, so
   * either use `audio/l16;rate=16000` in your NCCO (recommended) or configure
   * the STT provider's sample rate to match your NCCO explicitly.
   *
   * @returns {@link AudioMetadata} describing the inbound audio format.
   */
  getMetadata(): AudioMetadata {
    return {
      sampleRate: this.sampleRate,
      encoding: 'linear16',
      channels: 1,
      bitDepth: 16,
      mimeType: `audio/l16;rate=${this.sampleRate}`,
    };
  }

  // ── AudioOutputProvider interface ────────────────────────────────

  /**
   * Configure the output with the TTS provider's audio format.
   *
   * @remarks
   * Accepted encodings:
   * - `'linear16'` — passed through when the rate matches the negotiated
   *   rate, otherwise resampled with linear interpolation.
   * - `'mulaw'` / `'alaw'` — G.711-decoded to linear16, then resampled if
   *   needed.
   *
   * Compressed encodings (`'opus'`, `'mp3'`) cannot be decoded server-side
   * without heavy dependencies and are rejected. Configure your TTS provider
   * for raw PCM instead — e.g.
   * `new DeepgramTTS({ encoding: 'linear16', sampleRate: 16000 })`.
   *
   * @param metadata - Format description for incoming TTS chunks.
   *
   * @throws ConfigurationError if the encoding is unsupported or the audio is
   *   not mono.
   */
  configure(metadata: AudioMetadata): void {
    if (!SUPPORTED_OUTPUT_ENCODINGS.includes(metadata.encoding)) {
      throw new ConfigurationError(
        `VonageAudioSocket cannot play '${metadata.encoding}' audio. Vonage WebSockets require raw ` +
          `linear16 PCM. Configure your TTS provider to emit PCM — e.g. ` +
          `new DeepgramTTS({ encoding: 'linear16', sampleRate: 16000 }) or ` +
          `new ElevenLabsTTS({ outputFormat: 'pcm_16000' })`
      );
    }
    if (metadata.channels !== undefined && metadata.channels !== 1) {
      throw new ConfigurationError(
        `VonageAudioSocket requires mono TTS audio, got ${metadata.channels} channels. ` +
          `Configure your TTS provider for single-channel output.`
      );
    }
    this.ttsMetadata = { ...metadata };
    this.logger.debug(
      `Configured output: ${metadata.encoding} @ ${metadata.sampleRate} Hz -> linear16 @ ${this.sampleRate} Hz`
    );
  }

  /**
   * Enqueue a TTS audio chunk for playback into the call.
   *
   * @remarks
   * The chunk is converted to linear16 at the negotiated sample rate (see
   * {@link configure}) and appended to the outbound byte queue. A 20 ms
   * interval pump chunks the queue into fixed-size frames
   * (`sampleRate / 50` samples) and sends one per tick — Vonage requires
   * paced frames rather than a single burst.
   *
   * Per-chunk `metadata` overrides the format set by {@link configure}. If
   * neither is present the chunk is assumed to already be linear16 at the
   * negotiated rate.
   *
   * @param chunk - Audio data from the TTS stage.
   */
  enqueue(chunk: AudioChunk): void {
    // Once the socket has gone the pacing pump can never start again, so
    // these bytes would never drain — and a later flush() would see a
    // non-empty queue, park a resolver, and never settle. The pipeline awaits
    // that flush with capture paused, so the whole agent wedges. Audio queued
    // *before* the first attach is fine: attach() starts the pump and drains
    // it.
    if (!this.socket && this.socketDetached) {
      this.logger.warn('Dropping output chunk: the Vonage call has ended');
      return;
    }

    const metadata = chunk.metadata ?? this.ttsMetadata;
    let bytes: Uint8Array;
    try {
      bytes = this.convertToOutbound(chunk.data, metadata);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to convert TTS chunk: ${err.message}`);
      this.playbackErrorCallback?.(err);
      return;
    }
    if (bytes.byteLength === 0) return;

    this.outboundBuffers.push(bytes);
    this.outboundBytes += bytes.byteLength;
    this.ensurePump();
  }

  /**
   * Wait for all enqueued audio to be delivered into the call.
   *
   * @remarks
   * Vonage has no mark/acknowledgement mechanism, so completion is timed: the
   * paced pump sends one 20 ms frame per 20 ms tick, and `flush()` resolves
   * one tick after the final frame is sent — i.e. after the total queued
   * duration has elapsed. `flush()` also marks the end of the response,
   * allowing the pump to send a final zero-padded partial frame if the queued
   * bytes do not divide evenly into 20 ms frames.
   *
   * Resolves immediately when nothing is queued or playing. Also resolves
   * (as cancelled) on {@link stop}, {@link detach}, socket close, or
   * {@link dispose}.
   */
  async flush(): Promise<void> {
    if (this.outboundBytes === 0 && !this.delivering) {
      return;
    }
    this.flushRequested = true;
    this.ensurePump();
    return new Promise<void>((resolve) => {
      this.flushResolvers.push(resolve);
    });
  }

  /**
   * Check whether audio is currently being delivered into the call.
   *
   * @returns `true` between `onPlaybackStart` and `onPlaybackEnd`.
   */
  isPlaying(): boolean {
    return this.delivering;
  }

  /**
   * Register a callback invoked when audio delivery begins after being idle.
   *
   * @param callback - Function called when the first frame of a response is
   *   sent to Vonage.
   */
  onPlaybackStart(callback: () => void): void {
    this.playbackStartCallback = callback;
  }

  /**
   * Register a callback invoked when the outbound queue fully drains.
   *
   * @remarks
   * Also fired when playback is cancelled by {@link stop}, {@link detach},
   * or a socket close while audio was being delivered.
   *
   * @param callback - Function called when playback ends.
   */
  onPlaybackEnd(callback: () => void): void {
    this.playbackEndCallback = callback;
  }

  /**
   * Register a callback invoked when sending audio to Vonage fails.
   *
   * @param callback - Function called with the error.
   */
  onPlaybackError(callback: (error: Error) => void): void {
    this.playbackErrorCallback = callback;
  }

  // ── Socket message handling ──────────────────────────────────────

  /**
   * Normalize and dispatch a raw socket message.
   *
   * @remarks
   * Handles the four shapes real sockets produce:
   * - `string` (browser text frame) → JSON event
   * - Node `Buffer`/typed array with `isBinary === false` → UTF-8 JSON event
   * - `ArrayBuffer` or typed-array view (binary frame) → inbound audio
   * - anything else (e.g. `Blob` when `binaryType` could not be set) → warned
   *   and dropped
   *
   * @param data - The message payload.
   * @param isBinary - Node `ws` binary flag, when available.
   */
  private handleSocketData(data: unknown, isBinary: boolean | undefined): void {
    if (typeof data === 'string') {
      this.handleTextMessage(data);
      return;
    }

    // Node ws delivers text frames as Buffer with isBinary === false.
    if (isBinary === false) {
      const bytes = this.toUint8Array(data);
      if (bytes) {
        this.handleTextMessage(bytesToUtf8(bytes));
      }
      return;
    }

    const bytes = this.toUint8Array(data);
    if (!bytes) {
      this.logger.warn(
        'Dropped a socket message of unsupported type (set socket.binaryType = "arraybuffer")'
      );
      return;
    }
    this.handleBinaryFrame(bytes);
  }

  /**
   * Coerce a socket payload to a `Uint8Array`, or `null` if unsupported.
   *
   * @param data - `ArrayBuffer`, typed-array view (including Node `Buffer`),
   *   or an array of views (Node `ws` fragmented message).
   */
  private toUint8Array(data: unknown): Uint8Array | null {
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    if (Array.isArray(data) && data.every((part) => ArrayBuffer.isView(part))) {
      const parts = data as ArrayBufferView[];
      const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const part of parts) {
        merged.set(new Uint8Array(part.buffer, part.byteOffset, part.byteLength), offset);
        offset += part.byteLength;
      }
      return merged;
    }
    return null;
  }

  /**
   * Handle a JSON text frame from Vonage.
   *
   * @remarks
   * Recognized events:
   * - `websocket:connected` — first message on the socket; carries the
   *   `content-type` whose `rate=` parameter sets the negotiated sample rate
   *   (8000 / 16000 / 24000; anything else falls back to 16000).
   * - `websocket:dtmf` — keypad press; forwarded to the
   *   {@link VonageAudioSocket.onDtmf | onDtmf} callback.
   *
   * @param text - The raw JSON text.
   */
  private handleTextMessage(text: string): void {
    let message: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed === null || typeof parsed !== 'object') return;
      message = parsed as Record<string, unknown>;
    } catch {
      this.logger.warn(`Ignoring non-JSON text frame: ${text.slice(0, 120)}`);
      return;
    }

    switch (message.event) {
      case 'websocket:connected': {
        const contentType =
          typeof message['content-type'] === 'string' ? message['content-type'] : null;
        this.contentType = contentType;
        this.sampleRate = parseRateFromContentType(contentType);
        if (contentType && !SUPPORTED_RATES.includes(this.sampleRate)) {
          // parseRateFromContentType already fell back; log for visibility.
          this.logger.warn(`Unexpected content-type '${contentType}'`);
        }
        this.logger.info(
          `Vonage connected: content-type=${contentType ?? '(none)'} -> ${this.sampleRate} Hz`
        );
        break;
      }

      case 'websocket:dtmf': {
        const digit = typeof message.digit === 'string' ? message.digit : null;
        const duration = typeof message.duration === 'number' ? message.duration : undefined;
        if (digit !== null) {
          this.logger.debug(`DTMF: ${digit}`);
          this.dtmfCallback?.(digit, duration);
        }
        break;
      }

      default:
        this.logger.debug(`Unhandled event: ${String(message.event)}`);
    }
  }

  /**
   * Handle an inbound binary audio frame (raw linear16 PCM).
   *
   * @remarks
   * Emits an {@link AudioChunk} when the input role is active and not paused;
   * drops the frame silently otherwise. The bytes are copied into a fresh
   * `ArrayBuffer` so downstream consumers never alias socket buffers.
   *
   * @param bytes - The frame payload.
   */
  private handleBinaryFrame(bytes: Uint8Array): void {
    if (!this.inputActive || this.inputPaused || !this.audioCallback) return;

    const data = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(data).set(bytes);

    this.audioCallback({
      data,
      timestamp: Date.now(),
      sequence: this.sequenceNumber++,
    });
  }

  /**
   * Handle the socket closing (remote hangup or network failure).
   *
   * @remarks
   * Treated as the end of the call: inbound capture is deactivated, the
   * outbound pump and queue are cleared, pending {@link flush} promises
   * resolve, and `onPlaybackEnd` fires if audio was being delivered.
   */
  private handleSocketClose(): void {
    this.logger.info('Socket closed (remote hangup)');
    this.inputActive = false;
    this.inputPaused = false;
    this.detach();
  }

  // ── Outbound frame pump ──────────────────────────────────────────

  /**
   * Convert a TTS chunk to linear16 bytes at the negotiated sample rate.
   *
   * @param data - Raw chunk payload.
   * @param metadata - The chunk's format; `null` assumes linear16 at the
   *   negotiated rate.
   * @returns Converted bytes ready for the outbound queue.
   *
   * @throws ConfigurationError if the metadata carries an encoding that
   *   {@link configure} would reject.
   */
  private convertToOutbound(data: ArrayBuffer, metadata: AudioMetadata | null): Uint8Array {
    const encoding = metadata?.encoding ?? 'linear16';
    const fromRate = metadata?.sampleRate ?? this.sampleRate;

    let pcm: Int16Array;
    switch (encoding) {
      case 'linear16': {
        const evenLength = data.byteLength - (data.byteLength % 2);
        if (evenLength !== data.byteLength) {
          this.logger.warn('Dropping trailing odd byte from linear16 chunk');
        }
        pcm = new Int16Array(data, 0, evenLength / 2);
        break;
      }
      case 'mulaw':
        pcm = decodeMulaw(new Uint8Array(data));
        break;
      case 'alaw':
        pcm = decodeAlaw(new Uint8Array(data));
        break;
      default:
        throw new ConfigurationError(
          `VonageAudioSocket cannot play '${encoding}' audio. Configure your TTS provider to ` +
            `emit linear16 PCM — e.g. new DeepgramTTS({ encoding: 'linear16', sampleRate: 16000 })`
        );
    }

    if (fromRate !== this.sampleRate) {
      pcm = floatTo16BitPCM(resamplePcm(int16ToFloat(pcm), fromRate, this.sampleRate));
    }

    // Copy so queued bytes never alias the caller's buffer.
    const out = new Uint8Array(pcm.byteLength);
    out.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
    return out;
  }

  /**
   * Number of bytes in one 20 ms outbound frame at the negotiated rate.
   *
   * @returns `sampleRate x 2 bytes x 0.02 s` (640 at 16 kHz).
   */
  private frameBytes(): number {
    return Math.round((this.sampleRate * 2 * FRAME_MS) / 1000);
  }

  /**
   * Start the 20 ms outbound pump if it is not already running.
   *
   * @remarks
   * The pump only runs while a socket is attached; audio enqueued earlier
   * begins draining when {@link attach} is called.
   */
  private ensurePump(): void {
    if (this.pumpTimer !== null || !this.socket) return;
    this.pumpTimer = setInterval(() => this.pumpTick(), FRAME_MS);
  }

  /**
   * Send one paced frame to Vonage (called every 20 ms while pumping).
   *
   * @remarks
   * - Sends a full `frameBytes()` frame when enough bytes are queued.
   * - A partial tail (fewer bytes than one frame) is held until
   *   {@link flush} marks the response complete, then sent zero-padded —
   *   padding mid-stream would inject audible silence between streamed TTS
   *   chunks.
   * - When the queue is empty the pump stops, `onPlaybackEnd` fires, and
   *   pending {@link flush} promises resolve. This lands exactly one tick
   *   after the final frame, matching the time that frame takes to play.
   */
  private pumpTick(): void {
    const socket = this.socket;
    if (!socket) {
      this.clearOutbound();
      this.settlePlaybackStopped();
      return;
    }

    if (this.outboundBytes === 0) {
      this.stopPump();
      this.flushRequested = false;
      const wasDelivering = this.delivering;
      this.delivering = false;
      if (wasDelivering) {
        this.playbackEndCallback?.();
      }
      this.settleFlush();
      return;
    }

    const frameSize = this.frameBytes();
    if (this.outboundBytes < frameSize && !this.flushRequested) {
      // Partial tail mid-stream: wait for more TTS bytes.
      return;
    }

    const frame = new Uint8Array(frameSize); // zero-padded when partial
    this.takeOutboundBytes(frame);

    if (!this.delivering) {
      this.delivering = true;
      this.playbackStartCallback?.();
    }

    try {
      socket.send(frame);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error(`Failed to send audio frame: ${err.message}`);
      this.playbackErrorCallback?.(err);
    }
  }

  /**
   * Move up to `target.byteLength` queued bytes into `target`.
   *
   * @param target - Destination frame buffer (already zero-filled).
   * @returns The number of bytes copied.
   */
  private takeOutboundBytes(target: Uint8Array): number {
    let written = 0;
    while (written < target.byteLength && this.outboundBuffers.length > 0) {
      const head = this.outboundBuffers[0] as Uint8Array;
      const available = head.byteLength - this.outboundOffset;
      const take = Math.min(available, target.byteLength - written);
      target.set(
        this.outboundOffset === 0 && take === head.byteLength
          ? head
          : head.subarray(this.outboundOffset, this.outboundOffset + take),
        written
      );
      written += take;
      this.outboundOffset += take;
      this.outboundBytes -= take;
      if (this.outboundOffset >= head.byteLength) {
        this.outboundBuffers.shift();
        this.outboundOffset = 0;
      }
    }
    return written;
  }

  /** Stop the outbound pump timer, if running. */
  private stopPump(): void {
    if (this.pumpTimer !== null) {
      clearInterval(this.pumpTimer);
      this.pumpTimer = null;
    }
  }

  /** Stop the pump and drop all queued outbound bytes. */
  private clearOutbound(): void {
    this.stopPump();
    this.outboundBuffers = [];
    this.outboundOffset = 0;
    this.outboundBytes = 0;
    this.flushRequested = false;
  }

  /** Resolve all pending {@link flush} promises. */
  private settleFlush(): void {
    if (this.flushResolvers.length === 0) return;
    const resolvers = this.flushResolvers;
    this.flushResolvers = [];
    for (const resolve of resolvers) {
      resolve();
    }
  }

  /**
   * Mark playback stopped: settle flushes and fire `onPlaybackEnd` if audio
   * was being delivered.
   */
  private settlePlaybackStopped(): void {
    const wasDelivering = this.delivering;
    this.delivering = false;
    this.settleFlush();
    if (wasDelivering) {
      this.playbackEndCallback?.();
    }
  }
}

/**
 * Parse the sample rate from a Vonage `content-type` string.
 *
 * @remarks
 * Vonage announces the negotiated format as `audio/l16;rate=<hz>`. Only
 * 8000, 16000, and 24000 Hz are valid for the WebSocket endpoint; anything
 * else (or a missing/malformed content type) falls back to the 16000 Hz
 * default.
 *
 * @param contentType - The `content-type` from the `websocket:connected`
 *   event, or `null` when absent.
 * @returns The sample rate in Hz.
 *
 * @example
 * ```typescript
 * parseRateFromContentType('audio/l16;rate=8000');  // 8000
 * parseRateFromContentType('audio/l16');            // 16000 (default)
 * parseRateFromContentType(null);                   // 16000 (default)
 * ```
 */
function parseRateFromContentType(contentType: string | null): number {
  if (!contentType) return DEFAULT_SAMPLE_RATE;
  const match = /rate=(\d+)/.exec(contentType);
  if (!match) return DEFAULT_SAMPLE_RATE;
  const rate = Number(match[1]);
  return SUPPORTED_RATES.includes(rate) ? rate : DEFAULT_SAMPLE_RATE;
}

/**
 * Decode UTF-8 bytes to a string without assuming `TextDecoder` exists.
 *
 * @remarks
 * Prefers the standard `TextDecoder`; falls back to Node's `Buffer`, then to
 * a Latin-1 interpretation (sufficient for Vonage's ASCII JSON events) in
 * minimal environments such as older jsdom test setups.
 *
 * @param bytes - The UTF-8 encoded bytes.
 * @returns The decoded string.
 */
function bytesToUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder().decode(bytes);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('utf8');
  }
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    result += String.fromCharCode(bytes[i] as number);
  }
  return result;
}
