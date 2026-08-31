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
| `labels` | `Partial<RenderLabels>` | French | Replaces the interface labels. |
| `dateLocale` | `string` | `"fr-FR"` | Locale used to format the created/modified dates. |

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

Every interface label, French by default. `labels` accepts a **partial** object — only the
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

::: tip Translating the whole interface
```ts
const html = await renderPackageToHtml(pkg, {
  dateLocale: "en-US",
  labels: {
    noContent: "(empty)", untitled: "(untitled)", technicalDetails: "Technical details",
    yes: "Yes", no: "No", relationsLabel: "Links",
  },
});
```
:::

## `CustomAttributeRenderer`

```ts
interface CustomAttributeRenderer {
  attribute: string;                    // long name (case/space-insensitive) or identifier
  position?: "before" | "after";        // default: "before"
  render(value: AttributeValue | undefined, ctx: AttributeRenderContext): string | undefined;
  hideFromTechnical?: boolean;          // default: false
}
```

The HTML you return is inserted **as-is** — it is code you wrote, not document content, so
it is not sanitised. Escape interpolated text with
[`escapeHtml`](/api/rendering#escapehtml).

Two safety nets: an exception inside `render()` is caught (`custom-renderer-threw`), and
HTML with unbalanced tags is shown as escaped text (`custom-renderer-unbalanced-html`)
rather than breaking the structure of everything that follows. See
[Custom renderers](/guide/custom-renderers).

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
