import { describe, expect, it } from "vitest";
import { loadReqIfPackage, renderPackageToHtml, renderXhtmlContent, xhtmlToPlainText, ReqIfParseError } from "../src/index.js";
import { collectReferencedPaths } from "../src/sanitize.js";
import type { XhtmlContent, XhtmlNode } from "../src/types.js";
import { SYNTHETIC_REQIF, TINY_PNG_BASE64 } from "./fixtures.js";

/**
 * Deep enough that every traversal overflowed while they still recursed, and
 * still under `maxNestedTags`, so what is tested is the walk and not the
 * parser's own guard.
 */
const DEEP = 8_000;

/** The markup without the inlined stylesheet, whose selectors mention the same class names. */
function body(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/g, "");
}

/**
 * A chain of `depth` nested divs around `leaf`, built here rather than parsed:
 * a traversal that only ever runs behind a deep parse cannot be told apart
 * from the parse that precedes it.
 */
function deepContent(depth: number, leaf: XhtmlNode): XhtmlContent {
  let children: XhtmlNode[] = [leaf];
  for (let i = 0; i < depth; i++) {
    children = [{ type: "element", tag: "div", attributes: {}, children }];
  }
  return { nodes: children };
}

const TEXT_LEAF: XhtmlNode = { type: "text", value: "deep" };
const IMAGE_LEAF: XhtmlNode = {
  type: "element",
  tag: "object",
  attributes: { data: "deep.png", type: "image/png" },
  children: [],
};

/** The fixture with its rich-text value replaced by `depth` nested divs. */
function withXhtmlDepth(depth: number): string {
  const start = SYNTHETIC_REQIF.indexOf("<THE-VALUE>", SYNTHETIC_REQIF.indexOf("ATTRIBUTE-VALUE-XHTML"));
  const end = SYNTHETIC_REQIF.indexOf("</THE-VALUE>", start);
  const open = "<xhtml:div>".repeat(depth);
  const close = "</xhtml:div>".repeat(depth);
  return SYNTHETIC_REQIF.slice(0, start) + "<THE-VALUE>" + open + "deep" + close + SYNTHETIC_REQIF.slice(end);
}

describe("deeply nested rich text", () => {
  it("parses and renders a document nested far past what a recursive walk survived", async () => {
    const pkg = await loadReqIfPackage(withXhtmlDepth(DEEP));
    const html = await renderPackageToHtml(pkg);

    expect(body(html)).toContain("deep");
  });

  it("renders a deep fragment on its own, with no parsing in front of it", () => {
    const html = renderXhtmlContent(deepContent(DEEP, TEXT_LEAF));

    expect(html).toContain("deep");
    // One opening and one closing tag per level: the walk did not stop early.
    expect(html.split("<div>").length - 1).toBe(DEEP);
    expect(html.split("</div>").length - 1).toBe(DEEP);
  });

  it("resolves an attachment referenced at the bottom of the chain", () => {
    const html = renderXhtmlContent(deepContent(DEEP, IMAGE_LEAF), {
      attachments: { get: () => ({ href: `data:image/png;base64,${TINY_PNG_BASE64}`, mimeType: "image/png" }) },
    });

    expect(html).toContain(`<img src="data:image/png;base64,${TINY_PNG_BASE64}"`);
  });

  it("extracts the deep text and collects the deep reference", () => {
    expect(xhtmlToPlainText(deepContent(DEEP, TEXT_LEAF))).toBe("deep");
    expect([...collectReferencedPaths(deepContent(DEEP, IMAGE_LEAF))]).toEqual(["deep.png"]);
  });

  it("still refuses what maxNestedTags refuses, with the documented error", async () => {
    // Iterative walks remove the native ceiling; they must not remove the
    // configured one, nor change the type it throws.
    await expect(loadReqIfPackage(withXhtmlDepth(DEEP), { maxNestedTags: 100 })).rejects.toBeInstanceOf(
      ReqIfParseError,
    );
  });
});
