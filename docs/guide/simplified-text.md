# Text simplified along the way (`isSimplified`)

<!--@include: ../_conventions.md-->

When a tool in the exchange chain cannot interpret the formatting of an XHTML attribute,
the spec (clause 10.8.20) asks it to:

1. replace the content with a simplified version;
2. set `IS-SIMPLIFIED="true"` on the value;
3. **keep the original** in `<THE-ORIGINAL-VALUE>`.

In other words, the file carries both versions: the one the intermediate tool could
display, and the one it was handed.

## Why the original by default

`reqif-preview` renders the full XHTML subset the spec allows — so it does not have the
shortcoming this flag reports. **By default it shows the original**, as the more faithful
of the two:

```ts
// Default behaviour: the original if there is one, the simplified content otherwise.
const html = await renderPackageToHtml(pkg);

// To reproduce what a limited tool would see:
const html = await renderPackageToHtml(pkg, { preferSimplifiedXhtml: true });
```

Both contents are exposed on the model:

```ts
const { value } = resolveAttribute(obj, index, "ReqIF.Text");

if (value?.kind === "XHTML") {
  value.value;         // XhtmlContent — what the spec calls theValue
  value.originalValue; // XhtmlContent — theOriginalValue, when present
  value.isSimplified;  // true when value.value is a degraded stand-in
}
```

Attachments referenced by either one are resolved: toggling `preferSimplifiedXhtml` never
makes an image disappear.

## Text extraction: always the original

`xhtmlToPlainText` and `valueToPlainText` **always** read the original when there is one,
regardless of `preferSimplifiedXhtml`. The reason is concrete: a simplification may have
*lost* text — a flattened table, a collapsed list — and a full-text search or a CSV export
wants the most complete source, not the prettiest one.

::: tip See the difference
The [playground](/playground) loads a sample where one requirement carries both versions.
Tick `preferSimplifiedXhtml` and watch it change.
:::

## A modelling reminder

`isSimplified` applies to **an attribute value**, not to an object and not to a document.
One `SpecObject` can perfectly well have a simplified `ReqIF.Text` and an untouched
description: the flag is always read on the `AttributeValueXHTML` concerned.
