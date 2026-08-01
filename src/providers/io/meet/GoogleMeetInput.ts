/**
 * Google Meet Media API audio input provider (Developer Preview).
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link GoogleMeetInput} class, which implements the
 * {@link AudioInputProvider} interface on top of the
 * {@link https://developers.google.com/meet/media-api/guides/overview | Google Meet Media API}.
 * It joins an active Google Meet conference as a media consumer over WebRTC and
 * delivers the meeting's mixed audio into the CompositeVoice pipeline as
 * 16 kHz mono linear16 {@link AudioChunk} objects.
 *
 * `GoogleMeetInput` is a zero-dependency **browser** provider: it uses only
 * `RTCPeerConnection`, `fetch`, and `AudioContext` — no platform SDK is
 * required. The Meet Media API is **receive-only**; audio cannot be sent back
 * into the conference, so this provider covers only the `'input'` role. Pair
 * it with {@link NullOutput} (or any other output provider) for the `'output'`
 * slot.
 *
 * The Meet Media API is currently a **Developer Preview**. Your Google Cloud
 * project must be enrolled in the
 * {@link https://developers.google.com/workspace/preview | Google Workspace Developer Preview Program},
 * and every participant in the conference must belong to an enrolled account.
 *
 * **Data-flow diagram:**
 *
 * ```
 *                POST {spaceName}:connectActiveConference (SDP offer)
 * GoogleMeetInput ──────────────────────────────────────────────▶ Meet API
 *        │  ◀──────────────── SDP answer ────────────────────────────┘
 *        │
 *        │ RTCPeerConnection (3 recvonly audio transceivers, Opus)
 *        │   ├─ data channel 'session-control' (join state / leave)
 *        │   ├─ data channel 'media-stats'     (periodic getStats upload)
 *        │   └─ ontrack ×3 ──▶ MediaStream ──▶ AudioContext (mixed)
 *        │                                        │
 *        │                     AudioWorklet / ScriptProcessor (Float32)
 *        │                                        │
 *        │                downsample → 16 kHz → floatTo16BitPCM
 *        ▼                                        │
 *   onAudio(chunk) ◀──────────────────────────────┘
 *        │
 *        ▼
 *   InputQueue ──▶ [STT] ──▶ [LLM] ──▶ ...
 * ```
 *
 * @example
 * ```typescript
 * import { CompositeVoice, GoogleMeetInput, DeepgramSTT, AnthropicLLM, NullOutput } from 'composite-voice';
 *
 * const meet = new GoogleMeetInput({
 *   apiKey: async () => fetchFreshOAuthToken(), // meetings.conference.media.audio.readonly scope
 *   spaceName: 'spaces/jQCFfuBOdN5z',
 * });
 *
 * const agent = new CompositeVoice({
 *   providers: [meet, new DeepgramSTT({ apiKey }), new AnthropicLLM({ apiKey }), new NullOutput()],
 * });
 *
 * await agent.initialize();
 * await agent.startListening();
 * ```
 *
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link MicrophoneInput} for the microphone-based browser input
 * @see {@link NullOutput} for the recommended output pairing
 */

import type { AudioChunk, AudioMetadata } from '../../../core/types/audio';
import type { AudioInputProvider, ProviderType } from '../../../core/types/providers';
import type { ProviderRole } from '../../../core/types/roles';
import { downsampleAudio, floatTo16BitPCM } from '../../../utils/audio';
import { ProviderConnectionError, ProviderInitializationError } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';

/**
 * Default base URL for the Google Meet Media API.
 *
 * @remarks
 * Override via {@link GoogleMeetInputConfig.endpoint} for testing or proxying.
 */
const DEFAULT_ENDPOINT = 'https://meet.googleapis.com';

/**
 * Number of receive-only audio transceivers to negotiate.
 *
 * @remarks
 * Google Meet allocates exactly **3 virtual audio SSRCs** per media session —
 * the three most relevant audio streams are mixed across them. The SDP offer
 * must therefore contain exactly three `recvonly` audio m-lines.
 */
const AUDIO_TRANSCEIVER_COUNT = 3;

/** Target sample rate (Hz) for emitted PCM chunks. */
const TARGET_SAMPLE_RATE = 16000;

/**
 * Buffer size for the `ScriptProcessorNode` fallback path.
 *
 * @remarks
 * 4096 frames at 48 kHz is roughly 85 ms per chunk — a good latency/overhead
 * balance for live STT.
 */
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

/**
 * Maps WebRTC `RTCStatsReport` entry types to the snake_case section names the
 * Meet media-stats channel expects.
 *
 * @remarks
 * Mirrors the reference Meet Media API web client. Only these seven section
 * types may be uploaded; everything else in the stats report is ignored.
 */
const STATS_TYPE_CONVERTER: Record<string, string> = {
  codec: 'codec',
  'candidate-pair': 'candidate_pair',
  'media-playout': 'media_playout',
  transport: 'transport',
  'local-candidate': 'local_candidate',
  'remote-candidate': 'remote_candidate',
  'inbound-rtp': 'inbound_rtp',
};

/**
 * Inline AudioWorklet processor source, loaded via a Blob URL at runtime.
 *
 * @remarks
 * Mirrors the approach used by {@link AudioCapture} so users do not need to
 * serve a separate worklet file. The processor copies each render quantum's
 * first-channel samples and posts them to the main thread.
 */
const WORKLET_PROCESSOR_SOURCE = `
class GoogleMeetAudioProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage({ type: 'audio', data: new Float32Array(input[0]) });
    }
    return true;
  }
}
registerProcessor('google-meet-audio-processor', GoogleMeetAudioProcessor);
`;

/**
 * Connection state of the Meet media session, as reported on the
 * `session-control` data channel.
 *
 * @remarks
 * - `'STATE_WAITING'` — the session is waiting to be admitted into the meeting.
 * - `'STATE_JOINED'` — the session has fully joined the meeting.
 * - `'STATE_DISCONNECTED'` — the session is no longer connected.
 *
 * @see {@link GoogleMeetSessionStatus} for the full status resource
 */
export type GoogleMeetConnectionState = 'STATE_WAITING' | 'STATE_JOINED' | 'STATE_DISCONNECTED';

/**
 * Reason the Meet media session was disconnected.
 *
 * @remarks
 * Only present when {@link GoogleMeetSessionStatus.connectionState} is
 * `'STATE_DISCONNECTED'`.
 *
 * - `'REASON_CLIENT_LEFT'` — this client sent a leave request.
 * - `'REASON_USER_STOPPED'` — a user explicitly stopped the Media API session.
 * - `'REASON_CONFERENCE_ENDED'` — the conference ended.
 * - `'REASON_SESSION_UNHEALTHY'` — something else went wrong with the session.
 */
export type GoogleMeetDisconnectReason =
  | 'REASON_CLIENT_LEFT'
  | 'REASON_USER_STOPPED'
  | 'REASON_CONFERENCE_ENDED'
  | 'REASON_SESSION_UNHEALTHY';

/**
 * Session status resource delivered on the `session-control` data channel.
 *
 * @remarks
 * Emitted to callbacks registered with
 * {@link GoogleMeetInput.onSessionStatus | onSessionStatus()} whenever the
 * server pushes a status update.
 *
 * @example
 * ```typescript
 * meet.onSessionStatus((status) => {
 *   if (status.connectionState === 'STATE_JOINED') console.log('In the meeting');
 *   if (status.connectionState === 'STATE_DISCONNECTED') {
 *     console.log('Disconnected:', status.disconnectReason);
 *   }
 * });
 * ```
 *
 * @see {@link GoogleMeetConnectionState} for the state values
 * @see {@link GoogleMeetDisconnectReason} for the disconnect reasons
 */
export interface GoogleMeetSessionStatus {
  /** The connection state of the media session. */
  connectionState: GoogleMeetConnectionState;

  /**
   * Why the session disconnected. Only set when
   * {@link GoogleMeetSessionStatus.connectionState | connectionState} is
   * `'STATE_DISCONNECTED'`.
   */
  disconnectReason?: GoogleMeetDisconnectReason;
}

/**
 * Configuration for {@link GoogleMeetInput}.
 *
 * @example
 * ```typescript
 * const meet = new GoogleMeetInput({
 *   apiKey: async () => refreshOAuthToken(),
 *   spaceName: 'spaces/jQCFfuBOdN5z',
 * });
 * ```
 *
 * @see {@link GoogleMeetInput} for where this config is consumed
 */
export interface GoogleMeetInputConfig {
  /**
   * OAuth 2.0 access token (or an async factory returning a fresh token) with
   * the `https://www.googleapis.com/auth/meetings.conference.media.audio.readonly`
   * scope (or the broader `.media.readonly` scope).
   *
   * @remarks
   * Prefer the factory form — access tokens are short-lived, and the factory
   * is invoked at connect time so a fresh token is always used.
   */
  apiKey: string | (() => Promise<string>);

  /**
   * Resource name of the Meet space hosting the active conference, in the
   * form `spaces/{space}`.
   *
   * @remarks
   * Resolve a meeting code (e.g. `abc-mnop-xyz`) to a space name with the
   * Meet REST API `spaces.get` method. The conference must be **active** when
   * {@link GoogleMeetInput.initialize | initialize()} is called.
   */
  spaceName: string;

  /**
   * Base URL for the Meet Media API.
   *
   * @defaultValue `'https://meet.googleapis.com'`
   */
  endpoint?: string;

  /**
   * Whether to also open the optional `media-entries` data channel.
   *
   * @remarks
   * The channel streams metadata about which participant contributes each
   * audio stream (CSRC mappings, mute state). `GoogleMeetInput` does not
   * consume it — the flag exists for applications that want to inspect the
   * channel themselves via the peer connection.
   *
   * @defaultValue false
   */
  enableMediaEntries?: boolean;

  /**
   * Whether to enable debug logging for this provider.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

/**
 * Session-control channel message shape (server → client).
 *
 * @remarks
 * Minimal structural type covering only the fields this provider reads.
 */
interface SessionControlMessage {
  /** Optional response to a client request (e.g. the leave acknowledgement). */
  response?: unknown;
  /** Resource snapshots; the session status is the first (singleton) entry. */
  resources?: Array<{ sessionStatus?: GoogleMeetSessionStatus }>;
}

/**
 * Media-stats channel message shape (server → client).
 *
 * @remarks
 * The first server message carries the upload configuration: the interval and
 * an allowlist of stats sections/fields the client may upload. Note the
 * reference client reads `keys` from each allowlist entry even though the
 * published typings say `key`; both spellings are accepted here.
 */
interface MediaStatsMessage {
  /** Optional response to a previous `uploadMediaStats` request. */
  response?: { requestId?: number };
  /** Resource snapshots; the configuration is the first (singleton) entry. */
  resources?: Array<{
    configuration?: {
      uploadIntervalSeconds?: number;
      allowlist?: Record<string, { keys?: string[]; key?: string[] }>;
    };
  }>;
}

/**
 * One section of an `uploadMediaStats` request: the WebRTC stats entry id plus
 * the snake_cased section payload keyed by converted section type.
 */
interface MeetStatsSection {
  [sectionType: string]: Record<string, string | number> | string;
  /** WebRTC id of the stats entry. */
  id: string;
}

/**
 * Converts a camelCase WebRTC stats field name to the snake_case form the
 * Meet media-stats channel expects (e.g. `packetsReceived` → `packets_received`).
 *
 * @param text - The camelCase field name.
 * @returns The snake_case field name.
 */
function camelToUnderscore(text: string): string {
  return text.replace(/([A-Z])/g, '_$1').toLowerCase();
}

/**
 * Browser audio input provider that joins a Google Meet conference via the
 * Meet Media API (Developer Preview) and emits the meeting's mixed audio.
 *
 * @remarks
 * `GoogleMeetInput` negotiates a WebRTC session directly with Google Meet:
 *
 * 1. Creates an `RTCPeerConnection` (Google STUN, `max-bundle`).
 * 2. Adds exactly {@link AUDIO_TRANSCEIVER_COUNT | 3} `recvonly` audio
 *    transceivers (Meet uses 3 virtual audio SSRCs; Opus is negotiated by
 *    default).
 * 3. Opens the required `session-control` and `media-stats` data channels
 *    (both `ordered: true`) **before** creating the SDP offer.
 * 4. POSTs the offer to `{endpoint}/v2beta/{spaceName}:connectActiveConference`
 *    with a `Bearer` OAuth token and applies the returned SDP answer.
 * 5. Mixes the incoming audio tracks through a shared `AudioContext`
 *    processing node (AudioWorklet preferred, `ScriptProcessorNode`
 *    fallback), downsamples to 16 kHz mono linear16, and emits
 *    {@link AudioChunk} objects while active.
 *
 * The `media-stats` channel is serviced per the Meet reference client: the
 * provider sends nothing until the server's configuration resource arrives,
 * then uploads allowlisted `RTCPeerConnection.getStats()` sections at the
 * server-specified interval.
 *
 * The Meet Media API is **receive-only** — this provider covers only the
 * `'input'` role and cannot inject audio into the conference.
 *
 * **Data-flow diagram:**
 *
 * ```
 * Meet SFU ──RTP (Opus ×3)──▶ RTCPeerConnection.ontrack
 *                                    │
 *                     MediaStream ──▶ AudioContext (auto-mixed)
 *                                    │
 *                      worklet / script-processor (Float32)
 *                                    │
 *                  downsample 16 kHz → floatTo16BitPCM
 *                                    │
 *              active && !paused ? callback(chunk) : drop
 * ```
 *
 * @example
 * ```typescript
 * import { GoogleMeetInput } from 'composite-voice';
 *
 * const meet = new GoogleMeetInput({
 *   apiKey: 'ya29.a0...', // OAuth token with meetings.conference.media.audio.readonly
 *   spaceName: 'spaces/jQCFfuBOdN5z',
 *   debug: true,
 * });
 *
 * meet.onSessionStatus((status) => console.log('Meet session:', status.connectionState));
 * meet.onAudio((chunk) => console.log(`audio: ${chunk.data.byteLength} bytes`));
 *
 * await meet.initialize(); // joins the conference
 * meet.start();            // begin emitting audio chunks
 * // ...
 * await meet.dispose();    // sends a leave request and tears down WebRTC
 * ```
 *
 * @see {@link GoogleMeetInputConfig} for configuration options
 * @see {@link AudioInputProvider} for the interface contract
 * @see {@link GoogleMeetSessionStatus} for session lifecycle notifications
 */
export class GoogleMeetInput implements AudioInputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `'websocket'` because the provider holds a persistent WebRTC peer
   * connection (media + data channels) for the lifetime of the session.
   */
  public readonly type: ProviderType = 'websocket';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * The Meet Media API is receive-only, so `GoogleMeetInput` covers only the
   * `'input'` slot. Pair it with {@link NullOutput} or another output provider.
   */
  public readonly roles: readonly ProviderRole[] = ['input'];

  /** Normalized provider configuration. */
  private readonly config: GoogleMeetInputConfig;

  /** Scoped logger, enabled via {@link GoogleMeetInputConfig.debug}. */
  private readonly logger: Logger;

  /** The WebRTC peer connection to Google Meet, or `null` when torn down. */
  private peerConnection: RTCPeerConnection | null = null;

  /** The required `session-control` data channel. */
  private sessionControlChannel: RTCDataChannel | null = null;

  /** The required `media-stats` data channel. */
  private mediaStatsChannel: RTCDataChannel | null = null;

  /** The optional `media-entries` data channel (see {@link GoogleMeetInputConfig.enableMediaEntries}). */
  private mediaEntriesChannel: RTCDataChannel | null = null;

  /** Shared AudioContext used to mix and capture the received audio tracks. */
  private audioContext: AudioContext | null = null;

  /** Memoized audio-graph setup promise (guards against concurrent `ontrack`). */
  private audioGraphPromise: Promise<AudioNode> | null = null;

  /** One MediaStreamAudioSourceNode per received audio track. */
  private sourceNodes: AudioNode[] = [];

  /** AudioWorklet capture node (preferred path). */
  private workletNode: AudioWorkletNode | null = null;

  /** ScriptProcessor capture node (fallback path). */
  private processorNode: ScriptProcessorNode | null = null;

  /** Whether {@link initialize} has completed successfully. */
  private initialized = false;

  /** Whether the provider is emitting audio (between `start()` and `stop()`). */
  private active = false;

  /** Whether emission is temporarily paused. */
  private paused = false;

  /** Registered audio chunk callback. */
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;

  /** Registered session status callback. */
  private sessionStatusCallback: ((status: GoogleMeetSessionStatus) => void) | null = null;

  /** Most recent session status received on the session-control channel. */
  private lastSessionStatus: GoogleMeetSessionStatus | null = null;

  /** Monotonically increasing sequence number for emitted chunks. */
  private sequenceNumber = 0;

  /** Next request id for the session-control channel. */
  private sessionControlRequestId = 1;

  /** Next request id for the media-stats channel. */
  private mediaStatsRequestId = 1;

  /** Server-provided allowlist: stats type → uploadable camelCase field names. */
  private readonly statsAllowlist = new Map<string, string[]>();

  /** Interval handle for periodic media-stats uploads, or `null` when idle. */
  private statsIntervalId: ReturnType<typeof setInterval> | null = null;

  /**
   * Creates a new `GoogleMeetInput` instance.
   *
   * @remarks
   * Construction is side-effect free; the WebRTC session is established in
   * {@link GoogleMeetInput.initialize | initialize()}.
   *
   * @param config - Provider configuration. `apiKey` (OAuth access token or
   *   async factory) and `spaceName` (`spaces/{space}`) are required.
   *
   * @example
   * ```typescript
   * const meet = new GoogleMeetInput({
   *   apiKey: async () => getFreshAccessToken(),
   *   spaceName: 'spaces/jQCFfuBOdN5z',
   * });
   * ```
   */
  constructor(config: GoogleMeetInputConfig) {
    this.config = { ...config };
    this.logger = new Logger(this.constructor.name, {
      enabled: true,
      level: config.debug ? 'debug' : 'warn',
    });
  }

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Join the active conference: negotiate the WebRTC session with the Meet
   * Media API and set up the audio mixing pipeline.
   *
   * @remarks
   * Performs the full connect flow described in the class documentation. The
   * conference identified by {@link GoogleMeetInputConfig.spaceName} must be
   * active, and the OAuth token must carry a Meet Media API audio scope.
   * If already initialized, this is a no-op.
   *
   * @throws {@link ProviderInitializationError} when configuration is invalid,
   *   `RTCPeerConnection` is unavailable (non-browser environment), or WebRTC
   *   setup fails.
   * @throws {@link ProviderConnectionError} when the
   *   `connectActiveConference` request is rejected (non-2xx response or a
   *   response without an SDP answer).
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (typeof RTCPeerConnection === 'undefined') {
      throw new ProviderInitializationError(
        this.constructor.name,
        new Error(
          'RTCPeerConnection is not available. GoogleMeetInput requires a browser (or WebRTC-capable) environment.'
        )
      );
    }
    if (!this.config.apiKey) {
      throw new ProviderInitializationError(
        this.constructor.name,
        new Error('apiKey is required (an OAuth access token or async token factory)')
      );
    }
    if (!this.config.spaceName || !/^spaces\/[^/]+$/.test(this.config.spaceName)) {
      throw new ProviderInitializationError(
        this.constructor.name,
        new Error(
          `spaceName must be in the form 'spaces/{space}' (got '${String(this.config.spaceName)}'). ` +
            'Resolve a meeting code to a space name with the Meet REST API spaces.get method.'
        )
      );
    }

    try {
      const peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        bundlePolicy: 'max-bundle',
      });
      this.peerConnection = peerConnection;

      peerConnection.ontrack = (event: RTCTrackEvent): void => {
        this.handleTrack(event);
      };

      // Meet allocates exactly 3 virtual audio SSRCs — negotiate 3 recvonly
      // audio transceivers (Opus is the WebRTC default codec).
      for (let i = 0; i < AUDIO_TRANSCEIVER_COUNT; i++) {
        peerConnection.addTransceiver('audio', { direction: 'recvonly' });
      }

      // Data channels must be created before the offer so they are included
      // in the SDP. All Meet data channels must be reliable and ordered.
      this.createDataChannels(peerConnection);

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const answer = await this.connectActiveConference(offer.sdp ?? '');
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: answer });

      this.initialized = true;
      this.logger.info(`Connected to ${this.config.spaceName}`);
    } catch (error) {
      this.teardown();
      if (error instanceof ProviderConnectionError) {
        throw error;
      }
      throw new ProviderInitializationError(this.constructor.name, error as Error);
    }
  }

  /**
   * Leave the conference and release all resources.
   *
   * @remarks
   * Sends a `leave` request on the `session-control` channel (per the Meet
   * Media API contract: `{"request":{"requestId":n,"leave":{}}}`), then closes
   * the data channels, the peer connection, and the `AudioContext`. The
   * provider may be re-initialized afterwards. Safe to call multiple times.
   */
  async dispose(): Promise<void> {
    this.sendLeaveRequest();
    this.teardown();
    this.audioCallback = null;
    this.sessionStatusCallback = null;
    this.lastSessionStatus = null;
    this.sequenceNumber = 0;
    this.sessionControlRequestId = 1;
    this.mediaStatsRequestId = 1;
    this.initialized = false;
  }

  /**
   * Check whether the provider is connected to the conference.
   *
   * @returns `true` after {@link initialize} completes and until
   *   {@link dispose} is called or the server disconnects the session.
   */
  isReady(): boolean {
    return this.initialized;
  }

  // ── AudioInputProvider interface ─────────────────────────────────

  /**
   * Start emitting audio chunks.
   *
   * @remarks
   * Meeting audio received while stopped is silently dropped (the WebRTC
   * session keeps flowing; only emission is gated). Must be called after
   * {@link initialize}.
   */
  start(): void {
    this.active = true;
    this.paused = false;
  }

  /**
   * Stop emitting audio chunks.
   *
   * @remarks
   * The WebRTC session stays connected — call {@link start} to resume
   * emission, or {@link dispose} to leave the conference.
   */
  stop(): void {
    this.active = false;
    this.paused = false;
  }

  /**
   * Temporarily pause audio emission.
   *
   * @remarks
   * Used by the turn-taking system during TTS playback. Audio received while
   * paused is silently dropped.
   */
  pause(): void {
    if (this.active) {
      this.paused = true;
    }
  }

  /**
   * Resume audio emission after a pause.
   *
   * @see {@link GoogleMeetInput.pause | pause}
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
   * the previous callback.
   *
   * @param callback - Function invoked with each {@link AudioChunk} of mixed
   *   16 kHz mono linear16 meeting audio.
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Get the audio format metadata for the emitted audio.
   *
   * @remarks
   * The provider always emits 16 kHz mono 16-bit linear PCM regardless of the
   * `AudioContext` hardware rate (audio is downsampled internally). Used by
   * the pipeline to auto-configure the STT provider.
   *
   * @returns {@link AudioMetadata} — `linear16`, 16000 Hz, 1 channel, 16-bit.
   */
  getMetadata(): AudioMetadata {
    return {
      sampleRate: TARGET_SAMPLE_RATE,
      encoding: 'linear16',
      channels: 1,
      bitDepth: 16,
    };
  }

  // ── Public API (not part of AudioInputProvider) ──────────────────

  /**
   * Register a callback for Meet session status updates.
   *
   * @remarks
   * Invoked whenever the server pushes a `sessionStatus` resource on the
   * `session-control` data channel — on admission (`STATE_WAITING` →
   * `STATE_JOINED`) and on disconnect (`STATE_DISCONNECTED`, with a
   * {@link GoogleMeetDisconnectReason}). When the session disconnects, the
   * provider automatically stops emission and tears down the WebRTC session.
   *
   * @param callback - Function invoked with each {@link GoogleMeetSessionStatus}.
   *
   * @example
   * ```typescript
   * meet.onSessionStatus((status) => {
   *   if (status.connectionState === 'STATE_DISCONNECTED') {
   *     console.log('Meeting over:', status.disconnectReason);
   *   }
   * });
   * ```
   */
  onSessionStatus(callback: (status: GoogleMeetSessionStatus) => void): void {
    this.sessionStatusCallback = callback;
  }

  /**
   * Get the most recent session status received from the server.
   *
   * @returns The latest {@link GoogleMeetSessionStatus}, or `null` if no
   *   status has been received yet.
   */
  getSessionStatus(): GoogleMeetSessionStatus | null {
    return this.lastSessionStatus;
  }

  // ── Connection ────────────────────────────────────────────────────

  /**
   * Create the Meet data channels and wire their handlers.
   *
   * @remarks
   * Must run **before** `createOffer()` so the channels are negotiated in the
   * SDP. All channels are created `{ ordered: true }` as the Meet Media API
   * requires reliable, ordered delivery.
   *
   * @param peerConnection - The peer connection to create the channels on.
   */
  private createDataChannels(peerConnection: RTCPeerConnection): void {
    const channelOptions: RTCDataChannelInit = { ordered: true };

    const sessionControl = peerConnection.createDataChannel('session-control', channelOptions);
    sessionControl.onmessage = (event: MessageEvent): void => {
      this.handleSessionControlMessage(String(event.data));
    };
    sessionControl.onclose = (): void => {
      this.logger.debug('session-control channel closed');
    };
    this.sessionControlChannel = sessionControl;

    const mediaStats = peerConnection.createDataChannel('media-stats', channelOptions);
    mediaStats.onmessage = (event: MessageEvent): void => {
      this.handleMediaStatsMessage(String(event.data));
    };
    mediaStats.onclose = (): void => {
      this.clearStatsInterval();
      this.logger.debug('media-stats channel closed');
    };
    this.mediaStatsChannel = mediaStats;

    if (this.config.enableMediaEntries) {
      this.mediaEntriesChannel = peerConnection.createDataChannel('media-entries', channelOptions);
    }
  }

  /**
   * POST the SDP offer to the Meet Media API and return the SDP answer.
   *
   * @param sdp - The local SDP offer.
   * @returns The remote SDP answer.
   *
   * @throws {@link ProviderConnectionError} on a non-2xx response or when the
   *   response body lacks an `answer` field.
   */
  private async connectActiveConference(sdp: string): Promise<string> {
    const token = await this.resolveAccessToken();
    const endpoint = this.config.endpoint ?? DEFAULT_ENDPOINT;
    const url = `${endpoint}/v2beta/${this.config.spaceName}:connectActiveConference`;

    this.logger.debug(`POST ${url}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ offer: sdp }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ProviderConnectionError(
        this.constructor.name,
        new Error(`connectActiveConference failed (HTTP ${response.status}): ${body}`)
      );
    }

    const payload = (await response.json()) as { answer?: string; traceId?: string };
    if (!payload.answer) {
      throw new ProviderConnectionError(
        this.constructor.name,
        new Error(
          `connectActiveConference response contained no answer (traceId: ${payload.traceId ?? 'none'})`
        )
      );
    }
    if (payload.traceId) {
      this.logger.debug(`connectActiveConference traceId: ${payload.traceId}`);
    }
    return payload.answer;
  }

  /**
   * Resolve the configured OAuth access token.
   *
   * @returns The token string, invoking the factory if one was supplied.
   */
  private async resolveAccessToken(): Promise<string> {
    const { apiKey } = this.config;
    return typeof apiKey === 'function' ? apiKey() : apiKey;
  }

  // ── Audio pipeline ────────────────────────────────────────────────

  /**
   * Handle an incoming WebRTC track by mixing it into the shared audio graph.
   *
   * @remarks
   * Meet delivers up to three audio tracks (one per virtual SSRC). Each track
   * is wrapped in a `MediaStream`, turned into a `MediaStreamAudioSourceNode`,
   * and connected to the shared capture node — the Web Audio graph sums
   * (mixes) all connected sources automatically.
   *
   * @param event - The `track` event from the peer connection.
   */
  private handleTrack(event: RTCTrackEvent): void {
    if (!event.track || event.track.kind !== 'audio') {
      return;
    }
    this.logger.debug('Received audio track');
    void this.attachTrack(event.track).catch((error: unknown) => {
      this.logger.error('Failed to attach audio track', error);
    });
  }

  /**
   * Connect a received audio track into the shared capture node.
   *
   * @param track - The audio `MediaStreamTrack` to mix in.
   */
  private async attachTrack(track: MediaStreamTrack): Promise<void> {
    this.audioGraphPromise ??= this.setupAudioGraph();
    const captureNode = await this.audioGraphPromise;
    const context = this.audioContext;
    if (!context) return; // torn down while awaiting

    const stream = new MediaStream([track]);
    const source = context.createMediaStreamSource(stream);
    source.connect(captureNode);
    this.sourceNodes.push(source);
  }

  /**
   * Create the shared `AudioContext` and PCM capture node.
   *
   * @remarks
   * Prefers an `AudioWorkletNode` (off-main-thread processing, loaded from an
   * inline Blob URL). Falls back to the deprecated `ScriptProcessorNode` when
   * AudioWorklet is unavailable, mirroring {@link AudioCapture}. Both paths
   * feed {@link handleAudioFrame} with Float32 samples at the context rate.
   *
   * @returns The capture node that source nodes should connect to.
   */
  private async setupAudioGraph(): Promise<AudioNode> {
    const context = new AudioContext();
    this.audioContext = context;

    if (context.audioWorklet) {
      try {
        const blob = new Blob([WORKLET_PROCESSOR_SOURCE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        try {
          await context.audioWorklet.addModule(url);
        } finally {
          URL.revokeObjectURL(url);
        }

        const worklet = new AudioWorkletNode(context, 'google-meet-audio-processor');
        worklet.port.onmessage = (event: MessageEvent): void => {
          const data = event.data as { type?: string; data?: Float32Array } | null;
          if (data && data.type === 'audio' && data.data instanceof Float32Array) {
            this.handleAudioFrame(data.data, context.sampleRate);
          }
        };
        this.workletNode = worklet;
        this.logger.debug('Using AudioWorkletNode for audio capture');
        return worklet;
      } catch {
        this.logger.debug('AudioWorklet unavailable, falling back to ScriptProcessorNode');
      }
    }

    const processor = context.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
    processor.onaudioprocess = (event: AudioProcessingEvent): void => {
      this.handleAudioFrame(event.inputBuffer.getChannelData(0), event.inputBuffer.sampleRate);
    };
    // A ScriptProcessorNode only fires when connected to the destination.
    // Its output buffer is never written, so nothing is audibly played.
    processor.connect(context.destination);
    this.processorNode = processor;
    this.logger.debug('Using ScriptProcessorNode for audio capture (fallback)');
    return processor;
  }

  /**
   * Convert a Float32 frame of mixed meeting audio into a linear16 chunk and
   * emit it.
   *
   * @remarks
   * Chunks are only emitted while the provider is active and not paused —
   * otherwise the frame is silently dropped.
   *
   * @param samples - Float32 samples (mono) at `sourceSampleRate`.
   * @param sourceSampleRate - The rate the samples were captured at.
   */
  private handleAudioFrame(samples: Float32Array, sourceSampleRate: number): void {
    if (!this.active || this.paused || !this.audioCallback) {
      return;
    }

    const resampled =
      sourceSampleRate === TARGET_SAMPLE_RATE
        ? samples
        : downsampleAudio(samples, sourceSampleRate, TARGET_SAMPLE_RATE);
    const pcm = floatTo16BitPCM(resampled);

    const chunk: AudioChunk = {
      data: pcm.buffer as ArrayBuffer,
      timestamp: Date.now(),
      sequence: this.sequenceNumber++,
    };
    this.audioCallback(chunk);
  }

  // ── session-control channel ───────────────────────────────────────

  /**
   * Handle a message from the `session-control` data channel.
   *
   * @remarks
   * Extracts the singleton `sessionStatus` resource, notifies the registered
   * {@link onSessionStatus} callback, and tears down the session on
   * `STATE_DISCONNECTED`.
   *
   * @param raw - The raw JSON message text.
   */
  private handleSessionControlMessage(raw: string): void {
    let message: SessionControlMessage;
    try {
      message = JSON.parse(raw) as SessionControlMessage;
    } catch {
      this.logger.warn('session-control: ignoring malformed message');
      return;
    }

    if (message.response !== undefined) {
      this.logger.debug('session-control: response received', message.response);
    }

    const status = message.resources?.[0]?.sessionStatus;
    if (!status?.connectionState) {
      return;
    }

    this.lastSessionStatus = status;
    this.logger.info(`session-control: ${status.connectionState}`);
    try {
      this.sessionStatusCallback?.(status);
    } catch (error) {
      this.logger.error('session status callback threw', error);
    }

    if (status.connectionState === 'STATE_DISCONNECTED') {
      this.logger.info(
        `Disconnected from meeting (${status.disconnectReason ?? 'unknown reason'})`
      );
      this.teardown();
      this.initialized = false;
    }
  }

  /**
   * Send the Meet `leave` request on the session-control channel, if open.
   *
   * @remarks
   * Wire shape: `{"request":{"requestId":n,"leave":{}}}`. Failures are logged
   * but never thrown — dispose must always complete.
   */
  private sendLeaveRequest(): void {
    const channel = this.sessionControlChannel;
    if (!channel || channel.readyState !== 'open') {
      return;
    }
    try {
      channel.send(
        JSON.stringify({
          request: { requestId: this.sessionControlRequestId++, leave: {} },
        })
      );
      this.logger.debug('session-control: leave request sent');
    } catch (error) {
      this.logger.warn('session-control: failed to send leave request', error);
    }
  }

  // ── media-stats channel ───────────────────────────────────────────

  /**
   * Handle a message from the `media-stats` data channel.
   *
   * @remarks
   * Per the Meet reference client, the client uploads nothing until the
   * server's configuration resource arrives. The configuration provides an
   * `uploadIntervalSeconds` and an allowlist of stats sections/fields; the
   * provider then uploads filtered `getStats()` snapshots on that interval.
   * An interval of `0` stops uploads.
   *
   * @param raw - The raw JSON message text.
   */
  private handleMediaStatsMessage(raw: string): void {
    let message: MediaStatsMessage;
    try {
      message = JSON.parse(raw) as MediaStatsMessage;
    } catch {
      this.logger.warn('media-stats: ignoring malformed message');
      return;
    }

    if (message.response !== undefined) {
      this.logger.debug('media-stats: upload acknowledged', message.response);
    }

    const configuration = message.resources?.[0]?.configuration;
    if (!configuration) {
      return;
    }

    for (const [sectionType, entry] of Object.entries(configuration.allowlist ?? {})) {
      this.statsAllowlist.set(sectionType, entry.keys ?? entry.key ?? []);
    }

    this.clearStatsInterval();
    const intervalSeconds = configuration.uploadIntervalSeconds ?? 0;
    if (intervalSeconds > 0) {
      this.statsIntervalId = setInterval(() => {
        void this.uploadMediaStats();
      }, intervalSeconds * 1000);
      this.logger.debug(`media-stats: uploading every ${intervalSeconds}s`);
    } else {
      this.logger.debug('media-stats: uploads disabled by server (interval 0)');
    }
  }

  /**
   * Gather `RTCPeerConnection.getStats()` and upload the allowlisted sections.
   *
   * @remarks
   * Wire shape:
   * `{"request":{"requestId":n,"uploadMediaStats":{"sections":[{"id":…,"inbound_rtp":{…}},…]}}}`.
   * Field names are converted from camelCase to snake_case and the `id` field
   * is hoisted to the section top level, matching the reference client.
   * Sends nothing when no sections match or the channel is not open.
   */
  private async uploadMediaStats(): Promise<void> {
    const channel = this.mediaStatsChannel;
    const peerConnection = this.peerConnection;
    if (!channel || !peerConnection || channel.readyState !== 'open') {
      this.clearStatsInterval();
      return;
    }

    let report: RTCStatsReport;
    try {
      report = await peerConnection.getStats();
    } catch (error) {
      this.logger.warn('media-stats: getStats() failed', error);
      return;
    }

    const sections = this.buildStatsSections(report);
    if (sections.length === 0) {
      this.logger.debug('media-stats: no allowlisted stats to upload');
      return;
    }

    try {
      channel.send(
        JSON.stringify({
          request: {
            requestId: this.mediaStatsRequestId,
            uploadMediaStats: { sections },
          },
        })
      );
      this.mediaStatsRequestId++;
    } catch (error) {
      this.logger.warn('media-stats: failed to send upload', error);
    }
  }

  /**
   * Filter a WebRTC stats report down to the server-allowlisted sections.
   *
   * @param report - The stats report from `RTCPeerConnection.getStats()`.
   * @returns Sections in the Meet upload format (snake_case fields, `id`
   *   hoisted to the top level).
   */
  private buildStatsSections(report: RTCStatsReport): MeetStatsSection[] {
    const sections: MeetStatsSection[] = [];

    report.forEach((stats: unknown) => {
      const entry = stats as Record<string, unknown>;
      const type = typeof entry.type === 'string' ? entry.type : '';
      const allowedKeys = this.statsAllowlist.get(type);
      const sectionName = STATS_TYPE_CONVERTER[type];
      if (!allowedKeys || sectionName === undefined) {
        return;
      }

      const filtered: Record<string, string | number> = {};
      for (const [key, value] of Object.entries(entry)) {
        // `id` is not accepted alongside other stats — it is hoisted to the
        // top level of the section instead.
        if (key === 'id' || !allowedKeys.includes(key)) {
          continue;
        }
        if (typeof value === 'string' || typeof value === 'number') {
          filtered[camelToUnderscore(key)] = value;
        }
      }

      sections.push({
        id: typeof entry.id === 'string' ? entry.id : String(entry.id ?? ''),
        [sectionName]: filtered,
      });
    });

    return sections;
  }

  /** Stop the periodic media-stats upload interval, if running. */
  private clearStatsInterval(): void {
    if (this.statsIntervalId !== null) {
      clearInterval(this.statsIntervalId);
      this.statsIntervalId = null;
    }
  }

  // ── Teardown ──────────────────────────────────────────────────────

  /**
   * Release all WebRTC and Web Audio resources.
   *
   * @remarks
   * Called by {@link dispose}, on initialization failure, and when the server
   * reports `STATE_DISCONNECTED`. Idempotent and never throws.
   */
  private teardown(): void {
    this.active = false;
    this.paused = false;
    this.clearStatsInterval();
    this.statsAllowlist.clear();

    for (const source of this.sourceNodes) {
      try {
        source.disconnect();
      } catch {
        // ignore — node may already be disconnected
      }
    }
    this.sourceNodes = [];

    if (this.workletNode) {
      try {
        this.workletNode.port.onmessage = null;
        this.workletNode.disconnect();
      } catch {
        // ignore
      }
      this.workletNode = null;
    }

    if (this.processorNode) {
      try {
        this.processorNode.onaudioprocess = null;
        this.processorNode.disconnect();
      } catch {
        // ignore
      }
      this.processorNode = null;
    }

    this.audioGraphPromise = null;

    if (this.audioContext) {
      try {
        void this.audioContext.close();
      } catch {
        // ignore
      }
      this.audioContext = null;
    }

    for (const channel of [
      this.sessionControlChannel,
      this.mediaStatsChannel,
      this.mediaEntriesChannel,
    ]) {
      if (channel) {
        try {
          channel.close();
        } catch {
          // ignore
        }
      }
    }
    this.sessionControlChannel = null;
    this.mediaStatsChannel = null;
    this.mediaEntriesChannel = null;

    if (this.peerConnection) {
      try {
        this.peerConnection.close();
      } catch {
        // ignore
      }
      this.peerConnection = null;
    }
  }
}
