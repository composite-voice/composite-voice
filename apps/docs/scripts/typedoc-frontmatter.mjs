/**
 * Post-processes typedoc-plugin-markdown output to add YAML frontmatter
 * required by the Astro content collection schema (title is mandatory).
 *
 * Extracts the first H1 heading as the title, removes it from the body
 * (since the layout renders its own <h1>), and prepends frontmatter.
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API_DIR = new URL("../src/content/docs/api", import.meta.url).pathname;

async function processDir(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === "_media") continue;
      await processDir(fullPath);
    } else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) {
      let content = await readFile(fullPath, "utf-8");
      if (content.startsWith("---")) continue; // already has frontmatter

      // Extract title from first heading
      const titleMatch = content.match(/^#\s+(.+)$/m);
      let title = titleMatch
        ? titleMatch[1].trim()
        : entry.name.replace(/\.mdx?$/, "");

      // Strip markdown escaping from title for clean YAML
      title = title.replace(/\\([<>])/g, "$1");

      // Remove the first heading (layout provides it)
      if (titleMatch) {
        content = content.replace(/^#\s+.+\n+/, "");
      }

      // Use single-quoted YAML to avoid escape sequence issues
      const frontmatter = `---\ntitle: '${title.replace(/'/g, "''")}'\n---\n\n`;
      await writeFile(fullPath, frontmatter + content);
    }
  }
}

await processDir(API_DIR);
console.log("Added frontmatter to typedoc output");
