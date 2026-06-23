/**
 * Thin navigation helpers over the "preserveOrder" tree shape produced by
 * fast-xml-parser. We use preserveOrder mode everywhere (not just for XHTML)
 * because ReqIF documents contain mixed content (text interleaved with
 * elements) inside attribute values, and losing sibling order there would
 * silently corrupt formatted requirement text.
 *
 * Shape recap: a node is `{ [tagName]: XNode[], ":@"?: Record<string,string> }`
 * or a leaf text node `{ "#text": string }`.
 */

export type XNode = Record<string, unknown>;

const ATTR_KEY = ":@";
const TEXT_KEY = "#text";

export function isTextNode(node: XNode): boolean {
  return TEXT_KEY in node;
}

export function textOf(node: XNode): string {
  const v = node[TEXT_KEY];
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/** Returns the element tag name of a node, or undefined for text nodes. */
export function tagOf(node: XNode): string | undefined {
  for (const key of Object.keys(node)) {
    if (key !== ATTR_KEY && key !== TEXT_KEY) return key;
  }
  return undefined;
}

export function attrsOf(node: XNode): Record<string, string> {
  const a = node[ATTR_KEY] as Record<string, string> | undefined;
  return a ?? {};
}

export function attrOf(node: XNode, name: string): string | undefined {
  return attrsOf(node)[name];
}

/** Direct children of an element node (empty for text nodes). */
export function childrenOf(node: XNode): XNode[] {
  const tag = tagOf(node);
  if (!tag) return [];
  const kids = node[tag];
  return Array.isArray(kids) ? (kids as XNode[]) : [];
}

/** Direct *element* children only — drops whitespace/text nodes between tags. */
export function elementsOf(node: XNode): XNode[] {
  return childrenOf(node).filter((c) => !isTextNode(c));
}

/** All direct child elements whose tag matches `tag`. */
export function findAll(node: XNode, tag: string): XNode[] {
  return childrenOf(node).filter((c) => tagOf(c) === tag);
}

/** First direct child element whose tag matches `tag`, if any. */
export function findFirst(node: XNode, tag: string): XNode | undefined {
  return childrenOf(node).find((c) => tagOf(c) === tag);
}

/**
 * Concatenated text content of all descendant text nodes — used for simple
 * elements that only ever contain text (e.g. <TITLE>foo</TITLE>) and for
 * *-REF elements (e.g. <SPEC-OBJECT-REF>id-123</SPEC-OBJECT-REF>).
 */
export function deepText(node: XNode): string {
  if (isTextNode(node)) return textOf(node);
  return childrenOf(node).map(deepText).join("");
}

/** Text of the first direct child matching `tag`, or undefined. */
export function textOfChild(node: XNode, tag: string): string | undefined {
  const child = findFirst(node, tag);
  return child ? deepText(child) : undefined;
}

/**
 * Reads a single reference id out of a wrapper element, e.g.
 *   <TYPE><SPEC-OBJECT-TYPE-REF>foo</SPEC-OBJECT-TYPE-REF></TYPE>
 * `wrapperTag` is "TYPE", the *-REF child can be any tag (its name is
 * predictable but redundant with the wrapper, so we just take whichever
 * single element child is present).
 */
export function readRef(node: XNode, wrapperTag: string): string | undefined {
  const wrapper = findFirst(node, wrapperTag);
  if (!wrapper) return undefined;
  const refNode = childrenOf(wrapper).find((c) => !isTextNode(c));
  return refNode ? deepText(refNode).trim() : undefined;
}

/** Reads every reference id out of a wrapper that can hold multiple *-REF children. */
export function readRefs(node: XNode, wrapperTag: string): string[] {
  const wrapper = findFirst(node, wrapperTag);
  if (!wrapper) return [];
  return childrenOf(wrapper)
    .filter((c) => !isTextNode(c))
    .map((c) => deepText(c).trim());
}

export function parseBool(v: string | undefined): boolean | undefined {
  if (v === undefined) return undefined;
  return v === "true" || v === "1";
}

export function parseNum(v: string | undefined): number | undefined {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}
