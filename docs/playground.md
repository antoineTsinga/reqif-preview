---
# The preview needs the full content width: VitePress caps `.content-container`
# at 688px only when the right-hand aside is present, so dropping the aside is
# what actually widens the page — no CSS override, nothing tied to VitePress's
# scoped-style hashes.
aside: false
pageClass: sandbox-page
---

# Playground

This page runs **the real library**, in your browser, on the file of your choosing. The
bundle loaded here is the one `npm run build` produced when the site was published: what
you see is what the code does today.

Nothing is sent anywhere — there is no server behind this page. Your file is read by
`FileReader` and processed locally.

<ClientOnly>
  <Playground />
</ClientOnly>

## What is in the sample file

`exemple.reqifz` is a package of three ReqIF documents that reference one another, in
the exchange scenario the spec opens with (figure 1.1):

| Document | Contents |
|---|---|
| `01-exigences-client.reqif` | The customer specification — the `CRS-…` |
| `02-exigences-systeme.reqif` | The system requirements `SRS-…`, which *derive from* CRS |
| `03-plan-de-validation.reqif` | The tests `TST-…`, which *verify* SRS |

It contains **deliberate anomalies**, so that the
[Diagnostics](/guide/diagnostics) panel has something to show:

- a relation `TST-002 → SRS-999-absent` pointing at nothing: `unresolved-reference`;
- the object `CRS-003` rendered at two places in the tree: `duplicate-dom-id`;
- an XHTML attribute carrying `IS-SIMPLIFIED="true"` **and** its `<THE-ORIGINAL-VALUE>`,
  so the two can be compared with `preferSimplifiedXhtml`;
- an image (`images/schema-aeb.png`) referenced from the rich text, resolved to a
  `data:` URI;
- an `ALTERNATIVE-ID` (`DOORS-88421`), of the kind a real tool export attaches.

## Three things worth trying

**Follow a link between documents.** Pick `layout: tabs`, open the "Plan de validation"
tab, expand a test and click its `→ Vérifie` link. The "Exigences système" tab opens by
itself, **and** the right specification inside it, scrolled to the requirement: the URL
fragment drives the display, at both nesting levels at once. See
[Tabs, numbering, reading view](/guide/layout).

**Compare the original with the simplified version.** Toggle `preferSimplifiedXhtml` and
look at the requirement carrying the flag: by default the library shows the original, as
the more faithful of the two. See [Simplified text](/guide/simplified-text).

**Switch to reading mode.** Tick `readingMode` then `chapterNumbers`: the ID boxes, the
created/modified line and the technical panel disappear, and titles become real
numbered `<h3>`…`<h6>` tags. That is the rendering to aim for when printing or exporting
to PDF.

::: tip This page's hash will change
Tabs are real links: clicking one writes a fragment into the page's URL — including this
one. That is exactly the trade-off documented in
[Tabs, numbering, reading view](/guide/layout#two-accepted-trade-offs), and watching it
happen here beats reading about it.
:::

::: info The sample file is in French
The requirements in `exemple.reqifz` are written in French, as are the library's default
labels. Everything the sandbox demonstrates is language-independent — and `dateLocale`
plus `labels` are what you would change for an English rendering.
:::
