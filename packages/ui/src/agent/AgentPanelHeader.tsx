/**
 * AgentPanelHeader — header bar for the voice agent panel.
 *
 * Displays the brand name, a colored status indicator dot,
 * a clear-history button, and a close button.
 *
 * Status colors:
 * - green  = listening
 * - yellow = thinking / connecting
 * - blue   = speaking
 * - red    = error
 * - gray   = idle
 */

import { BrandName } from "../components/BrandName";
import { XIcon, TrashIcon } from "../icons";
import type { AgentStatus } from "./types";

interface AgentPanelHeaderProps {
  /** Current pipeline status */
  status: AgentStatus;
  /** Close the panel */
  onClose: () => void;
  /** Clear conversation history */
  onClear: () => void;
}

const statusColor: Record<AgentStatus, string> = {
  idle: "bg-foreground-muted",
  connecting: "bg-warning-500 animate-pulse",
  listening: "bg-success-500 animate-pulse",
  thinking: "bg-warning-500 animate-pulse",
  speaking: "bg-info-500 animate-pulse",
  error: "bg-danger-500",
};

const statusLabel: Record<AgentStatus, string> = {
  idle: "Idle",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  error: "Error",
};

export function AgentPanelHeader({
  status,
  onClose,
  onClear,
}: AgentPanelHeaderProps) {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-surface-raised shrink-0">
      {/* Brand + status */}
      <div className="flex items-center gap-3 min-w-0">
        <BrandName
          variant="wordmark"
          className="text-base font-semibold text-foreground truncate"
        />
        <span className="text-xs text-foreground-muted hidden sm:inline">
          Assistant
        </span>
        <span className="flex items-center gap-1.5" aria-label={`Status: ${statusLabel[status]}`}>
          <span
            className={`inline-block w-2 h-2 rounded-full shrink-0 ${statusColor[status]}`}
            aria-hidden="true"
          />
          <span className="text-xs text-foreground-muted hidden sm:inline">
            {statusLabel[status]}
          </span>
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onClear}
          className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-sunken transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          aria-label="Clear conversation history"
          title="Clear history"
        >
          <TrashIcon size="sm" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-foreground-muted hover:text-foreground hover:bg-surface-sunken transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          aria-label="Close panel"
        >
          <XIcon size="md" />
        </button>
      </div>
    </header>
  );
}
