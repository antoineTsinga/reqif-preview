import { ReqIfIndex } from "./lookup.js";
import { toBase64 } from "./base64.js";
import { escapeHtml } from "./escape.js";
import { resolveAttribute, valueToPlainText } from "./attribute-lookup.js";
import { extractLifecycleInfo } from "./lifecycle.js";
import { renderTabs } from "./tabs.js";
import { reportDegradation, type DegradationHandler } from "./diagnostics.js";
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
  AttributeValueXhtml,
  ReqIfDocument,
  ReqIfPackage,
  SpecHierarchy,
  SpecObject,
  SpecRelation,
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
  relationsLabel: string;
  relationFallbackType: string;
  relationUnresolved: string;
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
  relationsLabel: "Liens",
  relationFallbackType: "Relation",
  relationUnresolved: "(objet non trouvé)",
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
  /**
   * How to lay out multiple documents (a .reqifz package) or multiple
   * Specifications (within one document) relative to each other.
   * "stacked" (default): one after another, as before.
   * "tabs": a CSS-only tabbed switcher (no JavaScript) — only kicks in when
   * there's actually more than one document/specification; a lone one is
   * never wrapped in a pointless single tab.
   */
  layout?: "stacked" | "tabs";
  /**
   * Prefix each requirement's title with a Word-style chapter number
   * (1, 1.1, 1.1.1, 1.1.2, 1.2, 2, ...), restarting at 1 for each
   * Specification. Default: false.
   *
   * By default every node in the tree is numbered. Pass
   * `chapterNumberAttributes` alongside this to only number nodes that are
   * actually "chapters" (Word-style: headings get numbers, the body text
   * under them doesn't).
   */
  chapterNumbers?: boolean;
  /**
   * Restricts chapter numbering to nodes whose SpecObject carries a non-
   * empty value for one of these attributes (matched by long name or
   * identifier — e.g. `["ChapterName"]` or `["ReqIF.ChapterName"]`).
   * Siblings without a match are simply skipped when counting — like a
   * plain paragraph between two Word headings, they don't consume a number
   * and don't break the sequence. Their own children, if any, continue
   * numbering from the nearest numbered ancestor. Has no effect unless
   * `chapterNumbers` is also true; if omitted, every node counts (the
   * simpler, blunter default).
   */
  chapterNumberAttributes?: string[];
  /**
   * For objects that qualify as chapters (per `chapterNumberAttributes`), an
   * empty title or empty content is treated as intentional — a bare chapter
   * heading with nothing else under it directly is normal, not a data-
   * quality gap — so the usual "(sans titre)"/"(vide)" placeholders are
   * left out entirely for those objects specifically. Other objects
   * (regular requirements) keep showing the placeholders as before, since a
   * leaf requirement with no title/content usually *is* worth flagging.
   * Has no effect unless `chapterNumberAttributes` is also set. Default: false.
   *
   * This is really just a convenience shortcut for the chapter case — for
   * any other reason an object might legitimately have no title (e.g. a
   * plain paragraph/information object that's never meant to have one) or
   * no content (e.g. a pure heading), use `isTitleless`/`isContentless`
   * below instead, or alongside this.
   */
  suppressEmptyPlaceholdersForChapters?: boolean;
  /**
   * Decide, for any criterion of your own, whether a given object is
   * expected to have no title — e.g. because its SpecObjectType is a plain
   * "Paragraph"/"Information" type rather than a heading or requirement.
   * When this returns true, "(sans titre)" is left out for that object: an
   * empty title shows as empty, not flagged as missing data. Composes with
   * `suppressEmptyPlaceholdersForChapters` (either one suppressing is
   * enough). `index` is provided so you can inspect other attributes via
   * the exported `resolveAttribute`/`valueToPlainText` helpers if needed.
   */
  isTitleless?: (obj: SpecObject | undefined, specType: SpecType | undefined, index: ReqIfIndex) => boolean;
  /**
   * Same idea for the "(vide)" content placeholder — decide whether an
   * empty content area is expected for a given object (e.g. a pure heading
   * with nothing directly under it), rather than missing data worth
   * flagging. Composes with `suppressEmptyPlaceholdersForChapters`.
   */
  isContentless?: (obj: SpecObject, specType: SpecType | undefined, index: ReqIfIndex) => boolean;
  /**
   * Show each object's incoming/outgoing SpecRelations (traceability links
   * to other requirements), with a same-page anchor link when the related
   * object is rendered in the same output. Default: true — unlike the
   * author/date metadata, links to other requirements are usually content
   * worth keeping even in `readingMode`.
   */
  showRelations?: boolean;
  /**
   * Observe everything the renderer silently degrades — a missing attachment,
   * an unresolvable relation, a tag the allowlist strips, a custom renderer
   * that threw. Nothing about the output changes; this only makes those
   * decisions visible, which is otherwise impossible to diagnose. Note that
   * tag-level events can fire thousands of times on a large export: this is a
   * diagnostic channel, not a production log.
   */
  onDegradation?: DegradationHandler;
  /**
   * Display the simplified rendition of an XHTML value rather than the
   * original it stands in for (10.8.20 `theOriginalValue`). Default: false —
   * this renderer handles the full XHTML subset the spec allows, so it does
   * not have the interpretation deficiency `isSimplified` signals, and the
   * original is the more faithful thing to show. Set this to reproduce what
   * a limited downstream tool would see.
   */
  preferSimplifiedXhtml?: boolean;
  /**
   * Strip the metadata chrome (id badge, created/modified line, technical-
   * details panel) and switch headings to a flatter, document-like look —
   * for a clean reading view closer to a Word document, where only titles
   * and the actual requirement text remain. Content you explicitly asked
   * for via `customAttributeRenderers` still shows; only the *automatic*
   * metadata is hidden. Default: false.
   */
  readingMode?: boolean;
}

const DEFAULT_MAX_INLINE_BYTES = 5 * 1024 * 1024;

/** Renders every document found in a package (a .reqifz may contain several). */
export async function renderPackageToHtml(pkg: ReqIfPackage, options: RenderOptions = {}): Promise<string> {
  const attachments = options.attachments ?? pkg.attachments;
  // One index spanning every document in the package, so that a relation
  // pointing across .reqif boundaries resolves (see the ReqIfIndex ctor).
  const index = new ReqIfIndex(pkg.documents);
  const parts = await Promise.all(
    pkg.documents.map((doc) => renderDocumentToHtml(doc, attachments, { ...options, includeCss: false }, index)),
  );

  let body: string;
  if (options.layout === "tabs" && pkg.documents.length > 1) {
    const items = pkg.documents.map((doc, i) => ({
      label: doc.header.title || `${options.labels?.headerTitle ?? DEFAULT_LABELS.headerTitle} ${i + 1}`,
      html: parts[i],
    }));
    body = renderTabs(items);
  } else {
    body = parts.join("");
  }

  const css = options.includeCss === false ? "" : `<style>${DEFAULT_CSS}</style>`;
  const rootClass = options.readingMode ? "reqif-preview reqif-reading-mode" : "reqif-preview";
  return `${css}<div class="${rootClass}">${body}</div>`;
}

/**
 * Renders a single ReqIfDocument (header + all its specifications) to HTML.
 *
 * `sharedIndex` lets a caller supply an index built over several documents —
 * that is how `renderPackageToHtml` makes cross-document relations resolve.
 * Omit it and the document is indexed on its own, as before.
 */
export async function renderDocumentToHtml(
  doc: ReqIfDocument,
  attachments: AttachmentResolver,
  options: RenderOptions = {},
  sharedIndex?: ReqIfIndex,
): Promise<string> {
  const labels: RenderLabels = { ...DEFAULT_LABELS, ...options.labels };
  const index = sharedIndex ?? new ReqIfIndex(doc);
  const lookup = await createAttachmentLookup(
    doc,
    attachments,
    options.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES,
    options.onDegradation,
  );

  const header = options.readingMode ? "" : renderHeader(doc, labels);
  const specHtmls = doc.coreContent.specifications.map((spec) => renderSpecification(spec, index, lookup, labels, options));

  let specsHtml: string;
  if (options.layout === "tabs" && specHtmls.length > 1) {
    const items = doc.coreContent.specifications.map((spec, i) => ({
      label: spec.longName || labels.untitled,
      html: specHtmls[i],
    }));
    specsHtml = renderTabs(items);
  } else {
    specsHtml = specHtmls.join("");
  }

  const css = options.includeCss === false ? "" : `<style>${DEFAULT_CSS}</style>`;
  const rootClass = options.readingMode ? "reqif-preview reqif-reading-mode" : "reqif-preview";
  return `${css}<div class="${rootClass}">${header}<div class="reqif-specs">${specsHtml}</div></div>`;
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
  const nodes = renderHierarchyChildren(spec.children, index, attachments, labels, options, [], 1);
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
function formatDate(iso: string, locale: string, onDegradation?: DegradationHandler): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    reportDegradation(onDegradation, "unparsable-date", "Date shown verbatim: not a parsable date.", { value: iso });
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" } as Intl.DateTimeFormatOptions).format(d);
  } catch {
    reportDegradation(onDegradation, "invalid-locale", `Intl rejected the locale "${locale}"; date shown verbatim.`, {
      locale,
      value: iso,
    });
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

/**
 * Which of an XHTML value's two contents to render. A tool in the exchange
 * chain that could not interpret the original formatting stores a degraded
 * copy in `value` and preserves the real one in `originalValue` (10.8.20 §3).
 * We render the full XHTML subset, so the original is what the reader should
 * see; its mere presence is the signal that something was degraded.
 */
function displayXhtml(value: AttributeValueXhtml, options: RenderOptions): XhtmlContent | undefined {
  if (options.preferSimplifiedXhtml) return value.value;
  return value.originalValue ?? value.value;
}

/** Stable, sanitized anchor id for a SpecObject, used by relation links. */
function domId(identifier: string): string {
  return "reqif-obj-" + identifier.replace(/[^A-Za-z0-9_-]/g, "_");
}

/** Does this object qualify as a "chapter" for numbering purposes? */
function isChapterNode(obj: SpecObject | undefined, index: ReqIfIndex, attrs: string[]): boolean {
  if (!obj) return false;
  for (const key of attrs) {
    const { value } = resolveAttribute(obj, index, key);
    if (value && valueToPlainText(value, index)) return true;
  }
  return false;
}

/**
 * Whether an object is "a chapter" for the purpose of suppressing the
 * empty-title/empty-content placeholders — distinct from the numbering
 * qualification above, which defaults to "everything qualifies" when no
 * `chapterNumberAttributes` is configured. Suppression should only ever
 * kick in when the caller has *explicitly* told us which attribute marks a
 * chapter; otherwise every object in the document would silently lose its
 * placeholders.
 */
function isRealChapter(obj: SpecObject | undefined, index: ReqIfIndex, options: RenderOptions): boolean {
  if (!options.chapterNumberAttributes?.length) return false;
  return isChapterNode(obj, index, options.chapterNumberAttributes);
}

/**
 * Renders one set of siblings, handling the chapter-numbering counter for
 * this level: with `chapterNumberAttributes` set, only matching nodes
 * consume a number (others are skipped, like body paragraphs between Word
 * headings — they don't break the sequence, and their own children, if
 * any, keep numbering from the nearest numbered ancestor).
 */
function renderHierarchyChildren(
  nodes: SpecHierarchy[],
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels,
  options: RenderOptions,
  basePath: number[],
  depth: number,
): string {
  const chapterAttrs = options.chapterNumberAttributes;
  let counter = 0;
  return nodes
    .map((node) => {
      const obj = index.specObjects.get(node.objectRef);
      const qualifies = !chapterAttrs?.length || isChapterNode(obj, index, chapterAttrs);
      let displayPath: number[] | undefined;
      let childBasePath = basePath;
      if (options.chapterNumbers && qualifies) {
        counter += 1;
        displayPath = [...basePath, counter];
        childBasePath = displayPath;
      }
      return renderHierarchyNode(node, index, attachments, labels, options, displayPath, childBasePath, depth);
    })
    .join("");
}

function renderHierarchyNode(
  node: SpecHierarchy,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels,
  options: RenderOptions,
  displayPath: number[] | undefined,
  childBasePath: number[],
  depth: number,
): string {
  const obj = index.specObjects.get(node.objectRef);
  const specType = obj ? index.specTypes.get(obj.typeRef) : undefined;
  const isChapter = isRealChapter(obj, index, options);
  const chapterShortcut = !!options.suppressEmptyPlaceholdersForChapters && isChapter;
  const suppressTitle = chapterShortcut || !!options.isTitleless?.(obj, specType, index);
  const suppressContent = chapterShortcut || (!!obj && !!options.isContentless?.(obj, specType, index));

  if (!obj) {
    reportDegradation(
      options.onDegradation,
      "missing-spec-object",
      `Tree node "${node.identifier}" points at SpecObject "${node.objectRef}", which is not in the render.`,
      { specHierarchy: node.identifier, objectRef: node.objectRef },
    );
  }
  const body = obj
    ? renderSpecObjectBody(obj, index, attachments, labels, options, isChapter, suppressContent)
    : `<p class="reqif-missing">${labels.noContent}</p>`;

  const rawTitle = resolveTitle(obj, node, index, labels, options.titleAttributes, suppressTitle);
  const numberPrefix = displayPath ? displayPath.join(".") + " " : "";
  const titleText = numberPrefix ? (rawTitle ? `${numberPrefix}${rawTitle}` : numberPrefix.trim()) : rawTitle;

  const titleHtml = options.readingMode
    ? `<h${headingLevelFor(depth)} class="reqif-node-heading">${escapeHtml(titleText)}</h${headingLevelFor(depth)}>`
    : escapeHtml(titleText);

  const childrenHtml = renderHierarchyChildren(node.children, index, attachments, labels, options, childBasePath, depth + 1);
  const idAttr = obj ? ` id="${escapeAttr(domId(obj.identifier))}"` : "";

  return (
    `<details class="reqif-node" open${idAttr}>` +
    `<summary class="reqif-node-title">${titleHtml}</summary>` +
    `<div class="reqif-node-body">${body}</div>` +
    (childrenHtml ? `<div class="reqif-node-children">${childrenHtml}</div>` : "") +
    `</details>`
  );
}

/** h3 at the top level (the Specification title is already an h2), capped at h6. */
function headingLevelFor(depth: number): number {
  return Math.min(depth + 2, 6);
}

/**
 * Title resolution chain: the object's own LONG-NAME, then its hierarchy
 * node's LONG-NAME, then each of `titleAttributes` in order (first non-empty
 * value wins), then a generic "untitled" fallback — unless `suppressFallback`
 * is set (chapter shortcut and/or `isTitleless` said so), in which case an
 * empty title is left empty, on purpose.
 */
function resolveTitle(
  obj: SpecObject | undefined,
  node: SpecHierarchy,
  index: ReqIfIndex,
  labels: RenderLabels,
  titleAttributes: string[] | undefined,
  suppressFallback: boolean | undefined,
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
  return suppressFallback ? "" : labels.untitled;
}

function renderSpecObjectBody(
  obj: SpecObject,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels: RenderLabels,
  options: RenderOptions,
  isChapter: boolean,
  suppressContent: boolean,
): string {
  const specType = index.specTypes.get(obj.typeRef);
  const lifecycle = extractLifecycleInfo(obj, index);
  const dateLocale = options.dateLocale ?? "fr-FR";

  const simple = renderSimpleView(obj, specType, index, attachments, labels, options, lifecycle, dateLocale, isChapter, suppressContent);
  const technical = options.readingMode
    ? ""
    : renderTechnicalPanel(obj, specType, index, attachments, labels, options);
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
  isChapter: boolean,
  suppressContent: boolean,
): string {
  const displayId = lifecycle.foreignId ?? obj.identifier;
  const idHtml = options.readingMode
    ? ""
    : `<div class="reqif-id">${escapeHtml(labels.idLabel)}: <code>${escapeHtml(displayId)}</code></div>`;
  const metaHtml = options.readingMode ? "" : renderLifecycleMeta(lifecycle, labels, dateLocale, options.onDegradation);

  const formatValue = (value: AttributeValue | undefined) =>
    value ? renderAttributeValue(value, index, attachments, labels, options) : "";
  const ctx = buildAttributeRenderContext(obj, specType, index, attachments, formatValue, isChapter);
  const before = renderCustomAttributes(options.customAttributeRenderers, "before", ctx, options.onDegradation);
  const after = renderCustomAttributes(options.customAttributeRenderers, "after", ctx, options.onDegradation);

  const contentHtml = resolveContentHtml(obj, index, attachments, labels, lifecycle, options);
  const relationsHtml = options.showRelations === false ? "" : renderRelations(obj, index, labels, options.onDegradation);
  const emptyContentHtml = suppressContent ? "" : `<p class="reqif-empty">${escapeHtml(labels.noContent)}</p>`;

  return (
    idHtml +
    metaHtml +
    before +
    (contentHtml || emptyContentHtml) +
    after +
    relationsHtml
  );
}

/**
 * Lists an object's incoming/outgoing SpecRelations (traceability links).
 * Each related object becomes a same-page anchor link when it's rendered
 * somewhere in the same output (see `domId`); otherwise its title/id is
 * still shown, just not as a link.
 */
function renderRelations(
  obj: SpecObject,
  index: ReqIfIndex,
  labels: RenderLabels,
  onDegradation?: DegradationHandler,
): string {
  const outgoing = index.outgoingRelations.get(obj.identifier) ?? [];
  const incoming = index.incomingRelations.get(obj.identifier) ?? [];
  if (outgoing.length === 0 && incoming.length === 0) return "";

  const rows: string[] = [];
  for (const rel of outgoing)
    rows.push(renderRelationRow("\u2192", rel, index.specObjects.get(rel.targetRef), index, labels, onDegradation));
  for (const rel of incoming)
    rows.push(renderRelationRow("\u2190", rel, index.specObjects.get(rel.sourceRef), index, labels, onDegradation));

  return (
    `<div class="reqif-relations">` +
    `<div class="reqif-relations-label">${escapeHtml(labels.relationsLabel)}</div>` +
    rows.join("") +
    `</div>`
  );
}

function renderRelationRow(
  arrow: string,
  relation: SpecRelation,
  other: SpecObject | undefined,
  index: ReqIfIndex,
  labels: RenderLabels,
  onDegradation?: DegradationHandler,
): string {
  const typeName = index.specTypes.get(relation.typeRef)?.longName ?? labels.relationFallbackType;
  if (!other) {
    reportDegradation(
      onDegradation,
      "unresolved-reference",
      `Relation "${relation.identifier}" points at a SpecObject absent from the render; shown without a link.`,
      { relation: relation.identifier, sourceRef: relation.sourceRef, targetRef: relation.targetRef },
    );
  }
  const otherLabel = other?.longName || other?.identifier || labels.relationUnresolved;
  const target = other
    ? `<a class="reqif-relation-target" href="#${escapeAttr(domId(other.identifier))}">${escapeHtml(otherLabel)}</a>`
    : `<span class="reqif-relation-target reqif-relation-unresolved">${escapeHtml(otherLabel)}</span>`;
  return (
    `<div class="reqif-relation">` +
    `<span class="reqif-relation-arrow">${arrow}</span>` +
    `<span class="reqif-relation-type">${escapeHtml(typeName)}</span>` +
    target +
    `</div>`
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
  options: RenderOptions,
): string {
  const contentAttributes = options.contentAttributes;
  if (contentAttributes) {
    const parts: string[] = [];
    for (const key of contentAttributes) {
      const { value } = resolveAttribute(obj, index, key);
      if (!value) continue;
      let html: string;
      if (value.kind === "XHTML") {
        const content = displayXhtml(value, options);
        html = content ? renderXhtmlContent(content, { attachments, onDegradation: options.onDegradation }) : "";
      } else {
        html = renderAttributeValue(value, index, attachments, labels, options);
      }
      if (html) parts.push(`<div class="reqif-content">${html}</div>`);
    }
    return parts.join("");
  }

  const parts: string[] = [];
  for (const v of obj.values) {
    if (v.kind !== "XHTML") continue;
    if (lifecycle.consumedDefinitionIds.has(v.definitionRef)) continue;
    const content = displayXhtml(v, options);
    if (!content) continue;
    parts.push(`<div class="reqif-content">${renderXhtmlContent(content, { attachments, onDegradation: options.onDegradation })}</div>`);
  }
  return parts.join("");
}

/** Renders a single, unambiguous "Créé par X · date — Modifié par Y · date" line. */
function renderLifecycleMeta(
  lifecycle: ReturnType<typeof extractLifecycleInfo>,
  labels: RenderLabels,
  dateLocale: string,
  onDegradation?: DegradationHandler,
): string {
  const createdChip = lifecycleChip(
    lifecycle.createdBy,
    lifecycle.createdOn,
    labels.createdByLabel,
    labels.createdOnLabel,
    dateLocale,
    onDegradation,
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
        onDegradation,
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
  onDegradation?: DegradationHandler,
): string | undefined {
  if (!by && !on) return undefined;
  const role = by ? byLabel : onLabel;
  const bits = [`<span class="reqif-meta-role">${escapeHtml(role)}</span>`];
  if (by) bits.push(`<strong>${escapeHtml(by)}</strong>`);
  if (on) bits.push(`<time datetime="${escapeAttr(on)}">${escapeHtml(formatDate(on, dateLocale, onDegradation))}</time>`);
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
    reportDegradation(
      options.onDegradation,
      "orphan-attribute-value",
      `Value on "${obj.identifier}" references AttributeDefinition "${value.definitionRef}", absent from its declared SpecType. Shown with its raw id.`,
      { specObject: obj.identifier, definitionRef: value.definitionRef, specType: specType?.identifier },
    );
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
  const html = value ? renderAttributeValue(value, index, attachments, labels, options) : "";
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
  options: RenderOptions,
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
    case "XHTML": {
      const content = displayXhtml(value, options);
      return content ? renderXhtmlContent(content, { attachments, onDegradation: options.onDegradation }) : "";
    }
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Attachment pre-resolution: walk every XHTML value once, fetch referenced
// bytes up front, and hand back a synchronous lookup the renderer can use.
// ---------------------------------------------------------------------------

/**
 * Pre-resolves every attachment a document references into data: URIs, giving
 * back the synchronous lookup the render functions need.
 *
 * Exported because `renderSpecification` is synchronous — that is the point of
 * it, for virtualized UIs — and therefore cannot resolve attachments itself.
 * Without this, a caller driving `renderSpecification` directly could not
 * display a single image.
 */
export async function createAttachmentLookup(
  doc: ReqIfDocument,
  resolver: AttachmentResolver,
  maxInlineBytes: number = DEFAULT_MAX_INLINE_BYTES,
  onDegradation?: DegradationHandler,
): Promise<AttachmentLookup> {
  const paths = new Set<string>();
  for (const content of collectAllXhtmlContents(doc)) collectReferencedPaths(content, paths);

  const resolved = new Map<string, { href: string; mimeType?: string }>();
  await Promise.all(
    [...paths].map(async (path) => {
      const attachment = resolver.resolve(path);
      if (!attachment) {
        reportDegradation(onDegradation, "attachment-missing", `No attachment resolved for "${path}".`, { path });
        return;
      }
      if (attachment.size > maxInlineBytes) {
        // too big to inline; left unresolved on purpose
        reportDegradation(
          onDegradation,
          "attachment-too-large",
          `Attachment "${path}" (${attachment.size} bytes) exceeds maxInlineBytes (${maxInlineBytes}).`,
          { path, size: attachment.size, maxInlineBytes },
        );
        return;
      }
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
    for (const v of values) {
      if (v.kind !== "XHTML") continue;
      // Both contents, whichever ends up displayed: an image referenced only
      // by the original would otherwise never be resolved to a data: URI.
      if (v.value) out.push(v.value);
      if (v.originalValue) out.push(v.originalValue);
    }
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
.reqif-meta-chip { display: inline-flex; align-items: center; gap: 4px; background: #f5f5f5; border-radius: 6px; padding: 2px 8px; color: #444; white-space: nowrap; max-width: 100%; }
.reqif-meta-role { color: #888; }
.reqif-meta-chip time { color: #666; }
.reqif-custom-attr { font-size: 14px; contain: layout; }
.reqif-relations { margin-top: 10px; padding-top: 8px; border-top: 1px dashed #e8e8e8; display: flex; flex-direction: column; gap: 4px; }
.reqif-relations-label { font-size: 11px; text-transform: uppercase; letter-spacing: .02em; color: #999; }
.reqif-relation { display: flex; align-items: baseline; gap: 6px; font-size: 13px; }
.reqif-relation-arrow { color: #999; }
.reqif-relation-type { color: #666; font-style: italic; }
.reqif-relation-target { color: #0b62d6; text-decoration: none; }
.reqif-relation-target:hover { text-decoration: underline; }
.reqif-relation-unresolved { color: #aaa; font-style: italic; text-decoration: none; }

/* Tabs (CSS-only, see tabs.ts) */
.reqif-tab-input { position: absolute; opacity: 0; pointer-events: none; }
.reqif-tab-headers { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid #e2e2e2; margin-bottom: 16px; }
.reqif-tab-label { cursor: pointer; padding: 8px 14px; font-size: 14px; font-weight: 600; color: #666; border: 1px solid transparent; border-bottom: none; border-radius: 8px 8px 0 0; margin-bottom: -1px; }
.reqif-tab-label:hover { color: #0b62d6; }
.reqif-tab-panel { display: none; }

/* Reading mode: strip the "card list" look for something closer to a flowing Word document */
.reqif-reading-mode .reqif-node { border: none; border-radius: 0; padding: 0; margin: 0 0 18px; background: transparent; }
.reqif-reading-mode .reqif-tree { border-left: none; padding-left: 0; }
.reqif-reading-mode .reqif-node-children { margin-left: 22px; margin-top: 8px; }
.reqif-reading-mode .reqif-node-title { cursor: default; list-style: none; }
.reqif-reading-mode .reqif-node-title::-webkit-details-marker { display: none; }
.reqif-reading-mode .reqif-node-heading {
  margin: 0 0 6px; font-weight: 600; line-height: 1.3;
  /* Headings are nested inside each other's containers, so browsers' default
     em-based h3..h6 sizing would COMPOUND with depth (each level's em is
     relative to its own, already-shrunk, parent) and shrink illegibly fast.
     Fixed rem sizes (relative to the root, never to a nested ancestor) with
     a comfortable floor fix that: it gets gently smaller down to h6, then
     stays exactly that size for any further depth instead of continuing to shrink. */
  font-size: 1rem;
}
.reqif-reading-mode h3.reqif-node-heading { font-size: 1.3rem; }
.reqif-reading-mode h4.reqif-node-heading { font-size: 1.15rem; }
.reqif-reading-mode h5.reqif-node-heading { font-size: 1.05rem; }
.reqif-reading-mode h6.reqif-node-heading { font-size: 0.95rem; }
.reqif-reading-mode .reqif-node-body { overflow: visible; }
.reqif-reading-mode .reqif-content { line-height: 1.7; font-size: 15px; }
`;
