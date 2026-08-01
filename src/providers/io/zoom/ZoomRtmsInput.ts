/**
 * Zoom Realtime Media Streams (RTMS) audio input provider.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link ZoomRtmsInput} class, which implements the
 * {@link AudioInputProvider} interface on top of Zoom's Realtime Media
 * Streams protocol. RTMS gives server-side applications access to live,
 * mixed (or per-participant) meeting audio over a pair of WebSocket
 * connections — a **signaling** socket that authenticates the stream and a
 * **media** socket that delivers base64-encoded L16 PCM frames.
 *
 * RTMS is **receive-only**: there is no way to inject audio back into the
 * meeting through this protocol. Pair `ZoomRtmsInput` with {@link NullOutput}
 * (or any other output provider) to complete the pipeline.
 *
 * `ZoomRtmsInput` is zero-dependency and server-side only: the handshake
 * signature is an HMAC-SHA256 of your app's client credentials computed with
 * WebCrypto (`crypto.subtle`), so the client secret must never ship to a
 * browser.
 *
 * **Data-flow diagram:**
 *
 * ```
 * Zoom webhook (meeting.rtms_started)
 *        |  { meeting_uuid, rtms_stream_id, server_urls }
 *        v
 * app -> zoom.connect(session)
 *        |
 *        |  1. signaling WS  --SIGNALING_HAND_SHAKE_REQ (1)-->  Zoom
 *        |                   <-SIGNALING_HAND_SHAKE_RESP (2)--  { media server urls }
 *        |  2. media WS      --DATA_HAND_SHAKE_REQ (3)------->  Zoom
 *        |                   <-DATA_HAND_SHAKE_RESP (4)-------  { status }
 *        |  3. signaling WS  --CLIENT_READY_ACK (7)---------->  Zoom
 *        v
 * media WS --MEDIA_DATA_AUDIO (14)--> [ZoomRtmsInput] --onAudio()--> InputQueue --> [STT]
 *              (base64 L16 PCM)             |
 *                                      getMetadata()
 *                                           |
 *                                           v
 *                            linear16 @ 16 kHz (configurable), mono
 * ```
 *
 * Both sockets receive periodic `KEEP_ALIVE_REQ` (12) messages which the
 * provider answers automatically with `KEEP_ALIVE_RESP` (13), echoing the
 * request timestamp — Zoom closes connections that fail to respond.
 *
 * @example
 * ```typescript
 * import { CompositeVoice, ZoomRtmsInput, DeepgramSTT, AnthropicLLM, NullOutput } from 'composite-voice';
 *
 * const zoom = new ZoomRtmsInput({
 *   clientId: process.env.ZOOM_CLIENT_ID!,
 *   clientSecret: process.env.ZOOM_CLIENT_SECRET!,
 * });
 *
 * const voice = new CompositeVoice({
 *   providers: [zoom, new DeepgramSTT({ apiKey }), new AnthropicLLM({ apiKey }), new NullOutput()],
 * });
 * await voice.initialize();
 * await voice.startListening();
 *
 * // In your webhook handler:
 * app.post('/webhook', async (req, res) => {
 *   const { event, payload } = req.body;
 *   if (event === 'meeting.rtms_started') {
 *     const { meeting_uuid, rtms_stream_id, server_urls } = payload.object;
 *     await zoom.connect({
 *       meetingUuid: meeting_uuid,
 *       rtmsStreamId: rtms_stream_id,
 *       serverUrl: server_urls,
 *     });
 *   }
 *   if (event === 'meeting.rtms_stopped') {
 *     await zoom.disconnect();
 *   }
 *   res.status(200).send('OK');
 * });
 * ```
 *
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link BufferInput} for the generic push-based server-side input
 * @see {@link NullOutput} for the recommended output pairing
 */

import type { AudioChunk, AudioMetadata } from '../../../core/types/audio';
import type { AudioInputProvider, ProviderType } from '../../../core/types/providers';
import type { ProviderRole } from '../../../core/types/roles';
import { WebSocketManager } from '../../../utils/websocket';
import { Logger } from '../../../utils/logger';
import { ProviderInitializationError, ProviderConnectionError } from '../../../utils/errors';

/**
 * Audio sample rates supported by the RTMS media handshake.
 *
 * @remarks
 * Mapped to the RTMS wire enum: 8000 → `0` (SR_8K), 16000 → `1` (SR_16K),
 * 32000 → `2` (SR_32K), 48000 → `3` (SR_48K).
 */
export type ZoomRtmsSampleRate = 8000 | 16000 | 32000 | 48000;

/**
 * Audio stream layout requested from RTMS.
 *
 * @remarks
 * - `'mixed'` — one stream containing all participants mixed together
 *   (RTMS `data_opt` 1, `AUDIO_MIXED_STREAM`). Recommended for voice-agent
 *   pipelines: the STT stage receives a single coherent stream.
 * - `'per-participant'` — one stream per active speaker (RTMS `data_opt` 2).
 *   Chunks from different speakers interleave on the same callback; use
 *   {@link ZoomRtmsInput.onSpeakerAudio | onSpeakerAudio()} to demultiplex
 *   by participant.
 */
export type ZoomRtmsDataOption = 'mixed' | 'per-participant';

/**
 * Session parameters delivered by the `meeting.rtms_started` webhook.
 *
 * @remarks
 * Zoom sends these in `payload.object` of the webhook body. Pass them to
 * {@link ZoomRtmsInput.connect | connect()} (or supply them up-front in
 * {@link ZoomRtmsInputConfig}).
 *
 * @example
 * ```typescript
 * const { meeting_uuid, rtms_stream_id, server_urls } = webhookBody.payload.object;
 * await zoom.connect({
 *   meetingUuid: meeting_uuid,
 *   rtmsStreamId: rtms_stream_id,
 *   serverUrl: server_urls,
 * });
 * ```
 */
export interface ZoomRtmsSession {
  /** Unique meeting identifier (`meeting_uuid` from the webhook). */
  meetingUuid: string;
  /** RTMS stream identifier (`rtms_stream_id` from the webhook). */
  rtmsStreamId: string;
  /** Signaling WebSocket URL (`server_urls` from the webhook). */
  serverUrl: string;
}

/**
 * Configuration options for the {@link ZoomRtmsInput} provider.
 *
 * @remarks
 * `clientId` and `clientSecret` are the credentials of the Zoom app that has
 * RTMS enabled. They are used to compute the handshake HMAC signature, so
 * this provider must only run **server-side** — never expose the client
 * secret to a browser.
 *
 * Session parameters (`meetingUuid`, `rtmsStreamId`, `serverUrl`) may be
 * provided here when known ahead of time, or per-call via
 * {@link ZoomRtmsInput.connect | connect()} — the usual pattern, since they
 * arrive with each `meeting.rtms_started` webhook.
 *
 * @example
 * ```typescript
 * const config: ZoomRtmsInputConfig = {
 *   clientId: process.env.ZOOM_CLIENT_ID!,
 *   clientSecret: process.env.ZOOM_CLIENT_SECRET!,
 *   sampleRate: 16000,
 *   dataOpt: 'mixed',
 * };
 * ```
 *
 * @see {@link ZoomRtmsInput} for the provider class
 */
export interface ZoomRtmsInputConfig {
  /** Zoom app client ID (used in the HMAC signature message). */
  clientId: string;
  /**
   * Zoom app client secret (HMAC signing key).
   *
   * @remarks
   * Server-side only. The signature is
   * `hex(HMAC-SHA256("clientId,meetingUuid,rtmsStreamId", clientSecret))`.
   */
  clientSecret: string;
  /** Meeting UUID, if known up-front. Usually supplied via `connect()`. */
  meetingUuid?: string;
  /** RTMS stream ID, if known up-front. Usually supplied via `connect()`. */
  rtmsStreamId?: string;
  /** Signaling server URL, if known up-front. Usually supplied via `connect()`. */
  serverUrl?: string;
  /**
   * Audio sample rate to request from RTMS.
   *
   * @defaultValue 16000
   */
  sampleRate?: ZoomRtmsSampleRate;
  /**
   * Stream layout: one mixed stream or one stream per participant.
   *
   * @defaultValue 'mixed'
   */
  dataOpt?: ZoomRtmsDataOption;
  /**
   * Timeout in milliseconds for each connection/handshake step.
   *
   * @defaultValue 10000
   */
  connectionTimeout?: number;
  /**
   * Enable diagnostic logging.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

/**
 * RTMS handshake status codes mapped to their symbolic names.
 *
 * @remarks
 * Zoom returns `status_code` on `SIGNALING_HAND_SHAKE_RESP` (msg_type 2) and
 * `DATA_HAND_SHAKE_RESP` (msg_type 4). `0` means success; anything else is
 * an error, surfaced by {@link ZoomRtmsInput.connect | connect()} as a
 * {@link ProviderConnectionError} that includes the symbolic name below.
 */
export const ZOOM_RTMS_STATUS_CODES: Readonly<Record<number, string>> = {
  0: 'STATUS_OK',
  1: 'STATUS_INVALID_MESSAGE_TYPE',
  2: 'STATUS_INVALID_RTMS_STREAM_ID',
  3: 'STATUS_INVALID_SIGNATURE',
  4: 'STATUS_INVALID_PAYLOAD',
  5: 'STATUS_INVALID_EVENTS',
  6: 'STATUS_INVALID_EVENT_TYPE',
  7: 'STATUS_INVALID_MEDIA_TYPE',
  8: 'STATUS_DUPLICATE_SIGNAL_REQUEST',
  9: 'STATUS_MEDIA_TYPE_AUDIO_NOT_SUPPORT',
  10: 'STATUS_MEDIA_TYPE_VIDEO_NOT_SUPPORT',
  11: 'STATUS_MEDIA_TYPE_DESKSHARE_NOT_SUPPORT',
  12: 'STATUS_MEDIA_TYPE_TRANSCRIPT_NOT_SUPPORT',
  13: 'STATUS_MEDIA_TYPE_CHAT_NOT_SUPPORT',
  14: 'STATUS_MEDIA_TYPE_INVALID_VALUE',
  15: 'STATUS_MEDIA_DATA_ALL_CONNECTION_EXIST',
  16: 'STATUS_DUPLICATE_MEDIA_DATA_CONNECTION',
  17: 'STATUS_INVALID_MEDIA_PARAMS',
  18: 'STATUS_INVALID_MEDIA_AUDIO_PARAMS',
  19: 'STATUS_INVALID_MEDIA_AUDIO_CONTENT_TYPE',
  20: 'STATUS_INVALID_MEDIA_AUDIO_SAMPLE_RATE',
  21: 'STATUS_INVALID_MEDIA_AUDIO_CHANNEL',
  22: 'STATUS_INVALID_MEDIA_AUDIO_CODEC',
  23: 'STATUS_INVALID_MEDIA_AUDIO_DATA_OPT',
  24: 'STATUS_INVALID_MEDIA_AUDIO_SEND_RATE',
  25: 'STATUS_INVALID_MEDIA_VIDEO_PARAMS',
  26: 'STATUS_INVALID_MEDIA_VIDEO_CONTENT_TYPE',
  27: 'STATUS_INVALID_MEDIA_VIDEO_CODEC',
  28: 'STATUS_INVALID_MEDIA_VIDEO_RESOLUTION',
  29: 'STATUS_INVALID_MEDIA_VIDEO_DATA_OPT',
  30: 'STATUS_INVALID_MEDIA_VIDEO_FPS',
  31: 'STATUS_INVALID_MEDIA_DESKSHARE_PARAMS',
  32: 'STATUS_INVALID_MEDIA_DESKSHARE_CONTENT_TYPE',
  33: 'STATUS_INVALID_MEDIA_DESKSHARE_CODEC',
  34: 'STATUS_INVALID_MEDIA_DESKSHARE_RESOLUTION',
  35: 'STATUS_INVALID_MEDIA_DESKSHARE_FPS',
  36: 'STATUS_INVALID_MEDIA_TRANSCRIPT_PARAMS',
  37: 'STATUS_INVALID_MEDIA_TRANSCRIPT_CONTENT_TYPE',
  38: 'STATUS_INVALID_MEDIA_CHAT_PARAMS',
  39: 'STATUS_INVALID_MEDIA_CHAT_CONTENT_TYPE',
  40: 'STATUS_INVALID_RTMS_SESSION_ID',
  41: 'STATUS_INVALID_CLIENT_READY_ACK',
  42: 'STATUS_INVALID_EVENT_SUBSCRIBE',
  43: 'STATUS_INVALID_MEDIA_TRANSCRIPT_SOURCE_LANGUAGE',
};

/** @internal RTMS message-type constants used by this provider. */
const MSG = {
  SIGNALING_HAND_SHAKE_REQ: 1,
  SIGNALING_HAND_SHAKE_RESP: 2,
  DATA_HAND_SHAKE_REQ: 3,
  DATA_HAND_SHAKE_RESP: 4,
  CLIENT_READY_ACK: 7,
  STREAM_STATE_UPDATE: 8,
  SESSION_STATE_UPDATE: 9,
  KEEP_ALIVE_REQ: 12,
  KEEP_ALIVE_RESP: 13,
  MEDIA_DATA_AUDIO: 14,
} as const;

/** @internal RTMS stream state indicating the stream has ended. */
const STREAM_STATE_TERMINATED = 4;

/** @internal RTMS session state indicating the session has stopped. */
const SESSION_STATE_STOPPED = 5;

/** @internal RTMS `sample_rate` enum values keyed by Hz. */
const SAMPLE_RATE_ENUM: Record<ZoomRtmsSampleRate, number> = {
  8000: 0,
  16000: 1,
  32000: 2,
  48000: 3,
};

/**
 * A parsed RTMS control/media message (fields used by this provider).
 * @internal
 */
interface ZoomRtmsMessage {
  msg_type?: number;
  status_code?: number;
  reason?: number;
  stop_reason?: number;
  state?: number;
  timestamp?: number;
  media_server?: {
    server_urls?: {
      audio?: string;
      all?: string;
      [key: string]: string | undefined;
    };
  };
  /**
   * Audio payload. Official docs nest it as an object; some RTMS deployments
   * send the base64 string directly with `user_id`/`user_name` at the top
   * level, so both shapes are accepted.
   */
  content?:
    | {
        user_id?: number;
        user_name?: string;
        data?: string;
        timestamp?: number;
      }
    | string;
  user_id?: number;
  user_name?: string;
}

/**
 * A pending handshake-response waiter.
 * @internal
 */
interface HandshakeWaiter {
  resolve: (message: ZoomRtmsMessage) => void;
  reject: (error: Error) => void;
}

/** @internal Convert bytes to a lowercase hex string. */
function toHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Compute the RTMS handshake signature:
 * `hex(HMAC-SHA256("clientId,meetingUuid,rtmsStreamId", clientSecret))`.
 *
 * @remarks
 * Uses WebCrypto (`crypto.subtle`), available in Node.js 18+ and all modern
 * runtimes — no dependency on Node's `crypto` module.
 *
 * @internal
 */
async function computeRtmsSignature(
  clientId: string,
  clientSecret: string,
  meetingUuid: string,
  rtmsStreamId: string
): Promise<string> {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'WebCrypto (crypto.subtle) is not available. ZoomRtmsInput requires Node.js 18+ ' +
        'or another runtime with WebCrypto support.'
    );
  }
  const encoder = new TextEncoder();
  const key = await subtle.importKey(
    'raw',
    encoder.encode(clientSecret) as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const message = `${clientId},${meetingUuid},${rtmsStreamId}`;
  const signature = await subtle.sign('HMAC', key, encoder.encode(message) as BufferSource);
  return toHex(new Uint8Array(signature));
}

/** @internal Decode a base64 string into an ArrayBuffer (no Node Buffer). */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Zoom Realtime Media Streams (RTMS) input provider — streams live meeting
 * audio into the CompositeVoice pipeline.
 *
 * @remarks
 * `ZoomRtmsInput` is a single-role (`'input'`), **receive-only**, server-side
 * provider. It implements the RTMS WebSocket protocol directly with zero
 * peer dependencies:
 *
 * 1. **Signaling handshake** — connects to the `serverUrl` from the
 *    `meeting.rtms_started` webhook and sends `SIGNALING_HAND_SHAKE_REQ`
 *    (msg_type 1) signed with
 *    `hex(HMAC-SHA256("clientId,meetingUuid,rtmsStreamId", clientSecret))`.
 * 2. **Media handshake** — connects to the audio media server URL from the
 *    signaling response (`server_urls.audio`, falling back to
 *    `server_urls.all`) and sends `DATA_HAND_SHAKE_REQ` (msg_type 3)
 *    requesting raw L16 PCM audio.
 * 3. **Client ready** — acknowledges with `CLIENT_READY_ACK` (msg_type 7)
 *    on the *signaling* socket, after which `MEDIA_DATA_AUDIO` (msg_type 14)
 *    messages flow on the media socket.
 *
 * Keep-alive requests (msg_type 12) on either socket are answered
 * automatically (msg_type 13, echoing the timestamp). Stream/session state
 * updates (msg_type 8/9) are tracked; when the stream terminates or the
 * session stops, both sockets are closed (media first, then signaling).
 *
 * Because RTMS cannot play audio into the meeting, pair this provider with
 * {@link NullOutput} — or a platform output of your choice — for the
 * `'output'` role.
 *
 * **Data-flow diagram:**
 *
 * ```
 * meeting.rtms_started ──▶ connect() ──▶ signaling WS ──▶ media WS
 *                                                            │
 *                             MEDIA_DATA_AUDIO (base64 L16)  │
 *                                                            ▼
 *                          active && !paused ──▶ callback(AudioChunk) ──▶ STT
 *                                       │
 *                                       no: drop
 * ```
 *
 * @example
 * ```typescript
 * import { ZoomRtmsInput } from 'composite-voice';
 *
 * const zoom = new ZoomRtmsInput({
 *   clientId: process.env.ZOOM_CLIENT_ID!,
 *   clientSecret: process.env.ZOOM_CLIENT_SECRET!,
 *   dataOpt: 'per-participant',
 * });
 *
 * await zoom.initialize();
 * zoom.onAudio((chunk) => console.log(`audio: ${chunk.data.byteLength} bytes`));
 * zoom.onSpeakerAudio((userId, userName) => console.log(`${userName} is speaking`));
 * zoom.start();
 *
 * // From the meeting.rtms_started webhook:
 * await zoom.connect({ meetingUuid, rtmsStreamId, serverUrl });
 * ```
 *
 * @see {@link ZoomRtmsInputConfig} for configuration options
 * @see {@link ZoomRtmsSession} for the webhook-derived session parameters
 * @see {@link ZOOM_RTMS_STATUS_CODES} for handshake status-code names
 */
export class ZoomRtmsInput implements AudioInputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `'websocket'` — the provider holds two persistent WebSocket connections
   * (signaling and media) for the lifetime of the stream.
   */
  public readonly type: ProviderType = 'websocket';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `ZoomRtmsInput` covers only the `'input'` slot. RTMS is receive-only,
   * so a separate output provider (e.g. {@link NullOutput}) is required.
   */
  public readonly roles: readonly ProviderRole[] = ['input'];

  /** Provider configuration with defaults applied. */
  private readonly config: Required<
    Pick<ZoomRtmsInputConfig, 'clientId' | 'clientSecret' | 'sampleRate' | 'dataOpt'>
  > &
    ZoomRtmsInputConfig;

  /** Diagnostic logger (enabled via `config.debug`). */
  private readonly logger: Logger;

  /** Whether the provider has been initialized. */
  private initialized = false;

  /** Whether both handshakes completed and media is flowing. */
  private connected = false;

  /** Whether the provider is actively emitting audio. */
  private active = false;

  /** Whether the provider is paused. */
  private paused = false;

  /** Signaling WebSocket connection. */
  private signalingWs: WebSocketManager | null = null;

  /** Media WebSocket connection. */
  private mediaWs: WebSocketManager | null = null;

  /** Registered callback for audio chunks. */
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;

  /** Registered callback for per-participant audio. */
  private speakerCallback:
    | ((userId: number | undefined, userName: string | undefined, chunk: AudioChunk) => void)
    | null = null;

  /** Monotonically increasing sequence number for emitted chunks. */
  private sequenceNumber = 0;

  /** Pending handshake-response waiters, keyed by socket. */
  private waiters: { signaling: HandshakeWaiter | null; media: HandshakeWaiter | null } = {
    signaling: null,
    media: null,
  };

  /** Last stream state reported via STREAM_STATE_UPDATE (msg_type 8). */
  private streamState: number | null = null;

  /** Last session state reported via SESSION_STATE_UPDATE (msg_type 9). */
  private sessionState: number | null = null;

  /**
   * Creates a new `ZoomRtmsInput` instance.
   *
   * @remarks
   * The constructor only stores configuration; no network activity happens
   * until {@link ZoomRtmsInput.connect | connect()} is called.
   *
   * @param config - Provider configuration. `clientId` and `clientSecret`
   *   are required (validated in {@link ZoomRtmsInput.initialize | initialize()}).
   *
   * @example
   * ```typescript
   * const zoom = new ZoomRtmsInput({
   *   clientId: process.env.ZOOM_CLIENT_ID!,
   *   clientSecret: process.env.ZOOM_CLIENT_SECRET!,
   *   sampleRate: 16000,
   * });
   * ```
   */
  constructor(config: ZoomRtmsInputConfig) {
    this.config = {
      sampleRate: 16000,
      dataOpt: 'mixed',
      ...config,
    };
    this.logger = new Logger('ZoomRtmsInput', {
      enabled: true,
      level: config.debug ? 'debug' : 'warn',
    });
  }

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Initialize the provider and validate the configuration.
   *
   * @remarks
   * Validates that `clientId` and `clientSecret` are present — they are
   * needed to sign every handshake. No network connection is made here;
   * call {@link ZoomRtmsInput.connect | connect()} when the
   * `meeting.rtms_started` webhook arrives.
   *
   * @throws {@link ProviderInitializationError}
   * Thrown when `clientId` or `clientSecret` is missing, or when the
   * configured `sampleRate` is not one of 8000/16000/32000/48000.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.config.clientId || !this.config.clientSecret) {
      throw new ProviderInitializationError(
        'ZoomRtmsInput',
        new Error('ZoomRtmsInput requires both "clientId" and "clientSecret" to be configured.')
      );
    }

    if (!(this.config.sampleRate in SAMPLE_RATE_ENUM)) {
      throw new ProviderInitializationError(
        'ZoomRtmsInput',
        new Error(
          `Unsupported sampleRate ${this.config.sampleRate}. ` +
            'RTMS supports 8000, 16000, 32000, or 48000 Hz.'
        )
      );
    }

    this.initialized = true;
    this.logger.info('Zoom RTMS input initialized', {
      sampleRate: this.config.sampleRate,
      dataOpt: this.config.dataOpt,
    });
  }

  /**
   * Dispose of the provider and release all resources.
   *
   * @remarks
   * Disconnects both WebSockets (media first, then signaling), clears all
   * callbacks, and resets internal state. The instance can be re-initialized
   * afterwards with {@link ZoomRtmsInput.initialize | initialize()}.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) return;
    await this.disconnect();
    this.active = false;
    this.paused = false;
    this.audioCallback = null;
    this.speakerCallback = null;
    this.sequenceNumber = 0;
    this.streamState = null;
    this.sessionState = null;
    this.initialized = false;
    this.logger.info('Zoom RTMS input disposed');
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

  // ── AudioInputProvider interface ─────────────────────────────────

  /**
   * Start emitting audio chunks to the registered callback.
   *
   * @remarks
   * `start()` only gates emission — it does not open the RTMS connection.
   * Call {@link ZoomRtmsInput.connect | connect()} (before or after
   * `start()`) to establish the stream. Audio received while stopped is
   * silently dropped.
   */
  start(): void {
    this.active = true;
    this.paused = false;
  }

  /**
   * Stop emitting audio chunks.
   *
   * @remarks
   * The RTMS sockets stay open — audio received while stopped is silently
   * dropped, and emission can be resumed with
   * {@link ZoomRtmsInput.start | start()}. Use
   * {@link ZoomRtmsInput.disconnect | disconnect()} to close the stream.
   */
  stop(): void {
    this.active = false;
    this.paused = false;
  }

  /**
   * Temporarily pause audio emission without stopping the provider.
   *
   * @remarks
   * Audio received while paused is silently dropped. Resume with
   * {@link ZoomRtmsInput.resume | resume()}.
   */
  pause(): void {
    if (this.active) {
      this.paused = true;
    }
  }

  /**
   * Resume audio emission after a pause.
   *
   * @see {@link ZoomRtmsInput.pause | pause}
   */
  resume(): void {
    if (this.active) {
      this.paused = false;
    }
  }

  /**
   * Check whether the provider is actively emitting audio.
   *
   * @returns `true` when started and not paused.
   */
  isActive(): boolean {
    return this.active && !this.paused;
  }

  /**
   * Register a callback to receive audio chunks.
   *
   * @remarks
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback. With `dataOpt: 'per-participant'`, chunks from
   * different speakers interleave on this callback — use
   * {@link ZoomRtmsInput.onSpeakerAudio | onSpeakerAudio()} to attribute
   * chunks to participants.
   *
   * @param callback - Function invoked with each {@link AudioChunk} while
   *   the provider is active.
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Get the audio format metadata for the meeting audio.
   *
   * @remarks
   * RTMS delivers raw L16 PCM (16-bit signed little-endian), mono, at the
   * configured sample rate. Used by the pipeline to auto-configure the
   * downstream STT provider.
   *
   * @returns {@link AudioMetadata} describing linear16 mono audio at the
   *   configured sample rate (default 16000 Hz).
   */
  getMetadata(): AudioMetadata {
    return {
      sampleRate: this.config.sampleRate,
      encoding: 'linear16',
      channels: 1,
      bitDepth: 16,
    };
  }

  // ── Public API (not part of AudioInputProvider) ──────────────────

  /**
   * Attach the RTMS session for a started stream — alias for
   * {@link ZoomRtmsInput.connect | connect()}.
   *
   * @remarks
   * Implements the {@link AttachableInputProvider} contract so the session
   * parameters from a `meeting.rtms_started` webhook can be passed straight
   * to `CompositeVoice.startListening(session)`.
   *
   * @param session - Session parameters from the `meeting.rtms_started`
   *   webhook (`meetingUuid`, `rtmsStreamId`, `serverUrl`).
   *
   * @example
   * ```typescript
   * await voice.startListening({
   *   meetingUuid: payload.object.meeting_uuid,
   *   rtmsStreamId: payload.object.rtms_stream_id,
   *   serverUrl: payload.object.server_urls,
   * });
   * ```
   */
  attach(session: Partial<ZoomRtmsSession>): Promise<void> {
    return this.connect(session);
  }

  /**
   * Connect to an RTMS stream and start receiving meeting audio.
   *
   * @remarks
   * Performs the full RTMS connection flow:
   *
   * 1. Opens the signaling WebSocket and sends `SIGNALING_HAND_SHAKE_REQ`
   *    (msg_type 1) with the HMAC-SHA256 signature.
   * 2. On success, opens the media WebSocket to `server_urls.audio` (or
   *    `server_urls.all`) and sends `DATA_HAND_SHAKE_REQ` (msg_type 3)
   *    requesting raw L16 audio.
   * 3. On success, sends `CLIENT_READY_ACK` (msg_type 7) on the signaling
   *    socket — Zoom then starts pushing `MEDIA_DATA_AUDIO` messages.
   *
   * May be called before or after {@link ZoomRtmsInput.start | start()};
   * audio is only emitted while the provider is active.
   *
   * @param session - Session parameters from the `meeting.rtms_started`
   *   webhook. Falls back to `meetingUuid`/`rtmsStreamId`/`serverUrl` from
   *   the constructor config when omitted.
   *
   * @throws {@link ProviderConnectionError}
   * Thrown when the provider is not initialized, session parameters are
   * missing, either WebSocket fails to connect, or a handshake returns a
   * non-zero `status_code` (the message includes the symbolic name from
   * {@link ZOOM_RTMS_STATUS_CODES}).
   *
   * @example
   * ```typescript
   * await zoom.connect({
   *   meetingUuid: payload.object.meeting_uuid,
   *   rtmsStreamId: payload.object.rtms_stream_id,
   *   serverUrl: payload.object.server_urls,
   * });
   * ```
   */
  async connect(session?: Partial<ZoomRtmsSession>): Promise<void> {
    if (!this.initialized) {
      throw new ProviderConnectionError(
        'ZoomRtmsInput',
        new Error('Provider not initialized. Call initialize() before connect().')
      );
    }

    if (this.connected) {
      this.logger.warn('Already connected to an RTMS stream');
      return;
    }

    const meetingUuid = session?.meetingUuid ?? this.config.meetingUuid;
    const rtmsStreamId = session?.rtmsStreamId ?? this.config.rtmsStreamId;
    const serverUrl = session?.serverUrl ?? this.config.serverUrl;

    if (!meetingUuid || !rtmsStreamId || !serverUrl) {
      throw new ProviderConnectionError(
        'ZoomRtmsInput',
        new Error(
          'Missing RTMS session parameters. Provide "meetingUuid", "rtmsStreamId", and ' +
            '"serverUrl" via connect() or the constructor config (they arrive with the ' +
            'meeting.rtms_started webhook).'
        )
      );
    }

    try {
      const signature = await computeRtmsSignature(
        this.config.clientId,
        this.config.clientSecret,
        meetingUuid,
        rtmsStreamId
      );

      // ── 1. Signaling handshake ──────────────────────────────────
      this.signalingWs = this.createSocket(serverUrl, 'signaling');
      const signalingResponse = this.waitForHandshake('signaling');
      await this.signalingWs.connect();
      this.signalingWs.send(
        JSON.stringify({
          msg_type: MSG.SIGNALING_HAND_SHAKE_REQ,
          protocol_version: 1,
          sequence: 0,
          meeting_uuid: meetingUuid,
          rtms_stream_id: rtmsStreamId,
          signature,
        })
      );

      const signalingAck = await signalingResponse;
      if (signalingAck.status_code !== 0) {
        throw this.statusError('signaling handshake', signalingAck.status_code);
      }

      const serverUrls = signalingAck.media_server?.server_urls ?? {};
      const mediaUrl = serverUrls.audio ?? serverUrls.all;
      if (!mediaUrl) {
        throw new Error(
          'RTMS signaling response did not contain a media server URL (server_urls.audio or server_urls.all)'
        );
      }

      // ── 2. Media handshake ──────────────────────────────────────
      this.mediaWs = this.createSocket(mediaUrl, 'media');
      const mediaResponse = this.waitForHandshake('media');
      await this.mediaWs.connect();
      this.mediaWs.send(
        JSON.stringify({
          msg_type: MSG.DATA_HAND_SHAKE_REQ,
          protocol_version: 1,
          sequence: 0,
          meeting_uuid: meetingUuid,
          rtms_stream_id: rtmsStreamId,
          signature,
          media_type: 1, // AUDIO
          media_params: {
            audio: {
              content_type: 2, // RAW_AUDIO
              sample_rate: SAMPLE_RATE_ENUM[this.config.sampleRate],
              channel: 1, // MONO
              codec: 1, // L16
              data_opt: this.config.dataOpt === 'per-participant' ? 2 : 1,
              send_rate: 100, // 100 ms chunks
            },
          },
        })
      );

      const mediaAck = await mediaResponse;
      if (mediaAck.status_code !== 0) {
        throw this.statusError('media handshake', mediaAck.status_code);
      }

      // ── 3. Client ready (on the SIGNALING socket) ───────────────
      this.signalingWs.send(
        JSON.stringify({
          msg_type: MSG.CLIENT_READY_ACK,
          rtms_stream_id: rtmsStreamId,
        })
      );

      this.connected = true;
      this.logger.info('Connected to Zoom RTMS stream', { meetingUuid, rtmsStreamId });
    } catch (error) {
      await this.teardownSockets();
      if (error instanceof ProviderConnectionError) throw error;
      throw new ProviderConnectionError('ZoomRtmsInput', error as Error);
    }
  }

  /**
   * Gracefully disconnect from the RTMS stream.
   *
   * @remarks
   * Closes the media socket first, then the signaling socket, mirroring the
   * order Zoom recommends for a clean shutdown. Safe to call when not
   * connected (no-op). Typically invoked from the `meeting.rtms_stopped`
   * webhook handler or on application shutdown.
   */
  async disconnect(): Promise<void> {
    await this.teardownSockets();
  }

  /**
   * Check whether the provider is connected to an RTMS stream.
   *
   * @returns `true` when both handshakes completed and the sockets are open.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Register a callback for per-participant audio.
   *
   * @remarks
   * Invoked alongside the main {@link ZoomRtmsInput.onAudio | onAudio()}
   * callback with the participant attribution carried by each
   * `MEDIA_DATA_AUDIO` message. Most useful with
   * `dataOpt: 'per-participant'`, where each chunk belongs to exactly one
   * speaker; with the default mixed stream, Zoom reports the mixed source.
   * Emission follows the same active/paused gating as `onAudio()`.
   *
   * @param callback - Invoked with the Zoom `user_id`, `user_name`, and the
   *   {@link AudioChunk} for each audio message.
   *
   * @example
   * ```typescript
   * zoom.onSpeakerAudio((userId, userName, chunk) => {
   *   console.log(`${userName ?? userId}: ${chunk.data.byteLength} bytes`);
   * });
   * ```
   */
  onSpeakerAudio(
    callback: (userId: number | undefined, userName: string | undefined, chunk: AudioChunk) => void
  ): void {
    this.speakerCallback = callback;
  }

  /**
   * Get the last stream state reported by Zoom.
   *
   * @remarks
   * Updated from `STREAM_STATE_UPDATE` (msg_type 8) messages. Values:
   * 0 = INACTIVE, 1 = ACTIVE, 2 = INTERRUPTED, 3 = TERMINATING,
   * 4 = TERMINATED, 5 = PAUSED, 6 = RESUMED.
   *
   * @returns The numeric stream state, or `null` if none received yet.
   */
  getStreamState(): number | null {
    return this.streamState;
  }

  /**
   * Get the last session state reported by Zoom.
   *
   * @remarks
   * Updated from `SESSION_STATE_UPDATE` (msg_type 9) messages. Values:
   * 0 = INACTIVE, 1 = INITIALIZE, 2 = STARTED, 3 = PAUSED, 4 = RESUMED,
   * 5 = STOPPED.
   *
   * @returns The numeric session state, or `null` if none received yet.
   */
  getSessionState(): number | null {
    return this.sessionState;
  }

  // ── Internals ────────────────────────────────────────────────────

  /**
   * Create a managed WebSocket for one leg of the RTMS connection.
   *
   * @remarks
   * Automatic reconnection is disabled: RTMS rejects duplicate signaling
   * connections (`STATUS_DUPLICATE_SIGNAL_REQUEST`) and a reconnect would
   * need a fresh handshake flow, which the application should drive by
   * calling {@link ZoomRtmsInput.connect | connect()} again.
   *
   * @internal
   */
  private createSocket(url: string, kind: 'signaling' | 'media'): WebSocketManager {
    const ws = new WebSocketManager({
      url,
      connectionTimeout: this.config.connectionTimeout ?? 10000,
      reconnection: { enabled: false },
      logger: this.logger,
    });
    ws.setHandlers({
      onMessage: (event: MessageEvent) => this.handleMessage(kind, event),
      onClose: () => {
        this.logger.info(`RTMS ${kind} socket closed`);
        if (kind === 'media') {
          this.connected = false;
        }
      },
      onError: (error: Error) => {
        this.logger.error(`RTMS ${kind} socket error`, error);
      },
    });
    return ws;
  }

  /**
   * Create a promise that resolves with the next handshake response on the
   * given socket, or rejects after the connection timeout.
   *
   * @internal
   */
  private waitForHandshake(kind: 'signaling' | 'media'): Promise<ZoomRtmsMessage> {
    return new Promise<ZoomRtmsMessage>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.waiters[kind] = null;
        reject(
          new Error(
            `Timed out waiting for RTMS ${kind} handshake response after ${
              this.config.connectionTimeout ?? 10000
            }ms`
          )
        );
      }, this.config.connectionTimeout ?? 10000);

      this.waiters[kind] = {
        resolve: (message) => {
          clearTimeout(timeout);
          this.waiters[kind] = null;
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timeout);
          this.waiters[kind] = null;
          reject(error);
        },
      };
    });
  }

  /**
   * Build a connection error for a non-zero handshake status code, including
   * its symbolic name from {@link ZOOM_RTMS_STATUS_CODES}.
   *
   * @internal
   */
  private statusError(step: string, statusCode: number | undefined): ProviderConnectionError {
    const code = statusCode ?? -1;
    const name = ZOOM_RTMS_STATUS_CODES[code] ?? 'UNKNOWN_STATUS';
    return new ProviderConnectionError(
      'ZoomRtmsInput',
      new Error(`Zoom RTMS ${step} failed with status ${code} (${name})`)
    );
  }

  /**
   * Parse and dispatch an incoming message from either socket.
   *
   * @internal
   */
  private handleMessage(kind: 'signaling' | 'media', event: MessageEvent): void {
    if (typeof event.data !== 'string') {
      this.logger.warn(`Received non-string message on RTMS ${kind} socket, ignoring`);
      return;
    }

    let message: ZoomRtmsMessage;
    try {
      message = JSON.parse(event.data) as ZoomRtmsMessage;
    } catch (error) {
      this.logger.error(`Failed to parse RTMS ${kind} message`, error);
      return;
    }

    switch (message.msg_type) {
      case MSG.SIGNALING_HAND_SHAKE_RESP:
        this.waiters.signaling?.resolve(message);
        break;

      case MSG.DATA_HAND_SHAKE_RESP:
        this.waiters.media?.resolve(message);
        break;

      case MSG.KEEP_ALIVE_REQ:
        this.sendKeepAlive(kind, message.timestamp);
        break;

      case MSG.MEDIA_DATA_AUDIO:
        this.handleAudioData(message);
        break;

      case MSG.STREAM_STATE_UPDATE:
        this.streamState = message.state ?? null;
        this.logger.debug('RTMS stream state update', {
          state: message.state,
          reason: message.reason,
        });
        if (message.state === STREAM_STATE_TERMINATED) {
          this.logger.info('RTMS stream terminated, closing connections', {
            reason: message.reason,
          });
          void this.teardownSockets();
        }
        break;

      case MSG.SESSION_STATE_UPDATE:
        this.sessionState = message.state ?? null;
        this.logger.debug('RTMS session state update', {
          state: message.state,
          stopReason: message.stop_reason,
        });
        if (message.state === SESSION_STATE_STOPPED) {
          this.logger.info('RTMS session stopped, closing connections', {
            stopReason: message.stop_reason,
          });
          void this.teardownSockets();
        }
        break;

      default:
        this.logger.debug(`RTMS ${kind} message`, { msgType: message.msg_type });
        break;
    }
  }

  /**
   * Answer a keep-alive request, echoing the request timestamp on the socket
   * that received it. Zoom closes connections that fail to respond.
   *
   * @internal
   */
  private sendKeepAlive(kind: 'signaling' | 'media', timestamp: number | undefined): void {
    const ws = kind === 'signaling' ? this.signalingWs : this.mediaWs;
    if (!ws) return;
    try {
      ws.send(JSON.stringify({ msg_type: MSG.KEEP_ALIVE_RESP, timestamp }));
    } catch (error) {
      this.logger.error(`Failed to send keep-alive response on ${kind} socket`, error);
    }
  }

  /**
   * Decode a `MEDIA_DATA_AUDIO` message and emit it as an {@link AudioChunk}.
   *
   * @remarks
   * Accepts both payload shapes seen in the wild: `content` as an object
   * (`{ user_id, user_name, data, timestamp }`, per the official protocol
   * reference) and `content` as a bare base64 string with attribution fields
   * at the top level. Chunks are dropped silently while inactive or paused.
   *
   * @internal
   */
  private handleAudioData(message: ZoomRtmsMessage): void {
    if (!this.active || this.paused || (!this.audioCallback && !this.speakerCallback)) return;

    let base64: string | undefined;
    let userId: number | undefined;
    let userName: string | undefined;

    if (typeof message.content === 'string') {
      base64 = message.content;
      userId = message.user_id;
      userName = message.user_name;
    } else if (message.content) {
      base64 = message.content.data;
      userId = message.content.user_id;
      userName = message.content.user_name;
    }

    if (!base64) return;

    let data: ArrayBuffer;
    try {
      data = base64ToArrayBuffer(base64);
    } catch (error) {
      this.logger.error('Failed to decode RTMS audio payload', error);
      return;
    }

    const chunk: AudioChunk = {
      data,
      timestamp: Date.now(),
      sequence: this.sequenceNumber++,
    };

    this.audioCallback?.(chunk);
    this.speakerCallback?.(userId, userName, chunk);
  }

  /**
   * Close both sockets (media first, then signaling) and reject any pending
   * handshake waiters.
   *
   * @internal
   */
  private async teardownSockets(): Promise<void> {
    this.connected = false;

    this.waiters.media?.reject(new Error('RTMS connection closed'));
    this.waiters.signaling?.reject(new Error('RTMS connection closed'));

    const media = this.mediaWs;
    const signaling = this.signalingWs;
    this.mediaWs = null;
    this.signalingWs = null;

    if (media) {
      try {
        await media.disconnect();
      } catch (error) {
        this.logger.warn('Error closing RTMS media socket', error as Error);
      }
    }
    if (signaling) {
      try {
        await signaling.disconnect();
      } catch (error) {
        this.logger.warn('Error closing RTMS signaling socket', error as Error);
      }
    }
  }
}
