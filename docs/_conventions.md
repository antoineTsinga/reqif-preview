::: details Conventions used by the examples on this page

So the same preamble is not repeated everywhere, the examples below assume this
setting. Each block then shows only what it is demonstrating.

```ts
import { loadReqIfPackage, ReqIfIndex } from "reqif-preview";

// The bytes of your .reqif or .reqifz file.
// See [Getting started](/guide/getting-started) for reading them from an
// <input type="file">, from Node, or from a URL.
declare const bytes: Uint8Array;

const pkg = await loadReqIfPackage(bytes);
const doc = pkg.document; // the first document in the package

// pkg.documents, not pkg.document: this is what resolves relations that cross
// the boundary between two .reqif files inside one .reqifz.
const index = new ReqIfIndex(pkg.documents);

const spec = doc.coreContent.specifications[0];
const obj = index.specObjects.get(spec.children[0].objectRef)!;
```

:::
