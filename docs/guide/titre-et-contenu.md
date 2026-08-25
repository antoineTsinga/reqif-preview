# Choisir précisément le titre et le contenu affichés

Par défaut, le **titre** vient du `LONG-NAME` de l'objet (ou de son nœud dans
l'arborescence), et le **contenu** affiche automatiquement tous les attributs XHTML de
l'objet — ce qui n'est pas toujours pertinent si plusieurs champs riches coexistent sans
rapport entre eux. Deux options permettent de reprendre la main.

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

## `contentAttributes`

Liste blanche stricte :

- si un attribut listé n'existe pas sur l'objet, il est simplement ignoré ;
- si aucun n'a de valeur, le message « (vide) » habituel s'affiche ;
- les attributs sont rendus **dans l'ordre où vous les listez**, pas dans l'ordre du
  fichier.

## `titleAttributes`

N'intervient qu'**en dernier recours**, après le `LONG-NAME` de l'objet et celui de son
nœud d'arborescence — jamais à leur place. Pratique pour les exports DOORS où le vrai
libellé est parfois dans un attribut personnalisé plutôt que dans le champ structurel.

::: info Les deux options n'enlèvent rien
Les attributs visés restent visibles dans le panneau technique, qui, lui, n'est jamais
filtré. Ces options décident de ce qui est **mis en avant**, pas de ce qui est conservé.
:::

## Titre ou contenu vide volontaire

Pour les objets « chapitres » (voir [`chapterNumberAttributes`](/guide/mise-en-page#chapternumbers)),
un raccourci existe :

```ts
const html = await renderPackageToHtml(pkg, {
  chapterNumberAttributes: ["ChapterName"],
  suppressEmptyPlaceholdersForChapters: true, // pas de "(sans titre)"/"(vide)" pour les chapitres
});
```

Mais c'est en réalité un cas particulier d'un besoin plus général : parfois un objet
n'est **structurellement pas censé** avoir de titre — un simple paragraphe d'information,
par exemple, qui a du texte mais jamais de `LONG-NAME` — ou inversement pas de contenu
(un titre de section pur, sans texte directement dessous). Ce ne sont pas des données
manquantes à signaler avec « (sans titre) » ou « (vide) ».

::: warning `customAttributeRenderers` ne peut pas résoudre ça
Un rendu personnalisé n'agit que sur la zone de **contenu** (avant/après), jamais sur le
titre affiché dans l'arborescence (le `<summary>`). Pour le titre comme pour le contenu,
utilisez `isTitleless` / `isContentless`.
:::

```ts
import { resolveAttribute, valueToPlainText } from "reqif-preview";

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

- Les deux fonctions sont **indépendantes** : un objet peut être « sans titre attendu »
  sans être « sans contenu attendu », et inversement — c'est exactement le cas
  paragraphe-sans-titre contre chapitre-sans-contenu.
- Elles ne s'appliquent qu'au **repli** : si l'objet a un vrai `LONG-NAME` ou un vrai
  contenu, il s'affiche normalement, peu importe ce que ces fonctions renvoient.
- Elles se combinent avec `suppressEmptyPlaceholdersForChapters` : la suppression a lieu
  si l'une **ou** l'autre dit oui.

Pour un contrôle encore plus fin — afficher un texte de remplacement personnalisé plutôt
que rien — `customAttributeRenderers` reçoit `ctx.isChapter` (vrai si l'objet correspond
à `chapterNumberAttributes`, indépendamment des options de suppression) :

```ts
customAttributeRenderers: [{
  attribute: "ReqIF.Text",
  render: (value, ctx) => (!value && ctx.isChapter ? `<span class="chapter-divider">—</span>` : undefined),
}]
```
