# reqif-preview

Bibliothèque **indépendante de tout framework** pour parser et prévisualiser des fichiers **ReqIF** (`.reqif`) et **ReqIFZ** (`.reqifz`, l'archive zip avec pièces jointes), conforme à la spec OMG ReqIF v1.2 (formal/2016-07-01).

Fonctionne aussi bien dans le navigateur (bundlé par Vite/Webpack/etc., ou via `<script type="module">`) que côté Node.js (SSR, CLI, traitement batch). Zéro dépendance à React/Vue/Angular — vous récupérez soit un **modèle de données typé**, soit du **HTML prêt à afficher** (`innerHTML`), et vous l'intégrez où vous voulez.

📖 **[docs/index.html](./docs/index.html)** — page de documentation interactive : chaque exemple ci-dessous y est du vrai HTML rendu en direct par la bibliothèque (pas des captures d'écran). Ouvrez-la simplement dans un navigateur.

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

### Choisir précisément le titre et le contenu affichés

Par défaut, le **titre** vient du `LONG-NAME` de l'objet (ou de son nœud dans l'arborescence), et le **contenu** affiche automatiquement tous les attributs XHTML de l'objet — ce qui n'est pas toujours pertinent si plusieurs champs riches coexistent sans rapport entre eux. Deux options permettent de reprendre la main :

```ts
const html = await renderPackageToHtml(pkg, {
  // Seuls ces attributs (dans cet ordre) constituent le contenu principal.
  // Chacun est rendu selon son propre type (XHTML assaini, le reste en texte échappé).
  // Si omis : comportement par défaut (tous les attributs XHTML non déjà affichés ailleurs).
  contentAttributes: ["ReqIF.Text"],

  // Si l'objet (et son nœud) n'ont pas de LONG-NAME, on essaie ces attributs
  // dans l'ordre — le premier non vide devient le titre.
  titleAttributes: ["ReqIF.ChapterName", "ReqIF.Name"],
});
```

- `contentAttributes` : liste blanche stricte — si un attribut listé n'existe pas sur l'objet, il est simplement ignoré ; si aucun n'a de valeur, le message "(vide)" habituel s'affiche.
- `titleAttributes` : n'intervient qu'en dernier recours, après le `LONG-NAME` de l'objet et celui de son nœud d'arborescence (jamais à leur place) — pratique pour les exports DOORS où le vrai libellé est parfois dans un attribut personnalisé plutôt que dans le champ structurel.
- Dans les deux cas, les attributs visés restent aussi visibles dans le panneau technique (qui, lui, n'est jamais filtré).

### Texte simplifié en cours de route (`isSimplified`)

Quand un outil de la chaîne d'échange ne sait pas interpréter la mise en forme d'un attribut XHTML, la spec (clause 10.8.20) lui demande de remplacer le contenu par une version simplifiée, de poser `IS-SIMPLIFIED="true"`, et de **conserver l'original** dans `<THE-ORIGINAL-VALUE>`.

`reqif-preview` rend le sous-ensemble XHTML complet autorisé par la spec — il n'a donc pas la déficience que ce drapeau signale. **Par défaut il affiche l'original**, plus fidèle que la version dégradée :

```ts
// Comportement par défaut : l'original s'il existe, sinon le contenu simplifié.
const html = await renderPackageToHtml(pkg);

// Pour reproduire ce que verrait un outil limité :
const html = await renderPackageToHtml(pkg, { preferSimplifiedXhtml: true });
```

Les deux contenus sont exposés dans le modèle (`value.value` et `value.originalValue`), et les pièces jointes référencées par l'un comme par l'autre sont résolues. `xhtmlToPlainText`/`valueToPlainText` lisent toujours l'original quand il existe : une simplification peut avoir *perdu* du texte (un tableau aplati, une liste écrasée), et l'extraction de texte veut la source la plus complète.

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
- **Filet de sécurité** : si le HTML retourné a des balises mal fermées (une balise oubliée, une balise fermante en trop), la lib le détecte et l'affiche comme texte échappé plutôt que de l'insérer brut — sinon ce déséquilibre casserait la structure de *tout ce qui est affiché après* (contenu, détails techniques, voire les exigences suivantes dans l'arbre). Un avertissement est alors envoyé dans la console avec le HTML fautif, pour repérer facilement l'erreur pendant le développement.

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

## Documents très imbriqués

`fast-xml-parser` (utilisé en interne) refuse par défaut tout XML imbriqué sur plus de 100 niveaux, comme protection contre les fichiers XML malveillants ("XML bomb"). C'est trop bas pour de vrais documents ReqIF : une hiérarchie de spécifications profonde combinée à du texte enrichi richement imbriqué (typiquement du contenu collé depuis Word) dépasse facilement cette limite sur un document par ailleurs parfaitement valide, avec une erreur `Maximum nested tags exceeded`.

`reqif-preview` relève cette limite à **10 000** par défaut. Si besoin, ajustez-la :

```ts
// Document encore plus profondément imbriqué :
const pkg = await loadReqIfPackage(bytes, { maxNestedTags: 50_000 });

// À l'inverse, si vous traitez des fichiers non fiables et voulez une
// protection plus stricte contre les fichiers malveillants :
const pkg = await loadReqIfPackage(bytes, { maxNestedTags: 200 });
```

`fast-xml-parser` applique le même type de garde-fou pour le traitement des entités XML (`&amp;`, `&quot;`, déclarations `<!ENTITY>`...) : selon la version, la limite par défaut tourne autour de **1000** occurrences/déclarations au total dans le document — facilement dépassé par un export volumineux contenant beaucoup de `&`/guillemets dans son texte, avec une erreur du type `Entity count exceeds maximum allowed` ou `Entity expansion limit exceeded`. `reqif-preview` relève également ces limites par défaut. Pour les ajuster :

```ts
const pkg = await loadReqIfPackage(bytes, {
  processEntities: { maxEntityCount: 5_000_000, maxTotalExpansions: 5_000_000 },
});

// Désactiver entièrement le traitement des entités (rarement utile) :
const pkg = await loadReqIfPackage(bytes, { processEntities: false });
```

## Plusieurs documents en onglets, numérotation, vue de lecture

Trois options composables, pensées pour les gros exports (`.reqifz` à plusieurs modules) et pour produire un rendu plus proche d'un document Word :

```ts
const html = await renderPackageToHtml(pkg, {
  layout: "tabs",        // "stacked" (défaut) ou "tabs" — bascule CSS pure, sans JS
  chapterNumbers: true,  // 1, 1.1, 1.1.1, 1.2, 2... devant chaque titre, recommence à 1 par Specification
  readingMode: true,     // masque ID / créé-modifié / panneau technique ; titres en balises <h3>-<h6>
});
```

**`layout: "tabs"`** — s'applique à deux niveaux : entre les différents documents `.reqif` d'un même `.reqifz` (`renderPackageToHtml`), et entre les différentes `Specification` à l'intérieur d'un même document (`renderDocumentToHtml`). N'a aucun effet s'il n'y a qu'un seul document/qu'une seule spécification (pas d'onglet inutile pour un cas simple). Implémenté en CSS pur (case à cocher radio masquée + sélecteurs `:checked ~`) — aucun JavaScript, fonctionne même si le HTML est inséré statiquement sans script.

**`chapterNumbers: true`** — préfixe chaque titre de sa position dans l'arborescence (`1`, `1.1`, `1.1.1`, `1.1.2`, `1.2`, `2`...). La numérotation repart à 1 à chaque nouvelle `Specification`, comme des documents séparés.

Par défaut, **tous** les nœuds sont numérotés — un peu brutal, puisqu'un document Word ne numérote que ses titres (Heading 1/2/3...), pas chaque paragraphe. Si vos exigences distinguent les "chapitres" structurels des exigences elles-mêmes via un attribut (la convention `ChapterName`/`ReqIF.ChapterName` est courante chez DOORS), restreignez la numérotation à ces seuls nœuds :

```ts
const html = await renderPackageToHtml(pkg, {
  chapterNumbers: true,
  chapterNumberAttributes: ["ChapterName"], // ou ["ReqIF.ChapterName"], selon votre export
});
```

Seuls les objets portant une valeur non vide pour l'un de ces attributs reçoivent alors un numéro ; les autres (exigences "feuilles", sans cet attribut) n'en reçoivent aucun et ne décalent pas la numérotation de leurs frères — comme un paragraphe normal entre deux titres Word. Si un nœud non numéroté a lui-même des enfants qui sont des "chapitres", leur numérotation continue depuis le dernier ancêtre numéroté (elle ne redémarre pas à cause du nœud intermédiaire).

**`readingMode: true`** — pense à un export PDF/Word : seuls les titres et le texte des exigences restent visibles. Concrètement :
- l'encadré ID, la ligne "Créé par/Modifié par", et le panneau "Détails techniques" disparaissent (le contenu reste accessible par ailleurs via `showTechnicalByDefault`/le panneau technique si vous repassez en mode normal) ;
- les titres passent de simples lignes en gras à de vraies balises `<h3>`...`<h6>` selon la profondeur (la `Specification` elle-même garde son `<h2>`) — meilleure structure pour la lecture, l'impression ou l'export PDF. Leur taille est fixée explicitement par niveau (`1.3rem` → `0.95rem`) plutôt que de dépendre des tailles par défaut du navigateur, qui se réduisent en cascade à chaque imbrication et finissent par devenir illisibles sur les arborescences profondes ; passé `<h6>`, la taille reste constante (`0.95rem`) au lieu de continuer à rétrécir ;
- le contenu que *vous* ajoutez via `customAttributeRenderers` reste affiché : seule la métadonnée générée automatiquement est masquée, pas ce que vous avez explicitement demandé.

### Titre ou contenu vide volontaire (pas seulement pour les chapitres)

Pour le cas spécifique des objets "chapitres" (`chapterNumberAttributes`), un raccourci existe :

```ts
const html = await renderPackageToHtml(pkg, {
  chapterNumberAttributes: ["ChapterName"],
  suppressEmptyPlaceholdersForChapters: true, // pas de "(sans titre)"/"(vide)" pour les chapitres uniquement
});
```

Mais c'est en réalité un cas particulier d'un besoin plus général : parfois un objet n'est **structurellement pas censé** avoir de titre (un simple paragraphe d'information, par exemple, qui a du texte mais jamais de `LONG-NAME`) — ou inversement, du contenu (un titre de section pur, sans texte directement dessous). Ce ne sont pas des données manquantes à signaler avec "(sans titre)"/"(vide)".

⚠️ **`customAttributeRenderers` ne peut pas résoudre ça** : il n'agit que sur la zone de contenu (avant/après), jamais sur le titre affiché dans l'arborescence (`<summary>`). Pour le titre comme pour le contenu, utilisez plutôt `isTitleless`/`isContentless` — deux fonctions à fournir, indépendantes de toute notion de "chapitre" :

```ts
const html = await renderPackageToHtml(pkg, {
  // Par type d'objet : ne jamais signaler l'absence de titre sur un "Paragraph"
  isTitleless: (obj, specType) => specType?.longName === "Paragraph",

  // Par n'importe quel autre critère (accès à l'attribut de votre choix via les
  // helpers exportés resolveAttribute/valueToPlainText) :
  isContentless: (obj, specType, index) => {
    const { value } = resolveAttribute(obj, index, "ObjectType");
    return valueToPlainText(value, index) === "Heading";
  },
});
```

- Les deux fonctions sont **indépendantes** : un objet peut être "sans titre attendu" sans être "sans contenu attendu", et inversement (c'est exactement le cas paragraphe-sans-titre vs chapitre-sans-contenu).
- Elles ne s'appliquent qu'au **repli** : si l'objet a un vrai `LONG-NAME`/contenu, il s'affiche normalement, peu importe ce que ces fonctions renvoient.
- Elles se combinent avec `suppressEmptyPlaceholdersForChapters` (la suppression a lieu si l'un OU l'autre dit oui).
- Pour un contrôle encore plus fin (ex. afficher un texte de remplacement personnalisé plutôt que rien), `customAttributeRenderers` reçoit `ctx.isChapter` (vrai si l'objet correspond à `chapterNumberAttributes`, indépendamment des options de suppression) pour bâtir votre propre logique dans la zone de contenu :

```ts
customAttributeRenderers: [{
  attribute: "ReqIF.Text",
  render: (value, ctx) => (!value && ctx.isChapter ? `<span class="chapter-divider">—</span>` : undefined),
}]
```

## Liens entre exigences (SpecRelation)

Les liens typés entre exigences (`SpecRelation` — ex. "dérive de", "satisfait", "trace vers") sont affichés automatiquement pour chaque objet qui en possède : ses liens **sortants** (`→`) et **entrants** (`←`), avec le nom du type de relation et un lien d'ancrage vers l'objet lié **si celui-ci est rendu dans la même page** :

```html
<div class="reqif-relations">
  <div class="reqif-relations-label">Liens</div>
  <div class="reqif-relation"><span>→</span> <span>Dérive de</span> <a href="#reqif-obj-...">Exigence système — Authentification</a></div>
</div>
```

Si l'objet lié n'est pas trouvé, le libellé s'affiche quand même, sans lien cliquable. C'est visible par défaut, y compris en `readingMode` (un lien de traçabilité est du contenu à part entière, pas de la métadonnée technique) :

```ts
const html = await renderPackageToHtml(pkg, { showRelations: false }); // pour le masquer
```

**Relations entre documents d'un même `.reqifz`** — elles se résolvent. La spec type `SOURCE`/`TARGET` d'une `SpecRelation` en `GLOBAL-REF` (clause 11, règle 5b), c'est-à-dire qu'une relation peut légalement viser un objet d'un *autre* `.reqif` du paquet. `renderPackageToHtml` construit donc un index unique couvrant tous les documents. Si vous appelez `renderDocumentToHtml` document par document, chacun n'est indexé que sur lui-même — passez votre propre index partagé en 4ᵉ argument pour retrouver le même comportement :

```ts
const index = new ReqIfIndex(pkg.documents); // et non pkg.document
const html = await renderDocumentToHtml(doc, pkg.attachments, options, index);
```

⚠️ **En `layout: "tabs"`, une ancre vers un objet d'un autre onglet ne révèle pas cet onglet.** Les onglets sont en CSS pur (`display:none` tant que la radio n'est pas cochée) : le navigateur défile vers une cible masquée, sans effet visible. Le lien reste correct, seule la navigation est inopérante — il n'y a pas de correctif sans JavaScript. En `layout: "stacked"` (le défaut), tout fonctionne.

**Limite actuelle** : seules les `SpecRelation` (liens objet-à-objet) sont affichées. Les `RelationGroup` (regroupements de relations entre deux `Specification`) sont parsées (`doc.coreContent.specRelationGroups`) mais pas encore rendues — exploitables directement via le modèle de données si besoin.

## Sécurité

Le contenu XHTML d'un fichier ReqIF est une donnée **non fiable** provenant d'un tiers. `renderXhtmlContent` applique une liste blanche stricte de balises/attributs (alignée sur les modules XHTML autorisés par la spec : Text, List, Hypertext, Edit, Presentation, Basic Tables, Object, Style Attribute) :

- `<script>`, `<style>`, `<iframe>`, formulaires, etc. sont entièrement supprimés (balise **et** contenu) ;
- les `href`/`src` en `javascript:`, `vbscript:` ou `data:` sont neutralisés (l'attribut est simplement omis, le libellé du lien reste visible). `data:` est inclus parce qu'un `data:text/html` est un vecteur d'exécution au même titre que `javascript:` — seules les `data:` URI **produites par la bibliothèque elle-même** pour les pièces jointes résolues sont émises, et elles ne passent pas par ce filtre ;
- l'attribut `style` n'autorise que `text-decoration` (underline/line-through) et `color`, conformément à la clause 10.8.20 de la spec — tout le reste est filtré ;
- l'élément `<object>` (objet externe) suit la chaîne de repli décrite dans la spec : image PNG résolue → sinon objet alternatif imbriqué → sinon texte alternatif.

## Diagnostiquer ce qui a été dégradé (`onDegradation`)

Passé l'étape de parsing, **rien ne lève** : une entrée surprenante dégrade localement et le reste du document se rend quand même. C'est le bon comportement en production, et pénible en support — face à « il manque des trucs dans mon aperçu », il n'y avait aucun moyen d'obtenir un rapport.

```ts
const events: DegradationEvent[] = [];
const html = await renderPackageToHtml(pkg, { onDegradation: (e) => events.push(e) });

// [{ code: "attachment-missing", message: 'No attachment resolved for "schema.png".',
//    detail: { path: "schema.png" } }, …]
```

Le rendu est strictement identique avec ou sans handler : l'option ne fait que rendre visibles des décisions déjà prises. Les codes émis :

| Code | Situation |
|---|---|
| `attachment-missing` | pièce jointe référencée qu'aucun résolveur ne trouve |
| `attachment-too-large` | pièce jointe dépassant `maxInlineBytes`, laissée non résolue |
| `unresolved-reference` | `SpecRelation` visant un objet absent du rendu |
| `orphan-attribute-value` | valeur dont l'`AttributeDefinition` est absente du `SpecType` déclaré |
| `missing-spec-object` | nœud d'arborescence pointant vers un `SpecObject` inexistant |
| `custom-renderer-threw` | un `customAttributeRenderers` a levé et a été ignoré |
| `custom-renderer-unbalanced-html` | HTML personnalisé mal fermé, échappé en texte |
| `dropped-tag` | balise supprimée avec son sous-arbre (`<script>`, `<iframe>`…) |
| `unwrapped-tag` | balise hors liste blanche déballée, enfants conservés |
| `dropped-style-declaration` | déclaration `style` invalide abandonnée |
| `dropped-href` | `href` en `javascript:`/`vbscript:`/`data:` neutralisé |
| `unparsable-date` | date non analysable, affichée telle quelle |
| `invalid-locale` | `Intl` a rejeté la locale configurée |

⚠️ `dropped-tag` et `unwrapped-tag` peuvent se déclencher **des milliers de fois** sur un gros export : c'est un canal de diagnostic, pas un journal de production. Filtrez par code, ou n'activez l'option qu'en investigation.

Un handler qui lève est intercepté et ignoré — un canal de diagnostic qui casse ce qu'il observe serait pire que pas de canal du tout.

## API

| Export | Description |
|---|---|
| `loadReqIfPackage(input)` | Charge un `.reqif` (string/bytes) ou `.reqifz` (bytes), retourne un `ReqIfPackage`. |
| `parseReqIfXml(xml)` | Parse une seule chaîne XML ReqIF en `ReqIfDocument`. |
| `ReqIfIndex` | Index de résolution O(1) des références croisées d'un document. |
| `renderPackageToHtml(pkg, options?)` | Rendu HTML complet (tous les documents du package). |
| `renderDocumentToHtml(doc, attachments, options?)` | Rendu HTML d'un seul document. |
| `renderSpecification(spec, index, attachments, labels?, options?)` | Rendu HTML d'une seule arborescence de spécification (sync, pour UI virtualisée). |
| `createAttachmentLookup(doc, resolver, maxInlineBytes?, onDegradation?)` | Pré-résout les pièces jointes en `data:` URI — nécessaire pour alimenter `renderSpecification`, qui est synchrone. |
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
