/**
 * CodeBlock — syntax-highlighted code block with copy button.
 *
 * Uses prism-react-renderer for syntax highlighting with a custom
 * theme that maps to our design tokens via CSS variables.
 * Adapts automatically to light/dark mode.
 *
 * Accessibility:
 * - <pre><code> semantic structure
 * - Copy button with aria-label and status announcement
 * - tabIndex={0} on pre for keyboard scrolling
 * - role="region" with aria-label for the code block
 */

import { useState, useCallback } from "react";
import { Highlight } from "prism-react-renderer";
import { codeTheme } from "../code-theme";

interface CodeBlockProps {
  /** The code string to highlight */
  code: string;
  /** Language for syntax highlighting */
  language?: string;
  /** Show line numbers */
  showLineNumbers?: boolean;
  /** Optional title/filename shown above the code */
  title?: string;
  /** Additional class names for the outer wrapper */
  className?: string;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, [text]);

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied!" : "Copy code"}
      title={copied ? "Copied!" : "Copy code"}
      className="absolute top-2 right-2 p-1.5 rounded-md bg-neutral-800/50 hover:bg-neutral-800/80 text-neutral-400 hover:text-neutral-200 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
    >
      {copied ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      <span className="sr-only" aria-live="polite">
        {copied ? "Code copied to clipboard" : ""}
      </span>
    </button>
  );
}

export function CodeBlock({
  code,
  language = "text",
  showLineNumbers = false,
  title,
  className = "",
}: CodeBlockProps) {
  const trimmedCode = code.replace(/\n$/, "");

  return (
    <div
      className={`relative group rounded-card overflow-hidden border border-neutral-200 ${className}`}
      role="region"
      aria-label={title ? `Code: ${title}` : "Code block"}
    >
      {title && (
        <div className="flex items-center px-4 py-2 bg-surface-sunken border-b border-neutral-200">
          <span className="text-xs font-medium text-neutral-500 font-mono">{title}</span>
        </div>
      )}

      <div className="relative">
        <Highlight theme={codeTheme} code={trimmedCode} language={language}>
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className="overflow-x-auto p-4 text-sm font-mono leading-relaxed"
              style={style}
              tabIndex={0}
            >
              <code>
                {tokens.map((line, i) => {
                  const lineProps = getLineProps({ line, key: i });
                  return (
                    <div key={i} {...lineProps}>
                      {showLineNumbers && (
                        <span
                          className="inline-block w-8 text-right mr-4 text-neutral-500 select-none"
                          aria-hidden="true"
                        >
                          {i + 1}
                        </span>
                      )}
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token, key })} />
                      ))}
                    </div>
                  );
                })}
              </code>
            </pre>
          )}
        </Highlight>

        <CopyButton text={trimmedCode} />
      </div>
    </div>
  );
}
