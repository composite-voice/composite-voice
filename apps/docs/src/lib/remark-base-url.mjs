/**
 * Remark plugin that prefixes internal markdown links with the docs base path.
 *
 * When Astro is configured with `base: '/docs'`, links in markdown like
 * `[NativeSTT](/guides/stt/native-stt)` need to become `/docs/guides/stt/native-stt`.
 * Astro does NOT do this automatically for markdown content links.
 *
 * This plugin rewrites all link nodes whose URL starts with `/` (internal links)
 * to prepend the base path. External links (http/https/mailto/#) are left alone.
 */

const base = '/docs';

function visit(node, type, fn) {
  if (node.type === type) fn(node);
  if (node.children) {
    for (const child of node.children) {
      visit(child, type, fn);
    }
  }
}

export function remarkBaseUrl() {
  return (tree) => {
    visit(tree, 'link', (node) => {
      if (
        typeof node.url === 'string' &&
        node.url.startsWith('/') &&
        !node.url.startsWith(`${base}/`) &&
        node.url !== base
      ) {
        node.url = `${base}${node.url}`;
      }
    });
  };
}
