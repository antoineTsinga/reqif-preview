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
// Si vous traitez des fichiers non fiables et voulez une protection plus
// stricte contre les fichiers malveillants :
const pkg = await loadReqIfPackage(bytes, { maxNestedTags: 200 });
```

Relever le garde-fou relève le plafond du parseur, pas tous les plafonds — et notez que
`maxNestedTags` compte l'imbrication XML de tout le document, pas la profondeur du texte
enrichi d'un seul attribut.

Convertir, assainir, rendre et parcourir le texte enrichi d'un attribut n'utilisent plus la
pile d'appels JavaScript pour cette traversée : ce ne sont donc pas ces quatre-là qui
cèdent en premier. La **hiérarchie de spécifications** reste parcourue récursivement, de
même que la sérialisation d'un arbre retourné par un callback `customAttributeRenderers` :
l'une comme l'autre peut épuiser la pile, et l'erreur est alors un `RangeError` plutôt
qu'un `ReqIfParseError`. Où cela survient dépend du moteur et de la pile disponible à cet
instant, donc aucune profondeur maximale n'est annoncée ici.

## Entités XML

`fast-xml-parser` applique le même type de garde-fou au traitement des entités XML, et il
vaut la peine de savoir ce qu'il compte. La limite qui se déclenche sur un document
légitime compte les **déclarations** `<!ENTITY>` — un DOCTYPE généré par un outil, avec
beaucoup d'entités nommées — et non les références : les `&amp;` et `&quot;` du texte n'y
entrent pas. Une limite distincte borne le total des expansions, et savoir si les
références ordinaires en relèvent dépend de la version du parseur. Les erreurs
ressemblent à `Entity count exceeds maximum allowed` ou `Entity expansion limit
exceeded`.

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

## Ce qui, en revanche, dégrade

Les deux erreurs ci-dessus viennent de l'étape de **parsing**, et arrivent sous la forme
d'un `ReqIfParseError`. Passé ce point, le rendu dégrade localement au lieu d'échouer :
une entrée surprenante, un de vos callbacks qui lève, une pièce jointe illisible — chacun
vous coûte cette seule chose, et le reste du document se rend quand même. Voir
[Diagnostics](/fr/guide/diagnostics) pour rendre ces décisions visibles.

Ce n'est pas une garantie que rien ne peut lever. Deux parcours restent récursifs — la
hiérarchie de spécifications, et la sérialisation des arbres retournés par un callback
`customAttributeRenderers` — donc un document ou un callback imbriqué sur des milliers de
niveaux peut épuiser la pile d'appels, ce qui se manifeste par un `RangeError` et non par
une dégradation.

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

Chaque exigence porte un panneau technique replié qui liste ses attributs. Avec le défaut,
ses éléments sont construits avant que quiconque l'ouvre, et sur un document dont les
exigences portent beaucoup d'attributs, cela représente une grande part du DOM émis.

```ts
const html = await renderPackageToHtml(pkg, { technicalPanel: "lazy" });
document.getElementById("preview")!.innerHTML = html;
expandLazyPanels();
```

`"lazy"` conserve le contenu du panneau dans un bloc inerte et diffère la construction de
ses éléments DOM jusqu'à leur expansion par JavaScript. Il réduit le DOM initial. Il ne
réduit pas la chaîne HTML : le contenu voyage toujours, donc la chaîne n'est pas
nécessairement plus courte et peut être plus longue. Et il ne promet aucun rapport sur le
temps — savoir s'il paie dépend du document, donc mesurez-le sur le vôtre.

`expandLazyPanels()` est obligatoire : voir
[Faire fonctionner les panneaux paresseux](/fr/api/#faire-fonctionner-les-panneaux-paresseux)
pour la raison, et pour le cas du rendu serveur. Si vous n'avez pas besoin du panneau,
`technicalPanel: "off"` le supprime entièrement — avec les informations qu'il affiche — et
ne demande rien.

### À quoi s'attendre, et ce qui n'aidera pas

Le parsing est un appel synchrone indivisible : l'exécuter sur le fil principal retarde
donc les interactions pendant toute sa durée. Le déplacer dans un Web Worker est le moyen
de sortir ce travail du fil principal, et le modèle qu'il produit survit à
`structuredClone` ; le résolveur de pièces jointes, non, car il porte des méthodes.

La mémoire mérite une attention propre, et c'est souvent elle qui limite la taille de
fichier qu'une page peut ouvrir. Le modèle est construit entièrement en mémoire, en un seul
passage ; la chaîne HTML coexiste avec lui le temps du rendu ; et le DOM que le navigateur
en construit s'ajoute aux deux. Ce que cela représente dépend du document et de la façon
dont vous intégrez la bibliothèque — réduire le HTML ou le DOM initial en change une part,
le modèle restant complet. Le chiffre qui compte est celui que vous mesurez dans
l'environnement que vous livrez.

::: tip Mesurez votre propre fichier
La taille d'un fichier en dit moins que ce qu'il contient : deux documents de même taille
peuvent différer largement en temps comme en mémoire, selon le nombre d'attributs que porte
chaque exigence et la profondeur de son texte riche.

```ts
const started = performance.now();
const loaded = await loadReqIfPackage(bytes);
const afterLoad = performance.now();
const html = await renderPackageToHtml(loaded);
const afterRender = performance.now();
document.getElementById("preview")!.innerHTML = html;
const afterInsert = performance.now();

console.log({
  load: afterLoad - started,          // décodage, parsing, construction du modèle
  render: afterRender - afterLoad,
  insert: afterInsert - afterRender,  // insertion seule ; n'attend ni la mise en page ni la peinture
});
```
:::
