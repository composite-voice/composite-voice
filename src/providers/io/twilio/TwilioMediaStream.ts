/**
 * Twilio Media Streams duplex platform provider for phone-call voice agents.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link TwilioMediaStream} class, a duplex provider
 * covering both the `'input'` and `'output'` pipeline roles. It connects the
 * CompositeVoice pipeline to a live phone call through
 * {@link https://www.twilio.com/docs/voice/media-streams | Twilio Media Streams}.
 *
 * Twilio connects **to your server** over WebSocket when a call executes
 * `<Connect><Stream url="wss://your-server/..."/>` TwiML (bidirectional
 * streams require `<Connect>`, not `<Start>`). The provider does not run a
 * WebSocket server itself — your application accepts each connection and
 * hands the socket to the provider via
 * {@link TwilioMediaStream.attach | attach()}. Both Node `ws`-style sockets
 * (`on('message', ...)`) and browser-style sockets
 * (`addEventListener('message', ...)`) are supported through duck typing.
 *
 * `TwilioMediaStream` has zero dependencies: audio arrives and leaves as
 * base64-encoded G.711 mu-law at 8 kHz mono, handled entirely with the SDK's
 * built-in codecs in `utils/g711`.
 *
 * **Data-flow diagram:**
 *
 * ```
 *                        ┌─────────────────────────┐
 *  Twilio  ──"media"───▶ │                         │ ──onAudio(chunk)──▶ InputQueue ──▶ [STT]
 *  (caller audio,        │                         │     (raw mu-law 8 kHz mono)
 *   base64 mu-law)       │    TwilioMediaStream    │
 *                        │                         │
 *  Twilio  ◀──"media"─── │                         │ ◀──enqueue(chunk)── OutputQueue ◀── [TTS]
 *  (agent audio,         │                         │     (mu-law passthrough, or
 *   base64 mu-law)       └─────────────────────────┘      linear16 → resample → mu-law)
 *
 *  flush()  ──"mark"──▶  Twilio ──echoes "mark"──▶ flush() resolves
 *  stop()   ──"clear"─▶  Twilio drops buffered audio (barge-in)
 * ```
 *
 * @example
 * ```typescript
 * import { CompositeVoice, TwilioMediaStream, DeepgramSTT, AnthropicLLM, DeepgramTTS } from 'composite-voice';
 * import { WebSocketServer } from 'ws';
 *
 * const wss = new WebSocketServer({ port: 8080 });
 * wss.on('connection', async (socket) => {
 *   const twilio = new TwilioMediaStream();
 *   const agent = new CompositeVoice({
 *     providers: [
 *       twilio,
 *       new DeepgramSTT({ apiKey: '...', options: { encoding: 'mulaw', sampleRate: 8000 } }),
 *       new AnthropicLLM({ apiKey: '...', model: 'claude-haiku-4-5' }),
 *       new DeepgramTTS({ apiKey: '...', options: { encoding: 'mulaw', sampleRate: 8000 } }),
 *     ],
 *   });
 *   twilio.attach(socket);
 *   await agent.initialize();
 *   await agent.startListening();
 * });
 * ```
 *
 * @see {@link https://www.twilio.com/docs/voice/media-streams/websocket-messages | Twilio WebSocket message reference}
 * @see {@link AudioInputProvider} and {@link AudioOutputProvider} for the interface contracts
 * @see {@link BufferInput} and {@link NullOutput} for single-role server-side counterparts
 */

import type { AudioChunk, AudioMetadata } from '../../../core/types/audio';
import type {
  AudioInputProvider,
  AudioOutputProvider,
  ProviderType,
} from '../../../core/types/providers';
import type { ProviderRole } from '../../../core/types/roles';
import { downsampleAudio, resamplePcm, floatTo16BitPCM, int16ToFloat } from '../../../utils/audio';
import { encodeMulaw } from '../../../utils/g711';
import { ConfigurationError } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';

/**
 * Configuration options for {@link TwilioMediaStream}.
 *
 * @remarks
 * The provider needs no credentials: authentication happens before the
 * WebSocket reaches the provider (Twilio connects to the URL in your TwiML,
 * and your server accepts or rejects the connection). The only option is
 * debug logging.
 *
 * @example
 * ```typescript
 * const twilio = new TwilioMediaStream({ debug: true });
 * ```
 */
export interface TwilioMediaStreamConfig {
  /**
   * Enable debug logging for wire messages and state transitions.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

/**
 * Minimal duck-typed WebSocket surface accepted by
 * {@link TwilioMediaStream.attach | attach()}.
 *
 * @remarks
 * Matches both Node `ws` sockets (`on`/`off`/`removeListener`) and
 * browser-style sockets (`addEventListener`/`removeEventListener`).
 * Only `send()` is required; event wiring uses whichever listener API
 * the socket exposes (`on` is preferred when both exist).
 *
 * @see {@link TwilioMediaStream.attach | attach()} for usage
 */
/**
 * Loosest-possible event-listener shape for {@link TwilioStreamSocket}.
 *
 * @remarks
 * Deliberately `(...args: any[]) => void`: both the DOM `WebSocket` and the
 * `ws` package type `addEventListener`/`on` as generic **properties** with
 * per-event listener types, so any stricter shape here makes real sockets
 * unassignable to {@link TwilioStreamSocket} under `strictFunctionTypes`.
 * The provider narrows the event payloads internally.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TwilioSocketListener = (...args: any[]) => void;

export interface TwilioStreamSocket {
  /** Send a text frame to Twilio. */
  send(data: string): void;

  /** Close the socket (optional; the application owns the socket lifecycle). */
  close?(): void;

  /** Node `ws`-style event subscription (`socket.on('message', cb)`). */
  on?(event: string, listener: TwilioSocketListener): void;

  /** Node `ws`-style event unsubscription. */
  off?(event: string, listener: TwilioSocketListener): void;

  /** Node `EventEmitter`-style event unsubscription (older `ws` versions). */
  removeListener?(event: string, listener: TwilioSocketListener): void;

  /** Browser-style event subscription (`socket.addEventListener('message', cb)`). */
  addEventListener?(event: string, listener: TwilioSocketListener): void;

  /** Browser-style event unsubscription. */
  removeEventListener?(event: string, listener: TwilioSocketListener): void;
}

/** Parsed shape of Twilio's `start` message payload. @internal */
interface TwilioStartPayload {
  accountSid?: string;
  streamSid?: string;
  callSid?: string;
  tracks?: string[];
  mediaFormat?: { encoding?: string; sampleRate?: number; channels?: number };
  customParameters?: Record<string, string>;
}

/** Parsed shape of an inbound Twilio WebSocket message. @internal */
interface TwilioInboundMessage {
  event?: string;
  sequenceNumber?: string;
  streamSid?: string;
  start?: TwilioStartPayload;
  media?: { track?: string; chunk?: string; timestamp?: string; payload?: string };
  mark?: { name?: string };
  stop?: Record<string, unknown>;
  dtmf?: { track?: string; digit?: string };
}

/** Internal listener bookkeeping for detach(). @internal */
interface AttachedListeners {
  style: 'node' | 'dom';
  message: (...args: unknown[]) => void;
  close: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

/** Output conversion mode decided by {@link TwilioMediaStream.configure}. @internal */
type OutputMode = 'passthrough' | 'linear16';

/**
 * Duplex input/output provider for Twilio Media Streams phone calls.
 *
 * @remarks
 * `TwilioMediaStream` covers both the `'input'` and `'output'` pipeline
 * roles for a single phone call:
 *
 * - **Input** — Twilio `media` messages (base64 mu-law, 8 kHz mono) are
 *   decoded and emitted as {@link AudioChunk} objects while the provider is
 *   started and not paused. {@link TwilioMediaStream.getMetadata | getMetadata()}
 *   reports `mulaw`/8000/mono so the pipeline can auto-configure STT.
 * - **Output** — TTS audio is converted to base64 mu-law and sent to Twilio
 *   as `media` messages. mu-law @ 8 kHz passes through untouched; linear16
 *   at any sample rate is resampled to 8 kHz and G.711-encoded. Any other
 *   format makes {@link TwilioMediaStream.configure | configure()} throw with
 *   instructions for fixing the TTS configuration.
 * - **Flush** — {@link TwilioMediaStream.flush | flush()} sends a `mark`
 *   message; Twilio echoes the mark back once playback reaches it, which
 *   resolves the flush promise.
 * - **Barge-in** — {@link TwilioMediaStream.stop | stop()} sends a `clear`
 *   message so Twilio drops its buffered audio immediately, and settles any
 *   pending flushes as cancelled.
 *
 * The application owns the WebSocket server: accept each Twilio connection
 * and pass the socket to {@link TwilioMediaStream.attach | attach()}. Calling
 * `attach()` again replaces (and unwires) the previous socket.
 *
 * **Duplex method notes:** `stop()` serves both roles — it halts input
 * emission *and* clears Twilio's playback buffer. `pause()`/`resume()` apply
 * to the **input side only** (the turn-taking controller uses them to gate
 * capture during agent speech); Twilio buffers outbound audio server-side and
 * offers no way to pause playback mid-call.
 *
 * **Data-flow diagram:**
 *
 * ```
 * Twilio "media"(base64 mu-law) ──▶ decode ──▶ onAudio(chunk) ──▶ [STT]
 * [TTS] ──▶ enqueue(chunk) ──▶ mu-law/8k? passthrough : resample+encode ──▶ "media" ──▶ Twilio
 * flush() ──▶ "mark" ──▶ Twilio echo ──▶ resolve
 * stop()  ──▶ "clear" ──▶ Twilio drops buffer (barge-in)
 * ```
 *
 * @example
 * ```typescript
 * import { TwilioMediaStream } from 'composite-voice';
 *
 * const twilio = new TwilioMediaStream({ debug: true });
 * await twilio.initialize();
 *
 * twilio.onDtmf((digit) => console.log('Caller pressed', digit));
 * twilio.onCallEnded(() => console.log('Call ended'));
 *
 * wss.on('connection', (socket) => twilio.attach(socket));
 * ```
 *
 * @see {@link TwilioMediaStreamConfig} for configuration options
 * @see {@link TwilioStreamSocket} for the accepted socket shape
 */
export class TwilioMediaStream implements AudioInputProvider, AudioOutputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `'websocket'` because the provider holds a persistent WebSocket for the
   * lifetime of the call (even though the application accepts the connection).
   */
  public readonly type: ProviderType = 'websocket';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `TwilioMediaStream` is a duplex provider covering the `'input'` and
   * `'output'` slots. Separate STT, LLM, and TTS providers are still required.
   */
  public readonly roles: readonly ProviderRole[] = ['input', 'output'];

  /** Structured logger scoped to this provider. */
  private readonly logger: Logger;

  /** Whether this provider has been initialized. */
  private initialized = false;

  // ── Socket state ──────────────────────────────────────────────────

  /** Currently attached WebSocket, if any. */
  private socket: TwilioStreamSocket | null = null;

  /** Listener references for the attached socket (for detach). */
  private listeners: AttachedListeners | null = null;

  // ── Call state ────────────────────────────────────────────────────

  /** Stream SID captured from Twilio's `start` message. */
  private streamSid: string | null = null;

  /** Call SID captured from Twilio's `start` message. */
  private callSid: string | null = null;

  /** Custom parameters from the TwiML `<Stream>` element. */
  private customParameters: Record<string, string> = {};

  /** Whether the call has ended (Twilio `stop` message or socket close). */
  private callEnded = false;

  // ── Input state ───────────────────────────────────────────────────

  /** Whether the input side is started. */
  private active = false;

  /** Whether the input side is paused. */
  private paused = false;

  /** Registered callback for captured audio chunks. */
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;

  /** Monotonically increasing sequence number for emitted chunks. */
  private sequenceNumber = 0;

  // ── Output state ──────────────────────────────────────────────────

  /** Conversion mode decided by {@link configure}. */
  private outputMode: OutputMode = 'passthrough';

  /** Sample rate of incoming TTS audio when {@link outputMode} is `'linear16'`. */
  private outputSampleRate = 8000;

  /** Whether audio delivery is in progress (between first enqueue and drain). */
  private playing = false;

  /** Counter used to generate unique mark names (`cv-1`, `cv-2`, ...). */
  private markCounter = 0;

  /** Pending flush resolvers keyed by mark name. */
  private readonly pendingMarks = new Map<string, () => void>();

  // ── Callbacks ─────────────────────────────────────────────────────

  /** Registered playback-start callback. */
  private playbackStartCallback: (() => void) | null = null;

  /** Registered playback-end callback. */
  private playbackEndCallback: (() => void) | null = null;

  /** Registered playback-error callback. */
  private playbackErrorCallback: ((error: Error) => void) | null = null;

  /** Registered DTMF callback. */
  private dtmfCallback: ((digit: string) => void) | null = null;

  /** Registered call-ended callback. */
  private callEndedCallback: (() => void) | null = null;

  /**
   * Creates a new `TwilioMediaStream` instance.
   *
   * @remarks
   * No credentials are needed — the WebSocket handed to
   * {@link TwilioMediaStream.attach | attach()} is already authenticated by
   * your server (Twilio connects to the URL you put in your TwiML).
   *
   * @param config - Optional configuration (debug logging).
   *
   * @example
   * ```typescript
   * const twilio = new TwilioMediaStream({ debug: true });
   * ```
   */
  constructor(config: TwilioMediaStreamConfig = {}) {
    this.logger = new Logger(this.constructor.name, {
      enabled: true,
      level: config.debug ? 'debug' : 'warn',
    });
  }

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Initialize the provider, making it ready to accept a socket.
   *
   * @remarks
   * A no-op beyond setting the initialized flag — the WebSocket is created
   * by Twilio and accepted by your server, not by the provider. If already
   * initialized, this is a no-op.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    this.logger.debug('Initialized');
  }

  /**
   * Dispose of the provider and release all state.
   *
   * @remarks
   * Detaches the current socket (removing the provider's listeners), settles
   * any pending flushes, and resets all call/input/output state. The socket
   * itself is **not** closed — the application owns its lifecycle. After
   * disposal the provider can be re-initialized.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) return;
    this.detach();
    this.settlePendingMarks('dispose');
    this.active = false;
    this.paused = false;
    this.playing = false;
    this.audioCallback = null;
    this.sequenceNumber = 0;
    this.markCounter = 0;
    this.streamSid = null;
    this.callSid = null;
    this.customParameters = {};
    this.callEnded = false;
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
   * Attach an accepted Twilio WebSocket to the provider.
   *
   * @remarks
   * Call this from your WebSocket server's connection handler. The socket is
   * duck-typed ({@link TwilioStreamSocket}): both Node `ws` sockets
   * (`on('message', ...)`) and browser-style sockets
   * (`addEventListener('message', ...)`) work. If a socket is already
   * attached, it is detached first (its listeners are removed and any
   * pending flushes are settled).
   *
   * @param socket - The WebSocket accepted from Twilio's connection to your
   *   TwiML `<Stream>` URL.
   *
   * @example
   * ```typescript
   * wss.on('connection', (socket) => {
   *   twilio.attach(socket);
   * });
   * ```
   *
   * @see {@link TwilioMediaStream.detach | detach()} to unwire manually
   */
  attach(socket: TwilioStreamSocket): void {
    if (this.socket) {
      this.detach();
    }

    // Reset per-call state for the new connection
    this.streamSid = null;
    this.callSid = null;
    this.customParameters = {};
    this.callEnded = false;
    this.playing = false;

    const messageListener = (...args: unknown[]): void => {
      this.handleMessageEvent(args[0]);
    };
    const closeListener = (): void => {
      this.handleCallEnded('socket closed');
    };
    // A Node `ws` socket with no 'error' listener re-throws as an uncaught
    // exception, which takes the whole server down on a single ECONNRESET.
    // Treat it as the call ending — 'close' may never arrive.
    const errorListener = (...args: unknown[]): void => {
      const error = args[0] instanceof Error ? args[0] : new Error(String(args[0]));
      this.logger.warn('Socket error', error);
      this.handleCallEnded(`socket error: ${error.message}`);
    };

    if (typeof socket.on === 'function') {
      socket.on('message', messageListener);
      socket.on('close', closeListener);
      socket.on('error', errorListener);
      this.listeners = {
        style: 'node',
        message: messageListener,
        close: closeListener,
        error: errorListener,
      };
    } else if (typeof socket.addEventListener === 'function') {
      socket.addEventListener('message', messageListener);
      socket.addEventListener('close', closeListener);
      socket.addEventListener('error', errorListener);
      this.listeners = {
        style: 'dom',
        message: messageListener,
        close: closeListener,
        error: errorListener,
      };
    } else {
      throw new ConfigurationError(
        'TwilioMediaStream.attach() requires a socket with on() or addEventListener() ' +
          'for message/close events (Node "ws" sockets and browser WebSockets both work).'
      );
    }

    this.socket = socket;
    this.logger.debug('Socket attached');
  }

  /**
   * Detach the current socket without closing it.
   *
   * @remarks
   * Removes the provider's `message`/`close` listeners from the socket and
   * forgets it. Pending flushes are settled as cancelled. The socket remains
   * open — closing it is the application's responsibility. Safe to call when
   * no socket is attached.
   *
   * @see {@link TwilioMediaStream.attach | attach()}
   */
  detach(): void {
    const socket = this.socket;
    const listeners = this.listeners;
    if (!socket || !listeners) {
      this.socket = null;
      this.listeners = null;
      return;
    }

    if (listeners.style === 'node') {
      const remove = socket.off ?? socket.removeListener;
      if (typeof remove === 'function') {
        remove.call(socket, 'message', listeners.message);
        remove.call(socket, 'close', listeners.close);
        remove.call(socket, 'error', listeners.error);
      }
    } else if (typeof socket.removeEventListener === 'function') {
      socket.removeEventListener(
        'message',
        listeners.message as (event: { data: unknown }) => void
      );
      socket.removeEventListener('close', listeners.close as (event: { data: unknown }) => void);
      socket.removeEventListener('error', listeners.error as (event: { data: unknown }) => void);
    }

    this.socket = null;
    this.listeners = null;
    this.settlePendingMarks('detach');
    this.logger.debug('Socket detached');
  }

  /**
   * Get the Twilio stream SID for the current call.
   *
   * @remarks
   * Captured from Twilio's `start` message. `null` until the `start` message
   * arrives (i.e. immediately after {@link attach}).
   *
   * @returns The `MZ...` stream SID, or `null` before the stream starts.
   */
  getStreamSid(): string | null {
    return this.streamSid;
  }

  /**
   * Get the Twilio call SID for the current call.
   *
   * @remarks
   * Captured from Twilio's `start` message. Useful for correlating the media
   * stream with Twilio REST API operations on the call (e.g. redirects,
   * recordings, hangup).
   *
   * @returns The `CA...` call SID, or `null` before the stream starts.
   */
  getCallSid(): string | null {
    return this.callSid;
  }

  /**
   * Get the custom parameters declared on the TwiML `<Stream>` element.
   *
   * @remarks
   * TwiML `<Parameter name="..." value="..."/>` children of `<Stream>` are
   * delivered in Twilio's `start` message and exposed here — handy for
   * passing per-call context (user id, session token) into the voice agent.
   *
   * @returns A copy of the custom parameters map (empty before `start`).
   *
   * @example
   * ```typescript
   * // TwiML: <Stream url="..."><Parameter name="userId" value="42"/></Stream>
   * const { userId } = twilio.getCustomParameters();
   * ```
   */
  getCustomParameters(): Record<string, string> {
    return { ...this.customParameters };
  }

  /**
   * Register a callback for DTMF digits pressed by the caller.
   *
   * @remarks
   * Twilio delivers keypad presses as `dtmf` messages on the media stream.
   * Only one callback can be registered; subsequent calls replace it.
   *
   * @param callback - Invoked with the pressed digit (`'0'`-`'9'`, `'*'`, `'#'`).
   *
   * @example
   * ```typescript
   * twilio.onDtmf((digit) => {
   *   if (digit === '0') transferToHuman();
   * });
   * ```
   */
  onDtmf(callback: (digit: string) => void): void {
    this.dtmfCallback = callback;
  }

  /**
   * Register a callback invoked when the call ends.
   *
   * @remarks
   * Fires once per call, when Twilio sends its `stop` message (caller hung
   * up or the TwiML moved on) or when the socket closes without one. Use it
   * to tear down the pipeline for this call.
   *
   * @param callback - Invoked when the media stream ends.
   *
   * @example
   * ```typescript
   * twilio.onCallEnded(async () => {
   *   await agent.dispose();
   * });
   * ```
   */
  onCallEnded(callback: () => void): void {
    this.callEndedCallback = callback;
  }

  // ── AudioInputProvider interface ─────────────────────────────────

  /**
   * Start emitting caller audio chunks.
   *
   * @remarks
   * After calling `start()`, inbound Twilio `media` messages are decoded and
   * delivered to the callback registered with
   * {@link TwilioMediaStream.onAudio | onAudio()}. Media received while the
   * provider is stopped or paused is silently dropped.
   */
  start(): void {
    this.active = true;
    this.paused = false;
  }

  /**
   * Stop the provider — barge-in while the agent is speaking, input halt
   * otherwise.
   *
   * @remarks
   * As a duplex provider, the same `stop()` is invoked by CompositeVoice for
   * two different reasons, so the provider dispatches on playback state:
   *
   * - **Barge-in** (`output.stop()`) — while agent audio is playing or marks
   *   are outstanding, a `clear` message
   *   (`{"event":"clear","streamSid":"MZ..."}`) is sent so Twilio immediately
   *   drops any audio it has buffered but not yet played. Outstanding marks
   *   are settled as **cancelled** (their `flush()` promises resolve so the
   *   pipeline never hangs) and the late mark echoes are ignored. Caller
   *   audio capture is deliberately **not** halted: barge-in happens because
   *   the caller is speaking, and that speech must keep flowing to STT.
   * - **Stop listening** (`input.stop()`) — when no agent audio is playing
   *   and no marks are outstanding, caller audio is no longer emitted
   *   (restart with {@link TwilioMediaStream.start | start()}).
   *
   * Fires `onPlaybackEnd` if playback was in progress.
   */
  stop(): void {
    const bargeIn = this.playing || this.pendingMarks.size > 0;

    if (bargeIn) {
      this.stopPlayback();
      return;
    }

    this.stopCapture();
  }

  /**
   * Stop playback, leaving caller audio flowing.
   *
   * @remarks
   * The pipeline calls this for barge-in, so the provider never has to infer
   * which side was meant. Sends Twilio a `clear` so it drops audio already
   * buffered on its side, settles outstanding marks as cancelled (their
   * `flush()` promises resolve, so the pipeline cannot hang), and ignores the
   * late mark echoes that follow.
   *
   * Capture is deliberately untouched: barge-in fires because the caller is
   * speaking, and that speech has to reach STT. Safe when nothing is playing —
   * barge-in is also raised while the agent is still `thinking`.
   */
  stopPlayback(): void {
    if (this.socket && this.streamSid && !this.callEnded) {
      this.sendJson({ event: 'clear', streamSid: this.streamSid });
    }
    this.settlePendingMarks('stop (barge-in)');
    this.playing = false;
    this.firePlaybackEnd();
  }

  /**
   * Stop emitting caller audio, leaving any playback alone.
   *
   * @remarks
   * The pipeline calls this when it means "stop listening". Restart with
   * {@link TwilioMediaStream.start | start()}.
   */
  stopCapture(): void {
    this.active = false;
    this.paused = false;
  }

  /**
   * Temporarily pause input emission without detaching the socket.
   *
   * @remarks
   * Applies to the **input side only** — the turn-taking controller calls
   * this to mute capture while the agent speaks. Outbound audio delivery is
   * unaffected (Twilio buffers it server-side and cannot pause playback).
   * Caller audio received while paused is silently dropped. Resume with
   * {@link TwilioMediaStream.resume | resume()}.
   */
  pause(): void {
    if (this.active) {
      this.paused = true;
    }
  }

  /**
   * Resume input emission after a pause.
   *
   * @see {@link TwilioMediaStream.pause | pause}
   */
  resume(): void {
    if (this.active) {
      this.paused = false;
    }
  }

  /**
   * Check whether the input side is actively emitting audio.
   *
   * @returns `true` when started and not paused.
   */
  isActive(): boolean {
    return this.active && !this.paused;
  }

  /**
   * Register a callback to receive caller audio chunks.
   *
   * @remarks
   * Chunks contain raw G.711 mu-law bytes at 8 kHz mono, exactly as decoded
   * from Twilio's base64 `media` payloads. Only one callback can be
   * registered at a time; subsequent calls replace the previous callback.
   * Must be called before {@link TwilioMediaStream.start | start()}.
   *
   * @param callback - Function invoked with each {@link AudioChunk}.
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Get the audio format metadata for caller audio.
   *
   * @remarks
   * Twilio Media Streams always deliver G.711 mu-law at 8 kHz mono
   * (`audio/x-mulaw`). The pipeline uses this metadata to auto-configure the
   * STT provider — e.g. Deepgram receives `encoding=mulaw&sample_rate=8000`.
   * `bitDepth` is omitted because mu-law samples are companded, not linear.
   *
   * @returns Metadata describing mu-law 8 kHz mono audio.
   */
  getMetadata(): AudioMetadata {
    return {
      encoding: 'mulaw',
      sampleRate: 8000,
      channels: 1,
      mimeType: 'audio/basic',
    };
  }

  // ── AudioOutputProvider interface ────────────────────────────────

  /**
   * Configure the output with the format of incoming TTS audio.
   *
   * @remarks
   * Twilio only accepts G.711 mu-law at 8 kHz mono, so the accepted formats are:
   *
   * 1. **`mulaw` @ 8000 Hz** — passthrough (recommended; zero conversion cost).
   * 2. **`linear16` at any sample rate** — resampled to 8 kHz and mu-law
   *    encoded by the provider.
   *
   * Anything else (mp3, opus, alaw, multi-channel audio) throws a
   * {@link ConfigurationError} telling you how to reconfigure the TTS, e.g.
   * `new DeepgramTTS({ options: { encoding: 'mulaw', sampleRate: 8000 } })`.
   *
   * @param metadata - Format description for the incoming TTS audio.
   *
   * @throws {@link ConfigurationError}
   * If the TTS format cannot be converted to mu-law 8 kHz mono.
   */
  configure(metadata: AudioMetadata): void {
    if ((metadata.channels ?? 1) !== 1) {
      throw new ConfigurationError(
        `TwilioMediaStream requires mono TTS audio, got ${metadata.channels} channels. ` +
          `Configure your TTS for telephony output, e.g. ` +
          `DeepgramTTS({ encoding: 'mulaw', sampleRate: 8000 }).`
      );
    }

    if (metadata.encoding === 'mulaw' && metadata.sampleRate === 8000) {
      this.outputMode = 'passthrough';
      this.outputSampleRate = 8000;
    } else if (metadata.encoding === 'linear16') {
      this.outputMode = 'linear16';
      this.outputSampleRate = metadata.sampleRate;
    } else {
      throw new ConfigurationError(
        `TwilioMediaStream cannot convert '${metadata.encoding}' @ ${metadata.sampleRate} Hz ` +
          `to the mu-law 8000 Hz mono format Twilio requires. Configure your TTS to emit ` +
          `mulaw at 8000 Hz (e.g. DeepgramTTS({ encoding: 'mulaw', sampleRate: 8000 })) ` +
          `or linear16 at any sample rate.`
      );
    }

    this.logger.debug(
      `Output configured: ${metadata.encoding} @ ${metadata.sampleRate} Hz (${this.outputMode})`
    );
  }

  /**
   * Enqueue a TTS audio chunk for delivery into the call.
   *
   * @remarks
   * The chunk is converted per the format set by
   * {@link TwilioMediaStream.configure | configure()} (mu-law passthrough, or
   * linear16 → resample to 8 kHz → mu-law) and sent immediately as a Twilio
   * `media` message:
   *
   * ```json
   * {"event":"media","streamSid":"MZ...","media":{"payload":"<base64 mu-law>"}}
   * ```
   *
   * Twilio buffers outbound audio server-side and plays it in real time, so
   * no local pacing is needed. Chunks enqueued before the stream's `start`
   * message arrives (no `streamSid` yet), before a socket is attached, or
   * after the call ends are dropped with a warning. Fires `onPlaybackStart`
   * on the first chunk after idle.
   *
   * If `chunk.metadata` is present it overrides the configured format for
   * that chunk. When `configure()` was never called, mu-law @ 8 kHz
   * passthrough is assumed.
   *
   * @param chunk - Audio data from the TTS stage.
   */
  enqueue(chunk: AudioChunk): void {
    if (!this.socket || !this.streamSid || this.callEnded) {
      this.logger.warn('Dropping output chunk: no active Twilio stream');
      return;
    }

    let mulawBytes: Uint8Array;
    try {
      mulawBytes = this.toMulaw(chunk);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to convert output chunk', err);
      this.playbackErrorCallback?.(err);
      return;
    }

    const sent = this.sendJson({
      event: 'media',
      streamSid: this.streamSid,
      media: { payload: this.encodeBase64(mulawBytes) },
    });

    if (sent && !this.playing) {
      this.playing = true;
      this.playbackStartCallback?.();
    }
  }

  /**
   * Wait until Twilio has played all audio enqueued so far.
   *
   * @remarks
   * Sends a `mark` message (`{"event":"mark","streamSid":"MZ...","mark":{"name":"cv-<n>"}}`)
   * after the batch of media. Twilio echoes the mark back once call playback
   * reaches it, which resolves the returned promise and — when no other marks
   * are outstanding — fires `onPlaybackEnd`.
   *
   * Resolves immediately when nothing is playing or no stream is active.
   * A pending flush also resolves (as cancelled) on barge-in
   * ({@link TwilioMediaStream.stop | stop()}), remote hangup, detach, or
   * dispose, so the pipeline never hangs on a dead call.
   */
  async flush(): Promise<void> {
    if (!this.socket || !this.streamSid || this.callEnded || !this.playing) {
      return;
    }

    const name = `cv-${++this.markCounter}`;
    const sent = this.sendJson({
      event: 'mark',
      streamSid: this.streamSid,
      mark: { name },
    });
    if (!sent) return;

    return new Promise<void>((resolve) => {
      this.pendingMarks.set(name, resolve);
    });
  }

  /**
   * Check whether audio is currently being delivered into the call.
   *
   * @returns `true` between the first enqueued chunk and the point where all
   *   flush marks have been echoed (or playback was stopped).
   */
  isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Register a callback invoked when audio delivery begins after idle.
   *
   * @param callback - Function called when playback starts.
   */
  onPlaybackStart(callback: () => void): void {
    this.playbackStartCallback = callback;
  }

  /**
   * Register a callback invoked when the playback queue fully drains.
   *
   * @remarks
   * Fires when the final outstanding flush mark is echoed by Twilio, or when
   * playback is cut short by barge-in ({@link TwilioMediaStream.stop | stop()})
   * or remote hangup.
   *
   * @param callback - Function called when playback ends.
   */
  onPlaybackEnd(callback: () => void): void {
    this.playbackEndCallback = callback;
  }

  /**
   * Register a callback for playback delivery errors.
   *
   * @remarks
   * Fires when a chunk cannot be converted or the socket `send()` throws.
   *
   * @param callback - Function called with the error.
   */
  onPlaybackError(callback: (error: Error) => void): void {
    this.playbackErrorCallback = callback;
  }

  // ── Inbound message handling ─────────────────────────────────────

  /**
   * Normalize a socket message event and dispatch the parsed JSON.
   *
   * @remarks
   * Node `ws` delivers `(data, isBinary)` where data is a `Buffer` or
   * string; browser sockets deliver a `MessageEvent` with a `data` property.
   * Twilio only sends JSON text frames. Unparseable frames are logged and
   * ignored.
   *
   * @param raw - First argument of the socket's message event.
   */
  private handleMessageEvent(raw: unknown): void {
    let text: string;

    // Browser-style MessageEvent: unwrap .data
    const payload =
      typeof raw === 'object' && raw !== null && 'data' in raw
        ? (raw as { data: unknown }).data
        : raw;

    if (typeof payload === 'string') {
      text = payload;
    } else if (payload instanceof ArrayBuffer) {
      text = this.bytesToString(new Uint8Array(payload));
    } else if (ArrayBuffer.isView(payload)) {
      const view = payload as ArrayBufferView;
      text = this.bytesToString(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    } else {
      this.logger.warn('Ignoring unrecognized WebSocket frame');
      return;
    }

    let message: TwilioInboundMessage;
    try {
      message = JSON.parse(text) as TwilioInboundMessage;
    } catch {
      this.logger.warn('Ignoring non-JSON frame from Twilio');
      return;
    }

    this.handleTwilioMessage(message);
  }

  /**
   * Dispatch a parsed Twilio message by its `event` field.
   *
   * @param message - The parsed inbound message.
   */
  private handleTwilioMessage(message: TwilioInboundMessage): void {
    switch (message.event) {
      case 'connected':
        this.logger.debug('Twilio connected handshake received');
        break;
      case 'start':
        this.handleStart(message);
        break;
      case 'media':
        this.handleMedia(message);
        break;
      case 'mark':
        this.handleMark(message);
        break;
      case 'stop':
        this.handleCallEnded('Twilio stop event');
        break;
      case 'dtmf':
        if (message.dtmf?.digit !== undefined) {
          this.logger.debug(`DTMF digit received: ${message.dtmf.digit}`);
          this.dtmfCallback?.(message.dtmf.digit);
        }
        break;
      default:
        this.logger.debug(`Ignoring unknown Twilio event: ${String(message.event)}`);
    }
  }

  /**
   * Handle Twilio's `start` message: capture call identifiers.
   *
   * @param message - The parsed `start` message.
   */
  private handleStart(message: TwilioInboundMessage): void {
    const start = message.start ?? {};
    this.streamSid = start.streamSid ?? message.streamSid ?? null;
    this.callSid = start.callSid ?? null;
    this.customParameters = { ...(start.customParameters ?? {}) };
    this.callEnded = false;

    const format = start.mediaFormat;
    if (format && (format.encoding !== 'audio/x-mulaw' || format.sampleRate !== 8000)) {
      this.logger.warn(
        `Unexpected Twilio media format: ${String(format.encoding)} @ ${String(format.sampleRate)} Hz ` +
          '(expected audio/x-mulaw @ 8000 Hz)'
      );
    }

    this.logger.info(
      `Stream started: streamSid=${String(this.streamSid)} callSid=${String(this.callSid)}`
    );
  }

  /**
   * Handle a Twilio `media` message: decode and emit caller audio.
   *
   * @remarks
   * Only `inbound` track media is emitted (bidirectional streams can also
   * carry the `outbound` track when configured). Audio is dropped silently
   * while the provider is stopped or paused, per the input contract.
   *
   * @param message - The parsed `media` message.
   */
  private handleMedia(message: TwilioInboundMessage): void {
    const media = message.media;
    if (!media?.payload) return;
    if (media.track !== undefined && media.track !== 'inbound') return;
    if (!this.active || this.paused || !this.audioCallback) return;

    let data: ArrayBuffer;
    try {
      data = this.decodeBase64(media.payload);
    } catch {
      this.logger.warn('Ignoring media payload with invalid base64');
      return;
    }

    const chunk: AudioChunk = {
      data,
      timestamp: Date.now(),
      sequence: this.sequenceNumber++,
    };
    this.audioCallback(chunk);
  }

  /**
   * Handle a Twilio `mark` echo: resolve the matching pending flush.
   *
   * @remarks
   * When the last outstanding mark resolves, playback is considered drained
   * and `onPlaybackEnd` fires. Echoes for marks already settled (e.g. after
   * a barge-in `clear`) are ignored.
   *
   * @param message - The parsed `mark` message.
   */
  private handleMark(message: TwilioInboundMessage): void {
    const name = message.mark?.name;
    if (name === undefined) return;

    const resolve = this.pendingMarks.get(name);
    if (!resolve) {
      this.logger.debug(`Ignoring echo for unknown/cancelled mark: ${name}`);
      return;
    }

    this.pendingMarks.delete(name);
    resolve();
    this.logger.debug(`Mark reached by playback: ${name}`);

    if (this.pendingMarks.size === 0 && this.playing) {
      this.playing = false;
      this.firePlaybackEnd();
    }
  }

  /**
   * Handle end-of-call (Twilio `stop` message or socket close).
   *
   * @remarks
   * Treated as a remote hangup: input emission stops, pending flushes are
   * settled so the pipeline never hangs, `onPlaybackEnd` fires if audio was
   * being delivered, and the registered
   * {@link TwilioMediaStream.onCallEnded | onCallEnded} callback is invoked
   * exactly once per call.
   *
   * @param reason - Human-readable trigger, for logging.
   */
  private handleCallEnded(reason: string): void {
    if (this.callEnded) return;
    this.callEnded = true;
    this.active = false;
    this.paused = false;

    this.settlePendingMarks(reason);
    if (this.playing) {
      this.playing = false;
      this.firePlaybackEnd();
    }

    this.logger.info(`Call ended (${reason})`);
    this.callEndedCallback?.();
  }

  // ── Internal helpers ─────────────────────────────────────────────

  /**
   * Serialize and send a JSON message to Twilio.
   *
   * @param message - The message object to send.
   * @returns `true` when the send succeeded, `false` when it failed (the
   *   error is logged and reported via `onPlaybackError`).
   */
  private sendJson(message: Record<string, unknown>): boolean {
    if (!this.socket) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error('Failed to send message to Twilio', err);
      this.playbackErrorCallback?.(err);
      return false;
    }
  }

  /**
   * Convert a TTS chunk to raw mu-law bytes per the configured output mode.
   *
   * @remarks
   * Per-chunk `metadata` overrides the configured format. linear16 audio at
   * exactly 8 kHz is mu-law encoded directly; other rates go through
   * `int16 → float → resample to 8 kHz → int16 → mu-law` using the SDK's
   * audio utilities ({@link downsampleAudio} when reducing the rate — its
   * averaging acts as a crude low-pass — and {@link resamplePcm} when
   * increasing it).
   *
   * @param chunk - The TTS audio chunk.
   * @returns Raw mu-law bytes ready for base64 encoding.
   *
   * @throws {@link ConfigurationError}
   * If the chunk carries per-chunk metadata in an unsupported format.
   */
  private toMulaw(chunk: AudioChunk): Uint8Array {
    let mode = this.outputMode;
    let sampleRate = this.outputSampleRate;

    if (chunk.metadata) {
      if (chunk.metadata.encoding === 'mulaw' && chunk.metadata.sampleRate === 8000) {
        mode = 'passthrough';
        sampleRate = 8000;
      } else if (chunk.metadata.encoding === 'linear16') {
        mode = 'linear16';
        sampleRate = chunk.metadata.sampleRate;
      } else {
        throw new ConfigurationError(
          `TwilioMediaStream cannot convert chunk with encoding '${chunk.metadata.encoding}' ` +
            `to mu-law 8000 Hz. Configure your TTS for mulaw @ 8000 Hz ` +
            `(e.g. DeepgramTTS({ encoding: 'mulaw', sampleRate: 8000 })).`
        );
      }
    }

    if (mode === 'passthrough') {
      return new Uint8Array(chunk.data);
    }

    // linear16 → mu-law (resampling to 8 kHz when needed)
    const sampleCount = Math.floor(chunk.data.byteLength / 2);
    const pcm = new Int16Array(chunk.data, 0, sampleCount);

    if (sampleRate === 8000) {
      return encodeMulaw(pcm);
    }

    const floats = int16ToFloat(pcm);
    const resampled =
      sampleRate > 8000
        ? downsampleAudio(floats, sampleRate, 8000)
        : resamplePcm(floats, sampleRate, 8000);
    return encodeMulaw(floatTo16BitPCM(resampled));
  }

  /**
   * Settle every pending flush as cancelled (resolved, not rejected).
   *
   * @remarks
   * Used on barge-in, remote hangup, detach, and dispose. Resolving (rather
   * than rejecting) keeps the pipeline moving without surfacing spurious
   * errors for a normal interruption. Late mark echoes for settled marks are
   * ignored by {@link handleMark}.
   *
   * @param reason - Human-readable trigger, for logging.
   */
  private settlePendingMarks(reason: string): void {
    if (this.pendingMarks.size === 0) return;
    this.logger.debug(`Cancelling ${this.pendingMarks.size} pending mark(s): ${reason}`);
    const resolvers = [...this.pendingMarks.values()];
    this.pendingMarks.clear();
    for (const resolve of resolvers) {
      resolve();
    }
  }

  /** Fire the playback-end callback, guarding against user-code errors. */
  private firePlaybackEnd(): void {
    try {
      this.playbackEndCallback?.();
    } catch (error) {
      this.logger.error('onPlaybackEnd callback threw', error);
    }
  }

  /**
   * Decode a base64 string into an `ArrayBuffer`.
   *
   * @param base64 - The base64 payload from a Twilio `media` message.
   * @returns The decoded bytes.
   */
  private decodeBase64(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Encode raw bytes as a base64 string.
   *
   * @remarks
   * Builds the binary string in slices to stay clear of call-stack limits
   * on large payloads.
   *
   * @param bytes - Raw mu-law bytes.
   * @returns The base64-encoded payload for a Twilio `media` message.
   */
  private encodeBase64(bytes: Uint8Array): string {
    const parts: string[] = [];
    const sliceSize = 0x8000;
    for (let i = 0; i < bytes.length; i += sliceSize) {
      const slice = bytes.subarray(i, i + sliceSize);
      parts.push(String.fromCharCode(...slice));
    }
    return btoa(parts.join(''));
  }

  /**
   * Decode frame bytes to a string.
   *
   * @remarks
   * Uses `TextDecoder` when available (browsers, Node) and falls back to a
   * `String.fromCharCode` loop otherwise (e.g. bare jsdom). Twilio frames
   * are ASCII JSON — base64 payloads and SIDs — so the fallback is lossless.
   *
   * @param bytes - The raw frame bytes.
   * @returns The decoded text.
   */
  private bytesToString(bytes: Uint8Array): string {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder().decode(bytes);
    }
    const parts: string[] = [];
    const sliceSize = 0x8000;
    for (let i = 0; i < bytes.length; i += sliceSize) {
      parts.push(String.fromCharCode(...bytes.subarray(i, i + sliceSize)));
    }
    return parts.join('');
  }
}
