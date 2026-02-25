/**
 * Tabs — accessible tabbed interface following WAI-ARIA Tabs pattern.
 *
 * Compound component using React context for state management.
 * Implements full keyboard navigation: Arrow keys move between tabs,
 * Home/End jump to first/last, and Tab key moves focus into the panel.
 *
 * Components: Tabs, TabList, Tab, TabPanel
 *
 * Accessibility:
 * - role="tablist" on the tab container
 * - role="tab" on each tab with aria-selected
 * - role="tabpanel" with aria-labelledby linking back to its tab
 * - Arrow key navigation between tabs
 * - Automatic activation on arrow key press
 */

import { createContext, useContext, useState, useRef, useCallback, useEffect } from "react";
import { Text } from "./Text";

/* ── Context ──────────────────────────────────── */

interface TabsContextValue {
  activeTab: string;
  setActiveTab: (value: string) => void;
  baseId: string;
}

const TabsContext = createContext<TabsContextValue | null>(null);

function useTabsContext() {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("Tab components must be used within <Tabs>");
  return ctx;
}

/* ── Tabs (root) ──────────────────────────────── */

interface TabsProps {
  /** Default active tab value (uncontrolled) */
  defaultValue?: string;
  /** Active tab value (controlled) */
  value?: string;
  /** Callback on tab change */
  onChange?: (value: string) => void;
  /** Tab content */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

let tabsCounter = 0;

export function Tabs({
  defaultValue,
  value,
  onChange,
  className = "",
  children,
}: TabsProps) {
  const [uncontrolled, setUncontrolled] = useState(defaultValue ?? "");
  const baseId = useRef(`tabs-${++tabsCounter}`).current;

  const activeTab = value ?? uncontrolled;
  const setActiveTab = useCallback(
    (v: string) => {
      if (value === undefined) setUncontrolled(v);
      onChange?.(v);
    },
    [value, onChange],
  );

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab, baseId }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
}

/* ── TabList ──────────────────────────────────── */

interface TabListProps {
  /** Tab elements */
  children: React.ReactNode;
  /** Required accessible label for the tab list */
  "aria-label": string;
  /** Additional class names */
  className?: string;
}

export function TabList({
  children,
  className = "",
  ...props
}: TabListProps) {
  const { key: _, ...domProps } = props as typeof props & { key?: React.Key };
  const tabListRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = tabListRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    checkScroll();
    const el = tabListRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    const observer = new ResizeObserver(checkScroll);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      observer.disconnect();
    };
  }, [checkScroll]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const tabList = tabListRef.current;
    if (!tabList) return;

    const tabs = Array.from(
      tabList.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'),
    );
    const currentIndex = tabs.findIndex((t) => t === document.activeElement);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    switch (e.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % tabs.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    tabs[nextIndex].focus();
    tabs[nextIndex].click();
  };

  return (
    <div className="relative">
      <div
        ref={tabListRef}
        role="tablist"
        className={`flex overflow-x-auto overflow-y-hidden border-b border-neutral-200 ${className}`}
        onKeyDown={handleKeyDown}
        {...domProps}
      >
        {children}
      </div>
      {canScrollLeft && (
        <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-surface via-surface/60 to-transparent pointer-events-none" aria-hidden="true" />
      )}
      {canScrollRight && (
        <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-surface via-surface/60 to-transparent pointer-events-none" aria-hidden="true" />
      )}
    </div>
  );
}

/* ── Tab ──────────────────────────────────────── */

interface TabProps {
  /** Unique value identifying this tab */
  value: string;
  /** Tab label */
  children: React.ReactNode;
  /** Disabled state */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

export function Tab({
  value,
  children,
  disabled = false,
  className = "",
}: TabProps) {
  const { activeTab, setActiveTab, baseId } = useTabsContext();
  const isActive = activeTab === value;

  return (
    <button
      type="button"
      role="tab"
      id={`${baseId}-tab-${value}`}
      aria-selected={isActive}
      aria-controls={`${baseId}-panel-${value}`}
      tabIndex={isActive ? 0 : -1}
      disabled={disabled}
      onClick={() => !disabled && setActiveTab(value)}
      className={`relative shrink-0 whitespace-nowrap px-4 py-2.5 -mb-px border-b-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset disabled:opacity-50 disabled:cursor-not-allowed ${
        isActive
          ? "border-primary-600 text-primary-600"
          : "border-transparent text-foreground-muted hover:text-foreground hover:border-neutral-300"
      } ${className}`}
    >
      <Text as="span" size="sm" weight={isActive ? "semibold" : "medium"} color="inherit">
        {children}
      </Text>
    </button>
  );
}

/* ── TabPanel ─────────────────────────────────── */

interface TabPanelProps {
  /** Must match the corresponding Tab's value */
  value: string;
  /** Panel content */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function TabPanel({
  value,
  children,
  className = "",
}: TabPanelProps) {
  const { activeTab, baseId } = useTabsContext();
  const isActive = activeTab === value;

  if (!isActive) return null;

  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      tabIndex={0}
      className={`py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-inset rounded ${className}`}
    >
      {children}
    </div>
  );
}
