import { escapeAttr, escapeHtml } from "./escape.js";
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

/** Shared with custom-render.ts: one URL-scheme filter, not two. */
export function sanitizeHref(href: string | undefined, opts: XhtmlRenderOptions): string | undefined {
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

/**
 * Pushes a node list so it pops back in document order.
 *
 * Every traversal here uses an explicit stack rather than recursion. Rich text
 * pasted from a word processor nests deeply, and a recursive walk gives out at
 * a depth set by the engine's frame size and by how optimised the code already
 * is — not by anything the document declares. A ceiling that moves with the
 * state of the runtime can be neither predicted nor documented, so there is
 * none here.
 */
function pushReversed(stack: unknown[], nodes: XhtmlNode[]): void {
  for (let i = nodes.length - 1; i >= 0; i--) stack.push(nodes[i]);
}

/**
 * Walks the `<object>` fallback chain of 10.8.20 #2: an image (PNG) takes
 * priority, then a nested alternative `<object>`, then an attachment link,
 * then the alternative content. Descending the chain is a tail call, so a loop
 * replaces what used to be recursion.
 */
function resolveObject(
  node: XhtmlElementNode,
  opts: XhtmlRenderOptions,
): { html: string; children?: undefined } | { html?: undefined; children: XhtmlNode[] } {
  let current = node;
  for (;;) {
    const data = current.attributes["data"];
    const declaredType = current.attributes["type"];
    const resolved = data ? opts.attachments?.get(data) : undefined;
    const mime = resolved?.mimeType ?? declaredType;

    if (resolved && mime?.startsWith("image/")) {
      const width = current.attributes["width"];
      const height = current.attributes["height"];
      const w = width ? ` width="${escapeAttr(width)}"` : "";
      const h = height ? ` height="${escapeAttr(height)}"` : "";
      return { html: `<img src="${escapeAttr(resolved.href)}"${w}${h} alt="" loading="lazy" style="max-width:100%" />` };
    }

    const nestedObject = current.children.find(
      (c): c is XhtmlElementNode => c.type === "element" && c.tag === "object",
    );
    if (nestedObject) {
      current = nestedObject;
      continue;
    }

    if (resolved) {
      const label = baseName(data ?? resolved.href);
      return {
        html: `<a class="reqif-attachment" href="${escapeAttr(resolved.href)}" download="${escapeAttr(label)}">\uD83D\uDCCE ${escapeHtml(label)}</a>`,
      };
    }

    // Unresolved external object: fall back to whatever alt content was provided.
    return { children: current.children };
  }
}

/** The opening tag's attributes, allowlisted and escaped. */
function elementAttrs(node: XhtmlElementNode, opts: XhtmlRenderOptions): string {
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

  return attrParts.length ? " " + attrParts.join(" ") : "";
}

const VOID_TAGS = new Set(["br", "hr", "img", "col"]);

/** Work item: a node still to render, or markup already decided (a closing tag). */
type RenderStep = XhtmlNode | string;

function renderNodes(nodes: XhtmlNode[], opts: XhtmlRenderOptions): string {
  const out: string[] = [];
  const stack: RenderStep[] = [];
  pushReversed(stack, nodes);

  while (stack.length) {
    const step = stack.pop() as RenderStep;

    // A closing tag queued behind its element's children.
    if (typeof step === "string") {
      out.push(step);
      continue;
    }
    if (step.type === "text") {
      out.push(escapeHtml(step.value));
      continue;
    }

    if (step.tag === "object") {
      const resolvedObject = resolveObject(step, opts);
      if (resolvedObject.html !== undefined) out.push(resolvedObject.html);
      else pushReversed(stack, resolvedObject.children);
      continue;
    }

    if (DROP_ENTIRELY_TAGS.has(step.tag)) {
      reportDegradation(opts.onDegradation, "dropped-tag", `<${step.tag}> removed with its whole subtree.`, {
        tag: step.tag,
      });
      continue;
    }

    if (!ALLOWED_TAGS.has(step.tag)) {
      // Unknown/unsafe tag: drop the wrapper but keep rendering its content.
      reportDegradation(opts.onDegradation, "unwrapped-tag", `<${step.tag}> unwrapped; its children were kept.`, {
        tag: step.tag,
      });
      pushReversed(stack, step.children);
      continue;
    }

    const attrs = elementAttrs(step, opts);
    if (VOID_TAGS.has(step.tag)) {
      out.push(`<${step.tag}${attrs} />`);
      continue;
    }

    out.push(`<${step.tag}${attrs}>`);
    // The closing tag goes under the children, which pop first.
    stack.push(`</${step.tag}>`);
    pushReversed(stack, step.children);
  }

  return out.join("");
}

/** Renders a parsed XHTML fragment (an AttributeValueXHTML's content) to a safe HTML string. */
export function renderXhtmlContent(content: XhtmlContent, opts: XhtmlRenderOptions = {}): string {
  return renderNodes(content.nodes, opts);
}

/** Plain-text extraction (e.g. for tooltips, search indexing, CSV export). */
export function xhtmlToPlainText(content: XhtmlContent): string {
  const out: string[] = [];
  const stack: XhtmlNode[] = [];
  pushReversed(stack, content.nodes);
  while (stack.length) {
    const node = stack.pop() as XhtmlNode;
    if (node.type === "text") out.push(node.value);
    else pushReversed(stack, node.children);
  }
  return out.join("").replace(/\s+/g, " ").trim();
}

/** Walks every `<object data="...">` / `<img src="...">` reference in a fragment. */
export function collectReferencedPaths(content: XhtmlContent, out: Set<string> = new Set()): Set<string> {
  const stack: XhtmlNode[] = [];
  pushReversed(stack, content.nodes);
  while (stack.length) {
    const node = stack.pop() as XhtmlNode;
    if (node.type !== "element") continue;
    if (node.tag === "object" && node.attributes["data"]) out.add(node.attributes["data"]);
    if (node.tag === "img" && node.attributes["src"]) out.add(node.attributes["src"]);
    pushReversed(stack, node.children);
  }
  return out;
}
