# Onglets, numérotation, vue de lecture

<!--@include: ../_conventions.md-->

Trois options composables, pensées pour les gros exports (`.reqifz` à plusieurs modules)
et pour produire un rendu plus proche d'un document Word :

```ts
const html = await renderPackageToHtml(pkg, {
  layout: "tabs",        // "stacked" (défaut) ou "tabs" — bascule CSS pure, sans JS
  chapterNumbers: true,  // 1, 1.1, 1.1.1, 1.2, 2... devant chaque titre
  readingMode: true,     // masque ID / créé-modifié / panneau technique ; titres en <h3>-<h6>
});
```

## `layout: "tabs"`

S'applique à **deux niveaux** :

- entre les différents documents `.reqif` d'un même `.reqifz` (`renderPackageToHtml`) ;
- entre les différentes `Specification` à l'intérieur d'un même document
  (`renderDocumentToHtml`).

N'a aucun effet s'il n'y a qu'un seul document ou qu'une seule spécification : pas
d'onglet inutile pour un cas simple. Implémenté en **CSS pur** — aucun JavaScript, donc
fonctionne même si le HTML est inséré statiquement, sans script, ou servi depuis un SSR.

### Le fragment d'URL décide du panneau affiché

Les onglets sont de **vrais liens**, et c'est le fragment d'URL qui décide du panneau
visible, via `:target` et `:has(:target)`.

```css
.reqif-tab-panel { display: none; }
.reqif-tab-panel:target,
.reqif-tab-panel:has(:target) { display: block; }   /* le panneau qui CONTIENT la cible */
.reqif-tabs:not(:has(:target)) > .reqif-tab-panel:first-of-type { display: block; }
```

La deuxième règle est celle qui compte. Une ancre profonde ouvre d'elle-même **tous** les
panneaux menant à sa cible, à tous les niveaux d'imbrication à la fois. Un lien de
relation vers une exigence d'un autre onglet fonctionne, et une URL comme
`…#reqif-obj-SYS-REQ-0042` rouvre le bon document, la bonne spécification, défilée jusqu'à
l'exigence — de quoi envoyer un lien précis à un collègue.

::: info Pourquoi pas des `<input type="radio">` cachés
La technique classique des onglets sans JS met l'état dans le DOM plutôt que dans l'URL —
plus autonome, et deux aperçus sur une page gardent des sélections indépendantes. Mais
elle rend l'ancre profonde **impossible** : le lien fait défiler jusqu'à un élément qui
reste `display: none`. Le compromis a été tranché dans l'autre sens, en connaissance de
cause.
:::

Les identifiants de panneaux dérivent des identifiants ReqIF (`#reqif-doc-<header>`,
`#reqif-spec-<spec>`), **jamais de la position de l'onglet** : un lien partagé survit à
l'insertion d'un document avant lui.

### Deux contreparties assumées

Conséquences directes de ce que l'état vit désormais dans l'URL de la page hôte :

- une application hôte qui **route sur le hash** (Vue Router en mode hash, par exemple)
  verra sa route changer à chaque clic d'onglet ;
- **deux aperçus sur une même page** ne peuvent plus retenir deux sélections d'onglet
  indépendantes — un seul fragment, un seul état.

### Un routeur SPA qui intercepte les liens casse les onglets

C'est le piège d'intégration le plus probable, et il est silencieux : l'URL change
correctement, mais **l'onglet ne bascule pas**.

La plupart des frameworks de documentation et des SPA posent un écouteur de clic global
qui intercepte les liens internes pour éviter un rechargement de page. Ils font alors :

<!-- exemple: extrait — cite le gestionnaire interne de VitePress, ce n'est pas notre code -->

```js
e.preventDefault();
history.pushState({}, "", href);
```

Or `history.pushState` **ne recalcule pas l'élément ciblé par `:target`**. Le fragment de
l'URL change, la page défile parfois, mais du point de vue du CSS aucun élément n'est
`:target` — donc le panneau reste `display: none`.

Rien dans le HTML produit n'est en cause : le même balisage fonctionne parfaitement dans
une page statique. C'est l'interception du clic qui supprime la navigation par fragment
dont le mécanisme dépend.

**Le remède : faire en sorte que le routeur ignore ces liens.** La plupart des
intercepteurs prévoient une sortie. Quelques exemples :

| Hôte | Sortie |
|---|---|
| VitePress | un ancêtre portant la classe `vp-raw` — c'est ce que fait le [bac à sable](/bac-a-sable) |
| Docusaurus, VitePress | un attribut `target` (même `target="_self"`, sans effet pour le navigateur) ou `download` |
| Vue Router, React Router | rien à faire : seuls leurs composants `<RouterLink>`/`<Link>` sont concernés, pas les `<a>` bruts |

Si votre routeur n'offre aucune sortie, la solution de dernier recours est de rétablir
vous-même une vraie navigation par fragment après coup :

```js
// L'élément qui reçoit le HTML de l'aperçu.
const container = document.getElementById("preview")!;

container.addEventListener("click", (event) => {
  const link = event.target.closest?.("a[href^='#']");
  if (!link || !container.contains(link)) return;
  const id = link.getAttribute("href").slice(1);
  // Le routeur a peut-être fait un pushState, qui laisse :target inchangé.
  // On rejoue une vraie navigation par fragment.
  requestAnimationFrame(() => {
    if (location.hash.slice(1) === id) location.hash = "";
    location.hash = id;
  });
});
```

::: tip Comment reconnaître ce cas en trente secondes
Ouvrez la console et comparez, après un clic sur un onglet :

```js
location.hash;                        // "#reqif-doc-..."  -> l'URL a bien changé
document.querySelector(":target");    // null              -> mais rien n'est ciblé
```

`hash` renseigné et `:target` à `null`, c'est exactement cette situation.
:::

Cliquer un onglet fait par ailleurs défiler vers son panneau : c'est le comportement d'un
lien, atténué par `scroll-margin-top` mais pas supprimable. Enfin, ce mécanisme repose sur
`:has()`, disponible dans tous les navigateurs depuis décembre 2023.

## `chapterNumbers`

Préfixe chaque titre de sa position dans l'arborescence (`1`, `1.1`, `1.1.1`, `1.1.2`,
`1.2`, `2`…). La numérotation **repart à 1 à chaque nouvelle `Specification`**, comme des
documents séparés.

Par défaut, **tous** les nœuds sont numérotés — un peu brutal, puisqu'un document Word ne
numérote que ses titres, pas chaque paragraphe. Si vos exigences distinguent les
« chapitres » structurels des exigences elles-mêmes via un attribut (la convention
`ChapterName` / `ReqIF.ChapterName` est courante chez DOORS), restreignez la numérotation
à ces seuls nœuds :

```ts
const html = await renderPackageToHtml(pkg, {
  chapterNumbers: true,
  chapterNumberAttributes: ["ChapterName"], // ou ["ReqIF.ChapterName"], selon votre export
});
```

Seuls les objets portant une valeur non vide pour l'un de ces attributs reçoivent alors un
numéro. Les autres — les exigences « feuilles » — n'en reçoivent aucun **et ne décalent pas
la numérotation de leurs frères**, comme un paragraphe normal entre deux titres Word. Si un
nœud non numéroté a lui-même des enfants qui sont des chapitres, leur numérotation continue
depuis le dernier ancêtre numéroté : elle ne redémarre pas à cause du nœud intermédiaire.

## `readingMode`

Pensez à un export PDF ou Word : seuls les titres et le texte des exigences restent
visibles.

- L'encadré ID, la ligne « Créé par / Modifié par » et le panneau « Détails techniques »
  disparaissent. Le contenu reste accessible en repassant en mode normal.
- Les titres passent de simples lignes en gras à de vraies balises `<h3>`…`<h6>` selon la
  profondeur — la `Specification` elle-même garde son `<h2>`.
- Le contenu que *vous* ajoutez via [`customAttributeRenderers`](/guide/rendus-personnalises)
  **reste affiché** : seule la métadonnée générée automatiquement est masquée, pas ce que
  vous avez explicitement demandé.
- Les [liens entre exigences](/guide/relations) restent affichés eux aussi — un lien de
  traçabilité est du contenu, pas de la métadonnée technique.

::: details Pourquoi les tailles de titres sont fixées explicitement
Les titres sont imbriqués les uns dans les conteneurs des autres. Avec les tailles `em`
par défaut des navigateurs, chaque niveau se calcule relativement à son parent **déjà
réduit** : la taille se compose en cascade et devient illisible en quatre ou cinq niveaux,
ce qui est courant sur une arborescence d'exigences.

D'où des tailles en `rem` — relatives à la racine, jamais à un ancêtre imbriqué — fixées
niveau par niveau de `1.3rem` à `0.95rem`. Passé `<h6>`, la taille reste constante à
`0.95rem` au lieu de continuer à rétrécir.
:::

::: tip
Le [bac à sable](/bac-a-sable) expose ces trois options sur un paquet à trois documents et
deux niveaux d'onglets. C'est le moyen le plus rapide de voir laquelle correspond à ce que
vous cherchez.
:::
