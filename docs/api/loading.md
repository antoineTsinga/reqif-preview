# Loading and parsing

<!--@include: ../_conventions.md-->

## `loadReqIfPackage`

```ts
function loadReqIfPackage(input: ReqIfInput, options?: ParseOptions): Promise<ReqIfPackage>;
type ReqIfInput = string | Uint8Array | ArrayBuffer;
```

The normal entry point. It works out what it was handed on its own:

- a **string** is ReqIF XML;
- **bytes** starting with the zip signature (`PK`) are a `.reqifz`: every `.reqif` inside
  is parsed, the rest becomes the package's `AttachmentResolver`;
- any other **bytes** are decoded as UTF-8 and treated as XML.

```ts
const pkg = await loadReqIfPackage(bytes);
pkg.documents;   // ReqIfDocument[] — a .reqifz may legitimately hold several
pkg.document;    // the first one, a convenience accessor for the single-document case
pkg.attachments; // AttachmentResolver (EMPTY_ATTACHMENTS for a bare .reqif)
```

::: warning `pkg.document` is not always enough
To build an index or render a package, use `pkg.documents`. `pkg.document` returns only
the first — relations crossing the boundary between two `.reqif` files then stop
resolving. See [Links between requirements](/guide/relations).
:::

## `parseReqIfXml`

```ts
function parseReqIfXml(xml: string, options?: ParseOptions): ReqIfDocument;
```

Parses a ReqIF XML string already in memory, **synchronously**. No attachments, no zip —
the raw content, nothing else. Useful on the server when the XML comes from a database or
an API.

## `ParseOptions`

```ts
interface ParseOptions {
  maxNestedTags?: number;
  processEntities?: Partial<{ /* fast-xml-parser limits */ }> | false;
}
```

| Option | Default | Role |
|---|---|---|
| `maxNestedTags` | `10000` | Maximum XML nesting depth. `fast-xml-parser` stops at 100, too low for real ReqIF. |
| `processEntities` | raised limits | XML entity-expansion guards. A partial object, or `false` to disable entity processing entirely. |

Both are **security decisions** before they are convenience settings — see
[Deeply nested documents](/guide/large-documents).

## `ReqIfParseError`

```ts
class ReqIfParseError extends Error {
  readonly cause?: unknown; // the underlying error (fast-xml-parser, fflate) when there is one
}
```

The **only** error this library throws. The cases:

- malformed XML, or an unreadable `.reqifz` archive;
- no `.reqif` inside the archive;
- a missing `<REQ-IF>` root element;
- a missing `<THE-HEADER>` or `<CORE-CONTENT>` — the spec makes both mandatory;
- an unknown datatype, spec type, attribute definition or attribute value tag.

Everything that happens **after** parsing degrades silently rather than throwing
([diagnostics](/api/diagnostics)).

```ts
try {
  const pkg = await loadReqIfPackage(bytes);
} catch (e) {
  if (e instanceof ReqIfParseError) showUserError(e.message);
  else throw e;
}
```

## Attachments

### `AttachmentResolver`

```ts
interface AttachmentResolver {
  resolve(path: string): ReqIfAttachment | undefined;
  list(): ReqIfAttachment[];
}
```

The contract the renderer uses to find a binary file. The `path` you receive is exactly
what was written in the `data` attribute of an `<object>` in the rich text.

### `ReqIfAttachment`

```ts
interface ReqIfAttachment {
  path: string;
  mimeType?: string;
  size: number;
  getBytes(): Promise<Uint8Array>;
}
```

`getBytes` is **lazy**: the bytes are read on demand, and only once. Opening a 200 MB
`.reqifz` does not pull 200 MB into memory.

### `createAttachmentResolver`

```ts
function createAttachmentResolver(
  fetchByPath: (path: string) => { bytes: Uint8Array; mimeType?: string } | undefined,
): AttachmentResolver;
```

For a bare `.reqif` whose images live elsewhere — a CDN, an API, a folder on disk:

```ts
const attachments = createAttachmentResolver((path) => {
  const bytes = myOwnFileLookup(path);
  return bytes ? { bytes } : undefined;
});

const html = await renderPackageToHtml(pkg, { attachments });
```

The MIME type is inferred from the extension if you do not supply one.

### `EMPTY_ATTACHMENTS`

```ts
const EMPTY_ATTACHMENTS: AttachmentResolver;
```

A resolver that never finds anything. It is what `loadReqIfPackage` gives a bare `.reqif`,
and a convenient explicit default when a signature demands one.

## `ReqIfPackage`

```ts
interface ReqIfPackage {
  documents: ReqIfDocument[];
  document: ReqIfDocument;
  attachments: AttachmentResolver;
}
```

The result of loading, and the input to [`renderPackageToHtml`](/api/rendering).
