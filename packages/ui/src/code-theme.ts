/**
 * Custom Prism theme for CompositeVoice design system.
 *
 * Uses CSS custom properties so syntax colors automatically
 * adapt to light/dark mode via our light-dark() token system.
 *
 * Token → design token mapping:
 * - Comments     → neutral-500
 * - Strings      → success-600
 * - Keywords     → primary-600
 * - Functions    → accent-600
 * - Numbers      → warning-600
 * - Tags/deleted → danger-600
 * - Types/class  → info-600
 * - Punctuation  → neutral-600
 * - Plain text   → neutral-900
 */

import type { PrismTheme } from "prism-react-renderer";

export const codeTheme: PrismTheme = {
  plain: {
    color: "var(--color-neutral-900)",
    backgroundColor: "var(--color-surface-sunken)",
  },
  styles: [
    {
      types: ["comment", "prolog", "doctype", "cdata"],
      style: { color: "var(--color-neutral-500)", fontStyle: "italic" as const },
    },
    {
      types: ["punctuation", "operator"],
      style: { color: "var(--color-neutral-600)" },
    },
    {
      types: ["string", "attr-value", "template-string", "char"],
      style: { color: "var(--color-success-600)" },
    },
    {
      types: ["keyword", "selector", "atrule"],
      style: { color: "var(--color-primary-600)" },
    },
    {
      types: ["function", "function-variable"],
      style: { color: "var(--color-accent-600)" },
    },
    {
      types: ["number", "boolean", "constant"],
      style: { color: "var(--color-warning-600)" },
    },
    {
      types: ["tag", "deleted"],
      style: { color: "var(--color-danger-600)" },
    },
    {
      types: ["class-name", "builtin", "maybe-class-name"],
      style: { color: "var(--color-info-600)" },
    },
    {
      types: ["attr-name", "property"],
      style: { color: "var(--color-accent-600)" },
    },
    {
      types: ["variable", "regex", "entity", "url"],
      style: { color: "var(--color-danger-600)" },
    },
    {
      types: ["inserted"],
      style: { color: "var(--color-success-600)" },
    },
    {
      types: ["namespace"],
      style: { opacity: 0.7 },
    },
  ],
};
