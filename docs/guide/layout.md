# Tabs, numbering, reading view

<!--@include: ../_conventions.md-->

Three composable options, meant for large exports (multi-module `.reqifz`) and for
producing something closer to a Word document:

```ts
const html = await renderPackageToHtml(pkg, {
  layout: "tabs",        // "stacked" (default) or "tabs" — pure CSS, no JS
  chapterNumbers: true,  // 1, 1.1, 1.1.1, 1.2, 2... in front of every title
  readingMode: true,     // hides ID / created-modified / technical panel; titles as <h3>-<h6>
});
```

## `layout: "tabs"`

Applies at **two levels**:

- between the different `.reqif` documents of one `.reqifz` (`renderPackageToHtml`);
- between the different `Specification`s inside one document (`renderDocumentToHtml`).

It has no effect when there is only one document or only one specification: no pointless
tab for a simple case. Implemented in **pure CSS** — no JavaScript, so it works even when
the HTML is inserted statically, script-free, or served from an SSR.

### The URL fragment decides which panel shows

The tabs are **real links**, and it is the URL fragment that decides which panel is
visible, through `:target` and `:has(:target)`.

```css
.reqif-tab-panel { display: none; }
.reqif-tab-panel:target,
.reqif-tab-panel:has(:target) { display: block; }   /* the panel CONTAINING the target */
.reqif-tabs:not(:has(:target)) > .reqif-tab-panel:first-of-type { display: block; }
```

The second rule is the one that counts. A deep anchor opens **every** panel leading to its
target, at all nesting levels at once. A relation link to a requirement in another tab
works, and a URL like `…#reqif-obj-SYS-REQ-0042` reopens the right document, the right
specification, scrolled to the requirement — enough to send a colleague a precise link.

::: info Why not hidden `<input type="radio">`
The classic JS-free tab technique puts the state in the DOM rather than in the URL — more
self-contained, and two previews on one page keep independent selections. But it makes a
deep anchor **impossible**: the link scrolls to an element that stays `display: none`. The
trade-off was settled the other way, deliberately.
:::

Panel identifiers derive from the ReqIF identifiers (`#reqif-doc-<header>`,
`#reqif-spec-<spec>`), **never from the tab's position**: a shared link survives a document
being inserted before it.

### Two accepted trade-offs

Direct consequences of the state living in the host page's URL:

- a host application that **routes on the hash** (Vue Router in hash mode, for instance)
  will see its route change on every tab click;
- **two previews on one page** can no longer hold two independent tab selections — one
  fragment, one state.

### An SPA router that intercepts links breaks the tabs

This is the likeliest integration trap, and it is a silent one: the URL changes correctly,
but **the tab does not switch**.

Most documentation frameworks and SPAs install a global click listener that intercepts
internal links to avoid a page reload. They then do:

<!-- exemple: extrait — cite le gestionnaire interne de VitePress, ce n'est pas notre code -->

```js
e.preventDefault();
history.pushState({}, "", href);
```

And `history.pushState` **does not recompute the element `:target` matches**. The URL
fragment changes, the page sometimes scrolls, but as far as CSS is concerned no element is
`:target` — so the panel stays `display: none`.

Nothing about the emitted HTML is at fault: the same markup works perfectly in a static
page. It is the click interception that removes the fragment navigation the mechanism
depends on.

**The remedy: make the router ignore these links.** Most interceptors provide a way out.
A few examples:

| Host | Way out |
|---|---|
| VitePress | an ancestor carrying the `vp-raw` class — which is what the [playground](/playground) does |
| Docusaurus, VitePress | a `target` attribute (even `target="_self"`, a no-op for the browser) or `download` |
| Vue Router, React Router | nothing to do: only their `<RouterLink>`/`<Link>` components are affected, not raw `<a>` |

If your router offers no way out, the last resort is to reinstate a real fragment
navigation yourself, after the fact:

```js
// The element that receives the preview's HTML.
const container = document.getElementById("preview")!;

container.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[href^='#']");
  if (!link || !container.contains(link)) return;
  const id = link.getAttribute("href").slice(1);
  // The router may have done a pushState, which leaves :target untouched.
  // Replay a real fragment navigation.
  requestAnimationFrame(() => {
    if (location.hash.slice(1) === id) location.hash = "";
    location.hash = id;
  });
});
```

::: tip Recognising this case in thirty seconds
Open the console and compare, after clicking a tab:

```js
location.hash;                        // "#reqif-doc-..."  -> the URL did change
document.querySelector(":target");    // null              -> but nothing is targeted
```

A populated `hash` with `:target` at `null` is exactly this situation.
:::

Clicking a tab also scrolls to its panel: that is a link's behaviour, softened by
`scroll-margin-top` but not removable. Finally, this mechanism relies on `:has()`,
available in every browser since December 2023.

## `chapterNumbers`

Prefixes each title with its position in the tree (`1`, `1.1`, `1.1.1`, `1.1.2`, `1.2`,
`2`…). Numbering **restarts at 1 for each new `Specification`**, as if they were separate
documents.

By default **every** node is numbered — a little brutal, since a Word document numbers its
headings, not each paragraph. If your requirements distinguish structural "chapters" from
the requirements themselves through an attribute (the `ChapterName` / `ReqIF.ChapterName`
convention is common in DOORS), restrict numbering to those nodes:

```ts
const html = await renderPackageToHtml(pkg, {
  chapterNumbers: true,
  chapterNumberAttributes: ["ChapterName"], // or ["ReqIF.ChapterName"], depending on your export
});
```

Only objects carrying a non-empty value for one of those attributes then get a number. The
others — the "leaf" requirements — get none **and do not shift their siblings' numbering**,
like an ordinary paragraph between two Word headings. If an unnumbered node has children
that are themselves chapters, their numbering continues from the last numbered ancestor:
it does not restart because of the intermediate node.

## `readingMode`

Think of a PDF or Word export: only the titles and the requirements' text stay visible.

- The ID box, the "Created by / Modified by" line and the "Technical details" panel
  disappear. The content is still reachable by switching back to normal mode.
- Titles go from plain bold lines to real `<h3>`…`<h6>` tags according to depth — the
  `Specification` itself keeps its `<h2>`.
- Content *you* add through [`customAttributeRenderers`](/guide/custom-renderers)
  **stays visible**: only automatically generated metadata is hidden, not what you
  explicitly asked for.
- [Links between requirements](/guide/relations) stay visible too — a traceability link is
  content, not technical metadata.

::: details Why the title sizes are set explicitly
Titles are nested inside one another's containers. With browsers' default `em` sizes, each
level is computed relative to its **already-shrunk** parent: the size compounds down the
cascade and becomes unreadable within four or five levels, which is common in a
requirements tree.

Hence sizes in `rem` — relative to the root, never to a nested ancestor — fixed level by
level from `1.3rem` down to `0.95rem`. Past `<h6>`, the size stays at `0.95rem` instead of
continuing to shrink.
:::

::: tip
The [playground](/playground) exposes all three options on a three-document package with
two levels of tabs. It is the quickest way to see which one matches what you are after.
:::
