/**
 * Table — accessible data table with semantic HTML.
 *
 * Composes Text for cell content rendering. Uses native <table>
 * elements for maximum screen reader compatibility (JAWS, NVDA,
 * VoiceOver all rely on native table semantics).
 *
 * Schema.org: Supports Table itemType for structured data.
 *
 * Sub-components: Table, TableHead, TableBody, TableRow,
 * TableHeaderCell, TableCell, TableCaption
 *
 * Accessibility:
 * - <caption> announces table purpose to screen readers
 * - scope="col"/"row" on header cells for proper cell-header association
 * - aria-sort for sortable columns
 */

import { Text } from "./Text";

/* ── Table (root) ─────────────────────────────── */

interface TableProps extends React.TableHTMLAttributes<HTMLTableElement> {
  /** Alternating row colors */
  striped?: boolean;
  /** Row hover highlight */
  hoverable?: boolean;
  /** Cell borders */
  bordered?: boolean;
  /** Reduced padding */
  compact?: boolean;
  /** Additional class names */
  className?: string;
  /** Table content */
  children: React.ReactNode;
}

export function Table({
  striped = false,
  hoverable = false,
  bordered = false,
  compact = false,
  className = "",
  children,
  ...props
}: TableProps) {
  const dataAttributes = {
    "data-striped": striped || undefined,
    "data-hoverable": hoverable || undefined,
    "data-bordered": bordered || undefined,
    "data-compact": compact || undefined,
  };

  return (
    <div className="w-full overflow-x-auto" role="region" aria-label="Data table" tabIndex={0}>
      <table
        className={`w-full text-left border-collapse ${className}`}
        itemScope
        itemType="https://schema.org/Table"
        {...dataAttributes}
        {...props}
      >
        {children}
      </table>
    </div>
  );
}

/* ── TableCaption ─────────────────────────────── */

interface TableCaptionProps {
  children: React.ReactNode;
  className?: string;
  /** Position relative to table */
  side?: "top" | "bottom";
}

export function TableCaption({
  children,
  className = "",
  side = "bottom",
}: TableCaptionProps) {
  return (
    <caption
      className={`text-sm text-foreground-muted py-2 ${side === "bottom" ? "caption-bottom" : ""} ${className}`}
    >
      <Text as="span" size="sm" color="muted">
        {children}
      </Text>
    </caption>
  );
}

/* ── TableHead ────────────────────────────────── */

interface TableHeadProps {
  children: React.ReactNode;
  className?: string;
}

export function TableHead({ children, className = "" }: TableHeadProps) {
  return (
    <thead className={`border-b border-neutral-200 ${className}`}>
      {children}
    </thead>
  );
}

/* ── TableBody ────────────────────────────────── */

interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function TableBody({ children, className = "" }: TableBodyProps) {
  return (
    <tbody
      className={`divide-y divide-neutral-100 [table[data-striped]_&>tr:nth-child(even)]:bg-neutral-50 [table[data-hoverable]_&>tr]:hover:bg-neutral-50 ${className}`}
    >
      {children}
    </tbody>
  );
}

/* ── TableRow ─────────────────────────────────── */

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  children: React.ReactNode;
  /** Highlight row (e.g., selected state) */
  selected?: boolean;
  className?: string;
}

export function TableRow({
  children,
  selected = false,
  className = "",
  ...props
}: TableRowProps) {
  return (
    <tr
      className={`transition-colors ${selected ? "bg-primary-50" : ""} ${className}`}
      aria-selected={selected || undefined}
      {...props}
    >
      {children}
    </tr>
  );
}

/* ── TableHeaderCell ──────────────────────────── */

type SortDirection = "ascending" | "descending" | "none";

interface TableHeaderCellProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
  /** Sortable column indicator */
  sortable?: boolean;
  /** Current sort direction */
  sortDirection?: SortDirection;
  /** Sort change callback */
  onSort?: () => void;
  className?: string;
}

export function TableHeaderCell({
  children,
  sortable = false,
  sortDirection,
  onSort,
  className = "",
  scope = "col",
  ...props
}: TableHeaderCellProps) {
  const cellContent = (
    <Text as="span" size="xs" weight="semibold" color="muted" className="uppercase tracking-wider">
      {children}
    </Text>
  );

  const padding =
    "px-4 py-3 [table[data-compact]_&]:px-3 [table[data-compact]_&]:py-2 [table[data-bordered]_&]:border [table[data-bordered]_&]:border-neutral-200";

  if (sortable) {
    return (
      <th
        scope={scope}
        className={`${padding} ${className}`}
        aria-sort={sortDirection || undefined}
        {...props}
      >
        <button
          type="button"
          onClick={onSort}
          className="inline-flex items-center gap-1 hover:text-neutral-700 transition-colors group"
        >
          {cellContent}
          <span className="text-neutral-400 group-hover:text-neutral-600" aria-hidden="true">
            {sortDirection === "ascending" && "↑"}
            {sortDirection === "descending" && "↓"}
            {(!sortDirection || sortDirection === "none") && "↕"}
          </span>
        </button>
      </th>
    );
  }

  return (
    <th scope={scope} className={`${padding} text-left ${className}`} {...props}>
      {cellContent}
    </th>
  );
}

/* ── TableCell ────────────────────────────────── */

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  children: React.ReactNode;
  className?: string;
}

export function TableCell({
  children,
  className = "",
  ...props
}: TableCellProps) {
  return (
    <td
      className={`px-4 py-3 text-sm text-neutral-700 [table[data-compact]_&]:px-3 [table[data-compact]_&]:py-2 [table[data-bordered]_&]:border [table[data-bordered]_&]:border-neutral-200 ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}
