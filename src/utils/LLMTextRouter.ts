import { ChunkSplitter } from './chunkSplitter';

/**
 * Routes raw LLM text chunks into visual (chat UI) and spoken (TTS) streams.
 *
 * Encapsulates code fence buffering and markdown stripping so the
 * pipeline orchestrator only needs to call `push()` per chunk.
 */
export class LLMTextRouter {
  private splitter = new ChunkSplitter();
  private accumulated = '';

  constructor(
    private onVisual: (visual: string, spoken: string, accumulated: string) => void,
    private onSpoken: (text: string) => void,
  ) {}

  /** Feed a raw LLM text chunk. Produces zero or more visual/spoken events in order. */
  push(raw: string): void {
    this.accumulated += raw;
    const acc = this.accumulated;

    for (const { visual, spoken } of this.splitter.process(raw)) {
      if (visual) this.onVisual(visual, spoken, acc);
      if (spoken) this.onSpoken(spoken);
    }
  }

  /** Get the full accumulated raw text (includes code blocks). */
  getAccumulated(): string {
    return this.accumulated;
  }

  /** Reset accumulated text (e.g. between tool-use rounds). Returns text before reset. */
  resetAccumulated(): string {
    const text = this.accumulated;
    this.accumulated = '';
    return text;
  }
}
