# Afficher un contenu personnalisé

<!--@include: ../_conventions.md-->

`ReqIF.ForeignID` couvre le cas standard, mais beaucoup d'outils stockent leur
identifiant métier dans un attribut au nom libre — par exemple `IE PUID` chez DOORS,
parfois en XHTML plutôt qu'en chaîne simple. Pour ces cas, enregistrez un **rendu
personnalisé** : la fonction reçoit la valeur déjà résolue de l'attribut ciblé, plus un
contexte qui donne accès à *tous* les autres attributs de l'objet, et sa sortie est injectée
juste avant ou juste après le texte principal, au choix.

Vous décrivez quoi afficher sous forme de **nœuds**, pas de chaîne HTML. Le texte est
échappé pour vous :

```ts
import { renderPackageToHtml, xhtmlToPlainText } from "reqif-preview";

const html = await renderPackageToHtml(pkg, {
  customAttributeRenderers: [
    {
      attribute: "IE PUID", // nom long (ou identifiant) de l'attribut visé
      position: "before",   // "before" (défaut) ou "after"
      render: (value, ctx) => {
        if (!value) return undefined; // rien à afficher pour cet objet -> on ne touche à rien
        const text = value.kind === "XHTML" && value.value
          ? xhtmlToPlainText(value.value)
          : value.kind === "STRING" ? value.value : undefined;
        return text
          ? { tag: "span", attrs: { class: "puid-badge" }, children: [text] }
          : undefined;
      },
    },
  ],
});
```

## La forme que vous retournez

```ts
type RenderNode = string | RenderElement | RenderRawHtml;

interface RenderElement {
  tag: string;                      // liste blanche, sinon déballé
  attrs?: Record<string, string>;   // liste blanche, valeurs échappées
  children?: RenderNode[];          // une chaîne y est du texte, et elle est échappée
}
interface RenderRawHtml { dangerouslyRawHtml: string }

render(value, ctx): RenderElement | RenderRawHtml | RenderNode[] | undefined;
```

- **balises** : `span div p a code strong b em i small br img ul ol li`. Toute autre est
  déballée, ses enfants conservés — la règle que suit déjà l'assainisseur de document, pour
  qu'une mise en forme inconnue n'emporte jamais le texte qu'elle entoure. Émet
  `unwrapped-tag`.
- **attributs** : `class` `id` `title` `lang` `dir`, plus `href` et `src` passés par le même
  filtre de schéma d'URL que le contenu du document. Tout le reste est abandonné, avec
  `custom-renderer-dropped-attr`. **`style` n'y est pas** — la présentation va dans votre
  feuille de style.
- **une chaîne nue au premier niveau est une erreur de type.** Sous l'API précédente elle
  voulait dire « HTML brut » ; l'accepter changerait silencieusement le sens des rendus
  existants. Enveloppez le texte dans un tableau — `["CRS-001"]` — ou utilisez
  `dangerouslyRawHtml` pour du balisage. Depuis du JavaScript sans types, une chaîne
  retournée est échappée et émet `custom-renderer-raw-string`.

::: danger L'échappatoire est nommée, pas cachée
`{ dangerouslyRawHtml }` insère son contenu **tel quel**. Elle existe parce que certaines
sorties demandent vraiment du balisage que l'API de nœuds ne couvre pas — mais son nom
place le risque là où il est pris. Échappez vous-même ce qui vient du document :
[`escapeHtml`](/fr/api/rendu#escapehtml) pour du texte,
[`escapeAttr`](/fr/api/rendu#escapeattr) pour une valeur d'attribut.
:::

::: warning `ctx.formatValue` renvoie du HTML, pas du texte
Il réutilise le formatage du panneau technique, qui assainit le XHTML — son résultat est
donc du balisage. Le passer en enfant texte l'échapperait et afficherait les balises. Il
relève de `dangerouslyRawHtml` :

```ts
render: (_v, ctx) => ({
  tag: "span",
  children: [{ dangerouslyRawHtml: ctx.formatValue(ctx.getValue("Name")) }],
});
```
:::

## Le contexte

| Membre | Rôle |
|---|---|
| `ctx.specObject` | Le `SpecObject` en cours de rendu. |
| `ctx.specType` | Son `SpecObjectType`, si résolvable. |
| `ctx.index` | L'index complet de résolution des références croisées. |
| `ctx.attachments` | Les pièces jointes déjà résolues en `data:` URI. |
| `ctx.isChapter` | Vrai si l'objet correspond à `chapterNumberAttributes`. |
| `ctx.getValue(nom)` | Lit un autre attribut du même objet, par nom long ou identifiant. |
| `ctx.getDefinition(nom)` | Idem pour l'`AttributeDefinition`. |
| `ctx.formatValue(v)` | Formate comme le panneau technique (libellés d'énumération résolus, XHTML assaini…). |

## Ce qu'il faut savoir

- `value` est `undefined` si l'objet ne porte pas cet attribut — retournez `undefined`
  pour ne rien afficher.
- Par défaut, l'attribut ciblé **reste aussi visible** dans le panneau technique
  (transparence totale) ; passez `hideFromTechnical: true` pour l'en masquer puisqu'il est
  déjà affiché par votre rendu.
- Une exception levée dans `render()` est interceptée : elle n'interrompt jamais le rendu
  du reste du document. L'événement `custom-renderer-threw` est émis
  ([diagnostics](/fr/guide/diagnostics)).
- Le texte que vous mettez dans `children` est échappé pour vous. Seul
  `dangerouslyRawHtml` est inséré tel quel.

## Le filet de sécurité : HTML mal fermé

Il ne concerne plus que `dangerouslyRawHtml` — les nœuds structurés sont équilibrés par
construction. Si le balisage retourné a des balises mal fermées — une balise oubliée, une
balise fermante en trop — la bibliothèque le détecte et l'affiche **comme texte échappé**
plutôt que de l'insérer brut.

Ce n'est pas de la pudeur : un déséquilibre de balises ne casse pas seulement votre
badge, il casse la structure de **tout ce qui est affiché après** — le contenu, les détails
techniques, jusqu'aux exigences suivantes dans l'arbre, qui se retrouvent avalées à
l'intérieur de votre balise restée ouverte. Le symptôme visible serait « la moitié de mon
document a disparu », à mille lignes de la vraie cause.

Un avertissement est alors envoyé dans la console avec le HTML fautif, et l'événement
`custom-renderer-unbalanced-html` est émis.

```ts
render: () => ({ dangerouslyRawHtml: `<span class="badge">CRS-001` }), // <-- jamais fermée
// affiché littéralement : <span class="badge">CRS-001
```

::: tip
Ce filet ne remplace pas un test. Si votre rendu construit du HTML par concaténation,
la façon la plus sûre de ne jamais déclencher ce cas est de ne pas fabriquer de balises
ouvrantes sans leur fermante dans la même expression.
:::
