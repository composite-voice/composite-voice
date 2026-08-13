/**
 * Provider fallback chain for the `stt` pipeline role.
 *
 * @remarks
 * This module exports {@link FallbackSTT}, a meta-provider that wraps an
 * ordered list of live STT providers and automatically fails over to the
 * next one when the active provider cannot connect, times out, or reports
 * a streaming error mid-session. Each swap is surfaced through
 * {@link FallbackSTT.onFallback | onFallback}, which CompositeVoice bridges
 * to the `'provider.fallback'` SDK event.
 *
 * ```
 *                  ┌──────────────────────────────┐
 *  sendAudio ────▶ │  FallbackSTT                  │
 *                  │  ┌─────────┐  ┌─────────┐    │
 *                  │  │ primary │─▶│ backup  │─▶ … │  (advance on failure)
 *                  │  └─────────┘  └─────────┘    │
 *                  └──────────────┬───────────────┘
 *                                 ▼
 *                        onTranscription (active provider only)
 * ```
 *
 * @packageDocumentation
 */

import type {
  LiveSTTProvider,
  STTProvider,
  STTProviderConfig,
  TranscriptionResult,
  ProviderFallbackInfo,
  ProviderFallbackReason,
  FallbackCapableProvider,
} from '../../../core/types/providers';
import type { ProviderRole } from '../../../core/types/roles';
import { ConfigurationError, InvalidStateError, TimeoutError } from '../../../utils/errors';
import { Logger } from '../../../utils/logger';

/**
 * Options for {@link FallbackSTT}.
 */
export interface FallbackSTTOptions {
  /**
   * Maximum time in milliseconds to wait for a provider's `connect()` to
   * resolve before treating it as failed and moving to the next provider
   * in the chain.
   *
   * @remarks
   * Set to `0` to disable the timeout (each provider then decides its own
   * connection timeout behavior).
   *
   * @defaultValue 10000
   */
  connectTimeout?: number;

  /**
   * Whether to enable debug logging for the fallback chain itself.
   *
   * @defaultValue false
   */
  debug?: boolean;
}

/** Default connection timeout applied to each provider's `connect()`. */
const DEFAULT_CONNECT_TIMEOUT = 10_000;

/**
 * Upper bound on audio chunks buffered while a mid-session failover is in
 * progress. At typical capture rates (~10-50 chunks/sec) this covers well
 * over the connect timeout. On overflow the oldest chunks are dropped
 * (matching AudioBufferQueue's default) so the replayed audio stays
 * contiguous with the live stream once the swap completes.
 */
const MAX_PENDING_CHUNKS = 500;

/** Normalize an unknown thrown value to an Error. */
function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

/**
 * A meta STT provider that chains multiple live STT providers with automatic
 * failover.
 *
 * @remarks
 * `FallbackSTT` implements the {@link LiveSTTProvider} interface itself, so it
 * drops into the `providers` array anywhere a single STT provider would go.
 * Providers are tried in the order given:
 *
 * - **Initialization**: all providers are initialized concurrently. Providers
 *   that fail to initialize are marked dead; the first healthy provider
 *   becomes active. Initialization only fails if *every* provider fails.
 * - **Connection**: `connect()` tries the active provider first. On a
 *   connection error or timeout ({@link FallbackSTTOptions.connectTimeout})
 *   it advances to the next healthy provider. It throws only when the whole
 *   chain is exhausted.
 * - **Mid-session**: when the active provider reports a streaming error
 *   (an error transcription result, or a throwing `sendAudio()`), the chain
 *   disconnects it, connects the next provider, and replays audio buffered
 *   during the swap. Transcription results from providers that were failed
 *   away from are discarded.
 *
 * A failed provider stays dead until {@link FallbackSTT.resetToPrimary}
 * is called — during a vendor outage there is no point repeatedly retrying
 * the primary within the same session.
 *
 * Every swap invokes the callbacks registered via
 * {@link FallbackSTT.onFallback}. CompositeVoice registers one automatically
 * and re-emits the swap as a `'provider.fallback'` event.
 *
 * Constraints:
 *
 * - All chained providers must be live (`type: 'websocket'`) — REST STT
 *   providers don't participate in the streaming audio path.
 * - All chained providers must cover only the `'stt'` role. Multi-role
 *   providers (e.g. NativeSTT, which manages its own microphone) own their
 *   audio path and cannot be swapped mid-session.
 *
 * @example
 * ```typescript
 * import { CompositeVoice, FallbackSTT, DeepgramSTT, AssemblyAISTT } from 'composite-voice';
 *
 * const agent = new CompositeVoice({
 *   providers: [
 *     new FallbackSTT([
 *       new DeepgramSTT({ proxyUrl: '/api/proxy/deepgram' }),
 *       new AssemblyAISTT({ proxyUrl: '/api/proxy/assemblyai' }),
 *     ]),
 *     new AnthropicLLM({ model: 'claude-haiku-4-5' }),
 *     new DeepgramTTS({ proxyUrl: '/api/proxy/deepgram' }),
 *   ],
 * });
 *
 * agent.on('provider.fallback', ({ from, to, reason }) => {
 *   console.warn(`STT failed over from ${from} to ${to} (${reason})`);
 * });
 * ```
 *
 * @see {@link ProviderFallbackInfo} for the failover notification payload
 * @see {@link FallbackSTTOptions} for configuration options
 */
export class FallbackSTT implements LiveSTTProvider, FallbackCapableProvider {
  /** Fallback chains stream audio, so the wrapper is always a live provider. */
  readonly type = 'websocket' as const;

  /** The chain covers the `'stt'` pipeline role. */
  readonly roles: readonly ProviderRole[] = ['stt'];

  /**
   * The wrapped providers, in priority order.
   *
   * @remarks
   * Exposed so pipeline utilities (e.g. `configureSTTFromMetadata`) can
   * apply per-provider configuration to every member of the chain.
   */
  readonly providers: readonly LiveSTTProvider[];

  private activeIndex = 0;

  /** Providers that have failed and are skipped until {@link resetToPrimary}. */
  private readonly dead = new Set<LiveSTTProvider>();

  private readonly connectTimeout: number;
  private readonly logger: Logger;

  private transcriptionCallback?: (result: TranscriptionResult) => void;
  private readonly fallbackCallbacks: Array<(info: ProviderFallbackInfo) => void> = [];

  /** Whether a streaming session is active (between connect() and disconnect()). */
  private connected = false;

  /**
   * Incremented on every disconnect()/dispose(). An in-flight failover
   * captures the epoch before awaiting and abandons its work (tearing down
   * any provider it connected) when the epoch has moved on.
   */
  private sessionEpoch = 0;

  /** Guards against concurrent failover attempts. */
  private failingOver = false;

  /** Audio buffered while a mid-session failover swaps providers. */
  private pendingAudio: ArrayBuffer[] = [];

  /** Chunks dropped from the failover buffer since the last flush. */
  private droppedDuringFailover = 0;

  /**
   * Supplies the cached container header (e.g. WebM/OGG/WAV) to re-inject
   * after an internal failover reconnect, mirroring what the SDK does on
   * its own reconnect paths. Set via {@link setReconnectHeaderSource}.
   */
  private reconnectHeaderSource?: () => ArrayBuffer | null;

  private initialized = false;

  /**
   * Create a fallback chain over the given STT providers.
   *
   * @param providers - Live STT providers in priority order. The first is
   *   the primary; the rest are backups tried in order on failure.
   * @param options - Chain configuration.
   *
   * @throws {@link ConfigurationError}
   * If the array is empty, contains a REST provider, or contains a
   * multi-role provider.
   */
  constructor(providers: STTProvider[], options: FallbackSTTOptions = {}) {
    if (!Array.isArray(providers) || providers.length === 0) {
      throw new ConfigurationError('FallbackSTT requires at least one STT provider');
    }

    for (const provider of providers) {
      const name = provider.constructor.name;
      if (provider.type !== 'websocket') {
        throw new ConfigurationError(
          `FallbackSTT only supports live (WebSocket) STT providers, but "${name}" is a ` +
            `'${provider.type}' provider`
        );
      }
      const extraRoles = provider.roles.filter((role) => role !== 'stt');
      if (extraRoles.length > 0) {
        throw new ConfigurationError(
          `FallbackSTT can only chain single-role STT providers, but "${name}" also covers ` +
            `role(s): ${extraRoles.join(', ')}. Multi-role providers manage their own audio ` +
            'path and cannot be swapped mid-session.'
        );
      }
    }

    this.providers = providers as LiveSTTProvider[];
    this.connectTimeout = options.connectTimeout ?? DEFAULT_CONNECT_TIMEOUT;
    this.logger = new Logger('FallbackSTT', { enabled: options.debug ?? false });

    // Register on every provider up front. Results are filtered by identity
    // in handleResult, so late results from a failed-away provider are dropped.
    for (const provider of this.providers) {
      provider.onTranscription((result) => this.handleResult(provider, result));
    }
  }

  /** The currently active provider's configuration. */
  get config(): STTProviderConfig {
    return this.active.config;
  }

  /**
   * The provider currently receiving audio and producing transcriptions.
   */
  get activeProvider(): STTProvider {
    return this.active;
  }

  private get active(): LiveSTTProvider {
    const provider = this.providers[this.activeIndex];
    if (!provider) {
      // Unreachable: activeIndex only ever points at a chain member.
      throw new ConfigurationError('FallbackSTT active provider index out of range');
    }
    return provider;
  }

  /**
   * Register a callback invoked whenever the chain fails over to another
   * provider.
   *
   * @remarks
   * CompositeVoice registers one automatically and re-emits each swap as a
   * `'provider.fallback'` SDK event, so most applications subscribe there
   * instead. Multiple callbacks may be registered.
   *
   * @param callback - Invoked with a {@link ProviderFallbackInfo} per swap.
   */
  onFallback(callback: (info: ProviderFallbackInfo) => void): (() => void) | void {
    this.fallbackCallbacks.push(callback);
    return () => {
      const index = this.fallbackCallbacks.indexOf(callback);
      if (index !== -1) this.fallbackCallbacks.splice(index, 1);
    };
  }

  /**
   * Register a source for the cached audio container header.
   *
   * @remarks
   * When the input stream uses a container format (WebM/OGG/WAV), a provider
   * that connects mid-stream needs the container header before any audio
   * frames or it cannot demux them. The SDK re-injects the header from its
   * `AudioHeaderCache` on every reconnect it drives itself; this hook lets
   * the chain do the same for its internal failover reconnects.
   * CompositeVoice wires this automatically.
   *
   * @param source - Returns the cached header, or `null` when the stream is
   *   raw PCM / has no extractable header.
   * @returns An unsubscribe function that clears this source if it is still
   *   the registered one. CompositeVoice calls it on initialize failure and
   *   dispose so a shared chain cannot retain a disposed agent's cache.
   */
  setReconnectHeaderSource(source: () => ArrayBuffer | null): () => void {
    this.reconnectHeaderSource = source;
    return () => {
      if (this.reconnectHeaderSource === source) {
        delete this.reconnectHeaderSource;
      }
    };
  }

  /**
   * Clear all dead-provider markers and make the first provider active again.
   *
   * @remarks
   * Call this between sessions (while not connected) to probe whether the
   * primary has recovered from its outage. The chain never does this
   * automatically — within a session, retrying a failed vendor would risk
   * flapping.
   *
   * @throws {@link InvalidStateError}
   * If called while a streaming session is active.
   */
  resetToPrimary(): void {
    if (this.connected) {
      throw new InvalidStateError('connected', 'reset to primary');
    }
    this.dead.clear();
    this.activeIndex = 0;
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // A fresh initialization gets a fresh chain: dead markers from a failed
    // earlier attempt (or from before dispose()) must not survive, or a
    // retry could brick the chain even though every provider is healthy now.
    this.dead.clear();
    this.activeIndex = 0;

    const results = await Promise.allSettled(this.providers.map((p) => p.initialize()));

    results.forEach((result, i) => {
      const provider = this.providers[i];
      if (provider && result.status === 'rejected') {
        this.dead.add(provider);
        this.logger.warn(
          `Provider "${provider.constructor.name}" failed to initialize`,
          result.reason
        );
      }
    });

    if (this.dead.size === this.providers.length) {
      const firstRejection = results.find(
        (r): r is PromiseRejectedResult => r.status === 'rejected'
      );
      throw toError(firstRejection?.reason);
    }

    // If the primary is dead, advance to the first healthy provider so the
    // application learns about the degradation before the session starts.
    while (this.dead.has(this.active)) {
      const rejection = results[this.activeIndex];
      const error =
        rejection?.status === 'rejected'
          ? toError(rejection.reason)
          : new Error('initialization failed');
      if (!this.advance('init-error', error)) break;
    }

    this.initialized = true;
  }

  async dispose(): Promise<void> {
    this.sessionEpoch++;
    this.connected = false;
    this.pendingAudio = [];
    this.droppedDuringFailover = 0;
    // Drop listener references: a chain outlives the agents built around it
    // (the documented reuse pattern), and an append-only callback list would
    // pin every disposed agent in memory and re-notify it on later swaps.
    this.fallbackCallbacks.length = 0;
    delete this.transcriptionCallback;
    delete this.reconnectHeaderSource;
    await Promise.allSettled(this.providers.map((p) => p.dispose()));
    this.initialized = false;
  }

  isReady(): boolean {
    return this.initialized && this.active.isReady();
  }

  // ─── Streaming session ───────────────────────────────────────────────

  /**
   * Connect the active provider, advancing down the chain on failure.
   *
   * @throws The last provider's connection error when every remaining
   *   provider in the chain fails to connect.
   */
  async connect(): Promise<void> {
    const epoch = this.sessionEpoch;
    await this.connectChain(epoch);

    // A disconnect()/dispose() that landed while we were connecting wins:
    // the provider's own disconnect() no-ops while it is still CONNECTING,
    // so without this the chain would report a session nobody asked for and
    // strand an open socket.
    if (epoch !== this.sessionEpoch) {
      await this.active.disconnect().catch(() => {});
      return;
    }

    this.connected = true;
    const flushError = this.flushPendingAudio();
    if (flushError) {
      void this.failover('stream-error', flushError);
    }
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (!this.connected) {
      // Mirrors the wrapped providers' behavior — and prevents a throwing
      // provider from marking itself dead over audio sent outside a session.
      this.logger.warn('Cannot send audio: not connected');
      return;
    }

    if (this.failingOver) {
      this.bufferPendingAudio(chunk);
      return;
    }

    try {
      this.active.sendAudio(chunk);
    } catch (error) {
      const err = toError(error);
      this.logger.warn('sendAudio failed on active provider — triggering failover', err);
      this.bufferPendingAudio(chunk);
      void this.failover('stream-error', err);
    }
  }

  async disconnect(): Promise<void> {
    this.sessionEpoch++;
    this.connected = false;
    this.pendingAudio = [];
    this.droppedDuringFailover = 0;
    await this.active.disconnect();
  }

  onTranscription(callback: (result: TranscriptionResult) => void): void {
    this.transcriptionCallback = callback;
  }

  // ─── Guard methods (delegate to the active provider) ─────────────────

  isUtteranceComplete(result: TranscriptionResult): boolean {
    return this.active.isUtteranceComplete(result);
  }

  isPreflight(result: TranscriptionResult): boolean {
    return this.active.isPreflight(result);
  }

  isInterim(result: TranscriptionResult): boolean {
    return this.active.isInterim(result);
  }

  isFinal(result: TranscriptionResult): boolean {
    return this.active.isFinal(result);
  }

  // ─── Internals ───────────────────────────────────────────────────────

  /**
   * Route a transcription result from a chained provider.
   *
   * @remarks
   * Results from non-active providers are stale (they arrived after a
   * failover) and are dropped. Error results from the active provider
   * trigger a mid-session failover when a backup remains; otherwise they
   * are forwarded so the pipeline's normal STT error handling applies.
   */
  private handleResult(source: LiveSTTProvider, result: TranscriptionResult): void {
    if (source !== this.active) return;

    const isErrorResult = !!result.metadata?.error && !result.text?.trim();

    // Errors surfaced outside a session (e.g. a socket-teardown race during
    // our own disconnect, or a stray event mid-connect) must not mark a
    // healthy provider dead. Late *transcriptions* still pass through below —
    // providers can deliver final results during the disconnect grace period.
    if (isErrorResult && !this.connected) {
      this.logger.debug('Ignoring error result while not connected', result.metadata?.error);
      return;
    }

    if (isErrorResult && this.hasFallbackRemaining()) {
      const message =
        (result.metadata?.message as string) ??
        `STT (${source.constructor.name}) error: ${String(result.metadata?.error)}`;
      void this.failover('stream-error', new Error(message));
      return;
    }

    this.transcriptionCallback?.(result);
  }

  private hasFallbackRemaining(): boolean {
    for (let i = this.activeIndex + 1; i < this.providers.length; i++) {
      const provider = this.providers[i];
      if (provider && !this.dead.has(provider)) return true;
    }
    return false;
  }

  /**
   * Mark the active provider dead and move to the next healthy one,
   * notifying fallback listeners.
   *
   * @returns `false` when the chain is exhausted (active is left unchanged).
   */
  private advance(reason: ProviderFallbackReason, error: Error): boolean {
    const from = this.active;
    this.dead.add(from);

    let next = this.activeIndex + 1;
    while (next < this.providers.length) {
      const candidate = this.providers[next];
      if (candidate && !this.dead.has(candidate)) break;
      next++;
    }
    if (next >= this.providers.length) {
      this.logger.error('All STT providers in the fallback chain have failed', error);
      return false;
    }

    this.activeIndex = next;
    const info: ProviderFallbackInfo = {
      role: 'stt',
      from: from.constructor.name,
      to: this.active.constructor.name,
      reason,
      error,
    };
    this.logger.warn(`Failing over: ${info.from} → ${info.to} (${reason})`, error);

    for (const callback of this.fallbackCallbacks) {
      try {
        callback(info);
      } catch (callbackError) {
        this.logger.error('onFallback callback threw', callbackError);
      }
    }
    return true;
  }

  /**
   * Move the active pointer forward to the first provider not marked dead.
   *
   * @returns `false` when every provider from the active index on is dead.
   */
  private skipDeadProviders(): boolean {
    for (let i = this.activeIndex; i < this.providers.length; i++) {
      const candidate = this.providers[i];
      if (candidate && !this.dead.has(candidate)) {
        this.activeIndex = i;
        return true;
      }
    }
    return false;
  }

  /**
   * Try to connect the active provider, advancing on each failure.
   * Throws the last error when the chain is exhausted.
   *
   * @remarks
   * Known-dead providers are never retried (the documented sticky-failover
   * contract): a reconnect after the whole chain has failed throws
   * immediately instead of burning a connect timeout on a dead vendor.
   *
   * @param epoch - The {@link sessionEpoch} the caller started from. The
   *   walk stops as soon as the epoch moves on, so a session torn down
   *   mid-failover does not keep opening (billable) vendor connections.
   */
  private async connectChain(epoch: number): Promise<void> {
    if (!this.skipDeadProviders()) {
      this.connected = false;
      throw new InvalidStateError(
        'all providers in the fallback chain marked failed',
        'connect (call resetToPrimary() between sessions to retry them)'
      );
    }

    for (;;) {
      if (epoch !== this.sessionEpoch) {
        throw new InvalidStateError('session torn down', 'connect');
      }

      const provider = this.active;
      const connecting = provider.connect();
      try {
        await this.withConnectTimeout(connecting, provider.constructor.name);
        return;
      } catch (error) {
        const err = toError(error);
        const reason: ProviderFallbackReason =
          err instanceof TimeoutError ? 'connect-timeout' : 'connect-error';
        if (err instanceof TimeoutError) {
          // The provider is still CONNECTING, so disconnecting now would
          // no-op. Tear it down whenever its connect() eventually settles,
          // or the orphaned socket (and any keep-alive timer) leaks.
          // Skip the teardown if that same provider has meanwhile become
          // the live session: providers coalesce concurrent connect() calls
          // onto one promise, so this promise may be exactly what a later,
          // legitimate connect() is awaiting.
          connecting
            .then(() =>
              this.connected && provider === this.active ? undefined : provider.disconnect()
            )
            .catch(() => {});
        } else {
          // Tear down any half-open connection before moving on.
          void provider.disconnect().catch(() => {});
        }
        if (!this.advance(reason, err)) {
          this.connected = false;
          throw err;
        }
      }
    }
  }

  /**
   * Swap away from a provider that failed mid-session.
   *
   * @remarks
   * Audio arriving during the swap is buffered by {@link sendAudio} and
   * replayed once the replacement provider is connected. If every backup
   * also fails, a terminal error result is forwarded so the pipeline's
   * standard STT error handling (transcription.error + agent.error) fires.
   */
  private async failover(reason: ProviderFallbackReason, error: Error): Promise<void> {
    if (this.failingOver) return;
    this.failingOver = true;

    // If disconnect()/dispose() runs while we're awaiting a connect below,
    // the epoch moves on and this failover must abandon its work — including
    // closing a backup socket that finished connecting after the teardown.
    const epoch = this.sessionEpoch;

    try {
      const failed = this.active;
      void failed.disconnect().catch(() => {});

      if (!this.advance(reason, error)) {
        this.abortSession(error);
        return;
      }

      // Only reconnect when a streaming session is active — a failover
      // between sessions just moves the pointer.
      if (!this.connected) return;

      for (;;) {
        await this.connectChain(epoch);

        if (epoch !== this.sessionEpoch) {
          void this.active.disconnect().catch(() => {});
          return;
        }

        // Container streams need the header before any buffered frames,
        // just like the SDK's own reconnect paths re-inject it.
        this.injectReconnectHeader();

        const flushError = this.flushPendingAudio();
        if (!flushError) return;

        // The replacement died during the replay — treat it like any other
        // failed provider and keep walking the chain. (Re-entering failover
        // here would no-op against the failingOver guard.)
        this.logger.warn('Provider failed while replaying buffered audio', flushError);
        void this.active.disconnect().catch(() => {});
        if (!this.advance('stream-error', flushError)) {
          this.abortSession(flushError);
          return;
        }
      }
    } catch (chainError) {
      if (epoch === this.sessionEpoch) {
        this.abortSession(toError(chainError));
      }
    } finally {
      this.failingOver = false;
    }
  }

  /** End the session after the whole chain failed, surfacing a terminal error. */
  private abortSession(error: Error): void {
    this.connected = false;
    this.pendingAudio = [];
    this.droppedDuringFailover = 0;
    this.transcriptionCallback?.({
      text: '',
      isFinal: false,
      metadata: {
        error: 'stt_fallback_exhausted',
        message: `All STT providers in the fallback chain have failed. Last error: ${error.message}`,
      },
    });
  }

  /**
   * Buffer a chunk for replay after the in-flight failover, dropping the
   * oldest chunk on overflow so the replay stays contiguous with live audio.
   */
  private bufferPendingAudio(chunk: ArrayBuffer): void {
    this.pendingAudio.push(chunk);
    if (this.pendingAudio.length > MAX_PENDING_CHUNKS) {
      this.pendingAudio.shift();
      this.droppedDuringFailover++;
    }
  }

  /** Re-inject the cached container header after an internal reconnect. */
  private injectReconnectHeader(): void {
    const header = this.reconnectHeaderSource?.();
    if (!header) return;
    try {
      this.active.sendAudio(header);
    } catch (error) {
      // A failing send here will also fail the flush right after, which
      // drives the normal advance-and-retry path.
      this.logger.warn('Failed to re-inject audio header after failover', error);
    }
  }

  /**
   * Replay audio buffered during a failover to the (new) active provider.
   *
   * @returns The send error when the provider fails mid-replay (unsent
   *   chunks stay buffered for the next attempt), or `null` on success.
   */
  private flushPendingAudio(): Error | null {
    if (this.droppedDuringFailover > 0) {
      this.logger.warn(
        `Failover buffer overflowed: dropped ${this.droppedDuringFailover} oldest audio chunk(s)`
      );
      this.droppedDuringFailover = 0;
    }
    while (this.pendingAudio.length > 0) {
      const chunk = this.pendingAudio[0] as ArrayBuffer;
      try {
        this.active.sendAudio(chunk);
      } catch (error) {
        return toError(error);
      }
      this.pendingAudio.shift();
    }
    return null;
  }

  /** Race a provider's connect() against the configured timeout. */
  private async withConnectTimeout(connecting: Promise<void>, providerName: string): Promise<void> {
    if (!this.connectTimeout || this.connectTimeout <= 0) {
      return connecting;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        connecting,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new TimeoutError(`${providerName}.connect()`, this.connectTimeout)),
            this.connectTimeout
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
