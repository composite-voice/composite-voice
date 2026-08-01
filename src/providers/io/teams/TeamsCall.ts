// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./azure-modules.d.ts" />
/**
 * Microsoft Teams meeting duplex provider via Azure Communication Services.
 *
 * @packageDocumentation
 *
 * @remarks
 * This module provides the {@link TeamsCall} class, a duplex (`'input'` +
 * `'output'`) provider that joins a Microsoft Teams meeting as an external
 * (Teams-interop) participant using the Azure Communication Services (ACS)
 * Calling SDK for JavaScript. The agent hears the meeting's mixed remote
 * audio and speaks synthesized TTS audio into the meeting.
 *
 * `TeamsCall` is a **browser-only** provider: it relies on the Web Audio API
 * (`AudioContext`, `MediaStream`) and the ACS Calling SDK, which itself only
 * runs in browsers. It requires two **optional peer dependencies**:
 *
 * ```bash
 * pnpm add @azure/communication-calling @azure/communication-common
 * ```
 *
 * Both packages are loaded dynamically at
 * {@link TeamsCall.initialize | initialize()} time via `importPeerDep`, so
 * applications that do not use `TeamsCall` never pay for them.
 *
 * **Data-flow diagram:**
 *
 * ```
 *                Teams meeting (via ACS Teams interop)
 *                    |                        ^
 *          remoteAudioStreams[0]       LocalAudioStream
 *          (mixed remote audio)      (MediaStreamDestination)
 *                    |                        |
 *                    v                        |
 *              MediaStream              AudioContext <-- AudioBufferSource
 *                    |                        ^         (scheduled queue)
 *              AudioContext                   |
 *          (worklet/script node)          enqueue()
 *                    |                        |
 *              PCM 16k mono             OutputQueue <-- [TTS]
 *                    |
 *                onAudio()
 *                    |
 *                    v
 *          InputQueue --> [STT] --> [LLM]
 * ```
 *
 * **Remote audio acquisition (verified 2026-07-13):** the ACS Calling SDK's
 * `Call` interface exposes a `remoteAudioStreams` property and a
 * `remoteAudioStreamsUpdated` event (confirmed against the
 * `@azure/communication-calling` API reference). However, the official raw
 * media access quickstart documents only the poll-style pattern — check
 * `call.remoteAudioStreams[0]` after `stateChanged` reports `'Connected'` —
 * and does not demonstrate the event. Because the documentation is ambiguous
 * about when (or whether) the event fires for the mixed stream, `TeamsCall`
 * uses **both**: it subscribes to `remoteAudioStreamsUpdated` and
 * `stateChanged`, *and* runs a light interval poll of
 * `call.remoteAudioStreams` until the stream is acquired (the documented
 * fallback). Whichever path wins first attaches the capture graph; the rest
 * become no-ops.
 *
 * **Lobby caveat:** Teams meetings frequently admit external participants
 * through a lobby. The call then reports the `'InLobby'` state and no remote
 * audio flows until a participant with admission rights lets the agent in.
 * Subscribe with {@link TeamsCall.onCallStateChanged | onCallStateChanged()}
 * to surface this to users.
 *
 * @example
 * ```typescript
 * import { TeamsCall } from 'composite-voice';
 *
 * const teams = new TeamsCall({
 *   token: async () => fetchAcsTokenFromMyServer(),
 *   displayName: 'Support Agent',
 *   meetingLink: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_...',
 * });
 * ```
 *
 * @see {@link AudioInputProvider} and {@link AudioOutputProvider} for the interface contracts
 * @see {@link BrowserAudioOutput} for the local-speaker output counterpart whose
 *   scheduling semantics this provider mirrors
 * @see https://learn.microsoft.com/en-us/azure/communication-services/quickstarts/voice-video-calling/get-started-raw-media-access?pivots=platform-web
 */

import type { AudioChunk, AudioMetadata, AudioPlaybackState } from '../../../core/types/audio';
import type {
  AudioInputProvider,
  AudioOutputProvider,
  ProviderType,
} from '../../../core/types/providers';
import type { ProviderRole } from '../../../core/types/roles';
import { importPeerDep } from '../../../utils/importPeerDep';
import { ProviderConnectionError, ProviderInitializationError } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';
import { floatTo16BitPCM, int16ToFloat, resamplePcm } from '../../../utils/audio';
import { decodeAlaw, decodeMulaw } from '../../../utils/g711';

// ─── Constants ────────────────────────────────────────────────────────

/** Sample rate (Hz) of the PCM chunks emitted by the input side. */
const TARGET_SAMPLE_RATE = 16000;

/** Interval (ms) of the documented poll fallback for remote audio streams. */
const REMOTE_AUDIO_POLL_INTERVAL_MS = 500;

/** ScriptProcessorNode buffer size used by the capture fallback path. */
const CAPTURE_BUFFER_SIZE = 4096;

/**
 * Minimum audio buffered (ms) before playback into the meeting starts.
 * Mirrors `AudioPlayer`'s default `minBufferDuration` used by
 * {@link BrowserAudioOutput}.
 */
const MIN_BUFFER_DURATION_MS = 200;

/** Poll interval (ms) used while waiting for the minimum playback buffer. */
const BUFFER_CHECK_INTERVAL_MS = 50;

/** Maximum time (ms) to wait for the minimum buffer before playing anyway. */
const BUFFER_MAX_WAIT_MS = 5000;

/** Maximum time (ms) {@link TeamsCall.flush | flush()} waits for playback to drain. */
const FLUSH_TIMEOUT_MS = 30000;

/**
 * Inline AudioWorklet processor source for remote-audio capture.
 *
 * @remarks
 * Loaded via a Blob URL at runtime so users do not need to serve a separate
 * worklet file. Mirrors the processor used by the SDK's `AudioCapture`: each
 * render quantum's first-channel samples are posted to the main thread.
 */
const CAPTURE_WORKLET_SOURCE = `
class TeamsCallCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      this.port.postMessage({ type: 'audio', data: new Float32Array(input[0]) });
    }
    return true;
  }
}
registerProcessor('teams-call-capture-processor', TeamsCallCaptureProcessor);
`;

// ─── Local structural types for the ACS SDK surface ──────────────────
//
// The Azure packages are optional peer dependencies and are NOT installed in
// this repository, so `import('pkg').Type` type imports are unavailable.
// These interfaces describe only the SDK surface TeamsCall actually calls.

/**
 * Call states reported by the ACS Calling SDK's `Call.state`.
 *
 * @remarks
 * Mirrors the `CallState` string union from `@azure/communication-calling`.
 * The states most relevant to Teams interop are:
 *
 * - `'Connecting'` — the join request is in flight
 * - `'InLobby'` — the agent is waiting in the Teams lobby for admission
 * - `'Connected'` — media is flowing; remote audio becomes available
 * - `'Disconnected'` — the call ended (hang-up, removal, or failure)
 *
 * @see {@link TeamsCall.onCallStateChanged}
 */
export type TeamsCallState =
  | 'None'
  | 'Connecting'
  | 'Ringing'
  | 'EarlyMedia'
  | 'Connected'
  | 'LocalHold'
  | 'RemoteHold'
  | 'InLobby'
  | 'Disconnecting'
  | 'Disconnected';

/**
 * Minimal structural type for an ACS `CommunicationTokenCredential`.
 *
 * @remarks
 * Matches the surface of `AzureCommunicationTokenCredential` from
 * `@azure/communication-common`. Supply an instance via
 * {@link TeamsCallConfig.tokenCredential} when you need proactive token
 * refresh; otherwise pass a raw token (or async token factory) via
 * {@link TeamsCallConfig.token} and `TeamsCall` constructs the credential
 * for you.
 */
export interface TeamsTokenCredential {
  /** Returns the current ACS user access token. */
  getToken(abortSignal?: unknown): Promise<{ token: string; expiresOnTimestamp: number }>;
  /** Releases refresh timers held by the credential. */
  dispose(): void;
}

/** Structural type for `RemoteAudioStream` (mixed remote meeting audio). */
interface AcsRemoteAudioStream {
  /** Resolves the browser `MediaStream` carrying the mixed remote audio. */
  getMediaStream(): Promise<MediaStream>;
}

/** Listener shape for ACS `CollectionUpdatedEvent<RemoteAudioStream>`. */
type AcsRemoteStreamsUpdatedListener = (args: {
  added: AcsRemoteAudioStream[];
  removed: AcsRemoteAudioStream[];
}) => void;

/** Structural type for the ACS `Call` surface used by this provider. */
interface AcsCall {
  /** Current call state (`'Connected'`, `'InLobby'`, `'Disconnected'`, ...). */
  readonly state: TeamsCallState;
  /** Mixed remote audio streams currently received from the call. */
  readonly remoteAudioStreams: readonly AcsRemoteAudioStream[];
  on(event: 'stateChanged', listener: () => void): void;
  on(event: 'remoteAudioStreamsUpdated', listener: AcsRemoteStreamsUpdatedListener): void;
  off(event: 'stateChanged', listener: () => void): void;
  off(event: 'remoteAudioStreamsUpdated', listener: AcsRemoteStreamsUpdatedListener): void;
  /** Hangs up the call. */
  hangUp(): Promise<void>;
}

/** Join options subset accepted by `CallAgent.join()`. */
interface AcsJoinOptions {
  audioOptions?: {
    localAudioStreams?: unknown[];
    muted?: boolean;
  };
}

/** Structural type for the ACS `CallAgent` surface used by this provider. */
interface AcsCallAgent {
  /** Joins a Teams meeting by meeting link. */
  join(context: { meetingLink: string }, options?: AcsJoinOptions): AcsCall;
  /** Disposes the agent and its signaling connection. */
  dispose(): Promise<void>;
}

/** Structural type for the ACS `CallClient` surface used by this provider. */
interface AcsCallClient {
  /** Creates a `CallAgent` authenticated by the given token credential. */
  createCallAgent(
    credential: TeamsTokenCredential,
    options?: { displayName?: string }
  ): Promise<AcsCallAgent>;
}

/** Named exports consumed from `@azure/communication-calling`. */
interface AcsCallingModule {
  CallClient: new (options?: unknown) => AcsCallClient;
  LocalAudioStream: new (source: MediaStream) => unknown;
}

/** Named exports consumed from `@azure/communication-common`. */
interface AcsCommonModule {
  AzureCommunicationTokenCredential: new (token: string) => TeamsTokenCredential;
}

// ─── Configuration ────────────────────────────────────────────────────

/**
 * Configuration for {@link TeamsCall}.
 *
 * @remarks
 * Authentication uses an **ACS user access token** (issued server-side from
 * your ACS resource via the Identity SDK/REST API with the `voip` scope).
 * Provide either:
 *
 * - {@link TeamsCallConfig.token | token} — a raw token string, or an async
 *   factory returning a fresh token (factories are resolved once at
 *   `initialize()` time), or
 * - {@link TeamsCallConfig.tokenCredential | tokenCredential} — a
 *   pre-constructed `AzureCommunicationTokenCredential`, useful when you need
 *   proactive refresh for calls longer than the token lifetime.
 *
 * @example
 * ```typescript
 * const teams = new TeamsCall({
 *   token: async () => (await fetch('/api/acs-token')).json().then((r) => r.token),
 *   displayName: 'Voice Agent',
 *   meetingLink: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_...',
 *   debug: true,
 * });
 * ```
 *
 * @see {@link TeamsCall} for where this config is consumed
 */
export interface TeamsCallConfig {
  /**
   * ACS user access token, or an async factory returning one.
   *
   * @remarks
   * Ignored when {@link TeamsCallConfig.tokenCredential | tokenCredential}
   * is provided. Tokens are issued from your ACS resource server-side —
   * never mint them in the browser with your resource connection string.
   */
  token?: string | (() => Promise<string>);

  /**
   * Pre-constructed ACS token credential
   * (`AzureCommunicationTokenCredential`).
   *
   * @remarks
   * Takes precedence over {@link TeamsCallConfig.token | token}. `TeamsCall`
   * does **not** dispose credentials it did not create — the caller retains
   * ownership.
   */
  tokenCredential?: TeamsTokenCredential;

  /**
   * Display name shown to other meeting participants.
   *
   * @defaultValue `'Voice Agent'`
   */
  displayName?: string;

  /**
   * Teams meeting join link
   * (`https://teams.microsoft.com/l/meetup-join/...`).
   */
  meetingLink: string;

  /**
   * Whether to enable debug logging for this provider.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

// ─── Provider ─────────────────────────────────────────────────────────

/**
 * Duplex provider that joins a Microsoft Teams meeting via Azure
 * Communication Services and bridges its audio to the pipeline.
 *
 * @remarks
 * `TeamsCall` covers both the `'input'` and `'output'` pipeline roles:
 *
 * - **Input** — the meeting's mixed remote audio
 *   (`call.remoteAudioStreams[0]`, resolved to a `MediaStream` via
 *   `getMediaStream()`) is processed through an `AudioContext`
 *   (AudioWorklet preferred, `ScriptProcessorNode` fallback), resampled to
 *   16 kHz mono, and emitted as linear16 {@link AudioChunk}s.
 * - **Output** — TTS audio is decoded into `AudioBuffer`s and scheduled
 *   sequentially into an `AudioContext.createMediaStreamDestination()`
 *   node whose `MediaStream` is sent into the call as an ACS
 *   `LocalAudioStream` (passed via `audioOptions.localAudioStreams` at join
 *   time). The queue/buffering/merge/stop semantics mirror
 *   {@link BrowserAudioOutput} (i.e. the SDK's `AudioPlayer`): chunks are
 *   gated behind a 200 ms minimum buffer, drained and merged to play
 *   gaplessly, and a generation counter makes `stop()` cancel in-flight
 *   scheduling immediately.
 *
 * **Duplex method semantics.** Both roles share one class, so the shared
 * lifecycle methods are defined as follows (this matches how
 * `CompositeVoice` drives duplex providers):
 *
 * | Method | Semantics |
 * |---|---|
 * | `start()` | Input: begin emitting captured meeting audio |
 * | `stop()` | Output: **barge-in** — halt playback into the meeting and clear the buffer. Capture is *not* deactivated (the pipeline calls `output.stop()` mid-conversation when the user interrupts; killing capture would deafen the agent). Use {@link TeamsCall.hangUp | hangUp()} or {@link TeamsCall.dispose | dispose()} to leave the call and stop capture. |
 * | `pause()`/`resume()` | Input: gate emission (used by turn-taking to mute capture during TTS playback). Playback into the meeting is unaffected — pausing it would silence the agent's own speech. |
 * | `isActive()` | Input: started and not paused |
 * | `isPlaying()` | Output: audio currently being played into the meeting |
 *
 * **Supported TTS formats** (via {@link TeamsCall.configure | configure()}):
 * `linear16` at any sample rate (resampled by the browser), `mulaw`/`alaw`
 * (decoded with the SDK's G.711 codecs), and `mp3` (decoded with
 * `decodeAudioData`). Containerless `opus` is rejected with instructions to
 * reconfigure the TTS provider.
 *
 * **Data-flow diagram:**
 *
 * ```
 * Teams meeting ──remoteAudioStreams[0]──> AudioContext ──PCM 16k──> onAudio() ──> [STT]
 *       ^
 *       └──LocalAudioStream(dest.stream)── AudioContext <──AudioBuffer── enqueue() <── [TTS]
 * ```
 *
 * @example
 * ```typescript
 * import { CompositeVoice, TeamsCall, DeepgramSTT, AnthropicLLM, DeepgramTTS } from 'composite-voice';
 *
 * const teams = new TeamsCall({
 *   token: acsUserAccessToken,
 *   displayName: 'Voice Agent',
 *   meetingLink: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_...',
 * });
 *
 * teams.onCallStateChanged((state) => {
 *   if (state === 'InLobby') console.log('Waiting for lobby admission...');
 *   if (state === 'Connected') console.log('Joined the meeting');
 * });
 *
 * const voice = new CompositeVoice({
 *   providers: [
 *     teams, // fills both 'input' and 'output'
 *     new DeepgramSTT({ apiKey: '...' }),
 *     new AnthropicLLM({ model: 'claude-sonnet-4-20250514', apiKey: '...' }),
 *     new DeepgramTTS({ apiKey: '...', encoding: 'linear16', sampleRate: 24000 }),
 *   ],
 * });
 *
 * await voice.initialize(); // joins the meeting
 * await voice.startListening();
 * ```
 *
 * @see {@link TeamsCallConfig} for configuration options
 * @see {@link AudioInputProvider} and {@link AudioOutputProvider} for the contracts
 * @see {@link BrowserAudioOutput} for the mirrored playback semantics
 */
export class TeamsCall implements AudioInputProvider, AudioOutputProvider {
  /**
   * Communication type for this provider.
   *
   * @remarks
   * `'websocket'` because the ACS Calling SDK maintains a persistent
   * signaling and media connection for the lifetime of the call.
   */
  public readonly type: ProviderType = 'websocket';

  /**
   * Pipeline roles covered by this provider.
   *
   * @remarks
   * `TeamsCall` is a duplex provider filling both the `'input'` slot
   * (meeting audio in) and the `'output'` slot (TTS audio into the meeting).
   * It requires separate STT, LLM, and TTS providers.
   */
  public readonly roles: readonly ProviderRole[] = ['input', 'output'];

  /** Provider configuration captured at construction time. */
  private readonly config: TeamsCallConfig;

  /** Logger scoped to this provider. */
  private readonly logger: Logger;

  /** Whether this provider has been initialized. */
  private initialized = false;

  // ── ACS SDK state ──
  /** The ACS CallClient created during initialization. */
  private callClient: AcsCallClient | null = null;

  /** The ACS CallAgent created during initialization. */
  private callAgent: AcsCallAgent | null = null;

  /** The joined Teams meeting call. */
  private call: AcsCall | null = null;

  /** Token credential in use; owned when constructed from `config.token`. */
  private credential: TeamsTokenCredential | null = null;

  /** Whether this provider constructed (and must dispose) the credential. */
  private ownsCredential = false;

  /** Registered `stateChanged` listener (kept for `off()` on dispose). */
  private stateChangedListener: (() => void) | null = null;

  /** Registered `remoteAudioStreamsUpdated` listener (kept for `off()`). */
  private remoteStreamsListener: AcsRemoteStreamsUpdatedListener | null = null;

  /** Stored callback for call state changes. */
  private callStateCallback: ((state: TeamsCallState) => void) | null = null;

  // ── Input (capture) state ──
  /** Whether the input side has been started via `start()`. */
  private active = false;

  /** Whether input emission is paused. */
  private paused = false;

  /** Registered callback for captured audio chunks. */
  private audioCallback: ((chunk: AudioChunk) => void) | null = null;

  /** Monotonically increasing sequence number for emitted chunks. */
  private sequenceNumber = 0;

  /** AudioContext processing the remote meeting audio. */
  private captureContext: AudioContext | null = null;

  /** Source node wrapping the remote `MediaStream`. */
  private captureSource: MediaStreamAudioSourceNode | null = null;

  /** Worklet node used on the preferred capture path. */
  private captureWorkletNode: AudioWorkletNode | null = null;

  /** ScriptProcessor node used on the fallback capture path. */
  private captureProcessorNode: ScriptProcessorNode | null = null;

  /** The remote audio stream currently feeding the capture graph. */
  private attachedRemoteStream: AcsRemoteAudioStream | null = null;

  /** Guard against concurrent `getMediaStream()` attachment attempts. */
  private attachingRemoteStream = false;

  /** Interval handle for the documented remote-audio poll fallback. */
  private remoteAudioPollTimer: ReturnType<typeof setInterval> | null = null;

  // ── Output (playback) state ──
  /** AudioContext whose MediaStream destination feeds the call. */
  private playbackContext: AudioContext | null = null;

  /** Destination node whose `stream` becomes the ACS LocalAudioStream. */
  private destinationNode: MediaStreamAudioDestinationNode | null = null;

  /** Format metadata for incoming TTS chunks (set by `configure()`). */
  private outputMetadata: AudioMetadata | null = null;

  /** Queue of TTS chunks awaiting playback into the meeting. */
  private audioQueue: AudioChunk[] = [];

  /** Whether the playback queue processor loop is running. */
  private isProcessingQueue = false;

  /** Monotonic counter incremented on `stop()` so stale loops bail out. */
  private playbackGeneration = 0;

  /** Current playback state (mirrors AudioPlayer's state machine). */
  private playbackState: AudioPlaybackState = 'idle';

  /** The AudioBufferSourceNode currently playing into the destination. */
  private currentSource: AudioBufferSourceNode | null = null;

  /** Stored callback for playback start events. */
  private playbackStartCallback: (() => void) | null = null;

  /** Stored callback for playback end events. */
  private playbackEndCallback: (() => void) | null = null;

  /** Stored callback for playback error events. */
  private playbackErrorCallback: ((error: Error) => void) | null = null;

  /**
   * Creates a new `TeamsCall` instance.
   *
   * @remarks
   * The constructor only captures configuration — no network activity or
   * SDK loading occurs until {@link TeamsCall.initialize | initialize()},
   * which imports the peer dependencies, creates the `CallAgent`, and joins
   * the meeting.
   *
   * @param config - Provider configuration. `meetingLink` and one of
   *   `token`/`tokenCredential` are required (validated in `initialize()`).
   *
   * @example
   * ```typescript
   * const teams = new TeamsCall({
   *   token: '<ACS user access token>',
   *   meetingLink: 'https://teams.microsoft.com/l/meetup-join/19%3ameeting_...',
   * });
   * ```
   */
  constructor(config: TeamsCallConfig) {
    this.config = { ...config };
    this.logger = new Logger('TeamsCall', {
      enabled: true,
      level: config.debug ? 'debug' : 'warn',
    });
  }

  // ── BaseProvider lifecycle ────────────────────────────────────────

  /**
   * Initialize the provider: load the ACS SDK, create the call agent, and
   * join the Teams meeting.
   *
   * @remarks
   * Performs, in order:
   *
   * 1. Validates configuration (`meetingLink`, `token`/`tokenCredential`)
   *    and the browser environment (`AudioContext` must exist).
   * 2. Dynamically imports `@azure/communication-calling` and
   *    `@azure/communication-common` via `importPeerDep`.
   * 3. Resolves the token (calling the factory if one was supplied) and
   *    constructs an `AzureCommunicationTokenCredential` unless a
   *    credential was provided.
   * 4. Creates the `CallAgent` with the configured `displayName`.
   * 5. Builds the outgoing audio graph (`AudioContext` +
   *    `createMediaStreamDestination()`) and wraps its stream in an ACS
   *    `LocalAudioStream`.
   * 6. Joins the meeting:
   *    `callAgent.join({ meetingLink }, { audioOptions: { localAudioStreams: [las], muted: false } })`.
   * 7. Subscribes to `stateChanged` and `remoteAudioStreamsUpdated`, and
   *    starts the documented poll fallback for remote audio.
   *
   * Joining does not mean audio flows yet — the call may sit in the Teams
   * lobby (`'InLobby'`) until admitted. If already initialized, this is a
   * no-op.
   *
   * @throws {@link ProviderInitializationError} when configuration is
   *   invalid, a peer dependency is missing, the environment lacks Web
   *   Audio support, or `createCallAgent` fails.
   * @throws {@link ProviderConnectionError} when joining the meeting fails.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Already initialized');
      return;
    }

    if (!this.config.meetingLink) {
      throw new ProviderInitializationError(
        'TeamsCall',
        new Error('meetingLink is required (a https://teams.microsoft.com/l/meetup-join/... URL)')
      );
    }
    if (!this.config.token && !this.config.tokenCredential) {
      throw new ProviderInitializationError(
        'TeamsCall',
        new Error(
          'An ACS user access token is required: pass `token` (string or async factory) or `tokenCredential`'
        )
      );
    }
    if (typeof AudioContext === 'undefined') {
      throw new ProviderInitializationError(
        'TeamsCall',
        new Error(
          'TeamsCall requires a browser environment with Web Audio API support (AudioContext is not available)'
        )
      );
    }

    this.logger.info('Initializing TeamsCall');

    const calling = await importPeerDep<AcsCallingModule>(
      () => import('@azure/communication-calling'),
      '@azure/communication-calling',
      'TeamsCall'
    );
    const common = await importPeerDep<AcsCommonModule>(
      () => import('@azure/communication-common'),
      '@azure/communication-common',
      'TeamsCall'
    );

    // Resolve the token credential
    if (this.config.tokenCredential) {
      this.credential = this.config.tokenCredential;
      this.ownsCredential = false;
    } else {
      const token =
        typeof this.config.token === 'function' ? await this.config.token() : this.config.token;
      if (!token) {
        throw new ProviderInitializationError(
          'TeamsCall',
          new Error('The token factory returned an empty ACS user access token')
        );
      }
      this.credential = new common.AzureCommunicationTokenCredential(token);
      this.ownsCredential = true;
    }

    // Create the call agent
    try {
      this.callClient = new calling.CallClient();
      this.callAgent = await this.callClient.createCallAgent(this.credential, {
        displayName: this.config.displayName ?? 'Voice Agent',
      });
    } catch (error) {
      await this.cleanupAfterFailedInit();
      throw new ProviderInitializationError('TeamsCall', error as Error);
    }

    // Build the outgoing audio graph and join the meeting
    try {
      this.playbackContext = new AudioContext();
      this.destinationNode = this.playbackContext.createMediaStreamDestination();
      const localAudioStream = new calling.LocalAudioStream(this.destinationNode.stream);

      this.call = this.callAgent.join(
        { meetingLink: this.config.meetingLink },
        { audioOptions: { localAudioStreams: [localAudioStream], muted: false } }
      );
    } catch (error) {
      await this.cleanupAfterFailedInit();
      throw new ProviderConnectionError('TeamsCall', error as Error);
    }

    // Wire remote-audio acquisition: event (verified against the ACS Call
    // API reference) + state-change check + interval poll (the pattern the
    // raw-media quickstart documents).
    this.stateChangedListener = () => this.handleStateChanged();
    this.call.on('stateChanged', this.stateChangedListener);

    this.remoteStreamsListener = (args) => {
      if (args.added.length > 0) {
        this.logger.debug('remoteAudioStreamsUpdated: streams added', args.added.length);
        void this.tryAttachRemoteAudio();
      }
    };
    this.call.on('remoteAudioStreamsUpdated', this.remoteStreamsListener);

    this.startRemoteAudioPolling();
    void this.tryAttachRemoteAudio();

    this.initialized = true;
    this.logger.info('TeamsCall initialized — joining meeting', {
      state: this.call.state,
    });
  }

  /**
   * Dispose of the provider: hang up, release the call agent, and free all
   * audio resources.
   *
   * @remarks
   * Safe to call multiple times. Performs {@link TeamsCall.hangUp | hangUp()}
   * (which stops capture and playback), then disposes the `CallAgent`,
   * disposes the token credential **only if this provider created it**,
   * closes both `AudioContext`s, and clears all callback references. The
   * instance may be re-initialized afterwards.
   */
  async dispose(): Promise<void> {
    if (!this.initialized) {
      this.logger.debug('Already disposed');
      return;
    }

    this.logger.info('Disposing TeamsCall');

    await this.hangUp();

    if (this.callAgent) {
      try {
        await this.callAgent.dispose();
      } catch (error) {
        this.logger.warn('CallAgent dispose failed', error);
      }
      this.callAgent = null;
    }
    this.callClient = null;

    if (this.credential && this.ownsCredential) {
      try {
        this.credential.dispose();
      } catch (error) {
        this.logger.warn('Credential dispose failed', error);
      }
    }
    this.credential = null;
    this.ownsCredential = false;

    if (this.playbackContext) {
      try {
        await this.playbackContext.close();
      } catch (error) {
        this.logger.warn('Playback AudioContext close failed', error);
      }
      this.playbackContext = null;
    }
    this.destinationNode = null;

    this.audioCallback = null;
    this.callStateCallback = null;
    this.playbackStartCallback = null;
    this.playbackEndCallback = null;
    this.playbackErrorCallback = null;
    this.outputMetadata = null;
    this.sequenceNumber = 0;
    this.initialized = false;
    this.logger.info('TeamsCall disposed');
  }

  /**
   * Check whether the provider has been initialized.
   *
   * @returns `true` when {@link initialize} has completed and
   *   {@link dispose} has not yet been called.
   */
  isReady(): boolean {
    return this.initialized;
  }

  // ── AudioInputProvider interface ──────────────────────────────────

  /**
   * Start emitting captured meeting audio to the registered callback.
   *
   * @remarks
   * Chunks only flow once the remote audio stream has been acquired, which
   * requires the call to be `'Connected'` (i.e. admitted past any lobby).
   * Audio captured before `start()` is silently dropped.
   */
  start(): void {
    this.active = true;
    this.paused = false;
    this.logger.debug('Input started');
  }

  /**
   * Stop the provider — barge-in while the agent is speaking, capture halt
   * otherwise.
   *
   * @remarks
   * As a duplex provider, the same `stop()` is invoked by CompositeVoice for
   * two different reasons, so the provider dispatches on playback state:
   *
   * - **Barge-in** (`output.stop()`) — while audio is queued or playing into
   *   the meeting, playback is stopped in the {@link BrowserAudioOutput}
   *   manner: the in-flight `AudioBufferSourceNode` is stopped, the queue is
   *   cleared, and `onPlaybackEnd` fires. Meeting-audio capture deliberately
   *   survives — barge-in depends on the very speech the agent is hearing,
   *   so cutting capture here would permanently deafen the pipeline.
   * - **Stop listening** (`input.stop()`) — with no playback in flight,
   *   meeting-audio emission is halted instead (restart with
   *   {@link TeamsCall.start | start()}).
   *
   * {@link TeamsCall.hangUp | hangUp()} and
   * {@link TeamsCall.dispose | dispose()} stop both sides unconditionally.
   */
  stop(): void {
    const bargeIn =
      this.isProcessingQueue ||
      this.audioQueue.length > 0 ||
      this.playbackState === 'buffering' ||
      this.playbackState === 'playing';

    if (bargeIn) {
      this.stopPlayback();
      return;
    }

    this.stopCapture();
  }

  /**
   * Stop playback, leaving meeting-audio capture running.
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
    this.logger.debug('Stopping playback (barge-in)');
    this.stopPlaybackInternal(true);
  }

  /**
   * Stop emitting meeting audio, leaving playback alone.
   *
   * @remarks
   * The pipeline calls this when it means "stop listening". Restart with
   * {@link TeamsCall.start | start()}.
   */
  stopCapture(): void {
    this.active = false;
    this.paused = false;
    this.logger.debug('Input emission halted');
  }

  /**
   * Temporarily pause meeting-audio emission without leaving the call.
   *
   * @remarks
   * Gates the **input** side only — the turn-taking system uses this to
   * mute capture while the agent speaks. Playback into the meeting is
   * intentionally unaffected: suspending the shared audio path here would
   * silence the agent's own TTS audio mid-sentence.
   */
  pause(): void {
    if (this.active) {
      this.paused = true;
      this.logger.debug('Input paused');
    }
  }

  /**
   * Resume meeting-audio emission after a pause.
   *
   * @see {@link TeamsCall.pause | pause}
   */
  resume(): void {
    if (this.active) {
      this.paused = false;
      this.logger.debug('Input resumed');
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
   * Register a callback to receive captured meeting audio chunks.
   *
   * @remarks
   * Only one callback can be registered at a time; subsequent calls replace
   * the previous callback. Chunks are linear16 PCM at 16 kHz mono (see
   * {@link TeamsCall.getMetadata | getMetadata()}).
   *
   * @param callback - Function invoked with each {@link AudioChunk} while
   *   the provider is active.
   */
  onAudio(callback: (chunk: AudioChunk) => void): void {
    this.audioCallback = callback;
  }

  /**
   * Get the audio format metadata for the captured meeting audio.
   *
   * @remarks
   * The capture graph resamples the browser's native rate (typically
   * 44.1/48 kHz) down to 16 kHz mono linear16, which the pipeline uses to
   * auto-configure the STT provider.
   *
   * @returns Metadata describing 16 kHz mono 16-bit linear PCM.
   */
  getMetadata(): AudioMetadata {
    return {
      encoding: 'linear16',
      sampleRate: TARGET_SAMPLE_RATE,
      channels: 1,
      bitDepth: 16,
    };
  }

  // ── AudioOutputProvider interface ─────────────────────────────────

  /**
   * Configure the output with audio format metadata from the TTS provider.
   *
   * @remarks
   * Accepted encodings:
   *
   * - `linear16` at **any** sample rate — decoded manually into an
   *   `AudioBuffer` at the source rate; the browser resamples on playback.
   * - `mulaw` / `alaw` — decoded with the SDK's G.711 codecs.
   * - `mp3` — decoded with `AudioContext.decodeAudioData`.
   *
   * Containerless `opus` cannot be decoded by the Web Audio API and is
   * rejected — reconfigure your TTS provider, e.g.
   * `new DeepgramTTS({ encoding: 'linear16', sampleRate: 24000 })`.
   *
   * @param metadata - Format description for the incoming TTS audio.
   *
   * @throws Error when the encoding cannot be played into the meeting.
   *
   * @see {@link AudioOutputProvider.configure}
   */
  configure(metadata: AudioMetadata): void {
    if (
      metadata.encoding !== 'linear16' &&
      metadata.encoding !== 'mulaw' &&
      metadata.encoding !== 'alaw' &&
      metadata.encoding !== 'mp3'
    ) {
      throw new Error(
        `TeamsCall cannot play '${metadata.encoding}' audio into the meeting. ` +
          `Configure your TTS provider to emit linear16 PCM (any sample rate), ` +
          `G.711 mulaw/alaw, or MP3 — e.g. new DeepgramTTS({ encoding: 'linear16', sampleRate: 24000 }).`
      );
    }
    this.outputMetadata = { ...metadata };
    this.logger.debug('Output configured', metadata);
  }

  /**
   * Enqueue a TTS audio chunk for playback into the meeting.
   *
   * @remarks
   * Chunks are buffered and played sequentially into the outgoing
   * `MediaStream`. Mirroring {@link BrowserAudioOutput}, playback starts
   * once a 200 ms minimum buffer accumulates (or after a short wait), and
   * all queued chunks are merged before scheduling to avoid gaps between
   * chunk boundaries.
   *
   * @param chunk - Audio data in the format declared via
   *   {@link TeamsCall.configure | configure()}.
   *
   * @see {@link AudioOutputProvider.enqueue}
   */
  enqueue(chunk: AudioChunk): void {
    this.audioQueue.push(chunk);
    if (!this.isProcessingQueue) {
      void this.processQueue();
    }
  }

  /**
   * Wait for all enqueued audio to finish playing into the meeting.
   *
   * @remarks
   * Polls (every 50 ms, up to 30 s) until the queue is drained and playback
   * returns to idle — the same completion semantics as
   * {@link BrowserAudioOutput}. Resolves immediately when playback was
   * halted by a barge-in {@link TeamsCall.stop | stop()}.
   *
   * @see {@link AudioOutputProvider.flush}
   */
  async flush(): Promise<void> {
    const start = Date.now();
    while (
      this.isProcessingQueue ||
      this.audioQueue.length > 0 ||
      (this.playbackState !== 'idle' && this.playbackState !== 'stopped')
    ) {
      if (Date.now() - start > FLUSH_TIMEOUT_MS) {
        this.logger.warn('flush() timed out — audio may still be playing');
        break;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, BUFFER_CHECK_INTERVAL_MS));
    }
  }

  /**
   * Check whether audio is currently being played into the meeting.
   *
   * @returns `true` when the playback state is `'playing'`.
   *
   * @see {@link AudioOutputProvider.isPlaying}
   */
  isPlaying(): boolean {
    return this.playbackState === 'playing';
  }

  /**
   * Register a callback invoked when playback into the meeting begins.
   *
   * @param callback - Function called when playback starts after being idle.
   *
   * @see {@link AudioOutputProvider.onPlaybackStart}
   */
  onPlaybackStart(callback: () => void): void {
    this.playbackStartCallback = callback;
  }

  /**
   * Register a callback invoked when all queued audio has been played.
   *
   * @param callback - Function called when the queue fully drains or
   *   playback is stopped.
   *
   * @see {@link AudioOutputProvider.onPlaybackEnd}
   */
  onPlaybackEnd(callback: () => void): void {
    this.playbackEndCallback = callback;
  }

  /**
   * Register a callback invoked when a playback error occurs.
   *
   * @param callback - Function called with the error.
   *
   * @see {@link AudioOutputProvider.onPlaybackError}
   */
  onPlaybackError(callback: (error: Error) => void): void {
    this.playbackErrorCallback = callback;
  }

  // ── Public API (not part of the provider interfaces) ──────────────

  /**
   * Register a callback for ACS call state changes.
   *
   * @remarks
   * Invoked with the new {@link TeamsCallState} whenever the SDK fires
   * `stateChanged`. Watch for `'InLobby'` (waiting for a participant to
   * admit the agent — remote audio does not flow yet) and `'Disconnected'`
   * (the call ended; capture and playback are torn down automatically).
   * Only one callback can be registered at a time.
   *
   * @param callback - Function invoked with the new call state.
   *
   * @example
   * ```typescript
   * teams.onCallStateChanged((state) => {
   *   if (state === 'InLobby') showLobbyBanner();
   * });
   * ```
   */
  onCallStateChanged(callback: (state: TeamsCallState) => void): void {
    this.callStateCallback = callback;
  }

  /**
   * Get the current ACS call state.
   *
   * @returns The current {@link TeamsCallState}, or `null` when no call is
   *   active (before `initialize()` or after `hangUp()`/`dispose()`).
   */
  getCallState(): TeamsCallState | null {
    return this.call?.state ?? null;
  }

  /**
   * Leave the Teams meeting: hang up the call and stop capture/playback.
   *
   * @remarks
   * Stops meeting-audio emission, tears down the capture graph, halts
   * playback (firing `onPlaybackEnd` if audio was pending), removes call
   * event listeners, and calls `call.hangUp()`. The provider stays
   * initialized — the `CallAgent`, credential, and playback `AudioContext`
   * are only released by {@link TeamsCall.dispose | dispose()}.
   *
   * Safe to call when no call is active (no-op).
   */
  async hangUp(): Promise<void> {
    this.active = false;
    this.paused = false;
    this.stopRemoteAudioPolling();
    this.teardownCaptureGraph();
    this.stopPlaybackInternal(this.playbackState !== 'idle');

    const call = this.call;
    if (!call) return;
    this.call = null;

    if (this.stateChangedListener) {
      try {
        call.off('stateChanged', this.stateChangedListener);
      } catch (error) {
        this.logger.debug('off(stateChanged) failed', error);
      }
      this.stateChangedListener = null;
    }
    if (this.remoteStreamsListener) {
      try {
        call.off('remoteAudioStreamsUpdated', this.remoteStreamsListener);
      } catch (error) {
        this.logger.debug('off(remoteAudioStreamsUpdated) failed', error);
      }
      this.remoteStreamsListener = null;
    }

    try {
      await call.hangUp();
      this.logger.info('Call hung up');
    } catch (error) {
      this.logger.warn('hangUp failed (call may already be disconnected)', error);
    }
  }

  // ── Private: call state / remote audio acquisition ────────────────

  /**
   * Handle the ACS `stateChanged` event.
   *
   * @remarks
   * Surfaces the state via {@link TeamsCall.onCallStateChanged}, attempts
   * remote-audio attachment on `'Connected'` (the pattern documented by the
   * raw media access quickstart), and tears everything down on
   * `'Disconnected'`.
   */
  private handleStateChanged(): void {
    const state = this.call?.state;
    if (!state) return;

    this.logger.info('Call state changed', state);
    this.callStateCallback?.(state);

    if (state === 'Connected') {
      void this.tryAttachRemoteAudio();
    } else if (state === 'Disconnected') {
      this.handleCallEnded();
    }
  }

  /**
   * Handle remote hang-up / call termination.
   *
   * @remarks
   * Stops input emission, tears down the capture graph, and halts playback
   * (firing `onPlaybackEnd` if audio was pending). The provider remains
   * initialized so state can still be inspected and `dispose()` remains
   * responsible for releasing the agent.
   */
  private handleCallEnded(): void {
    this.logger.info('Call disconnected — stopping capture and playback');
    this.active = false;
    this.paused = false;
    this.stopRemoteAudioPolling();
    this.teardownCaptureGraph();
    this.stopPlaybackInternal(this.playbackState !== 'idle');
  }

  /**
   * Start the documented poll fallback for remote audio acquisition.
   *
   * @remarks
   * The raw media access quickstart acquires `call.remoteAudioStreams[0]`
   * after observing the `'Connected'` state rather than via an event, so in
   * addition to subscribing to `remoteAudioStreamsUpdated` this provider
   * polls the property every 500 ms until a stream is attached. The poll is
   * stopped once capture is attached, and on hang-up/disconnect/dispose.
   */
  private startRemoteAudioPolling(): void {
    if (this.remoteAudioPollTimer) return;
    this.remoteAudioPollTimer = setInterval(() => {
      void this.tryAttachRemoteAudio();
    }, REMOTE_AUDIO_POLL_INTERVAL_MS);
  }

  /** Stop the remote-audio poll fallback timer. */
  private stopRemoteAudioPolling(): void {
    if (this.remoteAudioPollTimer) {
      clearInterval(this.remoteAudioPollTimer);
      this.remoteAudioPollTimer = null;
    }
  }

  /**
   * Attach the capture graph to the call's mixed remote audio stream, if
   * available and not already attached.
   *
   * @remarks
   * Resolves `call.remoteAudioStreams[0]` to a browser `MediaStream` via
   * `getMediaStream()` and feeds it into a dedicated `AudioContext`.
   * Idempotent and re-entrancy-guarded: invoked from the
   * `remoteAudioStreamsUpdated` event, the `'Connected'` state change, and
   * the interval poll — the first successful path wins.
   */
  private async tryAttachRemoteAudio(): Promise<void> {
    if (this.attachedRemoteStream || this.attachingRemoteStream) return;

    const remoteStream = this.call?.remoteAudioStreams[0];
    if (!remoteStream) return;

    this.attachingRemoteStream = true;
    try {
      const mediaStream = await remoteStream.getMediaStream();
      // The call may have ended (or another path attached) while awaiting.
      if (!this.call || this.attachedRemoteStream) return;

      this.setupCaptureGraph(mediaStream);
      this.attachedRemoteStream = remoteStream;
      this.stopRemoteAudioPolling();
      this.logger.info('Remote meeting audio attached');
    } catch (error) {
      this.logger.error('Failed to attach remote audio stream', error);
    } finally {
      this.attachingRemoteStream = false;
    }
  }

  /**
   * Build the capture graph for the remote `MediaStream`.
   *
   * @remarks
   * Mirrors the SDK's `AudioCapture`: prefers an `AudioWorkletNode` (loaded
   * from an inline Blob URL) and falls back to the deprecated
   * `ScriptProcessorNode`. Float32 frames from either path flow through
   * {@link TeamsCall.handleCapturedAudio | handleCapturedAudio()}.
   * The worklet module load is asynchronous; the fallback is used
   * immediately when AudioWorklet is unavailable.
   */
  private setupCaptureGraph(mediaStream: MediaStream): void {
    this.captureContext = new AudioContext();
    this.captureSource = this.captureContext.createMediaStreamSource(mediaStream);

    if (this.captureContext.audioWorklet) {
      void this.setupCaptureWorklet();
      return;
    }
    this.setupCaptureScriptProcessor();
  }

  /**
   * Set up the preferred AudioWorklet capture path, falling back to
   * `ScriptProcessorNode` when module registration fails.
   */
  private async setupCaptureWorklet(): Promise<void> {
    if (!this.captureContext || !this.captureSource) return;
    try {
      const blob = new Blob([CAPTURE_WORKLET_SOURCE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      try {
        await this.captureContext.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }

      this.captureWorkletNode = new AudioWorkletNode(
        this.captureContext,
        'teams-call-capture-processor'
      );
      this.captureWorkletNode.port.onmessage = (event: MessageEvent) => {
        const data = event.data as { type?: string; data?: Float32Array };
        if (data?.type === 'audio' && data.data) {
          this.handleCapturedAudio(data.data);
        }
      };
      this.captureSource.connect(this.captureWorkletNode);
      this.logger.info('Using AudioWorkletNode for meeting-audio capture');
    } catch {
      this.logger.info('AudioWorklet unavailable — falling back to ScriptProcessorNode');
      this.setupCaptureScriptProcessor();
    }
  }

  /** Set up the deprecated ScriptProcessorNode capture fallback. */
  private setupCaptureScriptProcessor(): void {
    if (!this.captureContext || !this.captureSource) return;

    this.captureProcessorNode = this.captureContext.createScriptProcessor(
      CAPTURE_BUFFER_SIZE,
      1,
      1
    );
    this.captureProcessorNode.onaudioprocess = (event: AudioProcessingEvent) => {
      this.handleCapturedAudio(event.inputBuffer.getChannelData(0));
    };
    this.captureSource.connect(this.captureProcessorNode);
    // ScriptProcessorNode only fires when connected to the destination; its
    // output buffer stays silent, so nothing is echoed to local speakers.
    this.captureProcessorNode.connect(this.captureContext.destination);
    this.logger.info('Using ScriptProcessorNode for meeting-audio capture (fallback)');
  }

  /**
   * Convert captured Float32 samples to 16 kHz mono linear16 and emit them.
   *
   * @remarks
   * Emission is gated by `active && !paused`; audio arriving while inactive
   * is silently dropped. Resampling uses linear interpolation from the
   * capture context's native rate to {@link TARGET_SAMPLE_RATE}.
   */
  private handleCapturedAudio(samples: Float32Array): void {
    if (!this.active || this.paused || !this.audioCallback) return;

    try {
      const sourceRate = this.captureContext?.sampleRate ?? TARGET_SAMPLE_RATE;
      const resampled =
        sourceRate === TARGET_SAMPLE_RATE
          ? samples
          : resamplePcm(samples, sourceRate, TARGET_SAMPLE_RATE);
      const pcm = floatTo16BitPCM(resampled);

      this.audioCallback({
        data: pcm.buffer as ArrayBuffer,
        timestamp: Date.now(),
        sequence: this.sequenceNumber++,
      });
    } catch (error) {
      this.logger.error('Error processing captured meeting audio', error);
    }
  }

  /** Tear down the remote-audio capture graph and reset attachment state. */
  private teardownCaptureGraph(): void {
    if (this.captureWorkletNode) {
      this.captureWorkletNode.port.onmessage = null;
      this.captureWorkletNode.disconnect();
      this.captureWorkletNode = null;
    }
    if (this.captureProcessorNode) {
      this.captureProcessorNode.onaudioprocess = null;
      this.captureProcessorNode.disconnect();
      this.captureProcessorNode = null;
    }
    if (this.captureSource) {
      this.captureSource.disconnect();
      this.captureSource = null;
    }
    if (this.captureContext) {
      void this.captureContext.close().catch(() => undefined);
      this.captureContext = null;
    }
    this.attachedRemoteStream = null;
    this.attachingRemoteStream = false;
  }

  /** Roll back partially created resources after a failed `initialize()`. */
  private async cleanupAfterFailedInit(): Promise<void> {
    if (this.callAgent) {
      try {
        await this.callAgent.dispose();
      } catch {
        // best effort
      }
      this.callAgent = null;
    }
    this.callClient = null;
    if (this.credential && this.ownsCredential) {
      try {
        this.credential.dispose();
      } catch {
        // best effort
      }
    }
    this.credential = null;
    this.ownsCredential = false;
    if (this.playbackContext) {
      try {
        await this.playbackContext.close();
      } catch {
        // best effort
      }
      this.playbackContext = null;
    }
    this.destinationNode = null;
  }

  // ── Private: playback scheduling (mirrors AudioPlayer) ────────────

  /**
   * Stop playback immediately and clear the queue.
   *
   * @param fireCallback - Whether to invoke `onPlaybackEnd` (mirroring
   *   `AudioPlayer.stop()`, which always fires it; internal call-ended
   *   paths skip it when playback was already idle).
   */
  private stopPlaybackInternal(fireCallback: boolean): void {
    this.playbackGeneration++;

    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Ignore errors if already stopped
      }
      this.currentSource.disconnect();
      this.currentSource = null;
    }

    this.audioQueue = [];
    this.isProcessingQueue = false;
    this.playbackState = 'stopped';
    this.outputMetadata = null;

    if (fireCallback) {
      this.playbackEndCallback?.();
    }
  }

  /**
   * Process the playback queue sequentially.
   *
   * @remarks
   * Mirrors `AudioPlayer.processQueue()`: waits for the minimum buffer when
   * starting from idle, drains and merges all queued chunks into one buffer
   * to eliminate gaps, plays it, and repeats until the queue is empty. A
   * generation check after every await makes barge-in `stop()` abort the
   * loop immediately.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;
    const gen = this.playbackGeneration;

    try {
      while (this.audioQueue.length > 0) {
        if (gen !== this.playbackGeneration) return;

        if (this.playbackState === 'idle' && !this.hasMinimumBuffer()) {
          this.playbackState = 'buffering';
          this.logger.debug('Buffering audio for the meeting...');
          await this.waitForMinimumBuffer();
          if (gen !== this.playbackGeneration) return;
        }

        // Drain all available chunks and merge them to play gaplessly.
        const chunks = this.audioQueue.splice(0, this.audioQueue.length);
        const first = chunks[0];
        if (!first) continue;

        let merged: AudioChunk = first;
        if (chunks.length > 1) {
          const totalBytes = chunks.reduce((sum, c) => sum + c.data.byteLength, 0);
          const bytes = new Uint8Array(totalBytes);
          let offset = 0;
          for (const c of chunks) {
            bytes.set(new Uint8Array(c.data), offset);
            offset += c.data.byteLength;
          }
          merged = { data: bytes.buffer, timestamp: first.timestamp };
          if (first.metadata) {
            merged.metadata = first.metadata;
          }
        }

        await this.playChunk(merged);
        if (gen !== this.playbackGeneration) return;
      }

      if (gen === this.playbackGeneration) {
        this.playbackState = 'idle';
      }
    } catch (error) {
      if (gen === this.playbackGeneration) {
        this.handlePlaybackError(error as Error);
      }
    } finally {
      if (gen === this.playbackGeneration) {
        this.isProcessingQueue = false;
      }
    }
  }

  /** Whether queued audio meets the minimum buffer duration. */
  private hasMinimumBuffer(): boolean {
    if (this.audioQueue.length === 0) return false;
    const totalBytes = this.audioQueue.reduce((sum, chunk) => sum + chunk.data.byteLength, 0);
    return totalBytes / this.estimateBytesPerMs() >= MIN_BUFFER_DURATION_MS;
  }

  /** Poll until the minimum buffer is met or the max wait elapses. */
  private async waitForMinimumBuffer(): Promise<void> {
    let waited = 0;
    while (!this.hasMinimumBuffer() && waited < BUFFER_MAX_WAIT_MS) {
      await new Promise<void>((resolve) => setTimeout(resolve, BUFFER_CHECK_INTERVAL_MS));
      waited += BUFFER_CHECK_INTERVAL_MS;
    }
  }

  /** Estimate bytes-per-millisecond from configured metadata (16-bit assumed). */
  private estimateBytesPerMs(): number {
    if (!this.outputMetadata) {
      return (TARGET_SAMPLE_RATE * 2) / 1000;
    }
    const { sampleRate, channels } = this.outputMetadata;
    return (sampleRate * channels * 2) / 1000;
  }

  /** Decode a chunk and play it into the outgoing MediaStream destination. */
  private async playChunk(chunk: AudioChunk): Promise<void> {
    const context = this.playbackContext;
    if (!context || !this.destinationNode) {
      throw new Error('TeamsCall playback graph is not initialized');
    }
    const audioBuffer = await this.decodeChunk(chunk, context);
    await this.playAudioBuffer(audioBuffer, context);
  }

  /**
   * Decode an audio chunk into an `AudioBuffer`.
   *
   * @remarks
   * G.711 (`mulaw`/`alaw`) is decoded directly with the SDK codecs since
   * `decodeAudioData` cannot handle headerless G.711. Everything else
   * mirrors `AudioPlayer.decodeChunk()`: try `decodeAudioData` first (mp3
   * and other containers), then fall back to raw linear16 PCM using the
   * configured metadata.
   */
  private async decodeChunk(chunk: AudioChunk, context: AudioContext): Promise<AudioBuffer> {
    const metadata = this.outputMetadata;

    if (metadata && (metadata.encoding === 'mulaw' || metadata.encoding === 'alaw')) {
      const g711Bytes = new Uint8Array(chunk.data);
      const pcm = metadata.encoding === 'mulaw' ? decodeMulaw(g711Bytes) : decodeAlaw(g711Bytes);
      return this.createAudioBufferFromPcm(pcm, metadata, context);
    }

    try {
      return await context.decodeAudioData(chunk.data.slice(0));
    } catch (error) {
      if (metadata) {
        return this.createAudioBufferFromPcm(new Int16Array(chunk.data), metadata, context);
      }
      throw error;
    }
  }

  /** Create an `AudioBuffer` from 16-bit PCM samples (mirrors AudioPlayer). */
  private createAudioBufferFromPcm(
    pcm: Int16Array,
    metadata: AudioMetadata,
    context: AudioContext
  ): AudioBuffer {
    const floatData = int16ToFloat(pcm);
    const channels = Math.max(1, metadata.channels);
    const samplesPerChannel = Math.floor(floatData.length / channels);
    const audioBuffer = context.createBuffer(channels, samplesPerChannel, metadata.sampleRate);

    for (let channel = 0; channel < channels; channel++) {
      const channelData = audioBuffer.getChannelData(channel);
      for (let i = 0; i < samplesPerChannel; i++) {
        const sample = floatData[i * channels + channel];
        if (sample !== undefined) {
          channelData[i] = sample;
        }
      }
    }

    return audioBuffer;
  }

  /**
   * Schedule an `AudioBuffer` into the MediaStream destination and resolve
   * when it finishes (mirrors `AudioPlayer.playAudioBuffer()`, with the
   * destination swapped from the speakers to the outgoing call stream).
   */
  private playAudioBuffer(audioBuffer: AudioBuffer, context: AudioContext): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const destination = this.destinationNode;
        if (!destination) {
          reject(new Error('TeamsCall playback destination is not available'));
          return;
        }

        this.currentSource = context.createBufferSource();
        this.currentSource.buffer = audioBuffer;
        this.currentSource.connect(destination);

        this.currentSource.onended = () => {
          if (this.audioQueue.length === 0) {
            this.playbackState = 'idle';
            this.playbackEndCallback?.();
            this.logger.debug('Playback into meeting ended');
          }
          resolve();
        };

        if (this.playbackState !== 'playing') {
          this.playbackState = 'playing';
          this.playbackStartCallback?.();
          this.logger.debug('Playback into meeting started');
        }

        this.currentSource.start(0);
      } catch (error) {
        reject(error);
      }
    });
  }

  /** Handle playback errors: log, reset state, invoke the error callback. */
  private handlePlaybackError(error: Error): void {
    this.logger.error('Playback error', error);
    this.playbackState = 'idle';
    this.playbackErrorCallback?.(error);
  }
}
