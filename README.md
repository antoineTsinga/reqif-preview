# reqif-preview

Bibliothèque **indépendante de tout framework** pour parser et prévisualiser des fichiers **ReqIF** (`.reqif`) et **ReqIFZ** (`.reqifz`, l'archive zip avec pièces jointes), conforme à la spec OMG ReqIF v1.2 (formal/2016-07-01).

Fonctionne aussi bien dans le navigateur (bundlé par Vite/Webpack/etc., ou via `<script type="module">`) que côté Node.js (SSR, CLI, traitement batch). Zéro dépendance à React/Vue/Angular — vous récupérez soit un **modèle de données typé**, soit du **HTML prêt à afficher** (`innerHTML`), et vous l'intégrez où vous voulez.

📖 **[Documentation complète](https://antoinetsinga.github.io/reqif-preview/)** — guide, référence API, et un [bac à sable](https://antoinetsinga.github.io/reqif-preview/bac-a-sable) qui exécute la vraie bibliothèque sur *votre* fichier, dans votre navigateur.

## Installation

```bash
npm install reqif-preview
```

## Démarrage rapide

```ts
import { loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

// Les octets de votre fichier. Depuis une URL :
const fileBytes = new Uint8Array(await (await fetch("/exigences.reqifz")).arrayBuffer());
// Depuis un <input type="file">  : new Uint8Array(await file.arrayBuffer())
// Depuis Node                    : await readFile("exigences.reqifz")

// input : string XML brut, Uint8Array, ou ArrayBuffer (auto-détecte .reqif vs .reqifz)
const pkg = await loadReqIfPackage(fileBytes);

const html = await renderPackageToHtml(pkg);
document.getElementById("preview").innerHTML = html;
```

C'est tout pour le cas simple : `loadReqIfPackage` détecte automatiquement si l'entrée est du XML brut (`.reqif`) ou une archive zip (`.reqifz`), extrait les pièces jointes, et `renderPackageToHtml` produit un bloc HTML autonome (avec son propre `<style>` scoping `.reqif-preview`) — arborescence des spécifications, texte enrichi (gras/italique/listes/tableaux), images intégrées en `data:` URI.

Voir [`examples/browser.html`](./examples/browser.html) pour une démo complète sans aucun framework.

## Documentation

Tout le reste vit sur le [site de documentation](https://antoinetsinga.github.io/reqif-preview/) :

| | |
|---|---|
| [Démarrage](https://antoinetsinga.github.io/reqif-preview/guide/demarrage) | installation, mode simple, navigateur et Node.js |
| [Titre et contenu affichés](https://antoinetsinga.github.io/reqif-preview/guide/titre-et-contenu) | `contentAttributes`, `titleAttributes`, placeholders |
| [Texte simplifié](https://antoinetsinga.github.io/reqif-preview/guide/texte-simplifie) | `isSimplified` et `THE-ORIGINAL-VALUE` |
| [Rendus personnalisés](https://antoinetsinga.github.io/reqif-preview/guide/rendus-personnalises) | `customAttributeRenderers`, filet HTML mal fermé |
| [Onglets, numérotation, lecture](https://antoinetsinga.github.io/reqif-preview/guide/mise-en-page) | `layout`, `chapterNumbers`, `readingMode` |
| [Liens entre exigences](https://antoinetsinga.github.io/reqif-preview/guide/relations) | `SpecRelation`, ancres, relations inter-documents |
| [Pièces jointes](https://antoinetsinga.github.io/reqif-preview/guide/pieces-jointes) | `.reqifz`, résolveur personnalisé |
| [Documents très imbriqués](https://antoinetsinga.github.io/reqif-preview/guide/gros-documents) | `maxNestedTags`, `processEntities` |
| [Diagnostics](https://antoinetsinga.github.io/reqif-preview/guide/diagnostics) | `onDegradation` et ses 14 codes |
| [Sécurité](https://antoinetsinga.github.io/reqif-preview/guide/securite) | liste blanche, `style`, schémas d'URL |
| [Votre propre rendu](https://antoinetsinga.github.io/reqif-preview/guide/rendu-maison) | le modèle typé, `ReqIfIndex`, les helpers |
| [Référence API](https://antoinetsinga.github.io/reqif-preview/api/) | les 78 exports publics |

Les notes d'implémentation — comment le parseur, l'index et le renderer sont construits — sont dans [`ALGORITHMES.md`](./ALGORITHMES.md).

## Développement

```bash
npm install
npm test         # vitest — inclut un vrai export IBM DOORS en fixture
npm run build    # esm + cjs + .d.ts dans dist/
npm run typecheck
```

### Le site de documentation

```bash
npm run docs:dev      # build + synchro des assets + serveur de développement
npm run docs:build    # ce que la CI exécute
npm run docs:preview   # sert le site construit
```

Deux garde-fous s'exécutent dans `docs:build`, et ils sont là pour une raison précise — la page de documentation précédente inlinait une copie du bundle collée à la main, jamais régénérée, et décrivait au bout de deux mois une version qui n'existait plus :

- [`scripts/sync-docs-assets.mjs`](./scripts/sync-docs-assets.mjs) copie `dist/index.js` vers `docs/public/` et régénère le `.reqifz` d'exemple. Les deux sont gitignorés : ce sont des artefacts, jamais du contenu de dépôt.
- [`scripts/check-docs.mjs`](./scripts/check-docs.mjs) **fait échouer le build** si un symbole exporté par `src/index.ts` n'est documenté nulle part sous `docs/api/`. La liste des exports est lue via le compilateur TypeScript, donc `export * from "./types.js"` est développé exactement comme un consommateur le voit.

Le déploiement sur GitHub Pages se fait à chaque push sur `main` via [`.github/workflows/docs.yml`](./.github/workflows/docs.yml).

## Licence

MIT
