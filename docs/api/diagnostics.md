# Diagnostics

Three types, one option. See [the guide](/guide/diagnostics) for usage and for reading the
symptoms.

## `DegradationHandler`

```ts
type DegradationHandler = (event: DegradationEvent) => void;
```

Passed through `RenderOptions.onDegradation` — accepted by `renderPackageToHtml`,
`renderDocumentToHtml`, `renderSpecification`, `createAttachmentLookup` and
`renderXhtmlContent`.

An exception thrown inside the handler is **caught and ignored**. A diagnostic channel
that broke what it was observing would be worse than no channel at all.

## `DegradationEvent`

```ts
interface DegradationEvent {
  code: DegradationCode;
  /** A readable sentence, safe to log as-is. */
  message: string;
  /** What identifies the place: an id, a path, a tag name, the offending value. */
  detail?: Record<string, unknown>;
}
```

## `DegradationCode`

```ts
type DegradationCode =
  | "attachment-missing"
  | "attachment-too-large"
  | "unresolved-reference"
  | "orphan-attribute-value"
  | "missing-spec-object"
  | "duplicate-dom-id"
  | "custom-renderer-threw"
  | "custom-renderer-unbalanced-html"
  | "dropped-tag"
  | "unwrapped-tag"
  | "dropped-style-declaration"
  | "dropped-href"
  | "unparsable-date"
  | "invalid-locale";
```

| Code | Situation | `detail` keys |
|---|---|---|
| `attachment-missing` | a referenced attachment no resolver can find | `path` |
| `attachment-too-large` | an attachment over `maxInlineBytes`, left unresolved | `path`, `size`, `maxInlineBytes` |
| `unresolved-reference` | a `SpecRelation` pointing at an object absent from the render | `relation`, `sourceRef`, `targetRef` |
| `orphan-attribute-value` | a value whose `AttributeDefinition` is absent from the declared `SpecType` | `specObject`, `definitionRef`, `specType` |
| `missing-spec-object` | a tree node pointing at a `SpecObject` that does not exist | `specHierarchy`, `objectRef` |
| `duplicate-dom-id` | an object rendered more than once; only the first carries the `id` | `specObject`, `id`, `specHierarchy` |
| `custom-renderer-threw` | a `customAttributeRenderers` threw and was ignored | `attribute`, `specObject`, `error` |
| `custom-renderer-unbalanced-html` | custom HTML left unbalanced, escaped as text | `attribute`, `specObject`, `html` |
| `dropped-tag` | a tag removed along with its subtree (`<script>`, `<iframe>`…) | `tag` |
| `unwrapped-tag` | a non-allow-listed tag unwrapped, children kept | `tag` |
| `dropped-style-declaration` | an invalid `style` declaration discarded | `prop`, `value` |
| `dropped-href` | a `javascript:` / `vbscript:` / `data:` `href` neutralised | `href` |
| `unparsable-date` | a date that could not be parsed, shown as-is | `value` |
| `invalid-locale` | `Intl` rejected the configured locale | `locale`, `value` |

The identifiers reported (`specObject`, `specHierarchy`, `relation`…) are **ReqIF**
identifiers, not DOM `id`s — except the `id` key of `duplicate-dom-id`, which is indeed
the conflicting HTML anchor.

::: warning Volume
`dropped-tag` and `unwrapped-tag` can fire thousands of times on a large export — every
disallowed Word formatting `<span>` counts. This is a diagnostic channel, not a production
log: filter by code, or only turn the option on while investigating.
:::

::: info The rendering does not change
Wiring up a handler changes strictly nothing about the HTML output. The option makes
decisions that were already taken visible; it takes none of its own.
:::
