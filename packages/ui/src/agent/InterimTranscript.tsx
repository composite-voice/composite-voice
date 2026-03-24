/**
 * InterimTranscript — real-time speech-to-text preview.
 *
 * Renders the interim (not yet finalized) transcript as faded,
 * italic text so the user can see what the microphone is hearing.
 * Only renders when there is non-empty text.
 */

interface InterimTranscriptProps {
  /** The interim transcript text */
  text: string;
}

export function InterimTranscript({ text }: InterimTranscriptProps) {
  if (!text) return null;

  return (
    <div
      className="px-4 py-2 mb-1"
      role="status"
      aria-live="polite"
      aria-label="Hearing you say"
    >
      <p className="text-xs italic text-foreground-muted leading-relaxed truncate">
        {text}
      </p>
    </div>
  );
}
