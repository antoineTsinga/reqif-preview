# Attachments (`.reqifz`)

<!--@include: ../_conventions.md-->

A `.reqifz` is a zip archive containing one or more `.reqif` files **and** the binaries
they reference: images, PDFs, anything the rich text cites through `<object data="...">`.

`loadReqIfPackage` detects the zip, extracts every `.reqif` inside it — a `.reqifz` may
legitimately contain several — and builds an `AttachmentResolver` for the remaining files.

The HTML renderer resolves those references automatically and inlines them as `data:`
URIs.

```ts
const pkg = await loadReqIfPackage(bytes);
const html = await renderPackageToHtml(pkg); // images included, nothing to do
```

## The size limit

By default, **5 MB per file**. Above that the attachment is left unresolved — the
`<object>` element falls back to its alternative — and an `attachment-too-large` event is
emitted.

```ts
const html = await renderPackageToHtml(pkg, { maxInlineBytes: 20 * 1024 * 1024 });
```

A `data:` URI grows by roughly a third compared to the original bytes (base64), and it
lives inside the HTML string you are about to inject. An export rich in screenshots can
blow up the browser's memory well before it makes anything fail. That is why the limit
exists and why it is low.

## Your own resolver

For a bare `.reqif` accompanied by images served elsewhere — a CDN, an API, a folder on
disk — supply your own resolver:

```ts
import { createAttachmentResolver, loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

const attachments = createAttachmentResolver((path) => {
  const bytes = myOwnFileLookup(path); // Uint8Array | undefined
  return bytes ? { bytes } : undefined;
});

const xmlString = await (await fetch("/requirements.reqif")).text();
const pkg = await loadReqIfPackage(xmlString);
const html = await renderPackageToHtml(pkg, { attachments });
```

The `path` you receive is exactly what was written in the `<object>` element's `data`
attribute, verbatim. `createAttachmentResolver` infers the MIME type from the extension if
you do not supply one; return `{ bytes, mimeType }` to force it.

`EMPTY_ATTACHMENTS` is a resolver that never finds anything — useful as an explicit
default, and it is what `loadReqIfPackage` uses for a bare `.reqif`.

## An `<object>`'s fallback chain

The `<object>` element follows the chain the spec describes, in this order:

1. resolved image → an `<img>` tag carrying the `data:` URI;
2. otherwise, a nested alternative object → recurse into it;
3. otherwise, a resolved but non-image attachment → a download link;
4. otherwise, the alternative text held inside the element.

A missing image therefore never takes the context away with it: there is always something
left to read in its place.

## Synchronous rendering: pre-resolving attachments

Resolving an attachment is asynchronous — hence the `await` on `renderPackageToHtml`. If
you need a **synchronous** render (a virtualised UI rendering a specification on the fly
while scrolling, say), pre-resolve everything once and then call `renderSpecification`:

```ts
import { createAttachmentLookup, renderSpecification, ReqIfIndex } from "reqif-preview";

const index = new ReqIfIndex(pkg.documents);
const lookup = await createAttachmentLookup(pkg.document, pkg.attachments);

// synchronous, callable from a virtualised render
const html = renderSpecification(spec, index, lookup);
```

See [HTML rendering](/api/rendering) for the complete signatures.
