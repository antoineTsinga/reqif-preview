# Liens entre exigences (`SpecRelation`)

Les liens typés entre exigences — « dérive de », « satisfait », « trace vers » — sont
affichés automatiquement pour chaque objet qui en possède : ses liens **sortants** (`→`)
et **entrants** (`←`), avec le nom du type de relation et un lien d'ancrage vers l'objet
lié **si celui-ci est rendu dans la même page**.

```html
<div class="reqif-relations">
  <div class="reqif-relations-label">Liens</div>
  <div class="reqif-relation">
    <span>→</span> <span>Dérive de</span>
    <a href="#reqif-obj-...">Exigence système — Authentification</a>
  </div>
</div>
```

Si l'objet lié n'est pas trouvé, le libellé s'affiche quand même, sans lien cliquable, et
l'événement `unresolved-reference` est émis ([diagnostics](/guide/diagnostics)).

C'est visible par défaut, y compris en `readingMode` :

```ts
const html = await renderPackageToHtml(pkg, { showRelations: false }); // pour le masquer
```

## Relations entre documents d'un même `.reqifz`

**Elles se résolvent.** La spec type `SOURCE` et `TARGET` d'une `SpecRelation` en
`GLOBAL-REF` (clause 11, règle 5b), c'est-à-dire qu'une relation peut légalement viser un
objet d'un *autre* `.reqif` du paquet — c'est même le scénario d'échange canonique :
exigences client d'un côté, exigences système de l'autre, reliées par « dérive de ».

`renderPackageToHtml` construit donc **un index unique couvrant tous les documents**.

Si vous appelez `renderDocumentToHtml` document par document, chacun n'est indexé que sur
lui-même, et les relations qui traversent la frontière ne résolvent plus. Passez votre
propre index partagé en 4ᵉ argument pour retrouver le même comportement :

```ts
const index = new ReqIfIndex(pkg.documents); // et non pkg.document
const html = await renderDocumentToHtml(doc, pkg.attachments, options, index);
```

::: warning `pkg.documents`, pas `pkg.document`
`pkg.document` est un accesseur de confort pour le cas mono-document ; il ne renvoie que
le premier. Passer celui-là au constructeur reconstruit exactement l'index partiel qu'on
cherchait à éviter.
:::

## Objets rendus plusieurs fois

Un même `SpecObject` peut légalement apparaître à plusieurs endroits d'une arborescence —
une exigence transverse citée sous deux chapitres, par exemple.

Seule **la première occurrence porte l'`id`** d'ancrage. C'est déjà ce que fait un
navigateur en résolvant un fragment : émettre le même `id` plusieurs fois produit un HTML
invalide **sans** rendre les autres occurrences atteignables pour autant. Chaque doublon
émet un événement `duplicate-dom-id`.

Conséquence pratique : un lien de relation vers un objet dupliqué mène toujours à sa
première apparition dans l'ordre du document. C'est déterministe et stable entre deux
rendus.

## Ancres : la forme des identifiants

| Élément | `id` émis |
|---|---|
| Document (onglet) | `reqif-doc-<identifiant du header>` |
| Spécification (onglet) | `reqif-spec-<identifiant de la Specification>` |
| Objet | `reqif-obj-<identifiant du SpecObject>` |

Ils dérivent tous de l'identifiant ReqIF, jamais d'un compteur de position : un lien
partagé survit à l'insertion d'un élément avant sa cible.

::: warning Un routeur SPA peut neutraliser ces liens
Les liens de relation sont de simples `<a href="#…">`, comme les onglets. Un framework qui
intercepte les clics internes et fait `history.pushState` laisse `:target` inchangé : le
lien ne rouvrira pas l'onglet contenant sa cible. Le mécanisme et les remèdes sont détaillés
dans [Onglets, numérotation, lecture](/guide/mise-en-page#un-routeur-spa-qui-intercepte-les-liens-casse-les-onglets).
:::

## Limite actuelle

Seules les `SpecRelation` — liens objet-à-objet — sont affichées. Les `RelationGroup`,
qui regroupent des relations entre deux `Specification`, sont **parsées**
(`doc.coreContent.specRelationGroups`) mais pas encore rendues. Elles restent exploitables
directement via le [modèle de données](/guide/rendu-maison) si vous en avez besoin.
