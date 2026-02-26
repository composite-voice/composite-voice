/**
 * VersionPill — displays a version string as a small badge.
 *
 * Renders as a compact pill with primary background tint.
 * Prepends "v" automatically if the value doesn't already start with one.
 */

export interface VersionPillProps {
  /** Version string (e.g. "0.0.1" or "v0.0.1") */
  version: string;
  /** Additional class names */
  className?: string;
}

export function VersionPill({ version, className }: VersionPillProps) {
  const display = version.startsWith("v") ? version : `v${version}`;

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-badge text-[0.65rem] font-medium bg-primary-100 text-primary-700 ${className || ""}`}
    >
      {display}
    </span>
  );
}
