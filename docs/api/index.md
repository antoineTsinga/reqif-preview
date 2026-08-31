# API reference — overview

<!--@include: ../_conventions.md-->

Everything is exported from the package root:

```ts
import { loadReqIfPackage, renderPackageToHtml /* … */ } from "reqif-preview";
```

## The ten functions that matter

| Export | Description |
|---|---|
| [`loadReqIfPackage(input, options?)`](/api/loading#loadreqifpackage) | Loads a `.reqif` (string/bytes) or `.reqifz` (bytes), returns a `ReqIfPackage`. |
| [`parseReqIfXml(xml, options?)`](/api/loading#parsereqifxml) | Parses a single ReqIF XML string into a `ReqIfDocument`. |
| [`ReqIfIndex`](/api/model#reqifindex) | O(1) resolution index for the cross-references of one or more documents. |
| [`renderPackageToHtml(pkg, options?)`](/api/rendering#renderpackagetohtml) | Full HTML render — every document in the package. |
| [`renderDocumentToHtml(doc, attachments, options?, sharedIndex?)`](/api/rendering#renderdocumenttohtml) | HTML render of a single document. |
| [`renderSpecification(spec, index, attachments, labels?, options?)`](/api/rendering#renderspecification) | **Synchronous** render of a single tree — for a virtualised UI. |
| [`createAttachmentLookup(doc, resolver, maxInlineBytes?, onDegradation?)`](/api/rendering#createattachmentlookup) | Pre-resolves attachments to `data:` URIs — required to feed `renderSpecification`. |
| [`renderXhtmlContent(content, options?)`](/api/rendering#renderxhtmlcontent) | Sanitised serialisation of an isolated XHTML fragment. |
| [`xhtmlToPlainText(content)`](/api/rendering#xhtmltoplaintext) | Plain-text extraction from an XHTML fragment. |
| [`createAttachmentResolver(fn)`](/api/loading#createattachmentresolver) | Builds a custom attachment resolver. |

## Where to find what

| Page | Contents |
|---|---|
| [Loading and parsing](/api/loading) | `loadReqIfPackage`, `parseReqIfXml`, `ParseOptions`, `ReqIfParseError`, attachment resolvers |
| [HTML rendering](/api/rendering) | The four rendering functions, `renderXhtmlContent`, `xhtmlToPlainText`, `escapeHtml` |
| [Render options](/api/options) | The whole of `RenderOptions`, `RenderLabels`, custom renderers |
| [Data model](/api/model) | Every type of the ReqIF model, `ReqIfIndex` and the reading helpers |
| [Diagnostics](/api/diagnostics) | `DegradationCode`, `DegradationEvent`, `DegradationHandler` |

## What can throw

One thing only: **parsing**.

```ts
import { ReqIfParseError } from "reqif-preview";

try {
  const pkg = await loadReqIfPackage(bytes);
} catch (e) {
  if (e instanceof ReqIfParseError) { /* invalid XML, corrupt zip, missing root… */ }
}
```

Past that point nothing throws: the rendering functions degrade locally and carry on. To
learn *what* was degraded, see [Diagnostics](/api/diagnostics).

## Stylesheet

The render embeds its own stylesheet in a `<style>` at the top of the returned HTML,
scoped to `.reqif-preview`. There is therefore nothing to import or link: that is what
makes the output self-contained, insertable as-is with `innerHTML`.

To supply it yourself — a Content Security Policy forbidding inline `<style>`, or a theme
of your own:

```ts
const html = await renderPackageToHtml(pkg, { includeCss: false });
```

The stylesheet then stays reachable two ways, both coming from the **same source**, so
they can never disagree:

```ts
// A file, for a <link> or a bundler import.
import "reqif-preview/style.css";
```

```ts
// The text, for what a <link> cannot reach — a Shadow DOM, for instance.
import { DEFAULT_CSS } from "reqif-preview";

const shadowRoot = document.getElementById("preview")!.attachShadow({ mode: "open" });

const sheet = new CSSStyleSheet();
sheet.replaceSync(DEFAULT_CSS);
shadowRoot.adoptedStyleSheets = [sheet];
```

If you write your own rules instead, be aware that the tabs **stop working without
these**: their mechanism rests entirely on this stylesheet's `:target` rules.

::: warning The stylesheet assumes a light surface
`.reqif-preview` sets a text colour (`#1a1a1a`) but no background. Dropped as-is into a
dark-themed page, the preview would be unreadable: it is up to the host to provide a light
surface.
:::
