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
// An even more deeply nested document:
const pkg = await loadReqIfPackage(bytes, { maxNestedTags: 50_000 });

// The other way round, if you process untrusted files and want stricter
// protection against malicious ones:
const pkg = await loadReqIfPackage(bytes, { maxNestedTags: 200 });
```

## XML entities

`fast-xml-parser` applies the same kind of guard to XML entity processing (`&amp;`,
`&quot;`, `<!ENTITY>` declarations…): depending on the version, the default limit sits
around **1000** occurrences or declarations in the whole document. A large export exceeds
it simply by having plenty of ampersands and quotation marks in its text, with an error
along the lines of `Entity count exceeds maximum allowed` or
`Entity expansion limit exceeded`.

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

Every requirement carries a collapsed technical panel listing its attributes, and it is
the largest part of the DOM this library emits. Under the default those elements are built
whether or not anyone opens the panel.

```ts
const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy" });
document.getElementById("preview")!.innerHTML = html;
expandLazyPanels();
```

`"lazy"` keeps the panel's content in an inert block and defers building its DOM elements
until JavaScript expands them. It reduces the initial DOM. It does not reduce the HTML
string — that gets slightly longer, since the content still travels — and it promises no
ratio on time: whether it pays depends on the document, so measure it on yours.

`expandLazyPanels()` is required: see
[Making lazy panels open](/api/#making-lazy-panels-open) for why, and for the
server-rendered case. If you do not need the panel at all, `technicalPanel: "off"` removes
it entirely — along with the information it shows — and needs nothing.

### What to expect, and what will not help

Parsing is one synchronous call that cannot be broken up, and the page is frozen for its
duration. Moving that call to a Web Worker is the only thing that takes it off the main
thread, and the model it produces survives `structuredClone`; the attachment resolver does
not, as it carries methods.

Peak memory is the sharper limit, and it is what ends a browser tab before the seconds do.
The model is built whole, in memory, in one pass, and no option here changes that. A load
costs a multiple of the file's size rather than the size itself, and the multiple depends
on the document — so the only figure worth having is the one you measure on the files you
actually open.

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
  insert: afterInsert - afterRender,  // node building; layout and paint come after
});
```
:::
