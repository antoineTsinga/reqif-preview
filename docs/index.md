---
layout: home

hero:
  name: reqif-preview
  text: ReqIF and ReqIFZ, displayed without the work
  tagline: >-
    Parse and preview ReqIF requirements in the browser or on Node.js. No
    dependency on React, Vue or Angular — a typed model on one side,
    ready-to-display HTML on the other.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Playground
      link: /playground
    - theme: alt
      text: API reference
      link: /api/
    - theme: alt
      text: GitHub
      link: https://github.com/antoineTsinga/reqif-preview

features:
  - title: Two lines for a preview
    details: >-
      loadReqIfPackage works out on its own whether it was handed raw XML or a
      zip archive, and extracts the attachments; renderPackageToHtml returns a
      self-contained block of HTML, stylesheet included.
    link: /guide/getting-started
    linkText: Get started
  - title: Or render it yourself
    details: >-
      A typed data model, acyclic and serialisable, faithful to the spec's UML.
      Cross-references stay plain strings; ReqIfIndex resolves them in O(1).
    link: /guide/your-own-rendering
    linkText: Data model
  - title: OMG ReqIF v1.2 conformant
    details: >-
      formal/2016-07-01. The data model follows the spec closely, edge cases
      included, rather than a convenient subset of it.
    link: /api/model
    linkText: Model
---

<HeroPreview />

## In three lines

```ts
import { loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

const fileBytes = new Uint8Array(await (await fetch("/requirements.reqifz")).arrayBuffer());
const pkg = await loadReqIfPackage(fileBytes); // .reqif or .reqifz, detected for you
document.getElementById("preview").innerHTML = await renderPackageToHtml(pkg);
```

That is all there is to the simple case. What comes back is a self-contained block of
HTML — the specification tree, rich text (bold, italic, lists, tables), images inlined
as `data:` URIs — carrying its own `<style>` scoped to `.reqif-preview`.

<div class="tip custom-block" style="padding-top: 8px">

Want to try it on **your** file before installing anything? The
[playground](/playground) runs the real library in your browser: nothing is sent
anywhere.

</div>
