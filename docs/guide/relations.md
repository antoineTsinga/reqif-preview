# Links between requirements (`SpecRelation`)

<!--@include: ../_conventions.md-->

Typed links between requirements — "derives from", "satisfies", "traces to" — are shown
automatically for every object that has any: its **outgoing** (`→`) and **incoming** (`←`)
links, with the relation type's name and an anchor link to the linked object **when that
object is rendered in the same page**.

```html
<div class="reqif-relations">
  <div class="reqif-relations-label">Liens</div>
  <div class="reqif-relation">
    <span>→</span> <span>Dérive de</span>
    <a href="#reqif-obj-...">Exigence système — Authentification</a>
  </div>
</div>
```

When the linked object is not found, the label is still shown, without a clickable link,
and an `unresolved-reference` event is emitted ([diagnostics](/guide/diagnostics)).

This is visible by default, `readingMode` included:

```ts
const html = await renderPackageToHtml(pkg, { showRelations: false }); // to hide it
```

## Relations between documents of one `.reqifz`

**They resolve.** The spec types a `SpecRelation`'s `SOURCE` and `TARGET` as `GLOBAL-REF`
(clause 11, rule 5b), meaning a relation may legitimately target an object in *another*
`.reqif` of the package — that is in fact the canonical exchange scenario: customer
requirements on one side, system requirements on the other, tied together by "derives
from".

`renderPackageToHtml` therefore builds **a single index covering every document**.

If you call `renderDocumentToHtml` document by document, each is indexed against itself
alone, and relations crossing the boundary stop resolving. Pass your own shared index as
the 4th argument to get the same behaviour back:

```ts
const options: RenderOptions = { layout: "tabs" };
const index = new ReqIfIndex(pkg.documents); // and not pkg.document
const html = await renderDocumentToHtml(doc, pkg.attachments, options, index);
```

::: warning `pkg.documents`, not `pkg.document`
`pkg.document` is a convenience accessor for the single-document case; it returns only the
first one. Passing that to the constructor rebuilds exactly the partial index you were
trying to avoid.
:::

## Objects rendered more than once

One `SpecObject` may legitimately appear at several places in a tree — a cross-cutting
requirement cited under two chapters, for instance.

Only **the first occurrence carries the anchor `id`**. That is already what a browser does
when resolving a fragment: emitting the same `id` several times produces invalid HTML
**without** making the other occurrences reachable anyway. Each duplicate emits a
`duplicate-dom-id` event.

The practical consequence: a relation link to a duplicated object always leads to its
first appearance in document order. That is deterministic and stable between renders.

## Anchors: the shape of the identifiers

| Element | `id` emitted |
|---|---|
| Document (tab) | `reqif-doc-<header identifier>` |
| Specification (tab) | `reqif-spec-<Specification identifier>` |
| Object | `reqif-obj-<SpecObject identifier>` |

All of them derive from the ReqIF identifier, never from a positional counter: a shared
link survives an element being inserted before its target.

::: warning An SPA router can neutralise these links
Relation links are plain `<a href="#…">`, like the tabs. A framework that intercepts
in-page clicks and calls `history.pushState` leaves `:target` untouched: the link will not
reopen the tab containing its target. The mechanism and the remedies are detailed in
[Tabs, numbering, reading view](/guide/layout#an-spa-router-that-intercepts-links-breaks-the-tabs).
:::

## Current limitation

Only `SpecRelation` — object-to-object links — are shown. `RelationGroup`, which groups
relations between two `Specification`s, is **parsed**
(`doc.coreContent.specRelationGroups`) but not yet rendered. It stays usable directly
through the [data model](/guide/your-own-rendering) if you need it.
