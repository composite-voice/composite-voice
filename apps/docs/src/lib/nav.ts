/**
 * Docs sidebar navigation config.
 *
 * Each item is either:
 *  - A manual link:  { href: "/path", label: "Page Title" }
 *  - A content folder: { folder: "guides", label: "Guides" }
 *
 * Folder items auto-populate their children from the `docs` content
 * collection at build time. Just add a markdown file to the matching
 * folder under `src/content/docs/` and it appears in the sidebar.
 */

export interface NavLink {
  href: string;
  label: string;
}

export interface NavFolder {
  folder: string;
  label: string;
}

export type NavItem = NavLink | NavFolder;

export function isNavFolder(item: NavItem): item is NavFolder {
  return "folder" in item;
}

export const nav: NavItem[] = [
  { href: "/", label: "Overview" },
  { folder: "guides", label: "Guides" },
  { folder: "reference", label: "Reference" },
  { folder: "advanced", label: "Advanced" },
  { folder: "api", label: "API" },
  { href: "/examples", label: "Examples" },
];
