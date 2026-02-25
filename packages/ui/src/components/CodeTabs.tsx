/**
 * CodeTabs — tabbed code blocks for showing code in multiple languages.
 *
 * Wraps multiple CodeBlock instances with a tab bar for switching.
 * Only the active tab's code is rendered.
 *
 * Accessibility:
 * - WAI-ARIA tablist/tab/tabpanel pattern
 * - Arrow key navigation between tabs
 * - Each tab panel linked via aria-labelledby
 */

import { useState, useRef, useCallback, useId } from "react";
import { CodeBlock } from "./CodeBlock";

interface CodeTab {
  /** Tab label (e.g. "TypeScript", "JavaScript", "Bash") */
  label: string;
  /** The code string */
  code: string;
  /** Language for syntax highlighting */
  language?: string;
}

interface CodeTabsProps {
  /** Array of code tabs */
  tabs: CodeTab[];
  /** Show line numbers in code blocks */
  showLineNumbers?: boolean;
  /** Additional class names */
  className?: string;
}

export function CodeTabs({
  tabs,
  showLineNumbers = false,
  className = "",
}: CodeTabsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let next = activeIndex;

      if (e.key === "ArrowRight") {
        next = (activeIndex + 1) % tabs.length;
      } else if (e.key === "ArrowLeft") {
        next = (activeIndex - 1 + tabs.length) % tabs.length;
      } else if (e.key === "Home") {
        next = 0;
      } else if (e.key === "End") {
        next = tabs.length - 1;
      } else {
        return;
      }

      e.preventDefault();
      setActiveIndex(next);
      tabsRef.current[next]?.focus();
    },
    [activeIndex, tabs.length],
  );

  if (tabs.length === 0) return null;

  const activeTab = tabs[activeIndex];

  return (
    <div
      className={`rounded-card overflow-hidden border border-neutral-200 ${className}`}
      role="region"
      aria-label="Code examples"
    >
      {/* Tab bar */}
      <div
        className="flex bg-surface-sunken border-b border-neutral-200"
        role="tablist"
        aria-label="Code language tabs"
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            ref={(el) => { tabsRef.current[i] = el; }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${i}`}
            aria-selected={activeIndex === i}
            aria-controls={`${baseId}-panel-${i}`}
            tabIndex={activeIndex === i ? 0 : -1}
            onClick={() => setActiveIndex(i)}
            className={`px-4 py-2 text-xs font-medium font-mono transition-colors border-b-2 -mb-px ${
              activeIndex === i
                ? "border-primary-500 text-primary-700 bg-surface"
                : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active panel */}
      <div
        role="tabpanel"
        id={`${baseId}-panel-${activeIndex}`}
        aria-labelledby={`${baseId}-tab-${activeIndex}`}
        tabIndex={0}
      >
        <CodeBlock
          code={activeTab.code}
          language={activeTab.language}
          showLineNumbers={showLineNumbers}
          className="border-0 rounded-none"
        />
      </div>
    </div>
  );
}
