# reqif-preview

Bibliothèque **indépendante de tout framework** pour parser et prévisualiser des fichiers **ReqIF** (`.reqif`) et **ReqIFZ** (`.reqifz`, l'archive zip avec pièces jointes), conforme à la spec OMG ReqIF v1.2 (formal/2016-07-01).

Fonctionne aussi bien dans le navigateur (bundlé par Vite/Webpack/etc., ou via `<script type="module">`) que côté Node.js (SSR, CLI, traitement batch). Zéro dépendance à React/Vue/Angular — vous récupérez soit un **modèle de données typé**, soit du **HTML prêt à afficher** (`innerHTML`), et vous l'intégrez où vous voulez.

📖 **[Documentation complète](https://reqif-preview.dev/)** — guide, référence API, et un [bac à sable](https://reqif-preview.dev/bac-a-sable) qui exécute la vraie bibliothèque sur *votre* fichier, dans votre navigateur.

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

Pour voir le résultat sur **votre** fichier avant d'installer quoi que ce soit, le [bac à sable](https://reqif-preview.dev/bac-a-sable) exécute la bibliothèque dans votre navigateur — rien n'est envoyé nulle part. Et [`examples/browser.html`](https://github.com/antoineTsinga/reqif-preview/blob/main/examples/browser.html) est une page autonome, sans aucun framework ni outil de build.

## Documentation

Tout le reste vit sur le [site de documentation](https://reqif-preview.dev/) :

| | |
|---|---|
| [Démarrage](https://reqif-preview.dev/guide/demarrage) | installation, mode simple, navigateur et Node.js |
| [Titre et contenu affichés](https://reqif-preview.dev/guide/titre-et-contenu) | `contentAttributes`, `titleAttributes`, placeholders |
| [Texte simplifié](https://reqif-preview.dev/guide/texte-simplifie) | `isSimplified` et `THE-ORIGINAL-VALUE` |
| [Rendus personnalisés](https://reqif-preview.dev/guide/rendus-personnalises) | `customAttributeRenderers`, filet HTML mal fermé |
| [Onglets, numérotation, lecture](https://reqif-preview.dev/guide/mise-en-page) | `layout`, `chapterNumbers`, `readingMode` |
| [Liens entre exigences](https://reqif-preview.dev/guide/relations) | `SpecRelation`, ancres, relations inter-documents |
| [Pièces jointes](https://reqif-preview.dev/guide/pieces-jointes) | `.reqifz`, résolveur personnalisé |
| [Documents très imbriqués](https://reqif-preview.dev/guide/gros-documents) | `maxNestedTags`, `processEntities` |
| [Diagnostics](https://reqif-preview.dev/guide/diagnostics) | `onDegradation` et ses 14 codes |
| [Sécurité](https://reqif-preview.dev/guide/securite) | liste blanche, `style`, schémas d'URL |
| [Votre propre rendu](https://reqif-preview.dev/guide/rendu-maison) | le modèle typé, `ReqIfIndex`, les helpers |
| [Référence API](https://reqif-preview.dev/api/) | tous les exports publics, un par un |

## Contribuer

Les commandes de développement, le fonctionnement du site de documentation et la
procédure de publication sont dans [CONTRIBUTING.md](https://github.com/antoineTsinga/reqif-preview/blob/main/CONTRIBUTING.md).

## Licence

MIT
