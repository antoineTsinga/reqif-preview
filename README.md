# reqif-preview

**Framework-independent** library for parsing and previewing **ReqIF** (`.reqif`) and **ReqIFZ** (`.reqifz`, the zip archive carrying attachments) files, conformant to the OMG ReqIF v1.2 spec (formal/2016-07-01).

Works in the browser (bundled by Vite/Webpack/etc., or through `<script type="module">`) as well as on Node.js (SSR, CLI, batch processing). No dependency on React/Vue/Angular — you get either a **typed data model** or **ready-to-display HTML** (`innerHTML`), and you put it wherever you like.

📖 **[Full documentation](https://reqif-preview.dev/)** — guide, API reference, and a [playground](https://reqif-preview.dev/playground) that runs the real library on *your* file, in your browser. Also available [in French](https://reqif-preview.dev/fr/).

## Installation

```bash
npm install reqif-preview
```

## Quick start

```ts
import { loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

// The bytes of your file. From a URL:
const fileBytes = new Uint8Array(await (await fetch("/requirements.reqifz")).arrayBuffer());
// From an <input type="file"> : new Uint8Array(await file.arrayBuffer())
// From Node                   : await readFile("requirements.reqifz")

// input: raw XML string, Uint8Array, or ArrayBuffer (.reqif vs .reqifz is detected)
const pkg = await loadReqIfPackage(fileBytes);

const html = await renderPackageToHtml(pkg);
document.getElementById("preview").innerHTML = html;
```

That is all there is to the simple case: `loadReqIfPackage` works out on its own whether the input is raw XML (`.reqif`) or a zip archive (`.reqifz`), extracts the attachments, and `renderPackageToHtml` produces a self-contained block of HTML (with its own `<style>` scoping `.reqif-preview`) — the specification tree, rich text (bold/italic/lists/tables), images inlined as `data:` URIs.

To see the result on **your** file before installing anything, the [playground](https://reqif-preview.dev/playground) runs the library in your browser — nothing is sent anywhere. And [`examples/browser.html`](https://github.com/antoineTsinga/reqif-preview/blob/main/examples/browser.html) is a standalone page, with no framework and no build step.

## Documentation

Everything else lives on the [documentation site](https://reqif-preview.dev/):

| | |
|---|---|
| [Getting started](https://reqif-preview.dev/guide/getting-started) | installation, the default view, browser and Node.js |
| [Title and content shown](https://reqif-preview.dev/guide/title-and-content) | `contentAttributes`, `titleAttributes`, placeholders |
| [Simplified text](https://reqif-preview.dev/guide/simplified-text) | `isSimplified` and `THE-ORIGINAL-VALUE` |
| [Custom renderers](https://reqif-preview.dev/guide/custom-renderers) | `customAttributeRenderers`, escaping and the escape hatch |
| [Tabs, numbering, reading view](https://reqif-preview.dev/guide/layout) | `layout`, `chapterNumbers`, `readingMode` |
| [Links between requirements](https://reqif-preview.dev/guide/relations) | `SpecRelation`, anchors, cross-document relations |
| [Attachments](https://reqif-preview.dev/guide/attachments) | `.reqifz`, custom resolver |
| [Deeply nested documents](https://reqif-preview.dev/guide/large-documents) | `maxNestedTags`, `processEntities` |
| [Diagnostics](https://reqif-preview.dev/guide/diagnostics) | `onDegradation` and its 16 codes |
| [Security](https://reqif-preview.dev/guide/security) | allowlist, `style`, URL schemes |
| [Rendering it yourself](https://reqif-preview.dev/guide/your-own-rendering) | the typed model, `ReqIfIndex`, the helpers |
| [API reference](https://reqif-preview.dev/api/) | every public export, one by one |

## Contributing

Development commands, how the documentation site works and the release procedure are in [CONTRIBUTING.md](https://github.com/antoineTsinga/reqif-preview/blob/main/CONTRIBUTING.md).

## Licence

MIT
