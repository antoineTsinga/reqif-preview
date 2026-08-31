# Référence API — vue d'ensemble

<!--@include: ../_conventions.md-->

Tout est exporté depuis la racine du paquet :

```ts
import { loadReqIfPackage, renderPackageToHtml /* … */ } from "reqif-preview";
```

## Les dix fonctions qui comptent

| Export | Description |
|---|---|
| [`loadReqIfPackage(input, options?)`](/fr/api/chargement#loadreqifpackage) | Charge un `.reqif` (string/bytes) ou `.reqifz` (bytes), retourne un `ReqIfPackage`. |
| [`parseReqIfXml(xml, options?)`](/fr/api/chargement#parsereqifxml) | Parse une seule chaîne XML ReqIF en `ReqIfDocument`. |
| [`ReqIfIndex`](/fr/api/modele#reqifindex) | Index de résolution O(1) des références croisées d'un ou plusieurs documents. |
| [`renderPackageToHtml(pkg, options?)`](/fr/api/rendu#renderpackagetohtml) | Rendu HTML complet — tous les documents du paquet. |
| [`renderDocumentToHtml(doc, attachments, options?, sharedIndex?)`](/fr/api/rendu#renderdocumenttohtml) | Rendu HTML d'un seul document. |
| [`renderSpecification(spec, index, attachments, labels?, options?)`](/fr/api/rendu#renderspecification) | Rendu **synchrone** d'une seule arborescence — pour une UI virtualisée. |
| [`createAttachmentLookup(doc, resolver, maxInlineBytes?, onDegradation?)`](/fr/api/rendu#createattachmentlookup) | Pré-résout les pièces jointes en `data:` URI — nécessaire pour alimenter `renderSpecification`. |
| [`renderXhtmlContent(content, options?)`](/fr/api/rendu#renderxhtmlcontent) | Sérialisation assainie d'un fragment XHTML isolé. |
| [`xhtmlToPlainText(content)`](/fr/api/rendu#xhtmltoplaintext) | Extraction texte brut d'un fragment XHTML. |
| [`createAttachmentResolver(fn)`](/fr/api/chargement#createattachmentresolver) | Construit un résolveur de pièces jointes personnalisé. |

## Où trouver quoi

| Page | Contenu |
|---|---|
| [Chargement et parsing](/fr/api/chargement) | `loadReqIfPackage`, `parseReqIfXml`, `ParseOptions`, `ReqIfParseError`, résolveurs de pièces jointes |
| [Rendu HTML](/fr/api/rendu) | Les quatre fonctions de rendu, `renderXhtmlContent`, `xhtmlToPlainText`, `escapeHtml` |
| [Options de rendu](/fr/api/options) | `RenderOptions` au complet, `RenderLabels`, les rendus personnalisés |
| [Modèle de données](/fr/api/modele) | Tous les types du modèle ReqIF, `ReqIfIndex` et les helpers de lecture |
| [Diagnostics](/fr/api/diagnostics) | `DegradationCode`, `DegradationEvent`, `DegradationHandler` |

## Ce qui peut lever

Une seule chose : le **parsing**.

```ts
import { ReqIfParseError } from "reqif-preview";

try {
  const pkg = await loadReqIfPackage(bytes);
} catch (e) {
  if (e instanceof ReqIfParseError) { /* XML invalide, zip corrompu, racine absente… */ }
}
```

Passé ce point, plus rien ne lève : les fonctions de rendu dégradent localement et
poursuivent. Pour savoir *ce qui* a été dégradé, voir [Diagnostics](/fr/api/diagnostics).

## Feuille de style

Le rendu embarque sa propre feuille de style dans un `<style>` en tête du HTML retourné,
scopée sur `.reqif-preview`. Il n'y a donc rien à importer ni à lier : c'est ce qui rend la
sortie autonome, insérable telle quelle avec `innerHTML`.

Pour la fournir vous-même — cas d'une politique de sécurité de contenu (CSP) interdisant
les `<style>` inline, ou d'un thème maison :

```ts
const html = await renderPackageToHtml(pkg, { includeCss: false });
```

La feuille reste alors accessible de deux façons, l'une et l'autre issues de la **même
source**, donc jamais désynchronisées :

```ts
// Un fichier, pour un <link> ou un import de bundler.
import "reqif-preview/style.css";
```

```ts
// Le texte, pour ce qu'un <link> n'atteint pas — un Shadow DOM, par exemple.
import { DEFAULT_CSS } from "reqif-preview";

const shadowRoot = document.getElementById("preview")!.attachShadow({ mode: "open" });

const sheet = new CSSStyleSheet();
sheet.replaceSync(DEFAULT_CSS);
shadowRoot.adoptedStyleSheets = [sheet];
```

Si vous écrivez vos propres règles à la place, sachez que les onglets **cessent de
fonctionner sans elles** : leur mécanisme est entièrement porté par les règles `:target` de
cette feuille.

::: warning La feuille suppose un fond clair
`.reqif-preview` fixe une couleur de texte (`#1a1a1a`) mais aucun fond. Inséré tel quel dans
une page au thème sombre, l'aperçu serait illisible : c'est à l'hôte de fournir une surface
claire.
:::
