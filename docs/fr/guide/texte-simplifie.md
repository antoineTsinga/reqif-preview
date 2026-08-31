# Texte simplifié en cours de route (`isSimplified`)

<!--@include: ../_conventions.md-->

Quand un outil de la chaîne d'échange ne sait pas interpréter la mise en forme d'un
attribut XHTML, la spec (clause 10.8.20) lui demande de :

1. remplacer le contenu par une version simplifiée ;
2. poser `IS-SIMPLIFIED="true"` sur la valeur ;
3. **conserver l'original** dans `<THE-ORIGINAL-VALUE>`.

Autrement dit, le fichier transporte les deux versions : celle que l'outil intermédiaire
savait afficher, et celle qu'il a reçue.

## Pourquoi l'original par défaut

`reqif-preview` rend le sous-ensemble XHTML complet autorisé par la spec — il n'a donc
pas la déficience que ce drapeau signale. **Par défaut il affiche l'original**, plus
fidèle que la version dégradée :

```ts
// Comportement par défaut : l'original s'il existe, sinon le contenu simplifié.
const html = await renderPackageToHtml(pkg);

// Pour reproduire ce que verrait un outil limité :
const html = await renderPackageToHtml(pkg, { preferSimplifiedXhtml: true });
```

Les deux contenus sont exposés dans le modèle :

```ts
const { value } = resolveAttribute(obj, index, "ReqIF.Text");

if (value?.kind === "XHTML") {
  value.value;         // XhtmlContent — ce que la spec appelle theValue
  value.originalValue; // XhtmlContent — theOriginalValue, si présent
  value.isSimplified;  // true quand value.value est un substitut dégradé
}
```

Les pièces jointes référencées par l'un comme par l'autre sont résolues : basculer
`preferSimplifiedXhtml` ne fait jamais disparaître une image.

## Extraction de texte : toujours l'original

`xhtmlToPlainText` et `valueToPlainText` lisent **toujours** l'original quand il existe,
indépendamment de `preferSimplifiedXhtml`. La raison est concrète : une simplification
peut avoir *perdu* du texte — un tableau aplati, une liste écrasée — et une recherche
plein texte ou un export CSV veut la source la plus complète, pas la plus jolie.

::: tip Voir la différence
Le [bac à sable](/fr/bac-a-sable) charge un exemple dont une exigence porte les deux
versions. Cochez `preferSimplifiedXhtml` et regardez-la changer.
:::

## Rappel de modélisation

`isSimplified` s'applique à **une valeur d'attribut**, pas à un objet ni à un document. Un
même `SpecObject` peut parfaitement avoir un `ReqIF.Text` simplifié et une description
intacte : le drapeau se lit toujours sur l'`AttributeValueXHTML` concernée.
