# reqif-preview

Bibliothèque **indépendante de tout framework** pour parser et prévisualiser des fichiers **ReqIF** (`.reqif`) et **ReqIFZ** (`.reqifz`, l'archive zip avec pièces jointes), conforme à la spec OMG ReqIF v1.2 (formal/2016-07-01).

Fonctionne aussi bien dans le navigateur (bundlé par Vite/Webpack/etc., ou via `<script type="module">`) que côté Node.js (SSR, CLI, traitement batch). Zéro dépendance à React/Vue/Angular — vous récupérez soit un **modèle de données typé**, soit du **HTML prêt à afficher** (`innerHTML`), et vous l'intégrez où vous voulez.

## Installation

```bash
npm install reqif-preview
```

## Démarrage rapide

```ts
import { loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

// input : string XML brut, Uint8Array, ou ArrayBuffer (auto-détecte .reqif vs .reqifz)
const pkg = await loadReqIfPackage(fileBytes);

const html = await renderPackageToHtml(pkg);
document.getElementById("preview").innerHTML = html;
```

C'est tout pour le cas simple : `loadReqIfPackage` détecte automatiquement si l'entrée est du XML brut (`.reqif`) ou une archive zip (`.reqifz`), extrait les pièces jointes, et `renderPackageToHtml` produit un bloc HTML autonome (avec son propre `<style>` scoping `.reqif-preview`) — arborescence des spécifications, texte enrichi (gras/italique/listes/tableaux), images intégrées en `data:` URI.

### Mode simple par défaut

Pour chaque exigence, seuls trois éléments sont affichés sans action de l'utilisateur :
- le **titre** (résumé cliquable de l'arborescence) ;
- l'**ID** — `ReqIF.ForeignID` (ou équivalent : "Foreign ID", "ForeignID") si le document en fournit un, sinon l'identifiant GUID interne en repli ;
- le **texte enrichi** (contenu des attributs de type XHTML — la description/le corps de l'exigence) ;
- une ligne **« Créé par X · date — Modifié par Y · date »**, clairement étiquetée, si le document fournit ces informations (convention `ReqIF.ForeignCreatedBy/On` et `ReqIF.ForeignModifiedBy/On`, utilisée par DOORS, DOORS Next, ReqEdit, ReqView...). Si modification = création, la ligne "Modifié" n'est pas dupliquée.

Tous les autres attributs (chaînes, nombres, dates, énumérations, booléens...) sont regroupés dans un panneau **« Détails techniques »**, replié par défaut, qu'on déplie d'un clic (un `<details>/<summary>` natif — aucun JavaScript requis). **Ce panneau liste toujours absolument tous les attributs de l'objet**, y compris ceux déjà résumés ailleurs (ID, créé/modifié) — rien n'y est jamais filtré, pour une transparence totale.

La détection créé/modifié reconnaît `ReqIF.ForeignCreatedBy/On` aussi bien quand ils sont stockés en chaîne simple qu'en XHTML (DOORS exporte parfois ces champs en XHTML) — peu importe le type de donnée déclaré, le texte est extrait correctement.

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

### Afficher un contenu personnalisé (ex. un ID métier comme PUID)

`ReqIF.ForeignID` couvre le cas standard, mais beaucoup d'outils stockent leur identifiant métier dans un attribut au nom libre (ex. `IE PUID` chez DOORS, parfois en XHTML plutôt qu'en chaîne simple). Pour ces cas, enregistrez un **rendu personnalisable** : la fonction reçoit la valeur déjà résolue de l'attribut ciblé, plus un contexte qui donne accès à *tous* les autres attributs de l'objet (pour croiser plusieurs valeurs si besoin), et son HTML est injecté juste avant ou juste après le texte principal, au choix :

```ts
import { renderPackageToHtml, xhtmlToPlainText } from "reqif-preview";

const html = await renderPackageToHtml(pkg, {
  customAttributeRenderers: [
    {
      attribute: "IE PUID", // nom long (ou identifiant) de l'attribut visé
      position: "before",   // "before" (défaut) ou "after"
      render: (value, ctx) => {
        if (!value) return undefined; // rien à afficher pour cet objet -> on ne touche à rien
        const text = value.kind === "XHTML" && value.value
          ? xhtmlToPlainText(value.value)
          : value.kind === "STRING" ? value.value : undefined;
        return text
          ? `<span class="puid-badge">${text}</span>` // pensez à échapper vos propres textes
          : undefined;
      },
    },
  ],
});
```

- `value` est `undefined` si l'objet ne porte pas cet attribut — retournez `undefined` pour ne rien afficher.
- `ctx.getValue("Autre attribut")` / `ctx.getDefinition(...)` permettent de lire d'autres attributs de l'objet.
- `ctx.formatValue(value)` réutilise le même formatage que le panneau technique (résolution des libellés d'énumération, rendu XHTML assaini...).
- Par défaut, l'attribut ciblé reste aussi visible dans le panneau technique (transparence totale) ; passez `hideFromTechnical: true` si vous voulez l'en masquer puisqu'il est déjà affiché via le rendu personnalisé.
- Une exception levée dans `render()` est interceptée : elle n'interrompt jamais le rendu du reste du document.
- Le HTML retourné est inséré tel quel (ce n'est pas du contenu du document ReqIF, mais du code que *vous* écrivez) — échappez vous-même tout texte brut interpolé, par exemple avec `escapeHtml` exporté par la lib.

### Dans le navigateur, depuis un `<input type="file">`

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

Voir [`examples/browser.html`](./examples/browser.html) pour une démo complète sans aucun framework.

### Côté Node.js

```ts
import { readFile } from "node:fs/promises";
import { loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

const bytes = await readFile("export.reqifz");
const pkg = await loadReqIfPackage(bytes);
const html = await renderPackageToHtml(pkg);
await writeFile("preview.html", html);
```

## Si vous voulez gérer votre propre rendu

Vous n'êtes pas obligé d'utiliser le HTML fourni : `loadReqIfPackage` (et `parseReqIfXml` pour du XML déjà en mémoire) vous donnent un modèle de données **typé, acyclique et sérialisable** (`ReqIfDocument`) qui reflète fidèlement le modèle UML de la spec ReqIF (`Specification`, `SpecObject`, `SpecHierarchy`, `AttributeDefinition*`, `AttributeValue*`, `DatatypeDefinition*`, etc. — voir [`src/types.ts`](./src/types.ts)).

Les références croisées (`typeRef`, `definitionRef`, `objectRef`, `sourceRef`...) restent de simples chaînes d'identifiants — pas d'objets imbriqués circulaires. Utilisez `ReqIfIndex` pour les résoudre :

```ts
import { parseReqIfXml, ReqIfIndex } from "reqif-preview";

const doc = parseReqIfXml(xmlString);
const index = new ReqIfIndex(doc);

for (const spec of doc.coreContent.specifications) {
  for (const node of spec.children) {
    const requirement = index.specObjects.get(node.objectRef);
    console.log(requirement?.longName);
  }
}
```

Pour le contenu enrichi (`AttributeValueXHTML`), vous avez :
- `value.value` : un arbre `XhtmlNode[]` portable (sans dépendance au DOM) ;
- `renderXhtmlContent(value.value, { attachments })` : sérialise cet arbre en HTML assaini (voir sécurité ci-dessous) ;
- `xhtmlToPlainText(value.value)` : extrait le texte brut (utile pour une recherche plein texte ou un export CSV).

## Pièces jointes (`.reqifz`)

`loadReqIfPackage` détecte le zip, extrait chaque `.reqif` qu'il contient (un `.reqifz` peut légalement en contenir plusieurs) et construit un `AttachmentResolver` pour le reste des fichiers (images, PDF, etc. référencés par `<object data="...">` dans le texte enrichi).

Le renderer HTML résout automatiquement ces références et les intègre en `data:` URI (limite par défaut : 5 Mo par fichier, configurable via `maxInlineBytes`). Pour un `.reqif` nu accompagné d'images servies ailleurs (CDN, API...), fournissez votre propre résolveur :

```ts
import { createAttachmentResolver, loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

const attachments = createAttachmentResolver((path) => {
  const bytes = myOwnFileLookup(path); // Uint8Array | undefined
  return bytes ? { bytes } : undefined;
});

const pkg = await loadReqIfPackage(xmlString);
const html = await renderPackageToHtml(pkg, { attachments });
```

## Sécurité

Le contenu XHTML d'un fichier ReqIF est une donnée **non fiable** provenant d'un tiers. `renderXhtmlContent` applique une liste blanche stricte de balises/attributs (alignée sur les modules XHTML autorisés par la spec : Text, List, Hypertext, Edit, Presentation, Basic Tables, Object, Style Attribute) :

- `<script>`, `<style>`, `<iframe>`, formulaires, etc. sont entièrement supprimés (balise **et** contenu) ;
- les `href`/`src` en `javascript:` ou `vbscript:` sont neutralisés ;
- l'attribut `style` n'autorise que `text-decoration` (underline/line-through) et `color`, conformément à la clause 10.8.20 de la spec — tout le reste est filtré ;
- l'élément `<object>` (objet externe) suit la chaîne de repli décrite dans la spec : image PNG résolue → sinon objet alternatif imbriqué → sinon texte alternatif.

## API

| Export | Description |
|---|---|
| `loadReqIfPackage(input)` | Charge un `.reqif` (string/bytes) ou `.reqifz` (bytes), retourne un `ReqIfPackage`. |
| `parseReqIfXml(xml)` | Parse une seule chaîne XML ReqIF en `ReqIfDocument`. |
| `ReqIfIndex` | Index de résolution O(1) des références croisées d'un document. |
| `renderPackageToHtml(pkg, options?)` | Rendu HTML complet (tous les documents du package). |
| `renderDocumentToHtml(doc, attachments, options?)` | Rendu HTML d'un seul document. |
| `renderSpecification(spec, index, attachments, labels?, options?)` | Rendu HTML d'une seule arborescence de spécification (sync, pour UI virtualisée). |
| `renderXhtmlContent(content, options?)` | Sérialisation assainie d'un fragment XHTML isolé. |
| `xhtmlToPlainText(content)` | Extraction texte brut d'un fragment XHTML. |
| `createAttachmentResolver(fn)` | Construit un résolveur de pièces jointes personnalisé. |

Types complets dans [`src/types.ts`](./src/types.ts).

## Développement

```bash
npm install
npm test        # vitest — inclut un vrai export IBM DOORS en fixture
npm run build    # esm + cjs + .d.ts dans dist/
npm run typecheck
```

## Licence

MIT
