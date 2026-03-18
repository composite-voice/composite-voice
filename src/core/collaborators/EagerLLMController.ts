/**
 * Controls the eager/speculative LLM pipeline: preflight handling,
 * speculative generation start, text similarity reconciliation, and
 * abort management.
 *
 * @remarks
 * Extracted from CompositeVoice to encapsulate all eager LLM concerns
 * in a single, independently testable class. CompositeVoice delegates
 * eager pipeline decisions to this collaborator.
 *
 * @packageDocumentation
 */

import type { EagerLLMConfig } from '../types/config';
import { textSimilarity } from '../../utils/textSimilarity';
import type { Logger } from '../../utils/logger';

/** Result of reconciling a preflight with confirmed text. */
export type ReconcileResult = 'keep' | 'restart' | 'accept-anyway';

/**
 * Manages the eager/speculative LLM pipeline.
 *
 * @remarks
 * When the STT provider emits a preflight signal (e.g., DeepgramFlux's
 * early end-of-turn detection), this controller manages the lifecycle of
 * speculative LLM generation: starting it, reconciling it with the
 * confirmed speech_final text, and cancelling it when needed.
 */
export class EagerLLMController {
  private abortController: AbortController | null = null;
  private preflightText: string | null = null;

  constructor(
    private config?: EagerLLMConfig,
    private logger?: Logger
  ) {}

  /** Whether the eager LLM pipeline is enabled in configuration. */
  get enabled(): boolean {
    return this.config?.enabled === true;
  }

  /** Whether a speculative generation is currently in flight. */
  get isActive(): boolean {
    return this.abortController !== null;
  }

  /** The preflight text used for the current speculative generation. */
  get currentPreflightText(): string | null {
    return this.preflightText;
  }

  /**
   * Start a speculative LLM generation based on preflight text.
   *
   * @remarks
   * If a previous speculative generation is already running, it is aborted
   * first. Returns an AbortSignal that can be passed to the LLM generation
   * call so it can be cancelled.
   *
   * @param text - The provisional transcript text from the preflight event.
   * @returns The AbortSignal for the new speculative generation.
   */
  startSpeculative(text: string): AbortSignal {
    // Cancel any previous speculative generation
    if (this.abortController) {
      this.logger?.debug('Cancelling previous eager LLM generation');
      this.abortController.abort();
      this.abortController = null;
      this.preflightText = null;
    }

    this.logger?.debug('Starting eager LLM on preflight', { text });
    const controller = new AbortController();
    this.abortController = controller;
    this.preflightText = text;

    return controller.signal;
  }

  /**
   * Reconcile a preflight generation with confirmed speech_final text.
   *
   * @remarks
   * Compares the preflight text against the confirmed text using word-overlap
   * similarity:
   * - `'keep'`: similarity is at or above threshold; let the speculative
   *   generation complete.
   * - `'restart'`: similarity is below threshold and cancelOnTextChange is
   *   true; the caller should abort and restart with the confirmed text.
   * - `'accept-anyway'`: similarity is below threshold but cancelOnTextChange
   *   is false; accept the speculative result despite text difference.
   *
   * After reconciliation, the eager state is always cleared.
   *
   * @param confirmedText - The confirmed final transcript text.
   * @returns The reconciliation action to take.
   */
  reconcile(confirmedText: string): ReconcileResult {
    if (!this.abortController) {
      // No active eager generation; shouldn't be called but handle gracefully
      return 'restart';
    }

    const eagerText = this.preflightText;
    const shouldCancel = this.config?.cancelOnTextChange ?? true;
    const threshold = this.config?.similarityThreshold ?? 0.8;

    const similarity = eagerText ? textSimilarity(eagerText, confirmedText) : 0;

    if (similarity >= threshold) {
      this.logger?.debug('speech_final similar to preflight — using eager generation', {
        similarity,
        threshold,
        preflight: eagerText,
        final: confirmedText,
      });
      this.clearState();
      return 'keep';
    }

    if (shouldCancel) {
      this.logger?.debug(
        'speech_final too different from preflight — cancelling eager, restarting',
        { similarity, threshold, preflight: eagerText, final: confirmedText }
      );
      this.abortController.abort();
      this.clearState();
      return 'restart';
    }

    // Accept the preflight response even though text changed beyond threshold
    this.logger?.debug(
      'speech_final differs but cancelOnTextChange=false — accepting eager response',
      { similarity, threshold }
    );
    this.clearState();
    return 'accept-anyway';
  }

  /**
   * Cancel any in-flight speculative generation.
   */
  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.clearState();
    }
  }

  /**
   * Reset all eager state without aborting.
   *
   * @remarks
   * Used when the eager generation completes naturally or is
   * superseded by a confirmed result.
   */
  reset(): void {
    this.clearState();
  }

  private clearState(): void {
    this.abortController = null;
    this.preflightText = null;
  }
}
