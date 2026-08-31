# Getting started

`reqif-preview` is a **framework-independent** library for parsing and previewing
**ReqIF** (`.reqif`) and **ReqIFZ** (`.reqifz`, the zip archive carrying attachments)
files, conformant to the OMG ReqIF v1.2 spec (formal/2016-07-01).

It works in the browser (bundled by Vite, Webpack…, or through a
`<script type="module">`) as well as on Node.js (SSR, CLI, batch processing). No
dependency on React, Vue or Angular — you get either a **typed data model** or
**ready-to-display HTML** (`innerHTML`), and you put it wherever you like.

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

That is all there is to the simple case: `loadReqIfPackage` works out on its own
whether the input is raw XML (`.reqif`) or a zip archive (`.reqifz`), extracts the
attachments, and `renderPackageToHtml` produces a self-contained block of HTML (with
its own `<style>` scoping `.reqif-preview`) — the specification tree, rich text
(bold/italic/lists/tables), images inlined as `data:` URIs.

## What the default view shows

For each requirement, only three things are visible without the reader doing anything:

- the **title** (the clickable summary in the tree);
- the **ID** — `ReqIF.ForeignID` (or an equivalent: "Foreign ID", "ForeignID") when the
  document provides one, falling back to the internal GUID otherwise;
- the **rich text** (the content of XHTML-typed attributes — the requirement's
  description or body);
- a clearly labelled **"Created by X · date — Modified by Y · date"** line when the
  document supplies it (the `ReqIF.ForeignCreatedBy/On` and
  `ReqIF.ForeignModifiedBy/On` convention, used by DOORS, DOORS Next, ReqEdit,
  ReqView…). When modification equals creation, the "Modified" half is not repeated.

Every other attribute (strings, numbers, dates, enumerations, booleans…) is gathered
into a **"Technical details"** panel, collapsed by default and opened with one click —
a native `<details>`/`<summary>`, no JavaScript involved.

::: info The technical panel never filters anything out
It lists **every single** attribute of the object, including those already summarised
elsewhere (ID, created/modified). That is deliberate: in a requirements preview, data
hidden without saying so is worth less than data shown twice.
:::

Created/modified detection recognises `ReqIF.ForeignCreatedBy/On` whether they are
stored as a plain string or as XHTML (DOORS sometimes exports these fields as XHTML) —
whatever data type is declared, the text is extracted correctly.

```ts
// Collapsed by default. To have it open from the start:
const html = await renderPackageToHtml(pkg, { showTechnicalByDefault: true });

// Locale used to format the created/modified dates (default "fr-FR"):
const html = await renderPackageToHtml(pkg, { dateLocale: "en-US" });
```

::: warning Labels default to French
The library ships French labels, because that is the language of the project it grew
out of. English is one option away:

```ts
const html = await renderPackageToHtml(pkg, {
  dateLocale: "en-GB",
  labels: {
    technicalDetails: "Technical details",
    noContent: "(empty)",
    untitled: "(untitled)",
    yes: "Yes",
    no: "No",
    relationsLabel: "Links",
  },
});
```

The complete list is in [`RenderLabels`](/api/options#renderlabels).
:::

## In the browser, from an `<input type="file">`

```html
<input type="file" id="file" accept=".reqif,.reqifz" />
<div id="preview"></div>
<script type="module">
  import { loadReqIfPackage, renderPackageToHtml } from "./node_modules/reqif-preview/dist/index.js";

  document.getElementById("file").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pkg = await loadReqIfPackage(bytes);
    document.getElementById("preview").innerHTML = await renderPackageToHtml(pkg);
  });
</script>
```

See [`examples/browser.html`](https://github.com/antoineTsinga/reqif-preview/blob/main/examples/browser.html)
for a complete demo with no framework at all — and the [playground](/playground) for the
same thing with every option exposed.

## On Node.js

```ts
import { readFile, writeFile } from "node:fs/promises";
import { loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

const bytes = await readFile("export.reqifz");
const pkg = await loadReqIfPackage(bytes);
const html = await renderPackageToHtml(pkg);
await writeFile("preview.html", html);
```

## Where to next

- The default rendering does not show what you want? →
  [Title and content shown](/guide/title-and-content)
- Several documents in one `.reqifz`? → [Tabs, numbering, reading view](/guide/layout)
- You would rather render it yourself? → [Rendering it yourself](/guide/your-own-rendering)
- "Things are missing from my preview" → [Diagnostics](/guide/diagnostics)
