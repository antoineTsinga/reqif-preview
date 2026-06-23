import { XNode, attrsOf, childrenOf, isTextNode, tagOf, textOf } from "./xml-tree.js";
import type { XhtmlContent, XhtmlNode } from "./types.js";

/**
 * Converts a parsed XML node (children of a <THE-VALUE> belonging to an
 * AttributeValueXHTML, or a <DEFAULT-VALUE>) into our portable XhtmlNode
 * tree. Namespace prefixes are already stripped by the parser's
 * `removeNSPrefix` option, so "xhtml:div" arrives simply as "div".
 */
export function xNodeToXhtml(node: XNode): XhtmlNode {
  if (isTextNode(node)) {
    return { type: "text", value: textOf(node) };
  }
  const tag = (tagOf(node) ?? "").toLowerCase();
  const rawAttrs = attrsOf(node);
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawAttrs)) {
    attributes[k.toLowerCase()] = v;
  }
  return {
    type: "element",
    tag,
    attributes,
    children: childrenOf(node).map(xNodeToXhtml),
  };
}

export function xNodesToXhtmlContent(nodes: XNode[]): XhtmlContent {
  return { nodes: nodes.map(xNodeToXhtml) };
}
