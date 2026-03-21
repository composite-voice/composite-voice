/**
 * Strip markdown formatting from text for TTS consumption.
 *
 * Removes:
 * - Inline code backticks (keeps the text inside)
 * - Bold/italic markers (**, *, __)
 * - Heading markers (#)
 * - List markers (-, *)
 * - Link syntax [text](url) → keeps text
 * - Horizontal rules (---, ***)
 *
 * Preserves:
 * - SSML tags (<break/>, <prosody>, etc.)
 * - XML/JSON that's not in code fences
 * - Plain text content
 *
 * Does NOT handle code fences — those are managed by the pipeline's
 * buffer logic (code fences span multiple chunks).
 */
export function stripMarkdownForTTS(text: string): string {
  return text
    // Links: [text](url) → text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // Inline code: `code` → code
    .replace(/`([^`]*)`/g, '$1')
    // Bold/italic: **text**, *text*, __text__, _text_ → text
    .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
    .replace(/_{1,3}(.*?)_{1,3}/g, '$1')
    // Headings: ## text → text
    .replace(/^#{1,6}\s+/gm, '')
    // List markers at start of line: - item, * item → item
    .replace(/^[\s]*[-*+]\s+/gm, '')
    // Numbered list markers: 1. item → item
    .replace(/^[\s]*\d+\.\s+/gm, '')
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '');
}
