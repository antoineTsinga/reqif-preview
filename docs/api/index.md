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

Parsing, as `ReqIfParseError`.

```ts
import { ReqIfParseError } from "reqif-preview";

try {
  const pkg = await loadReqIfPackage(bytes);
} catch (e) {
  if (e instanceof ReqIfParseError) { /* invalid XML, corrupt zip, missing root… */ }
  else throw e;                          // anything else is not ours to swallow
}
```

Past that point the rendering functions degrade locally and carry on rather than failing.
To learn *what* was degraded, see [Diagnostics](/api/diagnostics).

They are not proof against every exception, though: the specification hierarchy and the
serialisation of a tree returned by `customAttributeRenderers` are still walked
recursively, so extreme nesting can surface as a `RangeError`.

## Stylesheet

The render embeds its own stylesheet in a `<style>` at the top of the returned HTML,
scoped to `.reqif-preview`. There is therefore nothing to import or link for the styling:
the output is insertable as-is with `innerHTML` and will look right. One thing does need a
call rather than markup — opening a lazy technical panel, covered just below.

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

## Technical panel

Each requirement carries a collapsed "Technical details" panel listing every attribute,
and `technicalPanel` decides how it is emitted.

| Value | What it emits |
|---|---|
| `"eager"` (default) | the panel, in full |
| `"lazy"` | its content in an inert block, built into DOM elements when opened |
| `"off"` | nothing |

The default writes it out, which needs no JavaScript and nothing from you. `"lazy"` gives a
smaller initial DOM, at the price of an initialisation call and a string that is not
necessarily shorter — see [Heavy files](/guide/large-documents#heavy-files) for how to
decide.
`"off"` drops the panel entirely if you simply do not want it.

### Making lazy panels open

`"lazy"` is opt-in rather than the default because it does not work on its own, and that is
worth being blunt about: **a `<script>` inserted through `innerHTML` never executes**. That
is the HTML specification, not a quirk of any browser, and `innerHTML` is how most pages
use this library. So the expander has to be installed separately:

```ts
import { renderPackageToHtml, expandLazyPanels } from "reqif-preview";

const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy" });
document.getElementById("preview")!.innerHTML = html;

// Once, any time. It only installs a listener, so the order relative to
// innerHTML does not matter -- though early is better than late, since a
// panel opened before the listener exists shows the fallback until reopened.
expandLazyPanels();
```

If the markup instead reaches the page inside the initial HTML document — server-rendered,
or written with `document.write` — a script *can* run from there, and `includeJs` asks for
one:

```ts
// Emits the expander inline. Nothing to call: it runs when the document loads.
const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy", includeJs: true });
```

Until one of the two is in place, opening a panel shows the
`labels.technicalUnavailable` message rather than nothing at all — an empty panel reads as
a broken viewer, which is the wrong thing to tell the reader. That fallback is also the
reason `"lazy"` is not the default: someone who has configured nothing should get a working
panel, not a message explaining what they did not do.

Under a strict Content-Security-Policy, which blocks inline scripts even in a
server-rendered document, leave `includeJs` alone and serve the same text the renderer
would have embedded, under a nonce or a hash:

```ts
import { DEFAULT_JS } from "reqif-preview";
```

`DEFAULT_JS` and `expandLazyPanels` do the same thing by the same rules — the first
as text you can serve under a nonce or hash, the second as a function you call.
