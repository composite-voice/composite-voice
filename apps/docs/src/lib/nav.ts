/**
 * Docs sidebar navigation config.
 *
 * Each item is one of:
 *  - A manual link:   { href: "/path", label: "Page Title" }
 *  - A content folder: { folder: "guides", label: "Guides" }
 *  - A nested section: { label: "API Reference", subfolders: [...] }
 *
 * Folder items auto-populate their children from the `docs` content
 * collection at build time. Just add a markdown file to the matching
 * folder under `src/content/docs/` and it appears in the sidebar.
 *
 * Nested sections create a collapsible top-level group containing
 * sub-groups for each subfolder.
 */

export interface NavLink {
  href: string;
  label: string;
}

export interface NavFolder {
  folder: string;
  label: string;
}

export interface NavSection {
  label: string;
  /** Optional href for a section overview/index page. */
  href?: string;
  subfolders: NavFolder[];
}

export type NavItem = NavLink | NavFolder | NavSection;

export function isNavFolder(item: NavItem): item is NavFolder {
  return "folder" in item && !("subfolders" in item);
}

export function isNavSection(item: NavItem): item is NavSection {
  return "subfolders" in item;
}

export const nav: NavItem[] = [
  { href: "/", label: "Overview" },
  {
    label: "Guides",
    subfolders: [
      { folder: "guides", label: "Getting Started" },
      { folder: "guides/stt", label: "Speech-to-Text" },
      { folder: "guides/llm", label: "Language Models" },
      { folder: "guides/tts", label: "Text-to-Speech" },
      { folder: "guides/agents", label: "Agent Providers" },
      { folder: "guides/io", label: "Inputs & Outputs" },
      { folder: "guides/proxy", label: "Server Proxy" },
    ],
  },
  { folder: "reference", label: "Reference" },
  { folder: "advanced", label: "Advanced" },
  {
    label: "API Reference",
    href: "/api",
    subfolders: [
      { folder: "api/classes", label: "Classes" },
      { folder: "api/abstract-classes", label: "Abstract Classes" },
      { folder: "api/interfaces", label: "Interfaces" },
      { folder: "api/types", label: "Types" },
      { folder: "api/functions", label: "Functions" },
      { folder: "api/errors", label: "Errors" },
      { folder: "api/enumerations", label: "Enumerations" },
    ],
  },
  { href: "/examples", label: "Examples" },
];
