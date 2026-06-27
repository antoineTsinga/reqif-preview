# ALGORITHMES.md — Fonctionnement interne de `reqif-preview`

Ce document explique, étape par étape, **comment** la bibliothèque transforme un fichier `.reqif`/`.reqifz` en HTML affichable. Il s'adresse à quelqu'un qui veut comprendre ou modifier le code source (`src/`), pas à un simple utilisateur de l'API — pour ça, voir [`README.md`](./README.md).

## Sommaire

1. [Vue d'ensemble du pipeline](#1-vue-densemble-du-pipeline)
2. [Parsing XML : pourquoi `preserveOrder` partout](#2-parsing-xml--pourquoi-preserveorder-partout)
3. [Construction du modèle de données](#3-construction-du-modèle-de-données)
4. [Conversion du contenu XHTML](#4-conversion-du-contenu-xhtml)
5. [Indexation et résolution des références croisées](#5-indexation-et-résolution-des-références-croisées)
6. [Assainissement (sanitization) du XHTML](#6-assainissement-sanitization-du-xhtml)
7. [Résolution des pièces jointes (`.reqifz`)](#7-résolution-des-pièces-jointes-reqifz)
8. [Rendu de l'arbre : titre, contenu, panneau technique](#8-rendu-de-larbre--titre-contenu-panneau-technique)
9. [Détection des métadonnées de cycle de vie](#9-détection-des-métadonnées-de-cycle-de-vie)
10. [Rendu personnalisé et vérification d'équilibre des balises](#10-rendu-personnalisé-et-vérification-déquilibre-des-balises)
11. [Complexités algorithmiques](#11-complexités-algorithmiques)
12. [Philosophie générale : fail-safe partout](#12-philosophie-générale--fail-safe-partout)
13. [Limites connues](#13-limites-connues)

---

## 1. Vue d'ensemble du pipeline

```
 entrée (string | Uint8Array | ArrayBuffer)
        │
        ▼
 load-package.ts ── détection ZIP (magic bytes "PK") ──► .reqifz : unzipSync (fflate)
        │                                                  │partition en
        │ .reqif (XML brut)                                │  • N × .reqif → parse
        ▼                                                  │  • reste → pièces jointes
 parse-document.ts (XMLParser, preserveOrder:true)          ▼
        │                                          AttachmentResolver (Map path→bytes)
        ▼
 ReqIfDocument (modèle typé, acyclique — src/types.ts)
        │
        ├──► lookup.ts        : ReqIfIndex (résolution O(1) des références)
        │
        └──► render.ts ───────────────────────────────────────────────────┐
                │                                                          │
                ├─ buildAttachmentLookup() : pré-résout tous les          │
                │  <object data="..."> en data: URI (passe async)        │
                │                                                          │
                ├─ pour chaque Specification → SpecHierarchy (récursif)   │
                │     ├─ resolveTitle()        (LONG-NAME → fallback)     │
                │     ├─ renderSimpleView()    (id, créé/modifié, custom, │
                │     │     contenu)                                      │
                │     │     └─ sanitize.ts : renderXhtmlContent()         │
                │     │     └─ custom-render.ts : renderCustomAttributes()│
                │     │           └─ html-balance.ts : isBalancedHtml()   │
                │     └─ renderTechnicalPanel() (tous les attributs)      │
                │                                                          │
                ▼                                                          │
           chaîne HTML autonome ◄──────────────────────────────────────────┘
```

Chaque flèche correspond à une fonction pure (aucun état partagé mutable entre les appels), ce qui rend chaque étape testable isolément — c'est ainsi que sont structurés les tests dans `test/`.

---

## 2. Parsing XML : pourquoi `preserveOrder` partout

### Le problème

`fast-xml-parser` propose deux modes :

- **mode "normal"** : regroupe les enfants par nom de balise dans un objet (`{ FOO: [...], BAR: [...] }`). Pratique, mais **l'ordre relatif entre des balises de noms différents est perdu**.
- **mode `preserveOrder: true`** : chaque nœud devient `{ [tagName]: enfants[], ":@"?: attributs }`, et les enfants restent un **tableau ordonné unique**, peu importe leur nom de balise.

Pour la structure squelette d'un ReqIF (`SPEC-OBJECT`, `VALUES`, `TYPE`...), l'ordre entre balises de noms différents n'a pas d'importance fonctionnelle. Mais pour le **contenu XHTML enrichi** (`<THE-VALUE>`), c'est l'inverse : un paragraphe comme

```xml
<xhtml:div>Le système doit <xhtml:b>répondre</xhtml:b> en moins de 2 secondes.</xhtml:div>
```

mélange du texte et des éléments dans un ordre précis. Perdre cet ordre reviendrait à afficher "répondre" n'importe où dans la phrase.

**Décision retenue** : plutôt que de jongler entre deux configurations de parseur selon l'endroit dans le document, `parse-document.ts` utilise **`preserveOrder: true` pour la totalité du document**. Le coût (un peu plus de verbosité de navigation) est accepté pour la garantie de fidélité partout, sans cas particulier à maintenir.

### La forme `XNode` et ses primitives de navigation (`xml-tree.ts`)

```ts
type XNode = { [tagName: string]: XNode[], ":@"?: Record<string,string> }
           | { "#text": string }
```

Toutes les fonctions de `xml-tree.ts` sont de petites primitives composables au-dessus de cette forme :

| Fonction | Rôle |
|---|---|
| `tagOf(node)` | renvoie le nom de balise (la seule clé qui n'est ni `":@"` ni `"#text"`) |
| `attrsOf(node)` | renvoie les attributs (`node[":@"]`) |
| `childrenOf(node)` | enfants **bruts**, texte inclus (utilisé pour le XHTML, où les espaces/textes comptent) |
| `elementsOf(node)` | enfants **filtrés** (texte exclu) — utilisé partout ailleurs, pour ignorer les retours à la ligne/indentation entre balises structurelles |
| `findFirst` / `findAll` | recherche par nom de balise parmi les enfants directs |
| `deepText(node)` | concatène récursivement tout le texte descendant — utilisé pour les éléments `*-REF` et les champs simples (`<TITLE>`) |
| `readRef(node, wrapperTag)` / `readRefs(...)` | lit l'identifiant à l'intérieur d'un élément wrapper (`<TYPE><X-REF>id</X-REF></TYPE>` → `"id"`) |

**Pourquoi deux fonctions `childrenOf`/`elementsOf` distinctes ?** C'est la correction d'un bug réel rencontré en cours de développement : un parseur en mode `preserveOrder` conserve les nœuds texte purement faits d'espaces (retours à la ligne d'indentation) comme de vrais enfants. Un appel naïf `childrenOf(datatypesWrap).map(parseDatatypeDefinition)` itérait alors aussi sur ces nœuds texte invisibles, et `parseDatatypeDefinition` plantait car `tagOf(textNode) === undefined`. La règle retenue : **`elementsOf` pour tout ce qui attend une liste d'éléments structurels, `childrenOf` uniquement pour le contenu XHTML mixte**, où le texte fait partie intégrante du contenu.

### Le garde-fou `maxNestedTags`

`fast-xml-parser` refuse par défaut (depuis une version récente de la bibliothèque) toute imbrication XML dépassant **100 niveaux**, comme protection contre les fichiers conçus pour épuiser la mémoire ("XML bomb"). Or un vrai document ReqIF peut dépasser ça aisément :

```
REQ-IF › CORE-CONTENT › REQ-IF-CONTENT › SPECIFICATIONS › SPECIFICATION
  › CHILDREN › SPEC-HIERARCHY › CHILDREN › SPEC-HIERARCHY › ... (récursif, un niveau par ligne hiérarchique)
```

… auquel s'ajoute la profondeur du contenu XHTML lui-même (texte collé depuis Word, souvent imbriqué `div > div > span > span`). `parse-document.ts` relève cette limite à **10 000**, configurable via `ParseOptions.maxNestedTags` (passé directement à `new XMLParser({ ...options, maxNestedTags })`).

### Le garde-fou `processEntities` (entités XML)

Le même type de package applique une protection analogue côté **entités** (`&amp;`, `&quot;`, déclarations `<!ENTITY>` dans un `<!DOCTYPE>`) : un compteur global, incrémenté à chaque entité traitée sur tout le document, déclenche une erreur (`Entity count exceeds maximum allowed` / `Entity expansion limit exceeded` selon la version) une fois un seuil de l'ordre de **1000** dépassé. Un grand export réel contenant simplement beaucoup de `&`/guillemets dans son texte (très commun : "Terms & Conditions", "R&D"...) peut dépasser ce seuil sans qu'il y ait quoi que ce soit de malveillant dans le fichier. `parse-document.ts` reconfigure explicitement `processEntities` avec des limites généreuses pour chacun de ses sous-réglages (`maxEntitySize`, `maxExpansionDepth`, `maxTotalExpansions`, `maxExpandedLength`, `maxEntityCount`), plutôt que de laisser fast-xml-parser appliquer ses valeurs implicites — la même philosophie que pour `maxNestedTags`, et configurable de la même façon via `ParseOptions.processEntities`.

---

## 3. Construction du modèle de données

`parse-document.ts` transforme l'arbre `XNode` générique en un modèle typé fidèle à la nomenclature UML de la spec OMG ReqIF v1.2 (`src/types.ts`).

### Dispatch par suffixe de balise

La spec ReqIF nomme ses balises XML en `UPPER-CASE-AVEC-TIRETS` directement dérivé du nom de classe UML (`AttributeValueString` → `ATTRIBUTE-VALUE-STRING`). L'algorithme de dispatch exploite cette régularité plutôt que d'écrire un `switch` exhaustif sur des chaînes complètes :

```ts
function kindFromTag(tag: string, prefix: string): DatatypeKind {
  const suffix = tag.slice(prefix.length).replace(/^-/, "");
  return suffix as DatatypeKind; // ex: "ATTRIBUTE-VALUE-STRING" - "ATTRIBUTE-VALUE" → "STRING"
}
```

Cette fonction est appelée avec le préfixe correspondant à la famille de balises (`"DATATYPE-DEFINITION"`, `"ATTRIBUTE-DEFINITION"`, `"ATTRIBUTE-VALUE"`), donnant directement le discriminant `kind` (`"STRING" | "INTEGER" | "BOOLEAN" | ...`) utilisé partout ailleurs dans le code comme type-guard TypeScript. Un `switch (kind)` ultérieur construit alors l'objet avec les champs spécifiques à ce sous-type (`MIN`/`MAX` pour `INTEGER`, `MAX-LENGTH` pour `STRING`, etc.), et lève une `ReqIfParseError` explicite dans le `default` si une balise inconnue apparaît (plutôt que d'échouer silencieusement).

### Convention uniforme pour les références croisées

Toute référence dans le document suit le même patron syntaxique :

```xml
<TYPE><SPEC-OBJECT-TYPE-REF>identifiant</SPEC-OBJECT-TYPE-REF></TYPE>
```

— un élément "wrapper" nommé d'après le rôle de l'association UML (`TYPE`, `DEFINITION`, `OBJECT`, `SOURCE`, `TARGET`...) contenant un unique élément `*-REF` dont le nom répète (redondamment) le type cible. `readRef(node, "TYPE")` ignore ce nom redondant et prend simplement "le premier enfant qui n'est pas un nœud texte", ce qui rend le code robuste même si la balise `*-REF` exacte varie. Le modèle de données qui en résulte **ne contient jamais d'objet imbriqué pour une référence — uniquement la chaîne d'identifiant** (`typeRef: Identifier`, jamais `type: SpecObjectType`). C'est un choix délibéré : ça garde `ReqIfDocument` acyclique et trivialement sérialisable en JSON (`JSON.stringify` fonctionne sans `replacer` custom), au prix de devoir passer par `ReqIfIndex` (section 5) pour résoudre une référence en objet réel.

### Construction récursive de la hiérarchie

`SPEC-HIERARCHY` peut contenir récursivement d'autres `SPEC-HIERARCHY` dans son propre `<CHILDREN>` — c'est l'arborescence visible dans l'UI finale. `parseSpecHierarchy` est une fonction récursive directe :

```ts
function parseSpecHierarchy(node: XNode): SpecHierarchy {
  const childrenWrap = findFirst(node, "CHILDREN");
  const children = childrenWrap
    ? findAll(childrenWrap, "SPEC-HIERARCHY").map(parseSpecHierarchy) // ← récursion
    : [];
  return { ...parseIdentifiable(node), objectRef: readRef(node, "OBJECT") ?? "", children, ... };
}
```

La profondeur de récursion JS correspond ici directement à la profondeur de l'arbre ReqIF — c'est exactement ce que `maxNestedTags` borne en amont, empêchant un débordement de pile sur un document pathologique.

---

## 4. Conversion du contenu XHTML

Le contenu XHTML traverse **deux représentations distinctes**, jamais une seule :

1. **`XNode`** (interne, propre à `fast-xml-parser`, jamais exposé dans l'API publique)
2. **`XhtmlNode`** (`{ type: "element", tag, attributes, children }` ou `{ type: "text", value }` — défini dans `types.ts`, complètement indépendant de la bibliothèque de parsing)

`xhtml.ts` fait la traversée de conversion :

```ts
function xNodeToXhtml(node: XNode): XhtmlNode {
  if (isTextNode(node)) return { type: "text", value: textOf(node) };
  return {
    type: "element",
    tag: tagOf(node)!.toLowerCase(),       // "xhtml:div" déjà devenu "div" via removeNSPrefix
    attributes: lowercased(attrsOf(node)),
    children: childrenOf(node).map(xNodeToXhtml), // récursion
  };
}
```

**Pourquoi cette indirection plutôt que d'exposer `XNode` directement ?** Découpler la forme publique (`XhtmlNode`) de l'implémentation interne du parseur (`XNode`) signifie qu'on pourrait remplacer `fast-xml-parser` par n'importe quel autre parseur XML sans casser l'API publique ni le sanitizer (section 6), qui ne connaît que `XhtmlNode`.

---

## 5. Indexation et résolution des références croisées

`ReqIfIndex` (`lookup.ts`) construit, **en un seul passage O(n)** sur le document, huit `Map<Identifier, T>` couvrant chaque famille d'éléments identifiables (types de données, types de spec, définitions d'attributs, valeurs d'énumération, objets, spécifications, nœuds de hiérarchie, relations, groupes de relations) :

```ts
constructor(doc: ReqIfDocument) {
  for (const d of c.datatypes) this.datatypes.set(d.identifier, d);
  for (const t of c.specTypes) {
    this.specTypes.set(t.identifier, t);
    for (const ad of t.specAttributes) this.attributeDefinitions.set(ad.identifier, ad); // aplatissement
  }
  // ... etc, une boucle par collection
  for (const s of c.specifications) this.indexHierarchy(s.children); // récursif, pour les SPEC-HIERARCHY imbriqués
}
```

Une fois construit, résoudre `typeRef`/`definitionRef`/`objectRef`/... coûte **O(1)** (lookup de Map) au lieu d'une recherche linéaire répétée dans les tableaux du document — déterminant pour le rendu, qui résout une référence par attribut et par nœud de l'arbre.

---

## 6. Assainissement (sanitization) du XHTML

Le contenu XHTML d'un fichier ReqIF est une **donnée non fiable** (provenant d'un tiers), même si le format ne permet en théorie que des balises "sûres". `sanitize.ts` applique un algorithme de **liste blanche récursive en trois catégories** :

```
pour chaque nœud de l'arbre XhtmlNode :
  ├─ nœud texte           → échappé (escapeHtml) et inséré tel quel
  ├─ <object>              → cas spécial, voir chaîne de repli ci-dessous
  ├─ balise dans
  │  DROP_ENTIRELY_TAGS    → toute la balise ET son contenu sont supprimés
  │  (<script>, <style>, <iframe>, formulaires, <svg>, <video>/<audio>...)
  ├─ balise hors de
  │  ALLOWED_TAGS           → la balise est supprimée mais ses ENFANTS sont
  │  (balise inconnue)       quand même rendus (on "déballe" sans perdre le texte)
  └─ balise dans
     ALLOWED_TAGS           → balise conservée, attributs filtrés
     (div, p, table...)      (seuls `style` et `title`, plus quelques
                              attributs spécifiques par balise comme
                              `colspan`/`href`), enfants récursés
```

La distinction entre les deux derniers cas est importante : un `<font>` ou un `<center>` (pas dans la liste blanche, mais inoffensif) garde son texte visible ; un `<script>alert(1)</script>` (dans `DROP_ENTIRELY_TAGS`) disparaît **entièrement**, contenu compris — sinon le texte `alert(1)` apparaîtrait, non exécuté mais visible inutilement.

### La chaîne de repli de `<object>`

La clause 10.8.20 de la spec décrit un mécanisme de repli pour les objets externes (images, sons...) :

```xml
<object data="diagramme.png" type="image/png">
  <object data="audio.mp3" type="audio/mpeg">
    Texte alternatif si rien ne peut être affiché
  </object>
</object>
```

`renderObject` implémente ça par récursion directe sur les enfants :

```ts
function renderObject(node): string {
  const resolved = opts.attachments?.get(node.attributes["data"]);
  if (resolved && mime.startsWith("image/")) return `<img src="${resolved.href}" ... />`;       // 1. image résolue
  const nestedObject = node.children.find(c => c.tag === "object");
  if (nestedObject) return renderObject(nestedObject, opts);                                     // 2. objet alternatif (récursion)
  if (resolved) return `<a download="...">📎 ...</a>`;                                           // 3. fichier non-image résolu → lien de téléchargement
  return renderChildren(node.children, opts);                                                    // 4. rien résolu → texte alternatif tel quel
}
```

### Assainissement de l'attribut `style`

La spec n'autorise que deux propriétés CSS (`text-decoration`, `color`) avec des valeurs précises. L'algorithme découpe la chaîne `style="prop1:val1;prop2:val2"` par `;` puis par le premier `:`, et valide chaque déclaration indépendamment contre une liste blanche de propriétés ET un motif de validation de valeur (`SAFE_COLOR`, `SAFE_TEXT_DECORATION`) avant de la conserver — toute déclaration qui échoue à l'une des deux vérifications est silencieusement abandonnée plutôt que de faire échouer tout le style.

---

## 7. Résolution des pièces jointes (`.reqifz`)

### Détection du format (`load-package.ts`)

Aucune extension de fichier n'est requise : l'entrée brute est inspectée par ses deux premiers octets, la signature magique d'un fichier ZIP local (`PK`, soit `0x50 0x4B`) :

```ts
function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}
```

Si ce n'est pas un ZIP, le contenu est traité comme du XML brut. Si c'est un ZIP, `unzipSync` (fflate) décompresse tout en mémoire en une fois, puis chaque entrée est **partitionnée** selon son nom : celles qui matchent `/\.reqif$/i` deviennent des documents parsés (un `.reqifz` peut légalement en contenir plusieurs), tout le reste devient une pièce jointe indexée par chemin dans une `Map<string, Uint8Array>`.

### Pourquoi deux passes (collecte puis résolution) au rendu

Le rendu HTML produit une **chaîne synchrone**, mais lire les octets d'une pièce jointe est **asynchrone** (`getBytes(): Promise<Uint8Array>`). Plutôt que de rendre toute la fonction de sérialisation HTML asynchrone (ce qui complexifierait chaque petite fonction récursive de `sanitize.ts`), le rendu est scindé en deux phases nettement séparées :

```
Phase 1 (async, une seule fois par document) :
  collectAllXhtmlContents(doc)              // parcourt tout le document
    → collectReferencedPaths(content)       // par valeur XHTML, cherche <object data> / <img src>
    → Set<string> de tous les chemins référencés, dédupliqués
    → Promise.all(...)                      // résout + lit chaque pièce jointe EN PARALLÈLE
    → Map<chemin, { href: data-URI, mimeType }>   ("AttachmentLookup")

Phase 2 (synchrone, récursive, peut être appelée autant de fois que nécessaire) :
  renderXhtmlContent(content, { attachments: lookupPhase1 })
    → AttachmentLookup.get(path) est un simple lookup de Map, donc instantané
```

Ce découpage permet de garder les fonctions de rendu purement synchrones (`renderXhtmlContent`, tout `sanitize.ts`) tout en supportant un mode de stockage des pièces jointes intrinsèquement asynchrone (lecture disque, fetch réseau...). `Promise.all` parallélise aussi la lecture de toutes les pièces jointes référencées plutôt que de les lire une par une.

### Encodage base64 universel (`base64.ts`)

`btoa(String.fromCharCode(...bytes))` casse sur de gros fichiers (limite d'arguments d'une fonction native). `toBase64` détecte `Buffer` (Node) en priorité, et sinon découpe les octets en blocs de 32 Ko avant de les passer à `btoa` côté navigateur — évitant le dépassement de pile sur une image volumineuse.

---

## 8. Rendu de l'arbre : titre, contenu, panneau technique

Le rendu d'un nœud de l'arborescence (`renderHierarchyNode`) est récursif, à l'image de la structure `SPEC-HIERARCHY` qu'il consomme. Pour chaque nœud, trois sous-algorithmes méritent un détail.

### Chaîne de résolution du titre

```ts
function resolveTitle(obj, node, index, labels, titleAttributes): string {
  if (obj?.longName) return obj.longName;                 // 1. LONG-NAME du SpecObject
  if (node.longName) return node.longName;                 // 2. LONG-NAME du SpecHierarchy
  for (const key of titleAttributes ?? []) {                // 3. attributs candidats, dans l'ordre fourni
    const { value } = resolveAttribute(obj, index, key);
    const text = valueToPlainText(value, index);
    if (text) return text;                                  //    premier non-vide gagne
  }
  return labels.untitled;                                   // 4. repli final
}
```

C'est une **cascade de priorité classique** ("first match wins"), où chaque étape n'est évaluée que si la précédente échoue (court-circuit par `return` anticipé). Le champ structurel `LONG-NAME` est toujours prioritaire ; `titleAttributes` n'intervient qu'en dernier recours, pour les cas où l'outil exportateur n'a pas rempli ce champ standard (DOORS, en particulier, met parfois le vrai libellé dans un attribut métier comme `ChapterName`).

### Résolution du contenu : mode automatique vs liste blanche explicite

```ts
function resolveContentHtml(obj, index, ..., contentAttributes): string {
  if (contentAttributes) {
    // Mode explicite : uniquement les attributs nommés, DANS L'ORDRE FOURNI.
    return contentAttributes
      .map(key => resolveAttribute(obj, index, key).value)
      .filter(Boolean)
      .map(formatAccordingToKind)   // XHTML → assaini ; sinon → texte échappé
      .join("");
  }
  // Mode automatique (par défaut) : tout attribut XHTML non déjà
  // consommé par la détection de cycle de vie (section 9).
  return obj.values
    .filter(v => v.kind === "XHTML" && !lifecycle.consumedDefinitionIds.has(v.definitionRef))
    .map(v => renderXhtmlContent(v.value, opts))
    .join("");
}
```

Le filtre `!lifecycle.consumedDefinitionIds.has(...)` est ce qui empêche un attribut "Créé par" stocké par erreur en XHTML (cas réel rencontré) de se retrouver **dupliqué** comme texte brut dans la zone de contenu principal — bug corrigé en cours de développement, voir l'historique des tests `does not duplicate created/modified values as bare main content`.

### Panneau technique : préservation de l'ordre déclaré

`renderTechnicalPanel` itère d'abord sur `specType.specAttributes` (l'ordre déclaré par le `SPEC-OBJECT-TYPE` dans le document — généralement l'ordre voulu par l'auteur du schéma), puis ajoute en second passage tout `AttributeValue` de l'objet dont la définition n'a pas été trouvée dans ce type (document malformé, mais récupérable plutôt que de perdre l'information) :

```ts
const seen = new Set<string>();
for (const def of orderedDefs) { seen.add(def.identifier); /* … */ }
for (const value of obj.values) {
  if (seen.has(value.definitionRef)) continue; // déjà traité ci-dessus
  /* … rendu en "orphelin" */
}
```

Ce panneau est **volontairement jamais filtré** par la détection de cycle de vie : c'est la zone "transparence totale", qui liste tout, même ce qui est déjà résumé ailleurs (voir section 9).

### Onglets sans JavaScript, numérotation, mode lecture

Trois mécanismes additionnels suivent les mêmes principes que le reste du rendu :

- **`layout: "tabs"`** (`tabs.ts`) : technique classique de "cases à cocher radio cachées" — un identifiant de groupe unique est généré par appel (compteur de module + suffixe aléatoire, pour éviter toute collision si plusieurs aperçus partagent une même page), puis une règle CSS `#input-i:checked ~ .reqif-tab-panel[data-tab-index="i"] { display: block }` est générée **par onglet** dans un `<style>` scoped. Le combinateur de frère général `~` permet à un `<input>` "caché" d'activer un panneau plus loin dans la fratrie sans JavaScript, à condition que tous deux soient des enfants directs du même conteneur (contrainte qui dicte la structure HTML choisie : tous les `<input>`, le conteneur des étiquettes, puis tous les panneaux, à plat).
- **Numérotation de chapitre** : la boucle sur une fratrie (`renderHierarchyChildren`) maintient un compteur local à ce niveau, et un `basePath: number[]` hérité du parent. Sans `chapterNumberAttributes`, chaque nœud incrémente le compteur (comportement "brutal" — tout est numéroté). Avec `chapterNumberAttributes`, un nœud n'incrémente le compteur **que** s'il porte une valeur non vide pour l'un des attributs listés (`isChapterNode`, qui réutilise `resolveAttribute`/`valueToPlainText` — les mêmes briques que `titleAttributes`) ; les nœuds qui ne qualifient pas n'affichent aucun numéro, et transmettent le `basePath` **inchangé** à leurs propres enfants — c'est ce qui permet à un "chapitre" plusieurs niveaux plus bas de continuer la séquence du dernier ancêtre numéroté plutôt que de repartir de zéro ou d'hériter d'un chemin erroné. La profondeur réelle de l'arbre (pour la taille des balises `<h3>`–`<h6>` du mode lecture) est suivie séparément (`depth`), puisqu'elle doit continuer à augmenter même quand le chemin de numérotation, lui, ne bouge pas.
- **Mode lecture** : n'ajoute aucune nouvelle structure de données — il fait simplement des branches conditionnelles (`options.readingMode ? "" : ...`) sur des fragments déjà calculés (badge ID, puce créé/modifié, panneau technique), et bascule le tag de titre d'un texte en gras vers `<h3>`–`<h6>` (profondeur + 2, plafonnée à 6) pour une meilleure structure sémantique/visuelle. Une classe `reqif-reading-mode` posée sur le conteneur racine active les surcharges CSS correspondantes (suppression des bordures de carte, etc.) sans dupliquer le HTML.

---

## 9. Détection des métadonnées de cycle de vie

`lifecycle.ts` résout un problème récurrent des exports DOORS/DOORS Next : l'identifiant métier et l'auteur/date de création/modification ne sont **pas définis par la spec OMG** elle-même, mais portés par une convention de fait (`ReqIF.ForeignID`, `ReqIF.ForeignCreatedBy`, `ReqIF.ForeignCreatedOn`, `ReqIF.ForeignModifiedBy`, `ReqIF.ForeignModifiedOn`) dont le nom exact varie d'un outil à l'autre.

### Normalisation des clés

```ts
function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}
```

Cette fonction réduit `"ReqIF.ForeignID"`, `"Foreign ID"` et `"foreign_id"` à la **même** clé canonique `"foreignid"`, permettant de les faire correspondre à un ensemble fixe de variantes connues (`FOREIGN_ID_KEYS`, `CREATED_BY_KEYS`, etc.) sans repli vers une comparaison floue coûteuse (distance de Levenshtein ou autre) — un simple `Set.has()` après normalisation suffit.

### Extraction de texte indépendante du type déclaré

Une même information sémantique ("le nom de la personne qui a créé l'objet") peut être stockée par l'outil exportateur comme `STRING`, ou — cas réel rencontré et corrigé — comme `XHTML` (DOORS exporte parfois même des champs courts en XHTML). `valueToPlainText` (`attribute-lookup.ts`) **dispatch sur le `kind`** de la valeur pour en extraire systématiquement une chaîne, peu importe le type concret :

```ts
function valueToPlainText(value: AttributeValue, index?: ReqIfIndex): string | undefined {
  switch (value.kind) {
    case "STRING": case "DATE":      return asString(value.value);
    case "INTEGER": case "REAL":     return value.value === undefined ? undefined : String(value.value);
    case "BOOLEAN":                  return value.value === undefined ? undefined : (value.value ? "true" : "false");
    case "XHTML":                    return value.value ? xhtmlToPlainText(value.value) : undefined; // aplatissement du texte
    case "ENUMERATION":              return index ? index.enumLabels(value.valueRefs).join(", ") : undefined;
  }
}
```

C'est ce dispatch qui a permis de corriger le bug "le nom ne s'affiche pas" : avant cette généralisation, le code ne savait extraire le texte que pour `STRING`, et un champ stocké en `XHTML` produisait silencieusement `undefined`.

### Un seul passage, classification multi-voies

`extractLifecycleInfo` fait un seul passage sur `obj.values` ; pour chaque valeur, sa définition est résolue (`index.attributeDefinitions.get(value.definitionRef)`), sa clé normalisée comparée successivement aux cinq ensembles reconnus, et la première correspondance déclenche l'extraction (`if/else if` mutuellement exclusifs — un attribut ne peut jouer qu'un seul rôle). L'identifiant de tout attribut ayant matché est accumulé dans `consumedDefinitionIds`, consommé plus tard uniquement par `resolveContentHtml` (section 8) pour éviter la duplication dans la zone de contenu — **jamais** par le panneau technique, qui reste exhaustif par choix de design.

---

## 10. Rendu personnalisé et vérification d'équilibre des balises

### Résolution et dispatch (`custom-render.ts`)

Pour chaque `CustomAttributeRenderer` enregistré, et pour chaque `SpecObject` rendu, l'algorithme :

1. résout la valeur de l'attribut ciblé via `resolveAttribute` (même mécanisme de correspondance par nom normalisé que `lifecycle.ts`, partagé via `attribute-lookup.ts`) ;
2. invoque `renderer.render(value, ctx)` dans un `try/catch` — une exception levée par le code de l'utilisateur de la bibliothèque ne doit jamais interrompre le rendu du reste du document ;
3. **valide l'équilibre des balises du résultat** (voir ci-dessous) avant de l'insérer.

### Vérification d'équilibre des balises (algorithme de pile)

C'est l'algorithme classique de "vérification de parenthésage" (le même principe qu'un vérificateur de `(`/`)`/`[`/`]` équilibrés), adapté aux balises HTML :

```ts
function isBalancedHtml(html: string): boolean {
  const stack: string[] = [];
  for (const [, closingSlash, tagName, selfClosing] of html.matchAll(TAG_RE)) {
    const lower = tagName.toLowerCase();
    if (VOID_TAGS.has(lower) || selfClosing) continue;      // <br>, <img/>... ignorées : pas de fermeture attendue
    if (closingSlash) {
      if (stack.length === 0 || stack.at(-1) !== lower) return false; // fermeture sans ouverture correspondante au sommet
      stack.pop();
    } else {
      stack.push(lower);                                     // ouverture : empilée
    }
  }
  return stack.length === 0;                                 // tout doit avoir été dépilé
}
```

Trois familles de bugs sont détectées par ce principe :
- **balise jamais fermée** (`<table>` sans `</table>`) → la pile n'est jamais vidée, `stack.length === 0` échoue à la fin ;
- **balise fermante en trop** (`</span></span>`) → la deuxième fermeture trouve une pile vide ou un sommet différent ;
- **imbrication croisée** (`<div><span>a</div></span>`) → la fermeture de `</div>` trouve `span` au sommet de la pile, pas `div`.

Le regex `TAG_RE` est conçu pour ignorer les `>` qui apparaissent **à l'intérieur d'une valeur d'attribut entre guillemets** (`<div title="a > b">`), pour ne pas se faire piéger par un attribut contenant ce caractère :

```
/<(\/)?([a-zA-Z][a-zA-Z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*?(\/)?>/g
```
décomposé : après le nom de balise, on autorise n'importe quelle séquence de (caractères qui ne sont ni `>` ni un guillemet) OU (une chaîne entre guillemets doubles) OU (une chaîne entre guillemets simples), de façon non-gourmande, jusqu'à la fermeture `>`.

Ce n'est **pas** un véritable parseur HTML (pas de gestion des règles de fermeture implicite du HTML5, par ex. `<p>` qui se ferme automatiquement devant un autre `<p>`) — un choix délibéré : l'objectif n'est pas de valider la conformité HTML, seulement d'attraper, sans dépendance externe, la classe d'erreurs la plus destructrice (un déséquilibre qui corromprait la structure de *tout ce qui est rendu après*).

### Dégradation "fail-safe"

Si `isBalancedHtml` renvoie `false`, le HTML retourné par l'utilisateur n'est **pas** inséré tel quel : il est échappé (`escapeHtml`) et affiché comme texte visible, accompagné d'un `console.warn` qui répète le HTML fautif. Le reste du document (contenu, panneau technique, nœuds suivants de l'arbre) continue à se construire normalement — une seule fonction de rendu personnalisée mal écrite ne peut donc plus jamais casser la mise en page de tout le reste.

---

## 11. Complexités algorithmiques

Avec *n* = nombre total de nœuds XML du document, *m* = nombre de pièces jointes référencées :

| Étape | Complexité | Remarque |
|---|---|---|
| Parsing XML (`fast-xml-parser`) | O(n) | un seul passage linéaire |
| Construction du modèle (`parse-document.ts`) | O(n) | un passage récursif, miroir direct de l'arbre source |
| Construction de `ReqIfIndex` | O(n) | un passage, 8 insertions de Map par élément au pire |
| Résolution d'une référence (`typeRef`, etc.) | O(1) amorti | lookup de `Map` |
| Collecte des chemins de pièces jointes | O(n) | un passage sur toutes les valeurs XHTML |
| Résolution des pièces jointes | O(m) en parallèle | `Promise.all`, borné par la I/O la plus lente, pas la somme |
| Rendu complet de l'arbre | O(n) | chaque nœud/attribut est visité une fois |
| `isBalancedHtml` | O(k) | k = longueur du fragment HTML personnalisé, un seul passage regex + pile |
| `normalizeKey` / correspondance d'attribut | O(longueur du nom) par appel | utilisé un nombre de fois borné par le nombre d'attributs de l'objet, pas par la taille du document |

Aucune étape n'est quadratique : il n'y a jamais de recherche linéaire imbriquée dans une autre boucle sur l'ensemble du document — c'est précisément ce que `ReqIfIndex` est censé empêcher.

---

## 12. Philosophie générale : fail-safe partout

Un fil conducteur traverse tout le code : **une donnée d'entrée surprenante (document malformé, attribut d'un type inattendu, fonction de rendu personnalisée buguée) ne doit jamais faire planter tout le rendu — au pire, elle dégrade localement.**

Quelques incarnations concrètes de ce principe, déjà rencontrées dans les sections précédentes :

- une balise structurelle inconnue lève une `ReqIfParseError` explicite (échec rapide et lisible) plutôt qu'un comportement indéfini silencieux ;
- une valeur dont la définition n'est pas trouvée dans le type déclaré est quand même affichée, en "orphelin", plutôt que silencieusement perdue ;
- une pièce jointe introuvable ou trop volumineuse n'empêche pas le reste du document de se rendre — elle retombe sur la chaîne de repli `<object>` ;
- un attribut `style` partiellement invalide ne fait pas échouer tout le style, seulement la déclaration fautive ;
- une fonction `render()` personnalisée qui lève une exception, ou qui retourne du HTML mal formé, dégrade vers une absence de contenu ou un texte échappé, jamais vers un document cassé.

---

## 13. Limites connues

- `isBalancedHtml` reste une heuristique de bon sens, pas un parseur HTML conforme : un cas pathologique extrêmement spécifique (par ex. exploitant les règles de fermeture implicite du HTML5 sur `<li>`/`<p>`/cellules de tableau) pourrait en théorie passer entre les mailles. Le compromis accepté est : zéro dépendance supplémentaire, contre une couverture "assez bonne pour les erreurs humaines courantes".
- La détection des métadonnées de cycle de vie (`lifecycle.ts`) repose sur une convention de nommage non normalisée par l'OMG — un outil qui n'utilise aucune des variantes reconnues (`ReqIF.ForeignID`, `Foreign ID`, etc.) ne sera simplement pas détecté automatiquement ; c'est pour ce cas que `titleAttributes`/`contentAttributes`/`customAttributeRenderers` existent comme échappatoires explicites.
- `maxNestedTags` est une limite globale par appel de parsing, pas par section du document : un document légitimement profond sur un seul attribut XHTML partage le même budget que la profondeur de la hiérarchie des spécifications.
