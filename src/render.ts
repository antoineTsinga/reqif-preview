import { ReqIfIndex } from "./lookup.js";
import { toBase64 } from "./base64.js";
import { escapeHtml } from "./escape.js";
import { resolveAttribute, valueToPlainText } from "./attribute-lookup.js";
import { extractLifecycleInfo } from "./lifecycle.js";
import {
  buildAttributeRenderContext,
  collectHiddenDefinitionIds,
  renderCustomAttributes,
  type AttributeRenderContext,
  type CustomAttributeRenderer,
} from "./custom-render.js";
import {
  AttachmentLookup,
  collectReferencedPaths,
  renderXhtmlContent,
  xhtmlToPlainText,
} from "./sanitize.js";
import type {
  AttachmentResolver,
  AttributeDefinition,
  AttributeValue,
  ReqIfDocument,
  ReqIfPackage,
  SpecHierarchy,
  SpecObject,
  SpecType,
  Specification,
  XhtmlContent,
} from "./types.js";

export type { AttributeRenderContext, CustomAttributeRenderer };

export interface RenderLabels {
  noContent: string;
  untitled: string;
  idLabel: string;
  technicalDetails: string;
  headerTitle: string;
  headerSourceTool: string;
  headerExportedBy: string;
  headerCreationTime: string;
  headerComment: string;
  yes: string;
  no: string;
  createdByLabel: string;
  createdOnLabel: string;
  modifiedByLabel: string;
  modifiedOnLabel: string;
}

const DEFAULT_LABELS: RenderLabels = {
  noContent: "(vide)",
  untitled: "(sans titre)",
  idLabel: "ID",
  technicalDetails: "Détails techniques",
  headerTitle: "Titre",
  headerSourceTool: "Outil source",
  headerExportedBy: "Exporté par",
  headerCreationTime: "Date de création",
  headerComment: "Commentaire",
  yes: "Oui",
  no: "Non",
  createdByLabel: "Créé par",
  createdOnLabel: "Créé le",
  modifiedByLabel: "Modifié par",
  modifiedOnLabel: "Modifié le",
};

export interface RenderOptions {
  /** Inline a small default stylesheet. Default: true. */
  includeCss?: boolean;
  /** Override the package's own attachment resolver. */
  attachments?: AttachmentResolver;
  /** UI strings, for basic i18n. */
  labels?: Partial<RenderLabels>;
  /** Skip attributes that have no value at all. Default: true. */
  hideEmptyAttributes?: boolean;
  /** Render the technical attribute panel expanded by default. Default: false (hidden, toggle to reveal). */
  showTechnicalByDefault?: boolean;
  /** Max bytes read per attachment before it's left unresolved instead of inlined. Default: 5MB. */
  maxInlineBytes?: number;
  /** Locale used to format the created/modified dates. Default: "fr-FR". */
  dateLocale?: string;
  /** Inject custom content (using your own attribute(s)) before/after each object's main content. */
  customAttributeRenderers?: CustomAttributeRenderer[];
  /**
   * Restrict the main "content" area to these specific attributes (matched
   * by long name or identifier), rendered in this order — each according to
   * its own kind (XHTML sanitized, everything else as plain text). If
   * omitted, every XHTML attribute not otherwise surfaced (id/created/
   * modified) is shown, which isn't always what you want when an object
   * carries several unrelated rich-text fields.
   */
  contentAttributes?: string[];
  /**
   * Extra attributes to try, in order, as a title fallback when the object
   * has no LONG-NAME of its own (and neither does its SpecHierarchy node).
   * The first one with a non-empty value wins — handy for tools (DOORS...)
   * that put a meaningful label in a custom attribute (e.g. "ChapterName")
   * instead of the structural LONG-NAME field.
   */
  titleAttributes?: string[];
}

const DEFAULT_MAX_INLINE_BYTES = 5 * 1024 * 1024;

/** Renders every document found in a package (a .reqifz may contain several). */
export async function renderPackageToHtml(pkg: ReqIfPackage, options: RenderOptions = {}): Promise<string> {
  const attachments = options.attachments ?? pkg.attachments;
  const parts = await Promise.all(
    pkg.documents.map((doc) => renderDocumentToHtml(doc, attachments, { ...options, includeCss: false })),
  );
  const css = options.includeCss === false ? "" : `<style>${DEFAULT_CSS}</style>`;
  return `${css}<div class="reqif-preview">${parts.join("")}</div>`;
}

/** Renders a single ReqIfDocument (header + all its specifications) to HTML. */
export async function renderDocumentToHtml(
  doc: ReqIfDocument,
  attachments: AttachmentResolver,
  options: RenderOptions = {},
): Promise<string> {
  const labels: RenderLabels = { ...DEFAULT_LABELS, ...options.labels };
  const index = new ReqIfIndex(doc);
  const lookup = await buildAttachmentLookup(doc, attachments, options.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES);

  const header = renderHeader(doc, labels);
  const specs = doc.coreContent.specifications
    .map((spec) => renderSpecification(spec, index, lookup, labels, options))
    .join("");

  const css = options.includeCss === false ? "" : `<style>${DEFAULT_CSS}</style>`;
  return `${css}<div class="reqif-preview">${header}<div class="reqif-specs">${specs}</div></div>`;
}

/** Renders one Specification subtree (useful for lazy/virtualized UIs). */
export function renderSpecification(
  spec: Specification,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels = DEFAULT_LABELS,
  options: RenderOptions = {},
): string {
  const title = escapeHtml(spec.longName || labels.untitled);
  const nodes = spec.children.map((n) => renderHierarchyNode(n, index, attachments, labels, options)).join("");
  return `<section class="reqif-spec"><h2 class="reqif-spec-title">${title}</h2><div class="reqif-tree">${nodes}</div></section>`;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

export { escapeHtml } from "./escape.js";

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/** Formats an ISO date/datetime for display; falls back to the raw string if it can't be parsed. */
function formatDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" } as Intl.DateTimeFormatOptions).format(d);
  } catch {
    return iso;
  }
}

function renderHeader(doc: ReqIfDocument, labels: RenderLabels): string {
  const h = doc.header;
  const rows: Array<[string, string]> = (
    [
      [labels.headerTitle, h.title],
      [labels.headerSourceTool, h.sourceToolId],
      [labels.headerExportedBy, h.reqIfToolId],
      [labels.headerCreationTime, h.creationTime],
      [labels.headerComment, h.comment],
    ] as Array<[string, string | undefined]>
  ).filter((row): row is [string, string] => !!row[1]);
  if (rows.length === 0) return "";
  const items = rows
    .map(
      ([k, v]) =>
        `<div class="reqif-meta-row"><span class="reqif-meta-key">${k}</span><span class="reqif-meta-value">${escapeHtml(v)}</span></div>`,
    )
    .join("");
  return `<header class="reqif-header">${items}</header>`;
}

function renderHierarchyNode(
  node: SpecHierarchy,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels,
  options: RenderOptions,
): string {
  const obj = index.specObjects.get(node.objectRef);
  const body = obj
    ? renderSpecObjectBody(obj, index, attachments, labels, options)
    : `<p class="reqif-missing">${labels.noContent}</p>`;
  const title = escapeHtml(resolveTitle(obj, node, index, labels, options.titleAttributes));
  const childrenHtml = node.children.map((c) => renderHierarchyNode(c, index, attachments, labels, options)).join("");

  return (
    `<details class="reqif-node" open>` +
    `<summary class="reqif-node-title">${title}</summary>` +
    `<div class="reqif-node-body">${body}</div>` +
    (childrenHtml ? `<div class="reqif-node-children">${childrenHtml}</div>` : "") +
    `</details>`
  );
}

/**
 * Title resolution chain: the object's own LONG-NAME, then its hierarchy
 * node's LONG-NAME, then each of `titleAttributes` in order (first non-empty
 * value wins), then a generic "untitled" fallback.
 */
function resolveTitle(
  obj: SpecObject | undefined,
  node: SpecHierarchy,
  index: ReqIfIndex,
  labels: RenderLabels,
  titleAttributes: string[] | undefined,
): string {
  if (obj?.longName) return obj.longName;
  if (node.longName) return node.longName;
  if (obj) {
    for (const key of titleAttributes ?? []) {
      const { value } = resolveAttribute(obj, index, key);
      if (!value) continue;
      const text = valueToPlainText(value, index);
      if (text) return text;
    }
  }
  return labels.untitled;
}

function renderSpecObjectBody(
  obj: SpecObject,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels,
  options: RenderOptions,
): string {
  const specType = index.specTypes.get(obj.typeRef);
  const lifecycle = extractLifecycleInfo(obj, index);
  const dateLocale = options.dateLocale ?? "fr-FR";

  const simple = renderSimpleView(obj, specType, index, attachments, labels, options, lifecycle, dateLocale);
  const technical = renderTechnicalPanel(obj, specType, index, attachments, labels, options);
  return `<div class="reqif-simple">${simple}</div>${technical}`;
}

/** The "friendly" view: id, a clear created/modified line, custom slots, then the rich-text content. */
function renderSimpleView(
  obj: SpecObject,
  specType: SpecType | undefined,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels,
  options: RenderOptions,
  lifecycle: ReturnType<typeof extractLifecycleInfo>,
  dateLocale: string,
): string {
  const displayId = lifecycle.foreignId ?? obj.identifier;
  const idHtml = `<div class="reqif-id">${escapeHtml(labels.idLabel)}: <code>${escapeHtml(displayId)}</code></div>`;
  const metaHtml = renderLifecycleMeta(lifecycle, labels, dateLocale);

  const formatValue = (value: AttributeValue | undefined) =>
    value ? renderAttributeValue(value, index, attachments, labels) : "";
  const ctx = buildAttributeRenderContext(obj, specType, index, attachments, formatValue);
  const before = renderCustomAttributes(options.customAttributeRenderers, "before", ctx);
  const after = renderCustomAttributes(options.customAttributeRenderers, "after", ctx);

  const contentHtml = resolveContentHtml(obj, index, attachments, labels, lifecycle, options.contentAttributes);

  return (
    idHtml +
    metaHtml +
    before +
    (contentHtml || `<p class="reqif-empty">${escapeHtml(labels.noContent)}</p>`) +
    after
  );
}

/**
 * Resolves what goes in the main "content" area of an object:
 * - if `contentAttributes` is given, only those attributes are shown, in that
 *   order, each formatted according to its own kind (XHTML sanitized,
 *   everything else as plain escaped text) — lets a consumer pick exactly
 *   which field(s) matter instead of every XHTML attribute being dumped in;
 * - otherwise, the previous default: every XHTML attribute not already
 *   surfaced elsewhere (id/created/modified).
 */
function resolveContentHtml(
  obj: SpecObject,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels,
  lifecycle: ReturnType<typeof extractLifecycleInfo>,
  contentAttributes: string[] | undefined,
): string {
  if (contentAttributes) {
    const parts: string[] = [];
    for (const key of contentAttributes) {
      const { value } = resolveAttribute(obj, index, key);
      if (!value) continue;
      const html =
        value.kind === "XHTML"
          ? value.value
            ? renderXhtmlContent(value.value, { attachments })
            : ""
          : renderAttributeValue(value, index, attachments, labels);
      if (html) parts.push(`<div class="reqif-content">${html}</div>`);
    }
    return parts.join("");
  }

  const xhtmlValues = obj.values.filter(
    (v): v is AttributeValue & { kind: "XHTML"; value: XhtmlContent } =>
      v.kind === "XHTML" && !!v.value && !lifecycle.consumedDefinitionIds.has(v.definitionRef),
  );
  return xhtmlValues
    .map((v) => `<div class="reqif-content">${renderXhtmlContent(v.value, { attachments })}</div>`)
    .join("");
}

/** Renders a single, unambiguous "Créé par X · date — Modifié par Y · date" line. */
function renderLifecycleMeta(
  lifecycle: ReturnType<typeof extractLifecycleInfo>,
  labels: RenderLabels,
  dateLocale: string,
): string {
  const createdChip = lifecycleChip(
    lifecycle.createdBy,
    lifecycle.createdOn,
    labels.createdByLabel,
    labels.createdOnLabel,
    dateLocale,
  );

  const isSameAsCreated =
    lifecycle.modifiedBy === lifecycle.createdBy && lifecycle.modifiedOn === lifecycle.createdOn;
  const modifiedChip = isSameAsCreated
    ? undefined
    : lifecycleChip(
        lifecycle.modifiedBy,
        lifecycle.modifiedOn,
        labels.modifiedByLabel,
        labels.modifiedOnLabel,
        dateLocale,
      );

  const chips = [createdChip, modifiedChip].filter((c): c is string => !!c);
  if (chips.length === 0) return "";
  return `<div class="reqif-meta-strip">${chips.join("")}</div>`;
}

function lifecycleChip(
  by: string | undefined,
  on: string | undefined,
  byLabel: string,
  onLabel: string,
  dateLocale: string,
): string | undefined {
  if (!by && !on) return undefined;
  const role = by ? byLabel : onLabel;
  const bits = [`<span class="reqif-meta-role">${escapeHtml(role)}</span>`];
  if (by) bits.push(`<strong>${escapeHtml(by)}</strong>`);
  if (on) bits.push(`<time datetime="${escapeAttr(on)}">${escapeHtml(formatDate(on, dateLocale))}</time>`);
  return `<span class="reqif-meta-chip">${bits.join(" ")}</span>`;
}

/** The "technical" view: literally every attribute, in the SpecObjectType's declared order — hidden behind a toggle, never filtered. */
function renderTechnicalPanel(
  obj: SpecObject,
  specType: SpecType | undefined,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels,
  options: RenderOptions,
): string {
  const orderedDefs = specType ? specType.specAttributes : [];
  const byDefId = new Map(obj.values.map((v) => [v.definitionRef, v]));

  // Only an explicit `hideFromTechnical: true` on a custom renderer can hide
  // a row here — by default (including created/modified/foreignId, which
  // are also surfaced above) every attribute is shown, for full transparency.
  const hidden = collectHiddenDefinitionIds(options.customAttributeRenderers, obj, index);

  const seen = new Set<string>();
  const rows: string[] = [];
  for (const def of orderedDefs) {
    seen.add(def.identifier);
    if (hidden.has(def.identifier)) continue;
    const value = byDefId.get(def.identifier);
    const html = renderAttributeRow(def, value, index, attachments, labels, options);
    if (html) rows.push(html);
  }
  for (const value of obj.values) {
    if (seen.has(value.definitionRef) || hidden.has(value.definitionRef)) continue;
    const html = renderAttributeRow(undefined, value, index, attachments, labels, options);
    if (html) rows.push(html);
  }

  if (rows.length === 0) return "";
  const openAttr = options.showTechnicalByDefault ? " open" : "";
  return (
    `<details class="reqif-technical"${openAttr}>` +
    `<summary class="reqif-technical-toggle">${escapeHtml(labels.technicalDetails)}</summary>` +
    `<dl class="reqif-attrs">${rows.join("")}</dl>` +
    `</details>`
  );
}

function renderAttributeRow(
  def: AttributeDefinition | undefined,
  value: AttributeValue | undefined,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels,
  options: RenderOptions,
): string | undefined {
  const name = def?.longName ?? value?.definitionRef ?? "?";
  const html = value ? renderAttributeValue(value, index, attachments, labels) : "";
  if (!html && options.hideEmptyAttributes !== false) return undefined;
  return (
    `<div class="reqif-attr">` +
    `<dt class="reqif-attr-name">${escapeHtml(name)}</dt>` +
    `<dd class="reqif-attr-value">${html || `<span class="reqif-empty">${labels.noContent}</span>`}</dd>` +
    `</div>`
  );
}

function renderAttributeValue(
  value: AttributeValue,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels,
): string {
  switch (value.kind) {
    case "BOOLEAN":
      return value.value === undefined ? "" : value.value ? labels.yes : labels.no;
    case "DATE":
      return value.value ? escapeHtml(value.value) : "";
    case "INTEGER":
    case "REAL":
      return value.value === undefined ? "" : escapeHtml(String(value.value));
    case "STRING":
      return value.value ? escapeHtml(value.value) : "";
    case "ENUMERATION":
      return index.enumLabels(value.valueRefs).map(escapeHtml).join(", ");
    case "XHTML":
      return value.value ? renderXhtmlContent(value.value, { attachments }) : "";
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Attachment pre-resolution: walk every XHTML value once, fetch referenced
// bytes up front, and hand back a synchronous lookup the renderer can use.
// ---------------------------------------------------------------------------

async function buildAttachmentLookup(
  doc: ReqIfDocument,
  resolver: AttachmentResolver,
  maxInlineBytes: number,
): Promise<AttachmentLookup> {
  const paths = new Set<string>();
  for (const content of collectAllXhtmlContents(doc)) collectReferencedPaths(content, paths);

  const resolved = new Map<string, { href: string; mimeType?: string }>();
  await Promise.all(
    [...paths].map(async (path) => {
      const attachment = resolver.resolve(path);
      if (!attachment) return;
      if (attachment.size > maxInlineBytes) return; // too big to inline; left unresolved on purpose
      const bytes = await attachment.getBytes();
      const mimeType = attachment.mimeType ?? "application/octet-stream";
      resolved.set(path, { href: `data:${mimeType};base64,${toBase64(bytes)}`, mimeType });
    }),
  );

  return { get: (path: string) => resolved.get(path) };
}

function collectAllXhtmlContents(doc: ReqIfDocument): XhtmlContent[] {
  const out: XhtmlContent[] = [];
  const collectFromValues = (values: AttributeValue[]) => {
    for (const v of values) if (v.kind === "XHTML" && v.value) out.push(v.value);
  };
  for (const o of doc.coreContent.specObjects) collectFromValues(o.values);
  for (const s of doc.coreContent.specifications) collectFromValues(s.values);
  for (const r of doc.coreContent.specRelations) collectFromValues(r.values);
  for (const g of doc.coreContent.specRelationGroups) collectFromValues(g.values);
  for (const t of doc.coreContent.specTypes) {
    for (const def of t.specAttributes) {
      if (def.kind === "XHTML" && def.defaultValue) out.push(def.defaultValue);
    }
  }
  return out;
}

export { xhtmlToPlainText };

const DEFAULT_CSS = `
.reqif-preview { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; line-height: 1.5; }
.reqif-preview * { box-sizing: border-box; }
.reqif-header { border: 1px solid #e2e2e2; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; background: #fafafa; }
.reqif-meta-row { display: flex; gap: 8px; font-size: 13px; }
.reqif-meta-key { font-weight: 600; min-width: 110px; color: #555; }
.reqif-spec-title { font-size: 18px; margin: 0 0 8px; }
.reqif-spec { margin-bottom: 24px; }
.reqif-tree { border-left: 2px solid #eee; padding-left: 12px; }
.reqif-node { border: 1px solid #e8e8e8; border-radius: 6px; padding: 6px 10px; margin: 6px 0; background: #fff; }
.reqif-node-title { cursor: pointer; font-weight: 600; }
.reqif-node-body { margin-top: 8px; contain: layout; overflow: hidden; }
.reqif-node-children { margin-left: 14px; }
.reqif-attrs { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; }
.reqif-attr { display: contents; }
.reqif-attr-name { font-size: 12px; text-transform: uppercase; letter-spacing: .02em; color: #888; align-self: start; padding-top: 2px; }
.reqif-attr-value { margin: 0; font-size: 14px; }
.reqif-empty { color: #aaa; font-style: italic; }
.reqif-missing { color: #b00; font-style: italic; }
.reqif-attachment { display: inline-flex; align-items: center; gap: 4px; color: #0b62d6; text-decoration: none; }
.reqif-preview table { border-collapse: collapse; }
.reqif-preview td, .reqif-preview th { border: 1px solid #ddd; padding: 4px 8px; }
.reqif-simple { display: flex; flex-direction: column; gap: 8px; }
.reqif-id { font-size: 11px; color: #999; }
.reqif-id code { background: #f2f2f2; border-radius: 4px; padding: 1px 6px; color: #555; }
.reqif-content { font-size: 14px; }
.reqif-content p:first-child { margin-top: 0; }
.reqif-technical { margin-top: 10px; }
.reqif-technical-toggle {
  display: inline-block; cursor: pointer; list-style: none; user-select: none;
  font-size: 12px; color: #444; background: #f0f0f0; border: 1px solid #ddd;
  border-radius: 999px; padding: 3px 10px; width: fit-content;
}
.reqif-technical-toggle::-webkit-details-marker { display: none; }
.reqif-technical-toggle:hover { background: #e6e6e6; }
.reqif-technical[open] > .reqif-technical-toggle { background: #e0ebfb; border-color: #b6d0f5; }
.reqif-technical .reqif-attrs { margin-top: 10px; }
.reqif-meta-strip { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; }
.reqif-meta-chip { display: inline-flex; align-items: center; gap: 4px; background: #f5f5f5; border-radius: 6px; padding: 2px 8px; color: #444; }
.reqif-meta-role { color: #888; }
.reqif-meta-chip time { color: #666; }
.reqif-custom-attr { font-size: 14px; contain: layout; }
`;
