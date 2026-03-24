/**
 * ThinkingIndicator — animated thinking dots for the agent panel.
 *
 * Renders three bouncing dots with staggered CSS animation and a
 * "Thinking..." label. Pure CSS animation, no JavaScript timers.
 */

export function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 px-4 py-3 mb-3" role="status" aria-label="Thinking">
      <div className="flex items-center gap-1">
        <span
          className="inline-block w-2 h-2 rounded-full bg-foreground-muted animate-bounce"
          style={{ animationDelay: "0ms", animationDuration: "1s" }}
          aria-hidden="true"
        />
        <span
          className="inline-block w-2 h-2 rounded-full bg-foreground-muted animate-bounce"
          style={{ animationDelay: "150ms", animationDuration: "1s" }}
          aria-hidden="true"
        />
        <span
          className="inline-block w-2 h-2 rounded-full bg-foreground-muted animate-bounce"
          style={{ animationDelay: "300ms", animationDuration: "1s" }}
          aria-hidden="true"
        />
      </div>
      <span className="text-xs text-foreground-muted">Thinking...</span>
    </div>
  );
}
