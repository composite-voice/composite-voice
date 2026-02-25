/**
 * CopyCommand — compact single-line code snippet with copy button.
 *
 * Designed for install commands and short CLI snippets on landing pages.
 * Lighter than CodeBlock — no syntax highlighting, just a monospace
 * line with a prominent copy affordance.
 */

import { useState, useCallback } from "react";

interface CopyCommandProps {
  /** The command text to display and copy */
  command: string;
  /** Optional prefix shown but excluded from copy (e.g., "$") */
  prefix?: string;
  /** Additional class names */
  className?: string;
}

export function CopyCommand({
  command,
  prefix = "$",
  className = "",
}: CopyCommandProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [command]);

  return (
    <div
      className={`inline-flex items-center gap-3 rounded-lg border border-neutral-200 bg-surface-sunken px-4 py-3 font-mono text-sm ${className}`}
    >
      {prefix && (
        <span className="text-foreground-muted select-none" aria-hidden="true">
          {prefix}
        </span>
      )}
      <code className="text-foreground select-all">{command}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied!" : "Copy command"}
        title={copied ? "Copied!" : "Copy to clipboard"}
        className="ml-auto shrink-0 p-1 rounded-md text-foreground-muted hover:text-foreground hover:bg-neutral-200 transition-colors"
      >
        {copied ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-success-600">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
}
