::: details Conventions des exemples de cette page

Pour ne pas répéter la même amorce partout, les exemples qui suivent supposent ce décor.
Chaque bloc ne montre donc que ce qu'il démontre.

```ts
import { loadReqIfPackage, ReqIfIndex } from "reqif-preview";

// Les octets de votre fichier .reqif ou .reqifz.
// Voir [Démarrage](/guide/demarrage) pour les obtenir depuis un <input type="file">,
// depuis Node ou depuis une URL.
declare const bytes: Uint8Array;

const pkg = await loadReqIfPackage(bytes);
const doc = pkg.document; // le premier document du paquet

// pkg.documents, pas pkg.document : c'est ce qui résout les relations qui
// traversent la frontière entre deux .reqif d'un même .reqifz.
const index = new ReqIfIndex(pkg.documents);

const spec = doc.coreContent.specifications[0];
const obj = index.specObjects.get(spec.children[0].objectRef)!;
```

Ce bloc est vérifié au build, comme tous les exemples du site : `scripts/check-doc-examples.mjs`
le compile et refuse toute variable dont on ne connaît pas la provenance.

:::
