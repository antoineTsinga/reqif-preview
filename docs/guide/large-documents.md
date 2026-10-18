# Deeply nested documents

<!--@include: ../_conventions.md-->

Two guards in `fast-xml-parser` — the XML parser used internally — make perfectly valid
ReqIF documents fail to parse at their default settings. `reqif-preview` raises both;
this page explains why, and how to adjust them.

## Nesting depth

By default `fast-xml-parser` refuses any XML nested more than **100 levels** deep, as
protection against malicious files ("XML bomb"). That is too low for real ReqIF
documents: a deep specification hierarchy combined with heavily nested rich text —
typically content pasted from Word — passes that limit easily on an otherwise legitimate
document, with a `Maximum nested tags exceeded` error.

`reqif-preview` raises the limit to **10,000** by default.

```ts
// If you process untrusted files and want stricter protection against
// malicious ones:
const pkg = await loadReqIfPackage(bytes, { maxNestedTags: 200 });
```

Raising the guard raises the parser's ceiling, not every ceiling. Deeply nested rich text
inside an attribute is walked without recursion and goes as deep as the guard allows. A
deeply nested **specification hierarchy** is not: it is still walked recursively, so a
hierarchy thousands of levels deep can exhaust the call stack before the configured limit
is reached, and the error you get then is a `RangeError` rather than a `ReqIfParseError`.
Hierarchies that deep do not occur in exports written by the usual tools.

## XML entities

`fast-xml-parser` applies the same kind of guard to XML entity processing, and it is worth
knowing what it counts. The limit that trips on a legitimate document is a count of
`<!ENTITY>` **declarations** — a tool-generated DOCTYPE with many named entities — not a
count of references: `&amp;` and `&quot;` in the text are not counted by it. A separate
limit bounds total expansions, and whether ordinary references fall under it depends on the
parser version. The errors read along the lines of `Entity count exceeds maximum allowed`
or `Entity expansion limit exceeded`.

`reqif-preview` raises these limits too.

```ts
const pkg = await loadReqIfPackage(bytes, {
  processEntities: { maxEntityCount: 5_000_000, maxTotalExpansions: 5_000_000 },
});

// Turn entity processing off entirely (rarely useful):
const pkg = await loadReqIfPackage(bytes, { processEntities: false });
```

The object you pass is **partial**: limits you do not mention keep the library's default.

::: warning These limits are a security decision
Raising them amounts to trusting the file. That is the right call for an export produced
by your own toolchain, and a call to reconsider for a file uploaded by an arbitrary user.
In that second case, `maxNestedTags: 200` and `fast-xml-parser`'s own entity defaults are
a reasonable starting point — at the cost of rejecting some legitimate documents.
:::

## What, by contrast, never throws

Both of these errors come from the **parsing** stage, the only one that can fail. Past
that point nothing throws: a surprising input degrades locally and the rest of the
document still renders. See [Diagnostics](/guide/diagnostics) for making those decisions
visible.

## Heavy files

Everything above is about documents that fail to parse. This section is about documents
that parse fine but feel slow — and about which knob actually helps, because the obvious
guesses are wrong.

Loading builds the ReqIF model in memory. Rendering produces an HTML string. The browser
then builds the DOM from that string and lays it out. How those operations compare depends
on the document's content, on the render mode and on the environment — under Node the DOM
and layout steps do not exist at all.

No phase is named here as the dominant one. Two corpora, measured separately, put the lead
in two different places, so a timing is worth nothing without the file, the engine and the
bench it came from. Measure the steps separately on your own files to find the one worth
improving.

### Deferring the technical panel

Every requirement carries a collapsed technical panel listing its attributes. Under the
default its elements are built before anyone opens it, and on a document whose
requirements carry many attributes that is a large share of the emitted DOM.

```ts
const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy" });
document.getElementById("preview")!.innerHTML = html;
expandLazyPanels();
```

`"lazy"` keeps the panel's content in an inert block and defers building its DOM elements
until JavaScript expands them. It reduces the initial DOM. It does not reduce the HTML
string: the content still travels, so the string is not necessarily shorter and can be
longer. And it promises no ratio on time — whether it pays depends on the document, so
measure it on yours.

`expandLazyPanels()` is required: see
[Making lazy panels open](/api/#making-lazy-panels-open) for why, and for the
server-rendered case. If you do not need the panel at all, `technicalPanel: "off"` removes
it entirely — along with the information it shows — and needs nothing.

### What to expect, and what will not help

Parsing is one synchronous call that cannot be broken up, so running it on the main thread
delays interactions for its duration. Moving it to a Web Worker is the way to take that
work off the main thread, and the model it produces survives `structuredClone`; the
attachment resolver does not, as it carries methods.

Memory deserves its own attention, and it is often what limits the size of file a page can
open. The model is built whole, in memory, in one pass; the HTML string coexists with it
while rendering; and the DOM the browser builds from that string adds to both. How much
that comes to depends on the document and on how you integrate the library — reducing the
HTML or the initial DOM changes part of it, while the model itself stays complete. The
figure that matters is the one you measure in the environment you ship to.

::: tip Measure your own file
A file's size says less than what is inside it: two documents of the same size can differ
widely on both time and memory, depending on how many attributes each requirement carries
and how deep its rich text runs.

```ts
const started = performance.now();
const loaded = await loadReqIfPackage(bytes);
const afterLoad = performance.now();
const html = await renderPackageToHtml(loaded);
const afterRender = performance.now();
document.getElementById("preview")!.innerHTML = html;
const afterInsert = performance.now();

console.log({
  load: afterLoad - started,          // decoding, parsing, building the model
  render: afterRender - afterLoad,
  insert: afterInsert - afterRender,  // insertion only; does not wait for layout or paint
});
```
:::
