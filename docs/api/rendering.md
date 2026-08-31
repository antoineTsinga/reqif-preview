# HTML rendering

<!--@include: ../_conventions.md-->

Four functions, from the highest level down to the finest. All of them produce HTML meant
for `innerHTML`, never a complete document.

## `renderPackageToHtml`

```ts
function renderPackageToHtml(pkg: ReqIfPackage, options?: RenderOptions): Promise<string>;
```

**The normal entry point.** Renders every document in the package, in one block, with its
stylesheet.

```ts
const html = await renderPackageToHtml(pkg, { layout: "tabs" });
document.getElementById("preview").innerHTML = html;
```

Two things it does that no lower-level function does for you:

1. **a single index over every document** (`new ReqIfIndex(pkg.documents)`) — that is what
   makes `GLOBAL-REF` relations from one `.reqif` to another resolve;
2. **one shared set of emitted `id`s** across the whole package — a `SpecObject` present in
   two documents does not produce two identical anchors.

The output has this shape:

```html
<style>/* … */</style>
<div class="reqif-preview">…</div>
<!-- or class="reqif-preview reqif-reading-mode" with readingMode -->
```

## `renderDocumentToHtml`

```ts
function renderDocumentToHtml(
  doc: ReqIfDocument,
  attachments: AttachmentResolver,
  options?: RenderOptions,
  sharedIndex?: ReqIfIndex,
  emittedIds?: Set<string>,
): Promise<string>;
```

Renders a single document: its header, then each of its `Specification`s — stacked, or as
tabs with `layout: "tabs"` when there is more than one.

::: warning The last two parameters are not optional by accident
Without `sharedIndex`, the document is indexed **against itself alone**: any relation
targeting an object in another `.reqif` of the package becomes `unresolved-reference`.
Without a shared `emittedIds`, two documents rendered separately can emit the same anchor
`id`.

```ts
const options: RenderOptions = { layout: "tabs" };
const emitted = new Set<string>();
const parts = await Promise.all(
  pkg.documents.map((d) => renderDocumentToHtml(d, pkg.attachments, options, index, emitted)),
);
```

That is exactly what `renderPackageToHtml` does for you.
:::

## `renderSpecification`

```ts
function renderSpecification(
  spec: Specification,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels?: RenderLabels,
  options?: RenderOptions,
  emittedIds?: Set<string>,
): string;
```

**Synchronous.** Renders one specification tree — meant for a virtualised interface
rendering on the fly while scrolling, where an `await` per item would be a non-starter.

The price of being synchronous is in the third parameter: it is not an
`AttachmentResolver` (lazy, asynchronous) but an `AttachmentLookup` (already resolved).
Hence `createAttachmentLookup`.

```ts
const index = new ReqIfIndex(pkg.documents);
const lookup = await createAttachmentLookup(pkg.document, pkg.attachments);

const html = renderSpecification(spec, index, lookup); // sync
```

Note that `labels` here is a **complete** `RenderLabels`, not a `Partial` — this function
does not apply the defaults. Pass `undefined` to get them.

## `createAttachmentLookup`

```ts
function createAttachmentLookup(
  doc: ReqIfDocument,
  resolver: AttachmentResolver,
  maxInlineBytes?: number,   // default: 5 MB
  onDegradation?: DegradationHandler,
): Promise<AttachmentLookup>;
```

Walks all of the document's XHTML content, collects the paths referenced by
`<object data="…">`, and resolves them **in parallel** to `data:` URIs.

```ts
interface AttachmentLookup {
  get(path: string): { href: string; mimeType?: string } | undefined;
}
```

An attachment that cannot be found emits `attachment-missing`; one that is too large emits
`attachment-too-large` and is not included. In both cases rendering continues and the
`<object>` element falls back to its alternative.

## `renderXhtmlContent`

```ts
function renderXhtmlContent(content: XhtmlContent, options?: XhtmlRenderOptions): string;

interface XhtmlRenderOptions {
  attachments?: AttachmentLookup;
  onDegradation?: DegradationHandler;
}
```

Serialises an isolated XHTML fragment to **sanitised** HTML — an allow-list of tags and
attributes, executable URL schemes neutralised, `style` restricted to `color` and
`text-decoration`. See [Security](/guide/security).

This is the brick to use if you are building your own rendering and just want to display a
requirement's body without taking on the whole layout.

```ts
const lookup = await createAttachmentLookup(doc, pkg.attachments);
const el = document.getElementById("requirement-body")!;

const { value } = resolveAttribute(obj, index, "ReqIF.Text");
if (value?.kind === "XHTML" && value.value) {
  el.innerHTML = renderXhtmlContent(value.value, { attachments: lookup });
}
```

## `xhtmlToPlainText`

```ts
function xhtmlToPlainText(content: XhtmlContent): string;
```

Extracts the plain text — full-text search, CSV export, computing a summary. No tag is
kept.

## `escapeHtml`

```ts
function escapeHtml(s: string): string;
```

Escapes `&`, `<`, `>` and quotation marks. Exported because the HTML returned by your
[`customAttributeRenderers`](/api/options#customattributerenderer) **is not sanitised**: if
you interpolate text coming from the file into it, escaping it is up to you.

<!-- exemple: extrait — une ligne `render:` volontairement hors contexte -->

```ts
import { escapeHtml } from "reqif-preview";
render: (v) => `<span class="badge">${escapeHtml(v?.value ?? "")}</span>`;
```
