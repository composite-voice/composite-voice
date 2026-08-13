/**
 * Runs the configured {@link Guardrail} chain between LLM output and TTS.
 *
 * @remarks
 * Two entry points, one for each way text reaches a TTS provider:
 *
 * - {@link GuardrailPipeline.run} filters a complete utterance. Used for REST
 *   TTS, which synthesizes the whole response in one call.
 * - {@link GuardrailPipeline.createStream} returns a {@link GuardrailStream},
 *   a stateful per-utterance filter for Live (WebSocket) TTS that segments the
 *   incoming chunks, filters each segment, and forwards survivors to the
 *   provider as they clear.
 *
 * Both paths share the same chain semantics: guardrails run in order, each one
 * receiving the previous one's output, and the chain stops at the first block.
 * A guardrail that throws or exceeds `timeoutMs` is handled according to the
 * configured {@link GuardrailErrorPolicy} rather than propagating — a broken
 * filter must not take down the turn.
 *
 * @packageDocumentation
 */

import type {
  Guardrail,
  GuardrailContext,
  GuardrailResult,
  GuardrailStage,
  GuardrailsConfig,
} from '../types/guardrails';
import { DEFAULT_GUARDRAILS_CONFIG } from '../types/guardrails';
import type { LLMMessage } from '../types/providers';
import type { Logger } from '../../utils/logger';

/**
 * Record of one guardrail that rewrote or blocked text.
 */
export interface GuardrailApplication {
  /** {@link Guardrail.name} of the guardrail that acted. */
  guardrail: string;
  /** Text handed to the guardrail. */
  original: string;
  /** Text the guardrail produced (empty when blocked). */
  text: string;
  /** Whether the guardrail blocked the text. */
  blocked: boolean;
  /** Explanation supplied by the guardrail, if any. */
  reason?: string | undefined;
  /** Detail supplied by the guardrail, if any. */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Result of running the chain over one piece of text.
 */
export interface GuardrailOutcome {
  /** Text that survived the chain. Empty when {@link GuardrailOutcome.blocked} is true. */
  text: string;
  /** Whether a guardrail suppressed the text. */
  blocked: boolean;
  /** Guardrails that rewrote or blocked the text, in the order they ran. */
  applications: GuardrailApplication[];
}

/**
 * Hooks the pipeline calls as guardrails act, so the SDK can turn them into
 * `guardrail.*` events.
 *
 * @remarks
 * Every method is optional and invoked synchronously. Handlers must not throw.
 */
export interface GuardrailObserver {
  /** A guardrail rewrote the text. */
  onApplied?(application: GuardrailApplication & { stage: GuardrailStage }): void;
  /** A guardrail suppressed the text. */
  onBlocked?(application: GuardrailApplication & { stage: GuardrailStage }): void;
  /** A guardrail threw or timed out. */
  onError?(info: {
    guardrail: string;
    stage: GuardrailStage;
    error: Error;
    policy: 'passthrough' | 'block';
  }): void;
}

/** Per-utterance inputs a {@link GuardrailStream} needs to build its context. */
export interface GuardrailStreamOptions {
  /**
   * Receives each piece of text that clears the chain, in order.
   *
   * @remarks
   * Awaited before the next segment is filtered, so a sink that applies
   * backpressure also throttles the guardrail chain.
   */
  onText: (text: string) => void | Promise<void>;

  /** Conversation history to expose on {@link GuardrailContext.messages}. */
  messages?: readonly LLMMessage[];

  /** Signal for the in-flight generation, forwarded to every guardrail. */
  signal?: AbortSignal;
}

/**
 * Sentence boundary: terminal punctuation followed by whitespace.
 *
 * @remarks
 * The lookahead requires trailing whitespace so a boundary is never declared
 * on a character that might still be mid-token — `3.` in `3.5` arrives without
 * a following space, and waiting one more chunk keeps the number intact for
 * pattern-matching guardrails.
 */
const SENTENCE_BOUNDARY = /[.!?;:\n](?=\s)/g;

/**
 * Runs a {@link Guardrail} chain over LLM text on its way to TTS.
 *
 * @see {@link GuardrailsConfig} for configuration.
 * @see {@link GuardrailStream} for the streaming counterpart.
 */
export class GuardrailPipeline {
  private readonly filters: readonly Guardrail[];
  private readonly settings: Required<Omit<GuardrailsConfig, 'filters'>>;
  private readonly logger: Logger | undefined;
  private readonly observer: GuardrailObserver | undefined;

  /**
   * @param config - Filters plus chain settings. Unset fields fall back to
   *   {@link DEFAULT_GUARDRAILS_CONFIG}.
   * @param deps - Optional logger and event observer.
   */
  constructor(
    config: GuardrailsConfig,
    deps: { logger?: Logger; observer?: GuardrailObserver } = {}
  ) {
    this.filters = config.filters ?? [];
    this.settings = {
      enabled: config.enabled ?? DEFAULT_GUARDRAILS_CONFIG.enabled,
      mode: config.mode ?? DEFAULT_GUARDRAILS_CONFIG.mode,
      segmentation: config.segmentation ?? DEFAULT_GUARDRAILS_CONFIG.segmentation,
      maxSegmentChars: config.maxSegmentChars ?? DEFAULT_GUARDRAILS_CONFIG.maxSegmentChars,
      timeoutMs: config.timeoutMs ?? DEFAULT_GUARDRAILS_CONFIG.timeoutMs,
      onError: config.onError ?? DEFAULT_GUARDRAILS_CONFIG.onError,
    };
    this.logger = deps.logger;
    this.observer = deps.observer;
  }

  /**
   * Whether the chain will actually filter anything.
   *
   * @remarks
   * False when `enabled` is `false` or no filters are configured, letting
   * callers skip the guardrail code path entirely.
   */
  get enabled(): boolean {
    return this.settings.enabled && this.filters.length > 0;
  }

  /** Whether Live TTS should hold the full response before filtering. */
  get buffered(): boolean {
    return this.settings.mode === 'buffered';
  }

  /**
   * Run the chain over a complete piece of text.
   *
   * @param text - Text to filter.
   * @param context - Stage, accumulated text, history, and abort signal.
   * @returns The surviving text and a record of what acted on it.
   */
  async run(text: string, context: GuardrailContext): Promise<GuardrailOutcome> {
    const applications: GuardrailApplication[] = [];

    if (!this.enabled || !text) {
      return { text, blocked: false, applications };
    }

    let current = text;

    for (const guardrail of this.filters) {
      if (!this.runsAt(guardrail, context.stage)) continue;

      let result: GuardrailResult | void;
      try {
        result = await this.invoke(guardrail, current, context);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        const policy = this.settings.onError;
        this.logger?.warn(`Guardrail "${guardrail.name}" failed (${policy})`, err);
        this.observer?.onError?.({
          guardrail: guardrail.name,
          stage: context.stage,
          error: err,
          policy,
        });

        if (policy === 'block') {
          const application: GuardrailApplication = {
            guardrail: guardrail.name,
            original: current,
            text: '',
            blocked: true,
            reason: `guardrail error: ${err.message}`,
          };
          applications.push(application);
          this.observer?.onBlocked?.({ ...application, stage: context.stage });
          return { text: '', blocked: true, applications };
        }
        continue;
      }

      if (!result) continue;

      if (result.block) {
        const application: GuardrailApplication = {
          guardrail: guardrail.name,
          original: current,
          text: '',
          blocked: true,
          reason: result.reason,
          metadata: result.metadata,
        };
        applications.push(application);
        this.observer?.onBlocked?.({ ...application, stage: context.stage });
        return { text: '', blocked: true, applications };
      }

      if (result.text !== undefined && result.text !== current) {
        const application: GuardrailApplication = {
          guardrail: guardrail.name,
          original: current,
          text: result.text,
          blocked: false,
          reason: result.reason,
          metadata: result.metadata,
        };
        applications.push(application);
        this.observer?.onApplied?.({ ...application, stage: context.stage });
        current = result.text;
      }
    }

    return { text: current, blocked: false, applications };
  }

  /**
   * Create a per-utterance streaming filter for a Live TTS provider.
   *
   * @remarks
   * One stream per generation — create it before streaming starts, `push()`
   * every LLM chunk, and `flush()` once generation completes. Discard the
   * stream without flushing when the turn is abandoned (barge-in, abort).
   *
   * @param options - Sink for surviving text plus per-utterance context.
   */
  createStream(options: GuardrailStreamOptions): GuardrailStream {
    return new GuardrailStream(this, this.settings, options);
  }

  /** Whether a guardrail opted into the given stage. */
  private runsAt(guardrail: Guardrail, stage: GuardrailStage): boolean {
    return guardrail.stages === undefined || guardrail.stages.includes(stage);
  }

  /**
   * Call a guardrail, enforcing the configured timeout.
   *
   * @remarks
   * A timed-out guardrail keeps running in the background — there is no way to
   * cancel an arbitrary user promise — but its result is ignored.
   */
  private async invoke(
    guardrail: Guardrail,
    text: string,
    context: GuardrailContext
  ): Promise<GuardrailResult | void> {
    const timeoutMs = this.settings.timeoutMs;
    const pending = Promise.resolve(guardrail.check(text, context));

    if (timeoutMs <= 0) return pending;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Guardrail "${guardrail.name}" timed out after ${timeoutMs}ms`)),
            timeoutMs
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}

/**
 * Stateful guardrail filter for one streamed LLM response.
 *
 * @remarks
 * In `'streaming'` mode the stream accumulates chunks until a segment boundary,
 * runs the `'chunk'` stage over each completed segment, and forwards survivors
 * to the sink immediately. In `'buffered'` mode nothing is forwarded until
 * {@link GuardrailStream.flush}, which runs the `'final'` stage over the whole
 * response — slower to first audio, but a block is absolute.
 *
 * Once a guardrail blocks, the stream stays blocked for the rest of the
 * utterance: text already handed to the TTS provider cannot be recalled, so the
 * only remaining option is to stop feeding it.
 *
 * @see {@link GuardrailPipeline.createStream}
 */
export class GuardrailStream {
  /** Text received but not yet forming a complete segment. */
  private buffer = '';

  /** All raw text pushed so far, for {@link GuardrailContext.accumulated}. */
  private accumulated = '';

  /** Text forwarded to the sink so far. */
  private emitted = '';

  /** How much of {@link emitted} {@link takeSpokenText} has already reported. */
  private reported = 0;

  private blocked = false;

  /** @internal Constructed via {@link GuardrailPipeline.createStream}. */
  constructor(
    private readonly pipeline: GuardrailPipeline,
    private readonly settings: Required<Omit<GuardrailsConfig, 'filters'>>,
    private readonly options: GuardrailStreamOptions
  ) {}

  /** Whether a guardrail has suppressed the remainder of this utterance. */
  get isBlocked(): boolean {
    return this.blocked;
  }

  /** Text forwarded to the sink so far. */
  get spokenText(): string {
    return this.emitted;
  }

  /**
   * Text forwarded to the sink since the last call, marking it as reported.
   *
   * @remarks
   * The caller finalizing a TTS provider needs the text of *that* utterance, not
   * of the whole stream. A tool loop shares one stream across rounds and
   * finalizes at each tool boundary, so reading {@link spokenText} there would
   * repeat everything spoken in earlier rounds. Returns `''` once a guardrail
   * has blocked and nothing further reached the provider.
   */
  takeSpokenText(): string {
    const next = this.emitted.slice(this.reported);
    this.reported = this.emitted.length;
    return next;
  }

  /**
   * Feed one raw LLM chunk.
   *
   * @remarks
   * Resolves once every segment the chunk completed has been filtered and
   * handed to the sink. Awaiting keeps text in order and lets a backpressured
   * sink throttle the LLM loop.
   */
  async push(raw: string): Promise<void> {
    if (this.blocked || !raw) return;

    this.accumulated += raw;

    if (this.settings.mode === 'buffered') {
      this.buffer += raw;
      return;
    }

    if (this.settings.segmentation === 'chunk') {
      await this.filterAndEmit(raw, 'chunk');
      return;
    }

    this.buffer += raw;

    let segment = this.takeSegment();
    while (segment !== null) {
      await this.filterAndEmit(segment, 'chunk');
      if (this.blocked) return;
      segment = this.takeSegment();
    }
  }

  /**
   * Filter and forward whatever text remains, ending the utterance.
   *
   * @remarks
   * In `'buffered'` mode this is where the entire response is filtered and
   * emitted, at the `'final'` stage. In `'streaming'` mode the only text left is
   * the tail of the last sentence, and it is filtered at the `'chunk'` stage
   * like every segment before it — so a guardrail restricted to `['final']` does
   * not run on the streaming path at all. Call once, after the LLM stream
   * completes and before finalizing the TTS provider. Safe to call when nothing
   * is buffered.
   *
   * @returns The full text that was forwarded to the sink for this utterance.
   */
  async flush(): Promise<string> {
    if (this.blocked) {
      this.buffer = '';
      return this.emitted;
    }

    const remaining = this.buffer;
    this.buffer = '';

    if (remaining) {
      await this.filterAndEmit(remaining, this.settings.mode === 'buffered' ? 'final' : 'chunk');
    }

    return this.emitted;
  }

  /**
   * Discard all buffered state.
   *
   * @remarks
   * Call when a turn is abandoned (barge-in, abort) so the next utterance
   * starts clean. Does not un-block a stream that was already blocked; create
   * a new stream per utterance instead.
   */
  reset(): void {
    this.buffer = '';
    this.accumulated = '';
    this.emitted = '';
    this.reported = 0;
    this.blocked = false;
  }

  /** Run one segment through the chain and hand survivors to the sink. */
  private async filterAndEmit(segment: string, stage: GuardrailStage): Promise<void> {
    const context: GuardrailContext = {
      stage,
      accumulated: this.accumulated,
      messages: this.options.messages ?? [],
    };
    // `exactOptionalPropertyTypes` — only set `signal` when there is one.
    if (this.options.signal) context.signal = this.options.signal;

    const outcome = await this.pipeline.run(segment, context);

    if (outcome.blocked) {
      this.blocked = true;
      return;
    }

    if (!outcome.text) return;

    this.emitted += outcome.text;
    await this.options.onText(outcome.text);
  }

  /**
   * Pull the largest complete segment out of the buffer.
   *
   * @remarks
   * Cuts at the *last* boundary in the buffer rather than the first, so a chunk
   * containing several finished sentences reaches the guardrail as one call.
   * Fewer invocations, and each one sees more surrounding context.
   *
   * @returns The segment, or `null` when the buffer holds no boundary and is
   *   still under the size limit.
   */
  private takeSegment(): string | null {
    const max = this.settings.maxSegmentChars;

    SENTENCE_BOUNDARY.lastIndex = 0;
    let boundary = -1;
    let match: RegExpExecArray | null;
    while ((match = SENTENCE_BOUNDARY.exec(this.buffer)) !== null) {
      boundary = match.index;
    }

    if (boundary !== -1) {
      const segment = this.buffer.slice(0, boundary + 1);
      this.buffer = this.buffer.slice(boundary + 1);
      return segment;
    }

    if (max > 0 && this.buffer.length >= max) {
      // No punctuation in sight — cut at the last word break so a redaction
      // pattern is not split down the middle any more often than necessary.
      const head = this.buffer.slice(0, max);
      const lastSpace = head.lastIndexOf(' ');
      const cut = lastSpace > 0 ? lastSpace + 1 : max;
      const segment = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut);
      return segment;
    }

    return null;
  }
}
