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
