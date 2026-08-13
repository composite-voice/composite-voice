/**
 * Per-turn latency metrics collection for the voice pipeline.
 *
 * @remarks
 * This module exports {@link TurnMetricsCollector}, which CompositeVoice
 * drives with `mark*()` calls at each pipeline stage and which emits one
 * {@link TurnMetricsSummary} per conversation turn:
 *
 * ```
 * preflight ─▶ sttFinal ─▶ llmStart ─▶ llmFirstToken ─▶ ttsFirstAudio ─▶ playbackStart ─▶ playbackEnd
 * (eager)      (turn t0)                                                 (voice-to-voice)
 * ```
 *
 * The collector understands the eager/speculative LLM pipeline: marks that
 * arrive before the confirmed `speech_final` (a preflight-triggered
 * generation) are held in a provisional buffer and either adopted into the
 * turn (eager accepted — `sttFinalToFirstToken` can then be negative) or
 * discarded (eager cancelled). The buffer holds every stage, not just the
 * first LLM marks, so a speculative generation that finishes before
 * `speech_final` still reports a complete summary.
 *
 * All timestamps are epoch milliseconds from `Date.now()`, matching the
 * `timestamp` field on every SDK event — so summaries convert directly to
 * tracing spans (OpenTelemetry or otherwise) without clock translation.
 *
 * @see {@link TurnMetricsSummary} for the emitted shape
 *
 * @packageDocumentation
 */

/**
 * Absolute timestamps (epoch ms) captured during one conversation turn.
 *
 * @remarks
 * Every field except {@link TurnTimestamps.sttFinal | sttFinal} and
 * {@link TurnTimestamps.turnEnd | turnEnd} is optional — which marks appear
 * depends on the pipeline topology (REST vs live TTS, separate vs
 * multi-role output, output muted) and on whether the turn completed.
 */
export interface TurnTimestamps {
  /**
   * When the STT provider signaled an early end-of-turn (preflight), if it
   * did.
   *
   * @remarks
   * This is the closest observable proxy for "the user stopped speaking" —
   * it fires before the confirmed final transcript on providers that
   * support it (e.g. DeepgramFlux).
   */
  preflight?: number;

  /**
   * When the utterance-complete transcription arrived — the turn's anchor
   * (t0). For typed turns via `sendMessage()`, the time the message was
   * submitted.
   */
  sttFinal: number;

  /** When the LLM request was dispatched. */
  llmStart?: number;

  /** When the first LLM token arrived. */
  llmFirstToken?: number;

  /** When the LLM finished generating. */
  llmComplete?: number;

  /** When the first TTS audio chunk arrived. */
  ttsFirstAudio?: number;

  /** When the output provider actually started playing audio. */
  playbackStart?: number;

  /** When the output provider last reported playback ending. */
  playbackEnd?: number;

  /** When the turn was finished (completed or interrupted). */
  turnEnd: number;
}

/**
 * Derived phase durations in milliseconds.
 *
 * @remarks
 * A duration is present only when both of its bounding timestamps were
 * captured. {@link TurnDurations.sttFinalToFirstToken | sttFinalToFirstToken}
 * can be **negative** when the eager pipeline produced the first token
 * before the confirmed transcript arrived — that negative number is the
 * latency the eager pipeline saved.
 */
export interface TurnDurations {
  /** STT final → first LLM token. Negative when an eager generation was adopted. */
  sttFinalToFirstToken?: number;

  /** First LLM token → first TTS audio chunk. */
  firstTokenToFirstAudio?: number;

  /** First TTS audio chunk → audible playback start. */
  firstAudioToPlayback?: number;

  /**
   * STT final → audible playback start — the headline "voice-to-voice"
   * response latency the user experiences.
   */
  voiceToVoice?: number;

  /** LLM request dispatch → generation complete. */
  llmTotal?: number;

  /** STT final → turn end (including full playback). */
  turnTotal: number;
}

/**
 * One completed (or interrupted) conversation turn's timing summary.
 *
 * @remarks
 * Emitted through the collector's summary callback, which CompositeVoice
 * re-emits as the `turn.metrics` SDK event.
 */
export interface TurnMetricsSummary {
  /** Monotonic turn counter, starting at 1 for the first turn. */
  turnId: number;

  /** The user text that started the turn. */
  transcript: string;

  /** How the turn was initiated: transcribed speech or typed text. */
  modality: 'voice' | 'text';

  /** Whether an eager (preflight-triggered) LLM generation was adopted. */
  eagerUsed: boolean;

  /**
   * Whether the turn ended early — barge-in, `stopSpeaking()`, or a
   * pipeline error — rather than completing playback.
   */
  interrupted: boolean;

  /** Absolute timestamps (epoch ms) for each captured stage. */
  timestamps: TurnTimestamps;

  /** Derived phase durations in milliseconds. */
  durations: TurnDurations;
}

/** Mutable working state for the turn in progress. @internal */
interface ActiveTurn {
  turnId: number;
  transcript: string;
  modality: 'voice' | 'text';
  eagerUsed: boolean;
  sttFinal: number;
  preflight?: number;
  llmStart?: number;
  llmFirstToken?: number;
  llmComplete?: number;
  ttsFirstAudio?: number;
  playbackStart?: number;
  playbackEnd?: number;
}

/** Marks captured for a speculative (eager) generation before speech_final. @internal */
interface PendingEagerMarks {
  preflight: number;
  llmStart?: number;
  llmFirstToken?: number;
  llmComplete?: number;
  ttsFirstAudio?: number;
  playbackStart?: number;
  playbackEnd?: number;
}

/**
 * Collects per-turn timing marks and emits a {@link TurnMetricsSummary}
 * when each turn finishes.
 *
 * @remarks
 * The collector is deliberately forgiving about call order:
 *
 * - Marks with no active turn are routed to the pending-eager buffer
 *   when a preflight was marked, and dropped otherwise (e.g. greeting
 *   audio from an agent provider).
 * - "First" marks (`llmStart`, `llmFirstToken`, `ttsFirstAudio`,
 *   `playbackStart`) are first-write-wins, so streaming loops can call
 *   them unconditionally per chunk.
 * - "Last" marks (`llmComplete`, `playbackEnd`) overwrite, so multi-round
 *   tool loops and bursty playback report their final occurrence.
 * - Starting a new turn while one is active finishes the old turn as
 *   `interrupted` — barge-in needs no special handling at call sites.
 *
 * @example
 * ```typescript
 * const collector = new TurnMetricsCollector((summary) => {
 *   console.log(`turn ${summary.turnId}: ${summary.durations.voiceToVoice}ms voice-to-voice`);
 * });
 *
 * collector.startTurn('what time is it', { modality: 'voice' });
 * collector.markLLMStart();
 * collector.markLLMFirstToken();
 * collector.markTTSFirstAudio();
 * collector.markPlaybackStart();
 * collector.finishTurn(); // emits the summary
 * ```
 */
export class TurnMetricsCollector {
  private turnCounter = 0;
  private current: ActiveTurn | null = null;
  private pendingEager: PendingEagerMarks | null = null;

  /**
   * @param onSummary - Invoked once per finished turn with the computed
   *   summary.
   * @param now - Clock function, injectable for tests. Defaults to
   *   `Date.now`.
   */
  constructor(
    private readonly onSummary: (summary: TurnMetricsSummary) => void,
    private readonly now: () => number = Date.now
  ) {}

  /** Whether a turn is currently in progress. */
  get hasActiveTurn(): boolean {
    return this.current !== null;
  }

  /**
   * Record a preflight (early end-of-turn) signal.
   *
   * @remarks
   * Opens a fresh pending-eager buffer; a subsequent eager LLM generation's
   * marks accumulate there until {@link startTurn} adopts or discards them.
   *
   * Providers can emit several preflights for one utterance. Later ones move
   * the mark while the buffer is still empty, but once an eager generation
   * has recorded a mark the buffer is frozen: that generation is still
   * running, and its first-write-wins marks will not fire again, so
   * replacing the buffer would lose them for good.
   */
  markPreflight(): void {
    const pending = this.pendingEager;
    if (pending && (pending.llmStart !== undefined || pending.llmFirstToken !== undefined)) {
      return;
    }
    this.pendingEager = { preflight: this.now() };
  }

  /**
   * Start a new turn, anchored at the current time.
   *
   * @remarks
   * If a turn is already active it is finished as `interrupted` first.
   * With `adoptEager: true`, every mark buffered since the last
   * {@link markPreflight} is copied into the new turn (this is how an
   * accepted eager generation's `llmFirstToken` can precede `sttFinal`,
   * and how a generation that finished before confirmation still reports
   * `llmComplete` / playback). The buffered `preflight` timestamp is
   * carried over either way — the early end-of-turn signal describes this
   * utterance whether or not a speculative generation ran on it, or was
   * accepted. The pending-eager buffer is cleared either way — a new turn
   * always invalidates old speculative marks.
   *
   * @param transcript - The user text that starts the turn.
   * @param options - Turn modality and whether to adopt buffered eager marks.
   */
  startTurn(
    transcript: string,
    options: { modality: 'voice' | 'text'; adoptEager?: boolean }
  ): void {
    if (this.current) {
      this.finish(true);
    }

    const pending = this.pendingEager;
    this.pendingEager = null;
    const eager = options.adoptEager === true ? pending : null;

    this.current = {
      turnId: ++this.turnCounter,
      transcript,
      modality: options.modality,
      eagerUsed: eager !== null,
      sttFinal: this.now(),
      ...(pending?.preflight !== undefined ? { preflight: pending.preflight } : {}),
      ...(eager?.llmStart !== undefined ? { llmStart: eager.llmStart } : {}),
      ...(eager?.llmFirstToken !== undefined ? { llmFirstToken: eager.llmFirstToken } : {}),
      ...(eager?.llmComplete !== undefined ? { llmComplete: eager.llmComplete } : {}),
      ...(eager?.ttsFirstAudio !== undefined ? { ttsFirstAudio: eager.ttsFirstAudio } : {}),
      ...(eager?.playbackStart !== undefined ? { playbackStart: eager.playbackStart } : {}),
      ...(eager?.playbackEnd !== undefined ? { playbackEnd: eager.playbackEnd } : {}),
    };
  }

  /** Record LLM request dispatch (first-write-wins). */
  markLLMStart(): void {
    const target = this.current ?? this.pendingEager;
    if (target && target.llmStart === undefined) {
      target.llmStart = this.now();
    }
  }

  /** Record first LLM token arrival (first-write-wins). */
  markLLMFirstToken(): void {
    const target = this.current ?? this.pendingEager;
    if (target && target.llmFirstToken === undefined) {
      target.llmFirstToken = this.now();
    }
  }

  /** Record LLM generation completion (last-write-wins). */
  markLLMComplete(): void {
    const target = this.current ?? this.pendingEager;
    if (target) {
      target.llmComplete = this.now();
    }
  }

  /** Record first TTS audio chunk arrival (first-write-wins). */
  markTTSFirstAudio(): void {
    const target = this.current ?? this.pendingEager;
    if (target && target.ttsFirstAudio === undefined) {
      target.ttsFirstAudio = this.now();
    }
  }

  /** Record audible playback start (first-write-wins). */
  markPlaybackStart(): void {
    const target = this.current ?? this.pendingEager;
    if (target && target.playbackStart === undefined) {
      target.playbackStart = this.now();
    }
  }

  /**
   * Record playback ending (last-write-wins).
   *
   * @remarks
   * Output providers can report several start/end cycles within one turn
   * when synthesis is slower than playback, so this does **not** finish
   * the turn — {@link finishTurn} does, driven by the pipeline.
   */
  markPlaybackEnd(): void {
    const target = this.current ?? this.pendingEager;
    if (target) {
      target.playbackEnd = this.now();
    }
  }

  /** Finish the active turn as completed and emit its summary. */
  finishTurn(): void {
    this.finish(false);
  }

  /**
   * Finish the active turn as interrupted and emit its summary.
   *
   * @remarks
   * Used for barge-in, `stopSpeaking()`, and pipeline errors. No-op when
   * no turn is active.
   */
  abortTurn(): void {
    this.finish(true);
  }

  private finish(interrupted: boolean): void {
    const turn = this.current;
    if (!turn) return;
    this.current = null;

    const turnEnd = this.now();

    const timestamps: TurnTimestamps = {
      sttFinal: turn.sttFinal,
      turnEnd,
      ...(turn.preflight !== undefined ? { preflight: turn.preflight } : {}),
      ...(turn.llmStart !== undefined ? { llmStart: turn.llmStart } : {}),
      ...(turn.llmFirstToken !== undefined ? { llmFirstToken: turn.llmFirstToken } : {}),
      ...(turn.llmComplete !== undefined ? { llmComplete: turn.llmComplete } : {}),
      ...(turn.ttsFirstAudio !== undefined ? { ttsFirstAudio: turn.ttsFirstAudio } : {}),
      ...(turn.playbackStart !== undefined ? { playbackStart: turn.playbackStart } : {}),
      ...(turn.playbackEnd !== undefined ? { playbackEnd: turn.playbackEnd } : {}),
    };

    const durations: TurnDurations = {
      turnTotal: turnEnd - turn.sttFinal,
      ...(turn.llmFirstToken !== undefined
        ? { sttFinalToFirstToken: turn.llmFirstToken - turn.sttFinal }
        : {}),
      ...(turn.llmFirstToken !== undefined && turn.ttsFirstAudio !== undefined
        ? { firstTokenToFirstAudio: turn.ttsFirstAudio - turn.llmFirstToken }
        : {}),
      ...(turn.ttsFirstAudio !== undefined && turn.playbackStart !== undefined
        ? { firstAudioToPlayback: turn.playbackStart - turn.ttsFirstAudio }
        : {}),
      ...(turn.playbackStart !== undefined
        ? { voiceToVoice: turn.playbackStart - turn.sttFinal }
        : {}),
      ...(turn.llmStart !== undefined && turn.llmComplete !== undefined
        ? { llmTotal: turn.llmComplete - turn.llmStart }
        : {}),
    };

    this.onSummary({
      turnId: turn.turnId,
      transcript: turn.transcript,
      modality: turn.modality,
      eagerUsed: turn.eagerUsed,
      interrupted,
      timestamps,
      durations,
    });
  }
}
