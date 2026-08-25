# Documents très imbriqués

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
document se rend quand même. Voir [Diagnostics](/guide/diagnostics) pour rendre ces
décisions visibles.
