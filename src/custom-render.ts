import { resolveAttribute } from "./attribute-lookup.js";
import { ReqIfIndex } from "./lookup.js";
import type { AttachmentLookup } from "./sanitize.js";
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
  /** Looks up another attribute on this same object, by long name or identifier. */
  getValue(attributeNameOrId: string): AttributeValue | undefined;
  /** Looks up another attribute's definition on this same object, by long name or identifier. */
  getDefinition(attributeNameOrId: string): AttributeDefinition | undefined;
  /** Formats a value the same way the built-in technical panel would (enum labels resolved, XHTML sanitized, dates/booleans as-is). */
  formatValue(value: AttributeValue | undefined): string;
}

export interface CustomAttributeRenderer {
  /** The attribute to render — matched against AttributeDefinition.longName (case/spacing-insensitive) or .identifier. */
  attribute: string;
  /** Where to inject the output relative to the object's main rich-text content. Default: "before". */
  position?: "before" | "after";
  /**
   * Produce custom HTML for this attribute. Receives the already-resolved
   * value (`undefined` if this object doesn't carry that attribute) plus the
   * full render context, so you can pull in *other* attributes too.
   * Return `undefined`/`""` to render nothing for this object.
   *
   * The returned string is inserted as-is (not sanitized) since it's
   * developer-authored markup, not untrusted document content — escape any
   * raw attribute text yourself if you interpolate it (see `escapeHtml`).
   */
  render(value: AttributeValue | undefined, ctx: AttributeRenderContext): string | undefined;
  /**
   * Also hide this attribute's row from the technical-details panel, since
   * it's already shown via this custom renderer. Default: false — by
   * default the technical panel always lists every attribute, even ones
   * also surfaced elsewhere, for full transparency.
   */
  hideFromTechnical?: boolean;
}

export function buildAttributeRenderContext(
  specObject: SpecObject,
  specType: SpecType | undefined,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  formatValue: (value: AttributeValue | undefined) => string,
): AttributeRenderContext {
  return {
    specObject,
    specType,
    index,
    attachments,
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
): string {
  if (!renderers?.length) return "";
  const parts: string[] = [];
  for (const renderer of renderers) {
    if ((renderer.position ?? "before") !== position) continue;
    const { value } = resolveAttribute(ctx.specObject, ctx.index, renderer.attribute);
    let html: string | undefined;
    try {
      html = renderer.render(value, ctx);
    } catch {
      // A misbehaving consumer-supplied renderer must never break the whole preview.
      continue;
    }
    if (html) parts.push(`<div class="reqif-custom-attr">${html}</div>`);
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
