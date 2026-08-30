---
# The preview needs the full content width: VitePress caps `.content-container`
# at 688px only when the right-hand aside is present, so dropping the aside is
# what actually widens the page — no CSS override, nothing tied to VitePress's
# scoped-style hashes.
aside: false
pageClass: sandbox-page
---

# Bac à sable

Cette page exécute **la vraie bibliothèque**, dans votre navigateur, sur le fichier
de votre choix. Le bundle chargé ici est celui produit par `npm run build` au moment
de la publication du site : ce que vous voyez est ce que fait le code aujourd'hui.

Rien n'est envoyé nulle part — il n'y a aucun serveur derrière cette page. Votre
fichier est lu par `FileReader` et traité localement.

<ClientOnly>
  <Playground />
</ClientOnly>

## Ce qu'il y a dans le fichier d'exemple

`exemple.reqifz` est un paquet de trois documents ReqIF qui se référencent
mutuellement, dans le scénario d'échange que la spec présente en ouverture
(figure 1.1) :

| Document | Contenu |
|---|---|
| `01-exigences-client.reqif` | La spécification du client — les `CRS-…` |
| `02-exigences-systeme.reqif` | Les exigences système `SRS-…`, qui *dérivent de* CRS |
| `03-plan-de-validation.reqif` | Les essais `TST-…`, qui *vérifient* des SRS |

Il contient **volontairement des anomalies**, pour que le panneau
[Diagnostics](/guide/diagnostics) ait quelque chose à montrer :

- une relation `TST-002 → SRS-999-absent` qui ne pointe sur rien : `unresolved-reference` ;
- l'objet `CRS-003` rendu à deux endroits de l'arborescence : `duplicate-dom-id` ;
- un attribut XHTML porteur de `IS-SIMPLIFIED="true"` **et** de son
  `<THE-ORIGINAL-VALUE>`, pour comparer les deux avec `preferSimplifiedXhtml` ;
- une image (`images/schema-aeb.png`) référencée depuis le texte enrichi, résolue
  en `data:` URI ;
- un `ALTERNATIVE-ID` (`DOORS-88421`), tel qu'un export d'outil réel en pose.

## Trois manipulations qui valent le détour

**Suivre un lien entre documents.** Choisissez `layout: tabs`, ouvrez l'onglet
« Plan de validation — AEB », dépliez un essai et cliquez son lien `→ Vérifie`.
L'onglet « Exigences système » s'ouvre de lui-même, **et** la bonne spécification
à l'intérieur (« Capteurs » ou « Interface conducteur »), défilée jusqu'à
l'exigence : c'est le fragment d'URL qui pilote l'affichage, aux deux niveaux
d'imbrication à la fois. Voir [Onglets, numérotation, lecture](/guide/mise-en-page).

**Comparer original et version simplifiée.** Basculez `preferSimplifiedXhtml` et
regardez l'exigence porteuse du drapeau : par défaut la bibliothèque affiche
l'original, plus fidèle. Voir [Texte simplifié](/guide/texte-simplifie).

**Passer en vue de lecture.** Cochez `readingMode` puis `chapterNumbers` : les
encadrés d'ID, la ligne « créé/modifié » et le panneau technique disparaissent, et
les titres deviennent de vraies balises `<h3>`…`<h6>` numérotées. C'est le rendu
à viser pour une impression ou un export PDF.

::: tip Le hash de cette page va changer
Les onglets sont de vrais liens : cliquer un onglet écrit un fragment dans l'URL
de la page — y compris celle-ci. C'est exactement la contrepartie documentée dans
[Onglets, numérotation, lecture](/guide/mise-en-page#deux-contreparties-assumees),
et la voir à l'œuvre ici vaut mieux que de la lire.
:::
