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

Le chargement construit le modèle ReqIF en mémoire. Le rendu produit une chaîne HTML. Le
navigateur en construit ensuite le DOM, puis calcule sa mise en page. Le poids relatif de
ces opérations dépend du contenu du document, du mode de rendu et de l'environnement —
sous Node, les étapes DOM et mise en page n'existent pas.

Aucun poste n'est désigné ici comme dominant. Deux corpus, mesurés séparément, l'ont placé
à deux endroits différents : un temps ne vaut donc rien sans son fichier, son moteur et son
banc. Mesurez ces étapes séparément sur vos propres fichiers pour trouver celle qui mérite
d'être améliorée.

### Différer le panneau technique

Chaque exigence porte un panneau technique replié qui liste ses attributs, et c'est la plus
grande part du DOM que cette bibliothèque émet. Avec le défaut, ces éléments sont
construits que quelqu'un ouvre le panneau ou non.

```ts
const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy" });
document.getElementById("preview")!.innerHTML = html;
expandLazyPanels();
```

`"lazy"` conserve le contenu du panneau dans un bloc inerte et diffère la construction de
ses éléments DOM jusqu'à leur expansion par JavaScript. Il réduit le DOM initial. Il ne
réduit pas la chaîne HTML — qui s'allonge un peu, le contenu voyageant toujours — et ne
promet aucun rapport sur le temps : savoir s'il paie dépend du document, donc mesurez-le
sur le vôtre.

`expandLazyPanels()` est obligatoire : voir
[Faire fonctionner les panneaux paresseux](/fr/api/#faire-fonctionner-les-panneaux-paresseux)
pour la raison, et pour le cas du rendu serveur. Si vous n'avez pas besoin du panneau,
`technicalPanel: "off"` le supprime entièrement — avec les informations qu'il affiche — et
ne demande rien.

### À quoi s'attendre, et ce qui n'aidera pas

Le parsing est un appel synchrone indivisible, pendant lequel la page est figée. Le
déplacer dans un Web Worker est la seule chose qui le retire du fil principal, et le modèle
qu'il produit survit à `structuredClone` ; le résolveur de pièces jointes, non, car il
porte des méthodes.

Le pic mémoire est la limite la plus dure, et c'est lui qui tuera un onglet avant les
secondes. Le modèle est construit entièrement en mémoire, en un seul passage, et aucune
option ici n'y change quoi que ce soit. Un chargement coûte un multiple de la taille du
fichier plutôt que cette taille, et ce multiple dépend du document — le seul chiffre qui
vaille est donc celui que vous mesurez sur les fichiers que vous ouvrez vraiment.

::: tip Mesurez votre propre fichier
La taille d'un fichier en dit moins que ce qu'il contient : deux documents de même taille
peuvent différer largement en temps comme en mémoire, selon le nombre d'attributs que porte
chaque exigence et la profondeur de son texte riche.

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
