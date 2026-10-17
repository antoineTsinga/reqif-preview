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

Measured with `npm run bench`, on a real 4.94 MB IBM DOORS export (1 024 requirements) and
a generated 49.8 MB file:

| Phase | 4.94 MB | 49.8 MB |
|---|---|---|
| Parsing XML into the model | 278 ms | 3 554 ms |
| Building `ReqIfIndex` | 0.5 ms | 9.3 ms |
| Resolving attachments | 0.5 ms | 12.7 ms |
| Rendering to a string | 99 ms | 3 217 ms |
| **Inserting the HTML into the DOM** | **550 ms** | **22 211 ms** |

Two things to take from it. The index costs nothing — it is not what to optimise. And the
largest cost is not in this library at all: it is the browser building nodes from the
string you assign to `innerHTML`.

### The one setting that helps

Two thirds of the emitted nodes are the technical panel, inside a `<details>` nobody has
opened. A closed `<details>` skips layout, but its nodes are built anyway, so they are
paid for in full before anyone asks to see them.

```ts
const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy" });
document.getElementById("preview")!.innerHTML = html;
expandLazyPanels();
```

That takes the nodes a browser must build from 69 per requirement to 29, which roughly
halves the insertion time. The markup still travels, so the string is about 3 % larger —
the saving is in parsing and layout, not in transfer.

`expandLazyPanels()` is required: see
[Making lazy panels open](/api/#making-lazy-panels-open) for why, and for the
server-rendered case. If you do not need the panel at all, `technicalPanel: "off"` is
lighter still and needs nothing.

### What to expect, and what will not help

Parsing is one synchronous call that cannot be broken up: roughly 0.3 s at 5 MB and 3.5 s
at 50 MB, during which the page is frozen. Scaling is close to linear — ten times the
input costs about thirteen times the time — so there is no cliff to fall off, just a
steady cost. Moving that call to a Web Worker is the only thing that removes it from the
main thread, and the model it produces survives `structuredClone`; the attachment
resolver does not, as it carries methods.

Peak memory is the sharper limit: **25 to 56 times the size of the input file**, 1.28 GB
for 49.8 MB. That is what will end a browser tab before the seconds do, and no option
here changes it — the model is built whole, in memory, in one pass.

::: tip Measure your own file
`npm run bench` takes the fixtures in the repository, but the numbers that matter are the
ones from a document shaped like yours. Export sizes say less than the depth of the rich
text inside them: the DOORS file above costs 56 times its size in memory while the
generated one costs 25, for the same reason its nodes per requirement are higher.
:::
