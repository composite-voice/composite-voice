import { stripMarkdownForTTS } from './ttsStrip';

/**
 * State tracker for splitting LLM text chunks into visual and spoken segments.
 *
 * Handles code fences that may open or close mid-chunk, span multiple chunks,
 * or have both open and close in the same chunk.
 *
 * Visual segments include everything (raw text + code blocks as single bursts).
 * Spoken segments exclude code fences and have markdown stripped.
 */
export class ChunkSplitter {
  private insideFence = false;
  private codeBuffer = '';

  /**
   * Process a raw text chunk and return visual + spoken segments to emit.
   *
   * May return multiple segments if the chunk contains fence boundaries.
   * Each segment has:
   * - visual: text for the chat UI (empty while code is buffering, burst when fence closes)
   * - spoken: text for TTS (empty inside fences, markdown-stripped outside)
   */
  process(raw: string): Array<{ visual: string; spoken: string }> {
    const segments: Array<{ visual: string; spoken: string }> = [];
    let remaining = raw;

    while (remaining.length > 0) {
      const fenceIdx = remaining.indexOf('```');

      if (fenceIdx === -1) {
        // No fence marker in remaining text
        if (this.insideFence) {
          this.codeBuffer += remaining;
          // No visual or spoken output while buffering
        } else {
          segments.push({
            visual: remaining,
            spoken: stripMarkdownForTTS(remaining),
          });
        }
        break;
      }

      // There's a fence marker at fenceIdx
      if (!this.insideFence) {
        // Opening fence — emit text before it, start buffering
        const before = remaining.slice(0, fenceIdx);
        if (before) {
          segments.push({
            visual: before,
            spoken: stripMarkdownForTTS(before),
          });
        }
        this.insideFence = true;
        this.codeBuffer = '```';
        remaining = remaining.slice(fenceIdx + 3);
      } else {
        // Closing fence — flush the buffered code block as visual
        this.codeBuffer += remaining.slice(0, fenceIdx + 3);
        segments.push({
          visual: this.codeBuffer,
          spoken: '',
        });
        this.codeBuffer = '';
        this.insideFence = false;
        remaining = remaining.slice(fenceIdx + 3);
      }
    }

    return segments;
  }
}
