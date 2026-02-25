/**
 * Pagination — page navigation with accessible semantics.
 *
 * Composes Button, Icon (chevrons), Text, and VisuallyHidden.
 * Renders inside a <nav> with aria-label for landmark navigation.
 * Current page uses aria-current="page".
 *
 * Uses an ellipsis algorithm to show relevant pages around the
 * current page while keeping the total button count manageable.
 *
 * Schema.org: Wraps in SiteNavigationElement for crawlers.
 */

import { Button } from "./Button";
import { Text } from "./Text";
import { VisuallyHidden } from "./VisuallyHidden";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "../icons";

type PaginationSize = "sm" | "md" | "lg";

interface PaginationProps {
  /** Current active page (1-indexed) */
  currentPage: number;
  /** Total number of pages */
  totalPages: number;
  /** Callback when page changes */
  onPageChange: (page: number) => void;
  /** Pages shown on each side of current page */
  siblingCount?: number;
  /** Show first/last page buttons */
  showFirstLast?: boolean;
  /** Size variant */
  size?: PaginationSize;
  /** Additional class names */
  className?: string;
}

function getPageRange(
  current: number,
  total: number,
  siblings: number,
): (number | "ellipsis")[] {
  const totalSlots = siblings * 2 + 5; // siblings + current + 2 boundaries + 2 ellipsis
  if (total <= totalSlots) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const leftSibling = Math.max(current - siblings, 1);
  const rightSibling = Math.min(current + siblings, total);
  const showLeftEllipsis = leftSibling > 2;
  const showRightEllipsis = rightSibling < total - 1;

  const pages: (number | "ellipsis")[] = [];

  if (showLeftEllipsis) {
    pages.push(1, "ellipsis");
  } else {
    for (let i = 1; i < leftSibling; i++) pages.push(i);
  }

  for (let i = leftSibling; i <= rightSibling; i++) {
    pages.push(i);
  }

  if (showRightEllipsis) {
    pages.push("ellipsis", total);
  } else {
    for (let i = rightSibling + 1; i <= total; i++) pages.push(i);
  }

  return pages;
}

const sizeConfig: Record<PaginationSize, { button: "xs" | "sm" | "md"; icon: "xs" | "sm" | "md" }> = {
  sm: { button: "xs", icon: "xs" },
  md: { button: "sm", icon: "sm" },
  lg: { button: "md", icon: "md" },
};

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  siblingCount = 1,
  showFirstLast = true,
  size = "md",
  className = "",
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages = getPageRange(currentPage, totalPages, siblingCount);
  const config = sizeConfig[size];

  return (
    <nav
      aria-label="Pagination"
      className={`inline-flex items-center gap-1 ${className}`}
      itemScope
      itemType="https://schema.org/SiteNavigationElement"
    >
      {showFirstLast && (
        <Button
          variant="ghost"
          size={config.button}
          onClick={() => onPageChange(1)}
          disabled={currentPage === 1}
          aria-label="Go to first page"
        >
          <ChevronsLeftIcon size={config.icon} />
        </Button>
      )}

      <Button
        variant="ghost"
        size={config.button}
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Go to previous page"
      >
        <ChevronLeftIcon size={config.icon} />
      </Button>

      {pages.map((page, i) =>
        page === "ellipsis" ? (
          <Text key={`ellipsis-${i}`} as="span" size="sm" color="muted" className="px-2">
            &hellip;
          </Text>
        ) : (
          <Button
            key={page}
            variant={page === currentPage ? "primary" : "ghost"}
            size={config.button}
            onClick={() => onPageChange(page)}
            aria-label={`Page ${page}`}
            aria-current={page === currentPage ? "page" : undefined}
          >
            {page}
          </Button>
        ),
      )}

      <Button
        variant="ghost"
        size={config.button}
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Go to next page"
      >
        <ChevronRightIcon size={config.icon} />
      </Button>

      {showFirstLast && (
        <Button
          variant="ghost"
          size={config.button}
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage === totalPages}
          aria-label="Go to last page"
        >
          <ChevronsRightIcon size={config.icon} />
        </Button>
      )}

      <VisuallyHidden>
        Page {currentPage} of {totalPages}
      </VisuallyHidden>
    </nav>
  );
}
