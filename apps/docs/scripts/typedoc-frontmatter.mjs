/**
 * Post-processes typedoc-plugin-markdown output to:
 *
 * 1. Add YAML frontmatter (title, description, order) required by the Astro
 *    content collection schema.
 * 2. Organise files into subdirectories by type (classes, abstract-classes,
 *    errors, interfaces, types, functions, enumerations).
 * 3. Rewrite internal cross-reference links to match the new directory layout,
 *    using absolute paths so they work regardless of nesting depth.
 *
 * Runs in two passes:
 *   Pass 1 – Read every file, extract metadata, build an old-name → new-path
 *            mapping.
 *   Pass 2 – Rewrite cross-references, add frontmatter, and move files into
 *            their target subdirectories.
 */

import { readdir, readFile, writeFile, mkdir, rm, rename, unlink } from "node:fs/promises";
import { join, basename } from "node:path";

const API_DIR = new URL("../src/content/docs/api", import.meta.url).pathname;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the first H1 heading from raw markdown (before any frontmatter has
 * been added).  Returns `null` when the file already has frontmatter or no H1.
 */
function extractRawTitle(content) {
  // If the file already has frontmatter, pull the title from it
  if (content.startsWith("---")) {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const titleMatch = fmMatch[1].match(/title:\s*'(.+)'/);
      if (titleMatch) return titleMatch[1].replace(/''/g, "'");
    }
    return null;
  }
  const m = content.match(/^#\s+(.+)$/m);
  return m ? m[1].trim().replace(/\\([<>])/g, "$1") : null;
}

/**
 * Determine the target subdirectory and cleaned filename for a given source
 * file.  Returns `{ subdir, newFilename, cleanTitle }`.
 */
function classifyFile(filename, title) {
  // index.md stays in place, with a clean title
  if (filename === "index.md") {
    return { subdir: null, newFilename: "index.md", cleanTitle: "API Reference" };
  }

  // Enumeration.Name.md
  if (filename.startsWith("Enumeration.")) {
    const name = filename.replace(/^Enumeration\./, "").replace(/\.md$/, "");
    const cleanTitle = title
      ? title.replace(/^Enumeration:\s*/, "")
      : name;
    return { subdir: "enumerations", newFilename: `${name}.md`, cleanTitle };
  }

  // Function.Name.md
  if (filename.startsWith("Function.")) {
    const name = filename.replace(/^Function\./, "").replace(/\.md$/, "");
    let cleanTitle = title
      ? title.replace(/^Function:\s*/, "")
      : name;
    // Remove trailing () that TypeDoc sometimes adds
    cleanTitle = cleanTitle.replace(/\(\)$/, "");
    return { subdir: "functions", newFilename: `${name}.md`, cleanTitle };
  }

  // Interface.Name.md
  if (filename.startsWith("Interface.")) {
    const name = filename.replace(/^Interface\./, "").replace(/\.md$/, "");
    const cleanTitle = title
      ? title.replace(/^Interface:\s*/, "")
      : name;
    return { subdir: "interfaces", newFilename: `${name}.md`, cleanTitle };
  }

  // TypeAlias.Name.md
  if (filename.startsWith("TypeAlias.")) {
    const name = filename.replace(/^TypeAlias\./, "").replace(/\.md$/, "");
    const cleanTitle = title
      ? title.replace(/^Type Alias:\s*/, "")
      : name;
    return { subdir: "types", newFilename: `${name}.md`, cleanTitle };
  }

  // Class.Name.md — needs further classification
  if (filename.startsWith("Class.")) {
    const name = filename.replace(/^Class\./, "").replace(/\.md$/, "");

    // Determine category from original title
    const isAbstract = title && title.startsWith("Abstract Class:");
    const isError = name.endsWith("Error");

    let subdir;
    if (isAbstract) {
      subdir = "abstract-classes";
    } else if (isError) {
      subdir = "errors";
    } else {
      subdir = "classes";
    }

    let cleanTitle;
    if (isAbstract) {
      cleanTitle = title.replace(/^Abstract Class:\s*/, "");
    } else {
      cleanTitle = title ? title.replace(/^Class:\s*/, "") : name;
    }

    return { subdir, newFilename: `${name}.md`, cleanTitle };
  }

  // Anything else — leave in place
  return {
    subdir: null,
    newFilename: filename,
    cleanTitle: title || filename.replace(/\.md$/, ""),
  };
}

/**
 * Extract the first non-heading, non-empty paragraph from the markdown body
 * and truncate it to ~160 characters for an SEO description.
 */
function extractDescription(content) {
  // Strip frontmatter if present
  let body = content;
  if (body.startsWith("---")) {
    body = body.replace(/^---[\s\S]*?---\n*/, "");
  }
  // Remove the first H1 heading
  body = body.replace(/^#\s+.+\n+/, "");

  // Skip code blocks and headings; find the first plain paragraph
  const lines = body.split("\n");
  let inCodeBlock = false;
  const paragraphLines = [];

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Skip headings, list items, table rows, HTML anchors, empty lines, Defined in lines
    if (/^#{1,6}\s/.test(line)) {
      // If we already started collecting a paragraph, stop here
      if (paragraphLines.length > 0) break;
      continue;
    }
    if (/^Defined in:/.test(line)) continue;
    if (/^\s*$/.test(line)) {
      if (paragraphLines.length > 0) break;
      continue;
    }
    if (/^[|\-*>]/.test(line) || /^<a /.test(line)) {
      if (paragraphLines.length > 0) break;
      continue;
    }

    paragraphLines.push(line.trim());
  }

  if (paragraphLines.length === 0) return "";

  let desc = paragraphLines.join(" ");
  // Strip markdown links, keeping text: [text](url) → text
  desc = desc.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  // Strip inline code backticks
  desc = desc.replace(/`([^`]+)`/g, "$1");
  // Strip bold/italic markers
  desc = desc.replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1");
  // Collapse whitespace
  desc = desc.replace(/\s+/g, " ").trim();

  if (desc.length > 160) {
    desc = desc.slice(0, 157).replace(/\s+\S*$/, "") + "...";
  }

  return desc;
}

/**
 * Build the absolute URL path (for markdown links) from a subdir and filename.
 * Astro's glob loader lowercases entry IDs, so slugs must be lowercase.
 * E.g. ("classes", "CompositeVoice.md") → "/api/classes/compositevoice"
 */
function buildAbsoluteUrl(subdir, filename) {
  const slug = filename.replace(/\.md$/, "").toLowerCase();
  if (subdir) {
    return `/api/${subdir}/${slug}`;
  }
  return `/api/${slug}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run() {
  // -----------------------------------------------------------------------
  // Pass 1: Read all files, build metadata + mapping
  // -----------------------------------------------------------------------

  const entries = await readdir(API_DIR, { withFileTypes: true });
  const mdFiles = entries.filter(
    (e) => !e.isDirectory() && (e.name.endsWith(".md") || e.name.endsWith(".mdx"))
  );

  /** @type {Map<string, { content: string, title: string, subdir: string|null, newFilename: string, cleanTitle: string, description: string, absoluteUrl: string }>} */
  const fileMap = new Map();

  // oldName → absoluteUrl mapping for cross-reference rewriting
  /** @type {Map<string, string>} */
  const linkMap = new Map();

  for (const entry of mdFiles) {
    const fullPath = join(API_DIR, entry.name);
    const content = await readFile(fullPath, "utf-8");
    const rawTitle = extractRawTitle(content);
    const title = rawTitle || entry.name.replace(/\.mdx?$/, "");

    const { subdir, newFilename, cleanTitle } = classifyFile(entry.name, title);
    const description = extractDescription(content);
    const absoluteUrl = buildAbsoluteUrl(subdir, newFilename);

    fileMap.set(entry.name, {
      content,
      title,
      subdir,
      newFilename,
      cleanTitle,
      description,
      absoluteUrl,
    });

    linkMap.set(entry.name, absoluteUrl);
  }

  // -----------------------------------------------------------------------
  // Compute alphabetical order within each subdirectory
  // -----------------------------------------------------------------------

  /** @type {Map<string, string[]>} */
  const subdirFiles = new Map();
  for (const [, info] of fileMap) {
    const key = info.subdir || "__root__";
    if (!subdirFiles.has(key)) subdirFiles.set(key, []);
    subdirFiles.get(key).push(info.cleanTitle);
  }
  // Sort each group alphabetically (case-insensitive)
  for (const [key, names] of subdirFiles) {
    names.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }

  // -----------------------------------------------------------------------
  // Category metadata (shared by Pass 2 index rewriting & index generation)
  // -----------------------------------------------------------------------

  const categoryMeta = {
    classes: {
      title: "Classes",
      description: "Concrete class implementations — providers, orchestrators, and core SDK components.",
    },
    "abstract-classes": {
      title: "Abstract Classes",
      description: "Base classes for building custom STT, LLM, and TTS providers.",
    },
    interfaces: {
      title: "Interfaces",
      description: "Configuration types, provider contracts, and event structures.",
    },
    types: {
      title: "Types",
      description: "Type aliases, union types, and utility types.",
    },
    functions: {
      title: "Functions",
      description: "Utility functions for audio processing, logging, and more.",
    },
    errors: {
      title: "Errors",
      description: "Error classes with machine-readable codes and recovery flags.",
    },
    enumerations: {
      title: "Enumerations",
      description: "Enum types used across the SDK.",
    },
  };

  // -----------------------------------------------------------------------
  // Pass 2: Rewrite cross-references, add frontmatter, move files
  // -----------------------------------------------------------------------

  // Create target subdirectories
  const subdirs = new Set();
  for (const [, info] of fileMap) {
    if (info.subdir) subdirs.add(info.subdir);
  }
  for (const subdir of subdirs) {
    await mkdir(join(API_DIR, subdir), { recursive: true });
  }

  for (const [oldName, info] of fileMap) {
    let { content } = info;

    // --- Rewrite cross-reference links ---
    // Matches patterns like:
    //   (Class.Name.md)       → (/api/classes/Name)
    //   (Class.Name.md#anchor) → (/api/classes/Name#anchor)
    //   (Interface.Name.md)   → (/api/interfaces/Name)
    //   etc.
    content = content.replace(
      /\(((Class|Interface|TypeAlias|Function|Enumeration)\.[A-Za-z0-9_]+\.md)(#[^)]+)?\)/g,
      (_match, filename, _prefix, anchor) => {
        const target = linkMap.get(filename);
        if (target) {
          return `(${target}${anchor || ""})`;
        }
        // Fallback: leave unchanged if we don't have a mapping
        return _match;
      }
    );

    // Also handle bare references without parens in markdown link syntax
    // e.g. [text](Class.Name.md) — already covered by the above regex

    // --- Strip existing frontmatter if present ---
    let body = content;
    if (body.startsWith("---")) {
      body = body.replace(/^---[\s\S]*?---\n*/, "");
    }

    // --- Remove the first H1 heading (layout renders its own) ---
    body = body.replace(/^#\s+.+\n+/, "");

    // --- Special handling for the entrypoint index page ---
    if (oldName === "index.md") {
      // Keep narrative content (Remarks, Examples, See) but replace the flat
      // export lists with a category overview linking to the category pages.
      const sectionHeadings = ["Enumerations", "Classes", "Interfaces", "Type Aliases", "Functions"];
      const firstExportSection = sectionHeadings.reduce((earliest, heading) => {
        const idx = body.indexOf(`## ${heading}\n`);
        if (idx !== -1 && (earliest === -1 || idx < earliest)) return idx;
        return earliest;
      }, -1);

      if (firstExportSection !== -1) {
        // Trim trailing whitespace from the narrative portion
        const narrative = body.slice(0, firstExportSection).trimEnd();

        // Build a category overview section
        const categoryLines = ["\n\n## Browse by category\n"];
        for (const [subdir, meta] of Object.entries(categoryMeta)) {
          let count = 0;
          for (const [, fi] of fileMap) {
            if (fi.subdir === subdir) count++;
          }
          if (count === 0) continue;
          categoryLines.push(
            `- [**${meta.title}**](/api/${subdir}) — ${meta.description} *(${count})*`
          );
        }
        categoryLines.push("");

        body = narrative + categoryLines.join("\n");
      }
    }

    // --- Compute order ---
    // The index page always gets order 0 so it appears first
    let order;
    if (oldName === "index.md") {
      order = 0;
    } else {
      const subdirKey = info.subdir || "__root__";
      const orderList = subdirFiles.get(subdirKey) || [];
      order = orderList.indexOf(info.cleanTitle) + 1;
    }

    // --- Build frontmatter ---
    const escapedTitle = info.cleanTitle.replace(/'/g, "''");
    const escapedDesc = info.description.replace(/'/g, "''");

    let frontmatter = `---\ntitle: '${escapedTitle}'`;
    if (escapedDesc) {
      frontmatter += `\ndescription: '${escapedDesc}'`;
    }
    frontmatter += `\norder: ${order}`;
    frontmatter += `\n---\n\n`;

    const finalContent = frontmatter + body;

    // --- Write to new location (lowercase filenames to match Astro's glob loader) ---
    const targetDir = info.subdir ? join(API_DIR, info.subdir) : API_DIR;
    const targetPath = join(targetDir, info.newFilename.toLowerCase());
    const sourcePath = join(API_DIR, oldName);

    await writeFile(targetPath, finalContent);

    // If the file was moved (different path), remove the original
    if (targetPath !== sourcePath) {
      await unlink(sourcePath).catch(() => {});
    }
  }

  // -----------------------------------------------------------------------
  // Generate category index pages
  // -----------------------------------------------------------------------

  for (const [subdir, meta] of Object.entries(categoryMeta)) {
    const items = [];
    for (const [, info] of fileMap) {
      if (info.subdir === subdir) {
        items.push({ title: info.cleanTitle, url: info.absoluteUrl, description: info.description });
      }
    }
    if (items.length === 0) continue;
    items.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));

    const lines = [
      `---`,
      `title: '${meta.title}'`,
      `description: '${meta.description}'`,
      `order: 0`,
      `---`,
      ``,
      meta.description,
      ``,
    ];

    for (const item of items) {
      lines.push(`- [**${item.title}**](${item.url})${item.description ? " — " + item.description : ""}`);
    }
    lines.push("");

    await writeFile(join(API_DIR, subdir, "index.md"), lines.join("\n"));
  }

  // -----------------------------------------------------------------------
  // Cleanup: remove empty directories left behind
  // -----------------------------------------------------------------------
  const remainingEntries = await readdir(API_DIR, { withFileTypes: true });
  for (const entry of remainingEntries) {
    if (entry.isDirectory() && entry.name !== "_media") {
      const dirPath = join(API_DIR, entry.name);
      const dirContents = await readdir(dirPath);
      if (dirContents.length === 0) {
        await rm(dirPath, { recursive: true });
      }
    }
  }

  // Summary
  const counts = {};
  for (const [, info] of fileMap) {
    const key = info.subdir || "root";
    counts[key] = (counts[key] || 0) + 1;
  }
  console.log("Processed typedoc output:");
  for (const [dir, count] of Object.entries(counts).sort()) {
    console.log(`  ${dir}: ${count} files`);
  }
}

await run();
