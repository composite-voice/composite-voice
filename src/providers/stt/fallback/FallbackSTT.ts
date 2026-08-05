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
 * over the connect timeout; anything beyond it is dropped oldest-last.
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

  /** Guards against concurrent failover attempts. */
  private failingOver = false;

  /** Audio buffered while a mid-session failover swaps providers. */
  private pendingAudio: ArrayBuffer[] = [];

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
  onFallback(callback: (info: ProviderFallbackInfo) => void): void {
    this.fallbackCallbacks.push(callback);
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
    this.connected = false;
    this.pendingAudio = [];
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
    await this.connectChain();
    this.connected = true;
    this.flushPendingAudio();
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (this.failingOver) {
      if (this.pendingAudio.length < MAX_PENDING_CHUNKS) {
        this.pendingAudio.push(chunk);
      }
      return;
    }

    try {
      this.active.sendAudio(chunk);
    } catch (error) {
      const err = toError(error);
      this.logger.warn('sendAudio failed on active provider — triggering failover', err);
      this.pendingAudio.push(chunk);
      void this.failover('stream-error', err);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.pendingAudio = [];
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
   * Try to connect the active provider, advancing on each failure.
   * Throws the last error when the chain is exhausted.
   */
  private async connectChain(): Promise<void> {
    for (;;) {
      const provider = this.active;
      try {
        await this.withConnectTimeout(provider.connect(), provider.constructor.name);
        return;
      } catch (error) {
        const err = toError(error);
        const reason: ProviderFallbackReason =
          err instanceof TimeoutError ? 'connect-timeout' : 'connect-error';
        // Tear down any half-open connection before moving on.
        void provider.disconnect().catch(() => {});
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

      try {
        await this.connectChain();
        this.flushPendingAudio();
      } catch (chainError) {
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
    this.transcriptionCallback?.({
      text: '',
      isFinal: false,
      metadata: {
        error: 'stt_fallback_exhausted',
        message: `All STT providers in the fallback chain have failed. Last error: ${error.message}`,
      },
    });
  }

  /** Replay audio buffered during a failover to the (new) active provider. */
  private flushPendingAudio(): void {
    if (this.pendingAudio.length === 0) return;
    const chunks = this.pendingAudio;
    this.pendingAudio = [];
    for (const chunk of chunks) {
      try {
        this.active.sendAudio(chunk);
      } catch (error) {
        this.logger.warn('Failed to flush buffered audio after failover', error);
        return;
      }
    }
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
