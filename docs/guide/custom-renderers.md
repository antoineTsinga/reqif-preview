# Showing content of your own

<!--@include: ../_conventions.md-->

`ReqIF.ForeignID` covers the standard case, but plenty of tools keep their business
identifier in a freely named attribute — `IE PUID` in DOORS, for instance, sometimes as
XHTML rather than a plain string. For those cases, register a **custom renderer**: the
function receives the already-resolved value of the attribute you target, plus a context
giving access to *every* other attribute of the object, and its HTML is injected right
before or right after the main text, as you prefer.

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
          ? `<span class="puid-badge">${text}</span>` // escape your own text
          : undefined;
      },
    },
  ],
});
```

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
- The HTML you return is inserted **as-is**. It is not ReqIF document content but code
  *you* wrote, so it is not sanitised. Escape any raw text you interpolate yourself, for
  example with `escapeHtml`, which the library exports.

## The safety net: unbalanced HTML

If the HTML you return has unbalanced tags — one left unclosed, one closing tag too many —
the library detects it and shows it **as escaped text** rather than inserting it raw.

This is not squeamishness: an imbalance does not only break your badge, it breaks the
structure of **everything displayed after it** — the content, the technical details, right
through to the following requirements in the tree, which end up swallowed inside your
still-open tag. The visible symptom would be "half my document has disappeared", a
thousand lines from the actual cause.

A warning is then sent to the console with the offending HTML, and a
`custom-renderer-unbalanced-html` event is emitted.

<!-- exemple: extrait — une ligne `render:` volontairement hors contexte -->

```ts
render: () => `<span class="badge">CRS-001`, // <-- tag never closed
// shown literally: <span class="badge">CRS-001
```

::: tip
This net does not replace a test. If your renderer builds HTML by concatenation, the
safest way never to hit this case is not to produce an opening tag without its closing one
in the same expression.
:::
