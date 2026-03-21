/**
 * Remark plugin that styles "CompositeVoice" in prose with the brand accent.
 *
 * Replaces bare "CompositeVoice" in text nodes with an HTML span that matches
 * the BrandName component: "Composite" inherits color, "Voice" gets primary-600.
 *
 * Skips:
 * - Inline code (`CompositeVoice`)
 * - Fenced code blocks
 * - Compound identifiers (CompositeVoiceConfig, CompositeVoiceError, etc.)
 */

const BRAND_HTML = 'Composite<span class="text-primary-600">Voice</span>';

/** Node types whose children should never be transformed. */
const SKIP_PARENTS = new Set(['code', 'inlineCode']);

function visitText(node, parent, fn) {
  if (SKIP_PARENTS.has(node.type)) return;
  if (node.type === 'text' && parent && !SKIP_PARENTS.has(parent.type)) {
    fn(node, parent);
  }
  if (node.children) {
    for (const child of node.children) {
      visitText(child, node, fn);
    }
  }
}

export function remarkBrandName() {
  return (tree) => {
    visitText(tree, null, (node, parent) => {
      // Match "CompositeVoice" NOT followed by a word char (avoids CompositeVoiceConfig etc.)
      const regex = /CompositeVoice(?![A-Za-z])/g;
      if (!regex.test(node.value)) return;

      // Split the text node around each match
      const parts = [];
      let lastIndex = 0;
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(node.value)) !== null) {
        if (match.index > lastIndex) {
          parts.push({ type: 'text', value: node.value.slice(lastIndex, match.index) });
        }
        parts.push({ type: 'html', value: BRAND_HTML });
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < node.value.length) {
        parts.push({ type: 'text', value: node.value.slice(lastIndex) });
      }

      // Replace this text node with the split parts in the parent's children
      if (parts.length > 1 && parent.children) {
        const idx = parent.children.indexOf(node);
        if (idx !== -1) {
          parent.children.splice(idx, 1, ...parts);
        }
      }
    });
  };
}
