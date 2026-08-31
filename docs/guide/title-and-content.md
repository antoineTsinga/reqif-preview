# Choosing exactly which title and content are shown

<!--@include: ../_conventions.md-->

By default the **title** comes from the object's `LONG-NAME` (or from its node in the
tree), and the **content** automatically shows every XHTML attribute the object has —
which is not always what you want when several unrelated rich-text fields coexist. Two
options hand control back to you.

```ts
const html = await renderPackageToHtml(pkg, {
  // Only these attributes (in this order) make up the main content.
  // Each is rendered according to its own type (XHTML sanitised, the rest escaped).
  // If omitted: the default behaviour (every XHTML attribute not already shown elsewhere).
  contentAttributes: ["ReqIF.Text"],

  // If the object (and its node) have no LONG-NAME, these attributes are tried in
  // order — the first non-empty one becomes the title.
  titleAttributes: ["ReqIF.ChapterName", "ReqIF.Name"],
});
```

## `contentAttributes`

A strict allow-list:

- an attribute listed here that the object does not have is simply ignored;
- if none of them has a value, the usual "(empty)" message is shown;
- attributes are rendered **in the order you list them**, not in the file's order.

## `titleAttributes`

Only steps in as a **last resort**, after the object's `LONG-NAME` and its tree node's —
never in their place. Useful for DOORS exports where the real label sometimes sits in a
custom attribute rather than in the structural field.

::: info Neither option removes anything
The attributes they target stay visible in the technical panel, which is never filtered.
These options decide what is **brought forward**, not what is kept.
:::

## Deliberately empty title or content

For "chapter" objects (see [`chapterNumberAttributes`](/guide/layout#chapternumbers))
there is a shortcut:

```ts
const html = await renderPackageToHtml(pkg, {
  chapterNumberAttributes: ["ChapterName"],
  suppressEmptyPlaceholdersForChapters: true, // no "(untitled)"/"(empty)" for chapters
});
```

That is really one case of a more general need. Sometimes an object is **structurally not
supposed** to have a title — a plain informational paragraph, say, which has text but
never a `LONG-NAME` — or, the other way round, no content at all (a pure section heading,
with no text directly under it). Those are not missing data to be flagged with
"(untitled)" or "(empty)".

::: warning `customAttributeRenderers` cannot solve this
A custom renderer only acts on the **content** area (before/after), never on the title
shown in the tree (the `<summary>`). For the title as much as for the content, use
`isTitleless` / `isContentless`.
:::

```ts
import { resolveAttribute, valueToPlainText } from "reqif-preview";

const html = await renderPackageToHtml(pkg, {
  // By object type: never report a missing title on a "Paragraph"
  isTitleless: (obj, specType) => specType?.longName === "Paragraph",

  // By any other criterion (reach the attribute of your choice through the
  // exported helpers resolveAttribute/valueToPlainText):
  isContentless: (obj, specType, index) => {
    const { value } = resolveAttribute(obj, index, "ObjectType");
    return valueToPlainText(value, index) === "Heading";
  },
});
```

- The two functions are **independent**: an object can be "not expected to have a title"
  without being "not expected to have content", and the reverse — which is exactly the
  paragraph-without-a-title versus chapter-without-content case.
- They only apply to the **fallback**: if the object has a real `LONG-NAME` or real
  content, it is shown normally, whatever these functions return.
- They combine with `suppressEmptyPlaceholdersForChapters`: the placeholder is suppressed
  if one **or** the other says yes.

For finer control still — showing a replacement of your own rather than nothing —
`customAttributeRenderers` receives `ctx.isChapter` (true when the object matches
`chapterNumberAttributes`, regardless of the suppression options):

<!-- exemple: extrait — fragment d'objet ; montrer l'appel complet noierait l'option -->

```ts
customAttributeRenderers: [{
  attribute: "ReqIF.Text",
  render: (value, ctx) => (!value && ctx.isChapter ? `<span class="chapter-divider">—</span>` : undefined),
}]
```
