# Documents très imbriqués

<!--@include: ../_conventions.md-->

Deux garde-fous de `fast-xml-parser` — l'analyseur XML utilisé en interne — font échouer
le parsing de documents ReqIF parfaitement valides avec leurs valeurs par défaut.
`reqif-preview` les relève ; cette page explique pourquoi, et comment les ajuster.

## Profondeur d'imbrication

`fast-xml-parser` refuse par défaut tout XML imbriqué sur plus de **100 niveaux**, comme
protection contre les fichiers malveillants (« XML bomb »). C'est trop bas pour de vrais
documents ReqIF : une hiérarchie de spécifications profonde combinée à du texte enrichi
richement imbriqué — typiquement du contenu collé depuis Word — dépasse facilement cette
limite sur un document par ailleurs légitime, avec une erreur
`Maximum nested tags exceeded`.

`reqif-preview` relève cette limite à **10 000** par défaut.

```ts
// Document encore plus profondément imbriqué :
const pkg = await loadReqIfPackage(bytes, { maxNestedTags: 50_000 });

// À l'inverse, si vous traitez des fichiers non fiables et voulez une
// protection plus stricte contre les fichiers malveillants :
const pkg = await loadReqIfPackage(bytes, { maxNestedTags: 200 });
```

## Entités XML

`fast-xml-parser` applique le même type de garde-fou pour le traitement des entités XML
(`&amp;`, `&quot;`, déclarations `<!ENTITY>`…) : selon la version, la limite par défaut
tourne autour de **1000** occurrences ou déclarations au total dans le document. Un export
volumineux la dépasse simplement en ayant beaucoup d'esperluettes et de guillemets dans
son texte, avec une erreur du type `Entity count exceeds maximum allowed` ou
`Entity expansion limit exceeded`.

`reqif-preview` relève également ces limites par défaut.

```ts
const pkg = await loadReqIfPackage(bytes, {
  processEntities: { maxEntityCount: 5_000_000, maxTotalExpansions: 5_000_000 },
});

// Désactiver entièrement le traitement des entités (rarement utile) :
const pkg = await loadReqIfPackage(bytes, { processEntities: false });
```

L'objet passé est **partiel** : les limites que vous ne mentionnez pas gardent la valeur
par défaut de la bibliothèque.

::: warning Ces limites sont une décision de sécurité
Les relever revient à faire confiance au fichier. C'est le bon choix pour un export produit
par votre propre chaîne d'outils, et un choix à reconsidérer pour un fichier téléversé par
un utilisateur quelconque. Dans ce dernier cas, `maxNestedTags: 200` et les défauts
d'entités de `fast-xml-parser` sont un point de départ raisonnable — au prix de refuser
certains documents légitimes.
:::

## Ce qui, en revanche, ne lève jamais

Ces deux erreurs viennent de l'étape de **parsing**, la seule qui peut échouer. Passé ce
point, plus rien ne lève : une entrée surprenante dégrade localement et le reste du
document se rend quand même. Voir [Diagnostics](/fr/guide/diagnostics) pour rendre ces
décisions visibles.

## Fichiers lourds

Tout ce qui précède concerne les documents qui échouent au parsing. Cette section concerne
ceux qui se parsent très bien mais paraissent lents — et surtout quel réglage aide
réellement, parce que les suppositions évidentes sont fausses.

Mesuré sur un vrai export IBM DOORS de 4,94 Mo (1 024 exigences) et sur un fichier généré
de 49,8 Mo, sous Node et sous Chrome :

| Phase | 4,94 Mo | 49,8 Mo |
|---|---|---|
| Parsing XML vers le modèle | 278 ms | 3 554 ms |
| Construction de `ReqIfIndex` | 0,5 ms | 9,3 ms |
| Résolution des pièces jointes | 0,5 ms | 12,7 ms |
| Rendu en chaîne | 99 ms | 3 217 ms |
| **Insertion du HTML dans le DOM** | **550 ms** | **22 211 ms** |

Deux choses à en retenir. L'index ne coûte rien — ce n'est pas lui qu'il faut optimiser. Et
le poste le plus lourd n'est pas dans cette bibliothèque : c'est le navigateur qui
construit les nœuds à partir de la chaîne que vous affectez à `innerHTML`.

### Le seul réglage qui aide

Les deux tiers des nœuds émis sont le panneau technique, dans un `<details>` que personne
n'a ouvert. Un `<details>` fermé saute la mise en page, mais ses nœuds sont construits
quand même : ils sont donc payés plein tarif avant que quiconque demande à les voir.

```ts
const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy" });
document.getElementById("preview")!.innerHTML = html;
expandLazyPanels();
```

Les nœuds que le navigateur doit construire passent de 69 par exigence à 29, ce qui divise
à peu près par deux le temps d'insertion. Le balisage voyage toujours : la chaîne est donc
~3 % plus grosse — le gain est à l'analyse et à la mise en page, pas au transfert.

`expandLazyPanels()` est obligatoire : voir
[Faire fonctionner les panneaux paresseux](/fr/api/#faire-fonctionner-les-panneaux-paresseux)
pour la raison, et pour le cas du rendu serveur. Si vous n'avez pas besoin du panneau,
`technicalPanel: "off"` est plus léger encore et ne demande rien.

### À quoi s'attendre, et ce qui n'aidera pas

Le parsing est un appel synchrone indivisible : environ 0,3 s à 5 Mo et 3,5 s à 50 Mo,
pendant lesquelles la page est figée. La montée est quasi linéaire — dix fois l'entrée
coûte environ treize fois le temps — il n'y a donc pas de mur, juste un coût régulier. Le
déplacer dans un Web Worker est la seule chose qui le retire du fil principal, et le
modèle qu'il produit survit à `structuredClone` ; le résolveur de pièces jointes, non, car
il porte des méthodes.

Le pic mémoire est la limite la plus dure : **25 à 56 fois la taille du fichier d'entrée**,
1,28 Go pour 49,8 Mo. C'est ce qui tuera un onglet avant les secondes, et aucune option
ici n'y change quoi que ce soit — le modèle est construit entièrement en mémoire, en un
seul passage.

::: tip Mesurez votre propre fichier
Les chiffres ci-dessus portent sur deux documents ; ceux qui comptent sont les vôtres. La
taille d'un fichier en dit moins que la profondeur du texte riche qu'il contient —
l'export DOORS ci-dessus coûte 56 fois sa taille en mémoire quand le fichier généré en
coûte 25, pour la même raison que ses nœuds par exigence sont plus nombreux.

```ts
const started = performance.now();
const loaded = await loadReqIfPackage(bytes);
const parsed = performance.now();
const html = await renderPackageToHtml(loaded);
const rendered = performance.now();
document.getElementById("preview")!.innerHTML = html;
const shown = performance.now();

console.log({
  parse: parsed - started,
  render: rendered - parsed,
  dom: shown - rendered,          // le plus gros des trois, en général
});
```
:::
