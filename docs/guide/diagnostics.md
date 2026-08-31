# Diagnosing what was degraded (`onDegradation`)

<!--@include: ../_conventions.md-->

Past the parsing stage, **nothing throws**. A surprising input degrades locally and the
rest of the document still renders. That is the right behaviour in production — a
requirements preview beats a blank page — and a miserable one in support: faced with
"things are missing from my preview", there is nothing to inspect.

```ts
import type { DegradationEvent } from "reqif-preview";

const events: DegradationEvent[] = [];
const html = await renderPackageToHtml(pkg, { onDegradation: (e) => events.push(e) });

// [{ code: "attachment-missing", message: 'No attachment resolved for "schema.png".',
//    detail: { path: "schema.png" } }, …]
```

::: info The rendering is strictly identical with or without a handler
The option changes nothing about the output. It only makes visible decisions that were
already being taken, silently. You can therefore wire it up in production without fearing
a change in behaviour.
:::

## The codes emitted

| Code | Situation |
|---|---|
| `attachment-missing` | a referenced attachment no resolver can find |
| `attachment-too-large` | an attachment over `maxInlineBytes`, left unresolved |
| `unresolved-reference` | a `SpecRelation` pointing at an object absent from the render |
| `duplicate-dom-id` | an object rendered more than once; only the first carries the `id` |
| `orphan-attribute-value` | a value whose `AttributeDefinition` is absent from the declared `SpecType` |
| `missing-spec-object` | a tree node pointing at a `SpecObject` that does not exist |
| `custom-renderer-threw` | a `customAttributeRenderers` threw and was ignored |
| `custom-renderer-unbalanced-html` | custom HTML left unbalanced, escaped as text |
| `dropped-tag` | a tag removed along with its subtree (`<script>`, `<iframe>`…) |
| `unwrapped-tag` | a non-allow-listed tag unwrapped, children kept |
| `dropped-style-declaration` | an invalid `style` declaration discarded |
| `dropped-href` | a `javascript:` / `vbscript:` / `data:` `href` neutralised |
| `unparsable-date` | a date that could not be parsed, shown as-is |
| `invalid-locale` | `Intl` rejected the configured locale |

## A diagnostic channel, not a log

::: warning
`dropped-tag` and `unwrapped-tag` can fire **thousands of times** on a large export: every
disallowed Word formatting `<span>` counts. Filter by code, or only turn the option on
while investigating.
:::

In practice what you can act on is the **aggregate**, not the raw list:

```ts
const byCode = new Map<string, number>();
await renderPackageToHtml(pkg, {
  onDegradation: (e) => byCode.set(e.code, (byCode.get(e.code) ?? 0) + 1),
});
console.table([...byCode]);
```

That is exactly what the "Diagnostics" panel of the [playground](/playground) does: one
row per code, with a counter and a sample message.

## A handler that throws is ignored

An exception in your handler is caught and swallowed. A diagnostic channel that broke what
it was observing would be worse than no channel at all.

## What to look at first

| Reported symptom | Code to look for |
|---|---|
| "The images do not show" | `attachment-missing`, `attachment-too-large` |
| "This traceability link goes nowhere" | `unresolved-reference` |
| "Clicking a link takes me to the wrong place" | `duplicate-dom-id` |
| "A whole requirement is missing" | `missing-spec-object` |
| "An attribute is absent from the technical panel" | `orphan-attribute-value` |
| "My formatting is lost" | `dropped-tag`, `unwrapped-tag`, `dropped-style-declaration` |
| "My custom badge shows as plain text" | `custom-renderer-unbalanced-html` |
| "The dates look odd" | `unparsable-date`, `invalid-locale` |
