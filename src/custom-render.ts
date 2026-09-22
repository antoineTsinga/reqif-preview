import { resolveAttribute } from "./attribute-lookup.js";
import { escapeAttr, escapeHtml } from "./escape.js";
import { isBalancedHtml } from "./html-balance.js";
import { ReqIfIndex } from "./lookup.js";
import { reportDegradation, type DegradationHandler } from "./diagnostics.js";
import { sanitizeHref, type AttachmentLookup } from "./sanitize.js";
import type { AttributeDefinition, AttributeValue, SpecObject, SpecType } from "./types.js";

export interface AttributeRenderContext {
  /** The SpecObject currently being rendered. */
  specObject: SpecObject;
  /** Its SpecObjectType, if resolvable. */
  specType: SpecType | undefined;
  /** Full cross-reference index for the document (enum labels, other types, ...). */
  index: ReqIfIndex;
  /** Resolved attachment lookup (data: URIs), in case your renderer needs an image too. */
  attachments: AttachmentLookup;
  /** Whether this object qualifies as a "chapter" (per `RenderOptions.chapterNumberAttributes`) — handy for a custom renderer to show its own placeholder for an intentionally empty chapter, distinct from a regular requirement that's actually missing data. */
  isChapter: boolean;
  /** Looks up another attribute on this same object, by long name or identifier. */
  getValue(attributeNameOrId: string): AttributeValue | undefined;
  /** Looks up another attribute's definition on this same object, by long name or identifier. */
  getDefinition(attributeNameOrId: string): AttributeDefinition | undefined;
  /** Formats a value the same way the built-in technical panel would (enum labels resolved, XHTML sanitized, dates/booleans as-is). */
  formatValue(value: AttributeValue | undefined): string;
}

/**
 * What a custom renderer builds. A bare string is *text*, and is escaped.
 *
 * The point of the shape is that the dangerous case has to be named. A renderer
 * exists to display a value that came out of a third-party file, so
 * interpolating document content is the normal thing to do here — and with a
 * string-returning API the normal thing was also the injectable thing, with no
 * signal anywhere. Escaping is now the default and raw markup is opt-in.
 */
export type RenderNode = string | RenderElement | RenderRawHtml;

export interface RenderElement {
  /** Lowercased and checked against the allowlist; anything else is unwrapped, keeping its children. */
  tag: string;
  /** `class` `id` `title` `lang` `dir`, plus `href`/`src` through the URL-scheme filter. Values are escaped. */
  attrs?: Record<string, string>;
  children?: RenderNode[];
}

/**
 * The escape hatch, named so the risk is visible where it is taken. Its
 * content is inserted verbatim — escape anything that came from the document
 * yourself, with `escapeHtml` for text and `escapeAttr` for attribute values.
 */
export interface RenderRawHtml {
  dangerouslyRawHtml: string;
}

/**
 * A bare string is deliberately not accepted at the top level: under the old
 * API it meant "raw HTML", so allowing it would silently flip the meaning of
 * every existing renderer. Wrap text in an array — `["CRS-001"]` — to say text,
 * or in `dangerouslyRawHtml` to say markup.
 */
export type RenderOutput = RenderElement | RenderRawHtml | RenderNode[] | undefined;

export interface CustomAttributeRenderer {
  /** The attribute to render — matched against AttributeDefinition.longName (case/spacing-insensitive) or .identifier. */
  attribute: string;
  /** Where to inject the output relative to the object's main rich-text content. Default: "before". */
  position?: "before" | "after";
  /**
   * Produce custom content for this attribute. Receives the already-resolved
   * value (`undefined` if this object doesn't carry that attribute) plus the
   * full render context, so you can pull in *other* attributes too.
   * Return `undefined` to render nothing for this object.
   */
  render(value: AttributeValue | undefined, ctx: AttributeRenderContext): RenderOutput;
  /**
   * Also hide this attribute's row from the technical-details panel, since
   * it's already shown via this custom renderer. Default: false — by
   * default the technical panel always lists every attribute, even ones
   * also surfaced elsewhere, for full transparency.
   */
  hideFromTechnical?: boolean;
}

/**
 * Tags a renderer may emit. Small on purpose: this is interface chrome you are
 * building, not document content, so it does not need the surface the XHTML
 * sanitizer allows.
 */
const ALLOWED_TAGS = new Set([
  "span", "div", "p", "a", "code", "strong", "b", "em", "i", "small", "br", "img", "ul", "ol", "li",
]);

const VOID_TAGS = new Set(["br", "img"]);

/** `style` is absent on purpose — presentation belongs in your own stylesheet. */
const ALLOWED_ATTRS = new Set(["class", "id", "title", "lang", "dir"]);

/** Routed through the same URL-scheme filter as document content. */
const URL_ATTRS = new Set(["href", "src"]);

function serializeAttrs(
  el: RenderElement,
  tag: string,
  renderer: CustomAttributeRenderer,
  ctx: AttributeRenderContext,
  onDegradation?: DegradationHandler,
): string {
  const parts: string[] = [];
  for (const [rawName, rawValue] of Object.entries(el.attrs ?? {})) {
    const name = rawName.toLowerCase();
    if (rawValue == null) continue;
    const value = String(rawValue);

    if (URL_ATTRS.has(name)) {
      const safe = sanitizeHref(value, { onDegradation });
      if (safe) parts.push(`${name}="${escapeAttr(safe)}"`);
      continue;
    }
    if (!ALLOWED_ATTRS.has(name)) {
      reportDegradation(
        onDegradation,
        "custom-renderer-dropped-attr",
        `Attribute "${name}" is not allowed on a custom-renderer node; it was dropped.`,
        { attribute: renderer.attribute, specObject: ctx.specObject.identifier, attr: name, tag },
      );
      continue;
    }
    parts.push(`${name}="${escapeAttr(value)}"`);
  }
  return parts.length ? " " + parts.join(" ") : "";
}

/** Turns one node into HTML. Text is escaped; only `dangerouslyRawHtml` is not. */
function serializeNode(
  node: RenderNode,
  renderer: CustomAttributeRenderer,
  ctx: AttributeRenderContext,
  onDegradation?: DegradationHandler,
): string {
  if (typeof node === "string") return escapeHtml(node);

  if ("dangerouslyRawHtml" in node) {
    const html = node.dangerouslyRawHtml;
    if (!html) return "";
    // Unbalanced markup here would corrupt the nesting of *everything* rendered
    // after it — the content, the technical panel, even sibling tree nodes. The
    // structured nodes above cannot go wrong this way; this path can.
    if (!isBalancedHtml(html)) {
      if (typeof console !== "undefined") {
        console.warn(
          `[reqif-preview] customAttributeRenderers: the dangerouslyRawHtml returned for attribute "${renderer.attribute}" has unbalanced tags (an unclosed or a stray extra tag). ` +
            `It was escaped as plain text instead of being inserted as-is, to avoid breaking the layout of everything rendered after it. Offending output:`,
          html,
        );
      }
      reportDegradation(
        onDegradation,
        "custom-renderer-unbalanced-html",
        `The HTML returned for attribute "${renderer.attribute}" has unbalanced tags; it was escaped as plain text.`,
        { attribute: renderer.attribute, specObject: ctx.specObject.identifier, html },
      );
      return escapeHtml(html);
    }
    return html;
  }

  const tag = String(node.tag ?? "").toLowerCase();
  const children = (node.children ?? [])
    .map((child) => serializeNode(child, renderer, ctx, onDegradation))
    .join("");

  if (!ALLOWED_TAGS.has(tag)) {
    // Same rule as the document sanitizer: drop the wrapper, keep the text it
    // surrounded. Unknown formatting must not carry content away with it.
    reportDegradation(
      onDegradation,
      "unwrapped-tag",
      `Tag <${tag || "?"}> is not allowed in a custom renderer; it was unwrapped and its children kept.`,
      { tag: tag || "?", attribute: renderer.attribute, specObject: ctx.specObject.identifier },
    );
    return children;
  }

  const attrs = serializeAttrs(node, tag, renderer, ctx, onDegradation);
  return VOID_TAGS.has(tag) ? `<${tag}${attrs} />` : `<${tag}${attrs}>${children}</${tag}>`;
}

export function buildAttributeRenderContext(
  specObject: SpecObject,
  specType: SpecType | undefined,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  formatValue: (value: AttributeValue | undefined) => string,
  isChapter: boolean,
): AttributeRenderContext {
  return {
    specObject,
    specType,
    index,
    attachments,
    isChapter,
    getValue: (key) => resolveAttribute(specObject, index, key).value,
    getDefinition: (key) => resolveAttribute(specObject, index, key).definition,
    formatValue,
  };
}

/** Runs every renderer registered for `position`, concatenating their non-empty output. */
export function renderCustomAttributes(
  renderers: CustomAttributeRenderer[] | undefined,
  position: "before" | "after",
  ctx: AttributeRenderContext,
  onDegradation?: DegradationHandler,
): string {
  if (!renderers?.length) return "";
  const parts: string[] = [];
  for (const renderer of renderers) {
    if ((renderer.position ?? "before") !== position) continue;
    const { value } = resolveAttribute(ctx.specObject, ctx.index, renderer.attribute);

    let out: RenderOutput;
    try {
      out = renderer.render(value, ctx);
    } catch (error) {
      // A misbehaving consumer-supplied renderer must never break the whole preview.
      reportDegradation(
        onDegradation,
        "custom-renderer-threw",
        `The renderer for attribute "${renderer.attribute}" threw; it was skipped for this object.`,
        { attribute: renderer.attribute, specObject: ctx.specObject.identifier, error: String(error) },
      );
      continue;
    }
    if (out == null) continue;

    let html: string;
    if (typeof out === "string") {
      // Only reachable from JavaScript — TypeScript rejects it. Under the old
      // API this string was inserted as markup, so escaping it is the safe
      // reading, and the event names the migration.
      if (!out) continue;
      reportDegradation(
        onDegradation,
        "custom-renderer-raw-string",
        `The renderer for attribute "${renderer.attribute}" returned a string; it was escaped as text. Return ["text"] for text, or { dangerouslyRawHtml } for markup.`,
        { attribute: renderer.attribute, specObject: ctx.specObject.identifier, value: out },
      );
      html = escapeHtml(out);
    } else if (Array.isArray(out)) {
      html = out.map((n) => serializeNode(n, renderer, ctx, onDegradation)).join("");
    } else {
      html = serializeNode(out, renderer, ctx, onDegradation);
    }

    if (!html) continue;
    parts.push(`<div class="reqif-custom-attr">${html}</div>`);
  }
  return parts.join("");
}

/** Identifiers of attributes that a CustomAttributeRenderer wants hidden from the technical panel. */
export function collectHiddenDefinitionIds(
  renderers: CustomAttributeRenderer[] | undefined,
  obj: SpecObject,
  index: ReqIfIndex,
): Set<string> {
  const hidden = new Set<string>();
  for (const renderer of renderers ?? []) {
    if (!renderer.hideFromTechnical) continue; // default false: never hide
    const { definition } = resolveAttribute(obj, index, renderer.attribute);
    if (definition) hidden.add(definition.identifier);
  }
  return hidden;
}
