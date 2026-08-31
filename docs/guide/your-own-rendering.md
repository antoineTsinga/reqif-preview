# Rendering it yourself

<!--@include: ../_conventions.md-->

You are not obliged to use the HTML provided. `loadReqIfPackage` — and `parseReqIfXml` for
XML already in memory — hand you a **typed, acyclic and serialisable** data model
(`ReqIfDocument`) that mirrors the ReqIF spec's UML faithfully: `Specification`,
`SpecObject`, `SpecHierarchy`, `AttributeDefinition*`, `AttributeValue*`,
`DatatypeDefinition*`, and so on.

## Acyclic, and why that matters

Cross-references — `typeRef`, `definitionRef`, `objectRef`, `sourceRef`… — stay **plain
identifier strings**. No circularly nested objects.

That is a design decision, not an implementation shortcut: a cyclic model breaks
`JSON.stringify`, breaks passing through `postMessage` to a Web Worker, breaks caching in
`IndexedDB`, and makes every debugging snapshot unreadable. The price is one indirection
when reading — which is what `ReqIfIndex` is for.

```ts
import { parseReqIfXml, ReqIfIndex } from "reqif-preview";

const xmlString = await (await fetch("/requirements.reqif")).text();
const doc = parseReqIfXml(xmlString);
const index = new ReqIfIndex(doc);

for (const spec of doc.coreContent.specifications) {
  for (const node of spec.children) {
    const requirement = index.specObjects.get(node.objectRef);
    console.log(requirement?.longName);
  }
}
```

`ReqIfIndex` takes either a document or an array of documents. For a multi-document
`.reqifz`, pass `pkg.documents` — that is what makes relations crossing the boundary
between two `.reqif` files resolve. See [Links between requirements](/guide/relations).

## Reading an attribute value

Finding "the attribute named `ReqIF.Text`" means walking `values` → `definitionRef` →
`AttributeDefinition` → `longName`. Two exported helpers make that walk for you:

```ts
import { resolveAttribute, valueToPlainText } from "reqif-preview";

const { value, definition } = resolveAttribute(obj, index, "ReqIF.Text");
const text = valueToPlainText(value, index); // string | undefined
```

Matching is on the **long name or the identifier**, case- and space-insensitive
(`normalizeKey`), because real exports write `ReqIF.ForeignID`, `Foreign ID` and
`ForeignID` interchangeably.

`valueToPlainText` resolves enumeration labels when you pass it the index — without it, an
enumeration value is just a list of identifiers.

## Rich content

For an `AttributeValueXHTML`, you have:

| Expression | Result |
|---|---|
| `value.value` | a portable `XhtmlNode[]` tree, with no DOM dependency |
| `value.originalValue` | the original before simplification, when there is one ([details](/guide/simplified-text)) |
| `renderXhtmlContent(value.value, { attachments })` | serialises that tree to **sanitised** HTML ([security](/guide/security)) |
| `xhtmlToPlainText(value.value)` | extracts the plain text — full-text search, CSV export |

The `XhtmlNode` tree is deliberately minimal: a node is either `{ type: "text", value }` or
`{ type: "element", tag, attributes, children }`. The namespace prefix is stripped and the
tag name lower-cased at parse time, so `<xhtml:P>` and `<p>` both arrive as `"p"`.

## Lifecycle metadata

`extractLifecycleInfo(obj, index)` returns the author and the creation/modification dates,
applying the recognised conventions (`ReqIF.ForeignCreatedBy/On`,
`ReqIF.ForeignModifiedBy/On`), whether they are stored as a string or as XHTML. It is what
the default rendering shows in its "Created by / Modified by" line; exporting it lets you
rebuild that your own way.

## Rendering a single specification, synchronously

`renderSpecification` is synchronous — meant for a virtualised UI rendering on the fly
while scrolling. In exchange it requires attachments that are **already resolved**:

```ts
import { createAttachmentLookup, renderSpecification, ReqIfIndex } from "reqif-preview";

const index = new ReqIfIndex(pkg.documents);
const lookup = await createAttachmentLookup(pkg.document, pkg.attachments);

const html = renderSpecification(spec, index, lookup); // sync
```

## The full model

The exact definitions are in
[`src/types.ts`](https://github.com/antoineTsinga/reqif-preview/blob/main/src/types.ts),
annotated with the spec clause number each one implements. The
[Data model](/api/model) page maps them out.
