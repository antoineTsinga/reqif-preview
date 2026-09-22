# Showing content of your own

<!--@include: ../_conventions.md-->

`ReqIF.ForeignID` covers the standard case, but plenty of tools keep their business
identifier in a freely named attribute — `IE PUID` in DOORS, for instance, sometimes as
XHTML rather than a plain string. For those cases, register a **custom renderer**: the
function receives the already-resolved value of the attribute you target, plus a context
giving access to *every* other attribute of the object, and its output is injected right
before or right after the main text, as you prefer.

You describe what to show as **nodes**, not as an HTML string. Text is escaped for you:

```ts
import { renderPackageToHtml, xhtmlToPlainText } from "reqif-preview";

const html = await renderPackageToHtml(pkg, {
  customAttributeRenderers: [
    {
      attribute: "IE PUID", // long name (or identifier) of the attribute targeted
      position: "before",   // "before" (default) or "after"
      render: (value, ctx) => {
        if (!value) return undefined; // nothing to show here -> leave it alone
        const text = value.kind === "XHTML" && value.value
          ? xhtmlToPlainText(value.value)
          : value.kind === "STRING" ? value.value : undefined;
        return text
          ? { tag: "span", attrs: { class: "puid-badge" }, children: [text] }
          : undefined;
      },
    },
  ],
});
```

## The shape you return

```ts
type RenderNode = string | RenderElement | RenderRawHtml;

interface RenderElement {
  tag: string;                      // allow-listed, otherwise unwrapped
  attrs?: Record<string, string>;   // allow-listed, values escaped
  children?: RenderNode[];          // a string here is text, and is escaped
}
interface RenderRawHtml { dangerouslyRawHtml: string }

render(value, ctx): RenderElement | RenderRawHtml | RenderNode[] | undefined;
```

- **tags**: `span div p a code strong b em i small br img ul ol li`. Anything else is
  unwrapped, its children kept — the same rule the document sanitiser follows, so unknown
  formatting never carries text away with it. Emits `unwrapped-tag`.
- **attributes**: `class` `id` `title` `lang` `dir`, plus `href` and `src` routed through
  the same URL-scheme filter as document content. Anything else is dropped, with
  `custom-renderer-dropped-attr`. **`style` is not on the list** — presentation belongs in
  your own stylesheet.
- **a bare string at the top level is a type error.** Under the previous API it meant "raw
  HTML", so accepting it would silently flip the meaning of existing renderers. Wrap text
  in an array — `["CRS-001"]` — or use `dangerouslyRawHtml` for markup. From untyped
  JavaScript, a returned string is escaped and emits `custom-renderer-raw-string`.

::: danger The escape hatch is named, not hidden
`{ dangerouslyRawHtml }` inserts its content **verbatim**. It exists because some output
genuinely needs markup the node API does not cover — but the name puts the risk where it
is taken. Escape anything from the document yourself: [`escapeHtml`](/api/rendering#escapehtml)
for text, [`escapeAttr`](/api/rendering#escapeattr) for an attribute value.
:::

::: warning `ctx.formatValue` returns HTML, not text
It reuses the technical panel's formatting, which sanitises XHTML — so its result is
markup. Passing it as a text child would escape it and show the tags. It belongs in
`dangerouslyRawHtml`:

```ts
render: (_v, ctx) => ({
  tag: "span",
  children: [{ dangerouslyRawHtml: ctx.formatValue(ctx.getValue("Name")) }],
});
```
:::

## The context

| Member | Role |
|---|---|
| `ctx.specObject` | The `SpecObject` being rendered. |
| `ctx.specType` | Its `SpecObjectType`, when resolvable. |
| `ctx.index` | The full index for resolving cross-references. |
| `ctx.attachments` | The attachments already resolved to `data:` URIs. |
| `ctx.isChapter` | True when the object matches `chapterNumberAttributes`. |
| `ctx.getValue(name)` | Reads another attribute of the same object, by long name or identifier. |
| `ctx.getDefinition(name)` | The same, for the `AttributeDefinition`. |
| `ctx.formatValue(v)` | Formats as the technical panel does (enumeration labels resolved, XHTML sanitised…). |

## What to know

- `value` is `undefined` when the object does not carry that attribute — return
  `undefined` to show nothing.
- By default the targeted attribute **also stays visible** in the technical panel (full
  transparency); pass `hideFromTechnical: true` to hide it there, since your renderer is
  already showing it.
- An exception thrown inside `render()` is caught: it never interrupts the rendering of
  the rest of the document. A `custom-renderer-threw` event is emitted
  ([diagnostics](/guide/diagnostics)).
- Text you put in `children` is escaped for you. Only `dangerouslyRawHtml` is inserted
  as-is.

## The safety net: unbalanced HTML

This applies to `dangerouslyRawHtml` alone — structured nodes are balanced by
construction. If the markup you return has unbalanced tags — one left unclosed, one
closing tag too many — the library detects it and shows it **as escaped text** rather than
inserting it raw.

This is not squeamishness: an imbalance does not only break your badge, it breaks the
structure of **everything displayed after it** — the content, the technical details, right
through to the following requirements in the tree, which end up swallowed inside your
still-open tag. The visible symptom would be "half my document has disappeared", a
thousand lines from the actual cause.

A warning is then sent to the console with the offending HTML, and a
`custom-renderer-unbalanced-html` event is emitted.

<!-- exemple: extrait — une ligne `render:` volontairement hors contexte -->

```ts
render: () => ({ dangerouslyRawHtml: `<span class="badge">CRS-001` }), // <-- never closed
// shown literally: <span class="badge">CRS-001
```

::: tip
This net does not replace a test. If your renderer builds HTML by concatenation, the
safest way never to hit this case is not to produce an opening tag without its closing one
in the same expression.
:::
