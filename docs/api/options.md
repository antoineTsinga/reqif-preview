# Render options

<!--@include: ../_conventions.md-->

## `RenderOptions`

The same object is accepted by `renderPackageToHtml`, `renderDocumentToHtml` and
`renderSpecification`. Every property is optional.

### Presentation

| Option | Type | Default | Effect |
|---|---|---|---|
| `includeCss` | `boolean` | `true` | Includes the default stylesheet in a `<style>` at the top of the output. If `false`, load it through `reqif-preview/style.css` or the `DEFAULT_CSS` export — see [Stylesheet](/api/#stylesheet). |
| `layout` | `"stacked" \| "tabs"` | `"stacked"` | CSS tabs between documents and between specifications. No effect when there is only one. [Details](/guide/layout) |
| `readingMode` | `boolean` | `false` | Reading view: hides ID, created/modified and the technical panel; titles as `<h3>`…`<h6>`. |
| `chapterNumbers` | `boolean` | `false` | Prefixes titles with `1`, `1.1`, `1.1.1`…, restarting at 1 per `Specification`. |
| `chapterNumberAttributes` | `string[]` | — | Numbers only nodes carrying one of these attributes. No effect without `chapterNumbers`. |
| `labels` | `Partial<RenderLabels>` | English | Replaces the interface labels. |
| `dateLocale` | `string` | `"en-GB"` | Locale used to format the created/modified dates. |

### Content

| Option | Type | Default | Effect |
|---|---|---|---|
| `contentAttributes` | `string[]` | — | Strict allow-list of the attributes making up the main content, in this order. [Details](/guide/title-and-content) |
| `titleAttributes` | `string[]` | — | Attributes tried as a title **as a last resort**, after the `LONG-NAME`s. |
| `showTechnicalByDefault` | `boolean` | `false` | Opens the "Technical details" panel from the start. |
| `hideEmptyAttributes` | `boolean` | `true` | Omits attributes with no value at all from the technical panel. |
| `preferSimplifiedXhtml` | `boolean` | `false` | Shows the simplified version rather than the original. [Details](/guide/simplified-text) |
| `showRelations` | `boolean` | `true` | Shows incoming/outgoing links. Visible in `readingMode` too. |
| `customAttributeRenderers` | `CustomAttributeRenderer[]` | — | Injects HTML of your own before/after the content. |

### The "(untitled)" / "(empty)" placeholders

| Option | Type | Effect |
|---|---|---|
| `suppressEmptyPlaceholdersForChapters` | `boolean` | A shortcut for "chapter" objects. No effect without `chapterNumberAttributes`. |
| `isTitleless` | `(obj, specType, index) => boolean` | Decides, by your own criteria, that an empty title is normal for this object. |
| `isContentless` | `(obj, specType, index) => boolean` | The same for empty content. Independent of the previous one. |

The three compose: the placeholder is suppressed if **any** says yes.
See [Choosing exactly which title and content are shown](/guide/title-and-content#deliberately-empty-title-or-content).

### Attachments and diagnostics

| Option | Type | Default | Effect |
|---|---|---|---|
| `attachments` | `AttachmentResolver` | the package's | Replaces the resolver. [Details](/guide/attachments) |
| `maxInlineBytes` | `number` | `5 * 1024 * 1024` | Maximum size inlined as a `data:` URI, per file. |
| `onDegradation` | `DegradationHandler` | — | Observes everything the render silently degrades. [Details](/api/diagnostics) |

## `RenderLabels`

Every interface label, English by default. `labels` accepts a **partial** object — only the
labels you supply are replaced.

```ts
interface RenderLabels {
  noContent: string;              // "(vide)"
  untitled: string;               // "(sans titre)"
  idLabel: string;
  technicalDetails: string;       // "Détails techniques"
  headerTitle: string;
  headerSourceTool: string;
  headerExportedBy: string;
  headerCreationTime: string;
  headerComment: string;
  yes: string;
  no: string;
  createdByLabel: string;
  createdOnLabel: string;
  modifiedByLabel: string;
  modifiedOnLabel: string;
  relationsLabel: string;         // "Liens"
  relationFallbackType: string;
  relationUnresolved: string;
}
```

## `FRENCH_LABELS`

```ts
const FRENCH_LABELS: RenderLabels;
```

The complete set this library shipped as its default until 0.2.0, so the previous
rendering is one line away rather than eighteen:

```ts
import { FRENCH_LABELS } from "reqif-preview";

const html = await renderPackageToHtml(pkg, {
  labels: FRENCH_LABELS,
  dateLocale: "fr-FR",
});
```

Any other language is the same shape — `labels` is partial, so supply only what you need.

## `CustomAttributeRenderer`

```ts
interface CustomAttributeRenderer {
  attribute: string;                    // long name (case/space-insensitive) or identifier
  position?: "before" | "after";        // default: "before"
  render(value: AttributeValue | undefined, ctx: AttributeRenderContext): RenderOutput;
  hideFromTechnical?: boolean;          // default: false
}
```

Two safety nets: an exception inside `render()` is caught (`custom-renderer-threw`), and
unbalanced `dangerouslyRawHtml` is shown as escaped text
(`custom-renderer-unbalanced-html`) rather than breaking the structure of everything that
follows. See [Custom renderers](/guide/custom-renderers).

## `RenderOutput`, `RenderNode`, `RenderElement`, `RenderRawHtml`

What a renderer returns. Text is escaped by default; raw markup has to be asked for by
name.

```ts
type RenderNode = string | RenderElement | RenderRawHtml;

interface RenderElement {
  tag: string;                      // allow-listed, otherwise unwrapped (unwrapped-tag)
  attrs?: Record<string, string>;   // allow-listed, values escaped
  children?: RenderNode[];          // a string here is text
}

interface RenderRawHtml {
  dangerouslyRawHtml: string;       // inserted verbatim — escape it yourself
}

type RenderOutput = RenderElement | RenderRawHtml | RenderNode[] | undefined;
```

| | Allowed |
|---|---|
| Tags | `span` `div` `p` `a` `code` `strong` `b` `em` `i` `small` `br` `img` `ul` `ol` `li` |
| Attributes | `class` `id` `title` `lang` `dir`, plus `href` / `src` through the URL-scheme filter |

`style` is deliberately absent — presentation belongs in your own stylesheet. A bare string
is **not** accepted at the top level: under the previous API it meant raw HTML, so
accepting it would silently change what existing renderers produce. From untyped
JavaScript it is escaped, with `custom-renderer-raw-string`.

## `AttributeRenderContext`

```ts
interface AttributeRenderContext {
  specObject: SpecObject;
  specType: SpecType | undefined;
  index: ReqIfIndex;
  attachments: AttachmentLookup;
  isChapter: boolean;
  getValue(attributeNameOrId: string): AttributeValue | undefined;
  getDefinition(attributeNameOrId: string): AttributeDefinition | undefined;
  formatValue(value: AttributeValue | undefined): string;
}
```

`formatValue` reuses exactly the technical panel's formatting: enumeration labels
resolved, XHTML sanitised, booleans following `labels.yes`/`labels.no`. It is the shortest
way to display a value "as the library would" without reimplementing the type logic.
