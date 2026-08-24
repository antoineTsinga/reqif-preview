import { escapeHtml } from "./escape.js";
import { reportDegradation, type DegradationHandler } from "./diagnostics.js";
import type { XhtmlContent, XhtmlElementNode, XhtmlNode } from "./types.js";

/**
 * Tags ReqIF documents are allowed to contain per spec clause 10.8.20 (Text,
 * List, Hypertext, Edit, Presentation, Basic Tables, Object and Style
 * Attribute XHTML modules). Anything outside this allowlist (scripts,
 * iframes, forms, embeds, event-handler-bearing tags, ...) is dropped on
 * import — ReqIF content originates from a third-party file and is treated
 * as untrusted markup, even though the format itself doesn't permit it.
 */
const ALLOWED_TAGS = new Set([
  "div","p","span","br","hr",
  "h1","h2","h3","h4","h5","h6",
  "b","i","u","strong","em","sup","sub","small","big","tt",
  "ul","ol","li","dl","dt","dd",
  "a",
  "ins","del",
  "blockquote","pre","code","q","abbr","cite","kbd","samp","var","address",
  "table","caption","thead","tbody","tfoot","tr","td","th","colgroup","col",
  "img", // not in the official module list, but emitted by us for <object>
]);

/** Attributes allowed on specific tags, beyond the universal `style`/`title`. */
const TAG_ATTRS: Record<string, string[]> = {
  a: ["href"],
  img: ["src", "alt", "width", "height"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan"],
  ol: ["start"],
};

const ALLOWED_STYLE_PROPS = new Set(["text-decoration", "color"]);
const SAFE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|[a-zA-Z]+)$/;
const SAFE_TEXT_DECORATION = new Set(["underline", "line-through", "none"]);

/** Tags whose entire subtree must be discarded, not just unwrapped — their
 * "text content" is executable/meta content, not part of the requirement. */
const DROP_ENTIRELY_TAGS = new Set([
  "script","style","iframe","embed","form","input","button",
  "select","textarea","noscript","head","meta","link","title","svg","video","audio",
]);

export interface AttachmentLookup {
  /** Resolves a relative path (as seen in `data`/`src`) to a renderable URI + mime type. */
  get(path: string): { href: string; mimeType?: string } | undefined;
}

export interface XhtmlRenderOptions {
  attachments?: AttachmentLookup;
  /** Observes what the allowlist removes. See `diagnostics.ts`. */
  onDegradation?: DegradationHandler;
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

function sanitizeHref(href: string | undefined, opts: XhtmlRenderOptions): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (/^(javascript|vbscript|data):/i.test(trimmed)) {
    reportDegradation(opts.onDegradation, "dropped-href", "Link removed: blocked URL scheme.", {
      href: trimmed,
    });
    return undefined;
  }
  return trimmed;
}

function sanitizeStyle(style: string | undefined, opts: XhtmlRenderOptions): string | undefined {
  if (!style) return undefined;
  const kept: string[] = [];
  const drop = (prop: string, value: string, why: string) =>
    reportDegradation(opts.onDegradation, "dropped-style-declaration", why, { prop, value });
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx < 0) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim().toLowerCase();
    if (!ALLOWED_STYLE_PROPS.has(prop)) {
      drop(prop, value, `CSS property "${prop}" is not one of the two the spec allows.`);
      continue;
    }
    if (prop === "text-decoration" && !SAFE_TEXT_DECORATION.has(value)) {
      drop(prop, value, `Unsupported text-decoration value "${value}".`);
      continue;
    }
    if (prop === "color" && !SAFE_COLOR.test(value)) {
      drop(prop, value, `Unsupported color value "${value}".`);
      continue;
    }
    kept.push(`${prop}:${value}`);
  }
  return kept.length ? kept.join(";") : undefined;
}

function baseName(path: string): string {
  return path.split(/[/\\]/).pop() ?? path;
}

function renderChildren(nodes: XhtmlNode[], opts: XhtmlRenderOptions): string {
  return nodes.map((n) => renderNode(n, opts)).join("");
}

/**
 * Renders an `<object>` element following the fallback chain described in
 * 10.8.20 #2: an image (PNG) takes priority, then a nested alternative
 * `<object>`, then plain alternative text/markup.
 */
function renderObject(node: XhtmlElementNode, opts: XhtmlRenderOptions): string {
  const data = node.attributes["data"];
  const declaredType = node.attributes["type"];
  const resolved = data ? opts.attachments?.get(data) : undefined;
  const mime = resolved?.mimeType ?? declaredType;

  if (resolved && mime?.startsWith("image/")) {
    const width = node.attributes["width"];
    const height = node.attributes["height"];
    const w = width ? ` width="${escapeAttr(width)}"` : "";
    const h = height ? ` height="${escapeAttr(height)}"` : "";
    return `<img src="${escapeAttr(resolved.href)}"${w}${h} alt="" loading="lazy" style="max-width:100%" />`;
  }

  const nestedObject = node.children.find(
    (c): c is XhtmlElementNode => c.type === "element" && c.tag === "object",
  );
  if (nestedObject) return renderObject(nestedObject, opts);

  if (resolved) {
    const label = baseName(data ?? resolved.href);
    return `<a class="reqif-attachment" href="${escapeAttr(resolved.href)}" download="${escapeAttr(label)}">\uD83D\uDCCE ${escapeHtml(label)}</a>`;
  }

  // Unresolved external object: fall back to whatever alt content was provided.
  return renderChildren(node.children, opts);
}

function renderElement(node: XhtmlElementNode, opts: XhtmlRenderOptions): string {
  if (node.tag === "object") return renderObject(node, opts);
  if (DROP_ENTIRELY_TAGS.has(node.tag)) {
    reportDegradation(opts.onDegradation, "dropped-tag", `<${node.tag}> removed with its whole subtree.`, {
      tag: node.tag,
    });
    return "";
  }

  if (!ALLOWED_TAGS.has(node.tag)) {
    // Unknown/unsafe tag: drop the wrapper but keep rendering its content.
    reportDegradation(opts.onDegradation, "unwrapped-tag", `<${node.tag}> unwrapped; its children were kept.`, {
      tag: node.tag,
    });
    return renderChildren(node.children, opts);
  }

  const attrParts: string[] = [];
  const style = sanitizeStyle(node.attributes["style"], opts);
  if (style) attrParts.push(`style="${escapeAttr(style)}"`);
  if (node.attributes["title"]) attrParts.push(`title="${escapeAttr(node.attributes["title"])}"`);

  if (node.tag === "a") {
    const href = sanitizeHref(node.attributes["href"], opts);
    if (href) {
      attrParts.push(`href="${escapeAttr(href)}"`);
      attrParts.push('target="_blank" rel="noopener noreferrer"');
    }
  } else {
    for (const attr of TAG_ATTRS[node.tag] ?? []) {
      const v = node.attributes[attr];
      if (v) attrParts.push(`${attr}="${escapeAttr(v)}"`);
    }
  }

  const attrs = attrParts.length ? " " + attrParts.join(" ") : "";
  const VOID = node.tag === "br" || node.tag === "hr" || node.tag === "img" || node.tag === "col";
  if (VOID) return `<${node.tag}${attrs} />`;
  return `<${node.tag}${attrs}>${renderChildren(node.children, opts)}</${node.tag}>`;
}

function renderNode(node: XhtmlNode, opts: XhtmlRenderOptions): string {
  if (node.type === "text") return escapeHtml(node.value);
  return renderElement(node, opts);
}

/** Renders a parsed XHTML fragment (an AttributeValueXHTML's content) to a safe HTML string. */
export function renderXhtmlContent(content: XhtmlContent, opts: XhtmlRenderOptions = {}): string {
  return renderChildren(content.nodes, opts);
}

/** Plain-text extraction (e.g. for tooltips, search indexing, CSV export). */
export function xhtmlToPlainText(content: XhtmlContent): string {
  function collect(nodes: XhtmlNode[], out: string[]): void {
    for (const n of nodes) {
      if (n.type === "text") out.push(n.value);
      else collect(n.children, out);
    }
  }
  const out: string[] = [];
  collect(content.nodes, out);
  return out.join("").replace(/\s+/g, " ").trim();
}

/** Walks every `<object data="...">` / `<img src="...">` reference in a fragment. */
export function collectReferencedPaths(content: XhtmlContent, out: Set<string> = new Set()): Set<string> {
  function walk(nodes: XhtmlNode[]): void {
    for (const n of nodes) {
      if (n.type !== "element") continue;
      if (n.tag === "object" && n.attributes["data"]) out.add(n.attributes["data"]);
      if (n.tag === "img" && n.attributes["src"]) out.add(n.attributes["src"]);
      walk(n.children);
    }
  }
  walk(content.nodes);
  return out;
}
