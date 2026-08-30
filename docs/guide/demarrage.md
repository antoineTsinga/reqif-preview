# Démarrage

`reqif-preview` est une bibliothèque **indépendante de tout framework** pour parser et
prévisualiser des fichiers **ReqIF** (`.reqif`) et **ReqIFZ** (`.reqifz`, l'archive zip
avec pièces jointes), conforme à la spec OMG ReqIF v1.2 (formal/2016-07-01).

Elle fonctionne aussi bien dans le navigateur (bundlée par Vite, Webpack…, ou via un
`<script type="module">`) que côté Node.js (SSR, CLI, traitement par lots). Zéro
dépendance à React, Vue ou Angular — vous récupérez soit un **modèle de données typé**,
soit du **HTML prêt à afficher** (`innerHTML`), et vous l'intégrez où vous voulez.

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

C'est tout pour le cas simple : `loadReqIfPackage` détecte automatiquement si l'entrée
est du XML brut (`.reqif`) ou une archive zip (`.reqifz`), extrait les pièces jointes,
et `renderPackageToHtml` produit un bloc HTML autonome (avec son propre `<style>`
scopant `.reqif-preview`) — arborescence des spécifications, texte enrichi
(gras/italique/listes/tableaux), images intégrées en `data:` URI.

## Mode simple par défaut

Pour chaque exigence, seuls trois éléments sont affichés sans action de l'utilisateur :

- le **titre** (résumé cliquable de l'arborescence) ;
- l'**ID** — `ReqIF.ForeignID` (ou équivalent : « Foreign ID », « ForeignID ») si le
  document en fournit un, sinon l'identifiant GUID interne en repli ;
- le **texte enrichi** (contenu des attributs de type XHTML — la description ou le corps
  de l'exigence) ;
- une ligne **« Créé par X · date — Modifié par Y · date »**, clairement étiquetée, si le
  document fournit ces informations (convention `ReqIF.ForeignCreatedBy/On` et
  `ReqIF.ForeignModifiedBy/On`, utilisée par DOORS, DOORS Next, ReqEdit, ReqView…). Si
  modification = création, la ligne « Modifié » n'est pas dupliquée.

Tous les autres attributs (chaînes, nombres, dates, énumérations, booléens…) sont
regroupés dans un panneau **« Détails techniques »**, replié par défaut, qu'on déplie
d'un clic — un `<details>`/`<summary>` natif, aucun JavaScript requis.

::: info Le panneau technique ne filtre jamais rien
Il liste **absolument tous** les attributs de l'objet, y compris ceux déjà résumés
ailleurs (ID, créé/modifié). C'est délibéré : sur un aperçu d'exigences, une donnée
masquée sans le dire vaut moins qu'une donnée en double.
:::

La détection créé/modifié reconnaît `ReqIF.ForeignCreatedBy/On` aussi bien quand ils sont
stockés en chaîne simple qu'en XHTML (DOORS exporte parfois ces champs en XHTML) — peu
importe le type de donnée déclaré, le texte est extrait correctement.

```ts
// Replié par défaut. Pour l'afficher déplié d'entrée :
const html = await renderPackageToHtml(pkg, { showTechnicalByDefault: true });

// Locale utilisée pour formater les dates créé/modifié (par défaut "fr-FR") :
const html = await renderPackageToHtml(pkg, { dateLocale: "en-US" });
```

Les libellés sont en français par défaut et personnalisables :

```ts
const html = await renderPackageToHtml(pkg, {
  labels: { technicalDetails: "Technical details", yes: "Yes", no: "No" },
});
```

La liste complète des libellés est dans [`RenderLabels`](/api/options#renderlabels).

## Dans le navigateur, depuis un `<input type="file">`

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

Voir [`examples/browser.html`](https://github.com/antoineTsinga/reqif-preview/blob/main/examples/browser.html)
pour une démo complète sans aucun framework — et le [bac à sable](/bac-a-sable) pour la
même chose avec toutes les options exposées.

## Côté Node.js

```ts
import { readFile, writeFile } from "node:fs/promises";
import { loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

const bytes = await readFile("export.reqifz");
const pkg = await loadReqIfPackage(bytes);
const html = await renderPackageToHtml(pkg);
await writeFile("preview.html", html);
```

## Et ensuite

- Le rendu par défaut ne montre pas ce que vous voulez ? →
  [Titre et contenu affichés](/guide/titre-et-contenu)
- Plusieurs documents dans un `.reqifz` ? → [Onglets, numérotation, lecture](/guide/mise-en-page)
- Vous préférez faire votre propre rendu ? → [Votre propre rendu](/guide/rendu-maison)
- « Il manque des trucs dans mon aperçu » → [Diagnostics](/guide/diagnostics)
