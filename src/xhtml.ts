import { XNode, attrsOf, childrenOf, isTextNode, tagOf, textOf } from "./xml-tree.js";
import type { XhtmlContent, XhtmlNode } from "./types.js";

/**
 * Converts a parsed XML node (children of a <THE-VALUE> belonging to an
 * AttributeValueXHTML, or a <DEFAULT-VALUE>) into our portable XhtmlNode
 * tree. Namespace prefixes are already stripped by the parser's
 * `removeNSPrefix` option, so "xhtml:div" arrives simply as "div".
 */
function shellOf(node: XNode): XhtmlNode {
  if (isTextNode(node)) {
    return { type: "text", value: textOf(node) };
  }
  const tag = (tagOf(node) ?? "").toLowerCase();
  const rawAttrs = attrsOf(node);
  const attributes: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawAttrs)) {
    attributes[k.toLowerCase()] = v;
  }
  return { type: "element", tag, attributes, children: [] };
}

export function xNodeToXhtml(node: XNode): XhtmlNode {
  const root = shellOf(node);
  if (root.type === "text") return root;

  // Built with an explicit stack for the same reason the render walk uses one:
  // a value nested deeply enough would otherwise overflow here, during
  // parsing, before anything could decide what to do with it. Children are
  // appended in document order; the stack only decides when each element is
  // expanded.
  const pending: { xml: XNode; target: typeof root }[] = [{ xml: node, target: root }];
  while (pending.length) {
    const { xml, target } = pending.pop() as { xml: XNode; target: typeof root };
    for (const child of childrenOf(xml)) {
      const built = shellOf(child);
      target.children.push(built);
      if (built.type === "element") pending.push({ xml: child, target: built });
    }
  }
  return root;
}

export function xNodesToXhtmlContent(nodes: XNode[]): XhtmlContent {
  return { nodes: nodes.map(xNodeToXhtml) };
}
