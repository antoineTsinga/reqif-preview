const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);

// Matches a tag while correctly skipping over `>` characters that appear
// inside quoted attribute values (e.g. <div title="a > b">).
const TAG_RE = /<(\/)?([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/)?>/g;

/**
 * A lightweight, dependency-free sanity check — not a full HTML parser. It
 * catches the most common, most damaging mistakes in hand-written snippets
 * (an unclosed tag, a stray extra closing tag, mismatched nesting), which is
 * exactly what's needed here: custom-renderer output is inserted as raw
 * HTML, so any imbalance silently breaks the structure of *everything*
 * rendered after it, not just the snippet itself.
 */
export function isBalancedHtml(html: string): boolean {
  const stack: string[] = [];
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(html))) {
    const [, closingSlash, tagName, selfClosing] = match;
    const lower = tagName.toLowerCase();
    if (VOID_TAGS.has(lower) || selfClosing) continue;
    if (closingSlash) {
      if (stack.length === 0 || stack[stack.length - 1] !== lower) return false;
      stack.pop();
    } else {
      stack.push(lower);
    }
  }
  return stack.length === 0;
}
