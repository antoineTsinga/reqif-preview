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

Each requirement carries a collapsed "Technical details" panel listing every attribute.
Measurement showed it to be **two thirds of all the nodes** the renderer emits, and
inserting nodes into the DOM to be the single largest cost of displaying a document — half
the wait on a 5 MB export, 70 % on a 50 MB one. The whole panel was therefore the majority
of the price, paid upfront, for something nobody had asked to see yet.

So by default its markup travels inside an inert block and becomes real nodes only when the
panel is opened:

```ts
// The default. Equivalent to passing nothing.
const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy" });
```

On the same 5 MB export that takes the nodes a browser must build from 69 per requirement
down to 29. The markup still ships, so the output is about 3 % **larger** in bytes — the
saving is in parsing and layout, not in transfer.

`"eager"` restores the behaviour of every version before this option, with no JavaScript
involved at all. `"off"` leaves the panel out entirely, which is lighter still if you do
not need it.

### Making lazy panels open

Lazy mode needs its script to run, and **a `<script>` inserted through `innerHTML` never
executes** — that is the HTML specification, not a quirk of any browser. Since `innerHTML`
is how most pages use this library, the script has to be installed separately:

```ts
import { renderPackageToHtml, expandLazyPanels } from "reqif-preview";

const html = await renderPackageToHtml(pkg);
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
const html = await renderPackageToHtml(pkg, { includeJs: true });
```

It is off by default precisely because of the rule above: in the browser the inlined copy
could never run, so it would be unreachable bytes in every output, plus a
Content-Security-Policy violation in exchange for nothing.

Until one of the two is in place, opening a panel shows the
`labels.technicalUnavailable` message rather than nothing at all — an empty panel reads as
a broken viewer, which is the wrong thing to tell the reader.

Under a strict Content-Security-Policy, which blocks inline scripts even in a
server-rendered document, leave `includeJs` alone and serve the same text the renderer
would have embedded, under a nonce or a hash:

```ts
import { DEFAULT_JS } from "reqif-preview";
```

`DEFAULT_JS` and `expandLazyPanels` do the same thing by the same rules — the first
as text you can serve under a nonce or hash, the second as a function you call.
