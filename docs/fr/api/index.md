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
scopée sur `.reqif-preview`. Il n'y a donc rien à importer ni à lier pour l'habillage : la
sortie est insérable telle quelle avec `innerHTML` et s'affichera correctement. Une seule
chose demande un appel plutôt que du balisage — l'ouverture d'un panneau technique
paresseux, traitée juste en dessous.

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

## Panneau technique

Chaque exigence porte un panneau « Détails techniques » replié qui liste tous ses
attributs, et `technicalPanel` décide de la façon dont il est émis.

| Valeur | Ce qu'elle émet |
|---|---|
| `"eager"` (défaut) | le panneau, en entier |
| `"lazy"` | son contenu dans un bloc inerte, construit en éléments DOM à l'ouverture |
| `"off"` | rien |

Le défaut l'écrit, ce qui ne demande aucun JavaScript et rien de votre part. `"lazy"` donne
un DOM initial plus petit, au prix d'un appel d'initialisation et d'une chaîne qui n'est
pas nécessairement plus courte — voir
[Fichiers lourds](/fr/guide/gros-documents#fichiers-lourds) pour savoir comment choisir.
`"off"` supprime le panneau entièrement si vous n'en voulez simplement pas.

### Faire fonctionner les panneaux paresseux

`"lazy"` se demande au lieu d'être le défaut parce qu'il ne fonctionne pas seul, et autant
le dire sans détour : **un `<script>` inséré via `innerHTML` ne s'exécute jamais**. C'est
la spécification HTML, pas une bizarrerie de navigateur, et `innerHTML` est la façon dont
la plupart des pages utilisent cette bibliothèque. Le déployeur doit donc être installé
séparément :

```ts
import { renderPackageToHtml, expandLazyPanels } from "reqif-preview";

const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy" });
document.getElementById("preview")!.innerHTML = html;

// Une fois, n'importe quand. Elle ne pose qu'un écouteur : l'ordre par rapport
// à innerHTML n'importe pas -- tôt vaut mieux que tard, cela étant, car un
// panneau ouvert avant l'écouteur affiche le repli jusqu'à sa réouverture.
expandLazyPanels();
```

Si le balisage arrive au contraire dans le document HTML initial — rendu côté serveur, ou
écrit par `document.write` — un script *peut* s'exécuter de là, et `includeJs` en demande
un :

```ts
// Émet le déployeur inline. Rien à appeler : il s'exécute au chargement.
const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy", includeJs: true });
```

Tant que ni l'un ni l'autre n'est en place, l'ouverture d'un panneau affiche le message
`labels.technicalUnavailable` plutôt que rien du tout — un panneau vide se lit comme un
viewer cassé, ce qui est la mauvaise chose à dire au lecteur. Ce repli est d'ailleurs la
raison pour laquelle `"lazy"` n'est pas le défaut : qui n'a rien configuré doit obtenir un
panneau qui marche, pas un message expliquant ce qu'il n'a pas fait.

Sous une Content-Security-Policy stricte, qui bloque les scripts inline même dans un
document rendu côté serveur, laissez `includeJs` tranquille et servez vous-même le texte
que le rendu aurait embarqué, sous un nonce ou un hash :

```ts
import { DEFAULT_JS } from "reqif-preview";
```

`DEFAULT_JS` et `expandLazyPanels` font la même chose selon les mêmes règles — le
premier comme texte que vous pouvez servir sous un nonce ou un hash, le second comme
fonction à appeler.
