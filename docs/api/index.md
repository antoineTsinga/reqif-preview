# Référence API — vue d'ensemble

Tout est exporté depuis la racine du paquet :

```ts
import { loadReqIfPackage, renderPackageToHtml /* … */ } from "reqif-preview";
```

## Les dix fonctions qui comptent

| Export | Description |
|---|---|
| [`loadReqIfPackage(input, options?)`](/api/chargement#loadreqifpackage) | Charge un `.reqif` (string/bytes) ou `.reqifz` (bytes), retourne un `ReqIfPackage`. |
| [`parseReqIfXml(xml, options?)`](/api/chargement#parsereqifxml) | Parse une seule chaîne XML ReqIF en `ReqIfDocument`. |
| [`ReqIfIndex`](/api/modele#reqifindex) | Index de résolution O(1) des références croisées d'un ou plusieurs documents. |
| [`renderPackageToHtml(pkg, options?)`](/api/rendu#renderpackagetohtml) | Rendu HTML complet — tous les documents du paquet. |
| [`renderDocumentToHtml(doc, attachments, options?, sharedIndex?)`](/api/rendu#renderdocumenttohtml) | Rendu HTML d'un seul document. |
| [`renderSpecification(spec, index, attachments, labels?, options?)`](/api/rendu#renderspecification) | Rendu **synchrone** d'une seule arborescence — pour une UI virtualisée. |
| [`createAttachmentLookup(doc, resolver, maxInlineBytes?, onDegradation?)`](/api/rendu#createattachmentlookup) | Pré-résout les pièces jointes en `data:` URI — nécessaire pour alimenter `renderSpecification`. |
| [`renderXhtmlContent(content, options?)`](/api/rendu#renderxhtmlcontent) | Sérialisation assainie d'un fragment XHTML isolé. |
| [`xhtmlToPlainText(content)`](/api/rendu#xhtmltoplaintext) | Extraction texte brut d'un fragment XHTML. |
| [`createAttachmentResolver(fn)`](/api/chargement#createattachmentresolver) | Construit un résolveur de pièces jointes personnalisé. |

## Où trouver quoi

| Page | Contenu |
|---|---|
| [Chargement et parsing](/api/chargement) | `loadReqIfPackage`, `parseReqIfXml`, `ParseOptions`, `ReqIfParseError`, résolveurs de pièces jointes |
| [Rendu HTML](/api/rendu) | Les quatre fonctions de rendu, `renderXhtmlContent`, `xhtmlToPlainText`, `escapeHtml` |
| [Options de rendu](/api/options) | `RenderOptions` au complet, `RenderLabels`, les rendus personnalisés |
| [Modèle de données](/api/modele) | Tous les types du modèle ReqIF, `ReqIfIndex` et les helpers de lecture |
| [Diagnostics](/api/diagnostics) | `DegradationCode`, `DegradationEvent`, `DegradationHandler` |

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
poursuivent. Pour savoir *ce qui* a été dégradé, voir [Diagnostics](/api/diagnostics).

## Feuille de style

Le rendu embarque sa propre feuille de style dans un `<style>` en tête du HTML retourné,
scopée sur `.reqif-preview`. Il n'y a donc rien à importer ni à lier : c'est ce qui rend la
sortie autonome, insérable telle quelle avec `innerHTML`.

Pour la fournir vous-même — cas d'une politique de sécurité de contenu (CSP) interdisant
les `<style>` inline, ou d'un thème maison :

```ts
const html = await renderPackageToHtml(pkg, { includeCss: false });
```

À vous alors d'écrire les règles pour les classes émises (`.reqif-preview`, `.reqif-node`,
`.reqif-tabs`…). Les onglets, en particulier, **cessent de fonctionner sans elles** : leur
mécanisme est entièrement porté par les règles `:target` de cette feuille.
