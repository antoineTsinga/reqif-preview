# Afficher un contenu personnalisé

`ReqIF.ForeignID` couvre le cas standard, mais beaucoup d'outils stockent leur
identifiant métier dans un attribut au nom libre — par exemple `IE PUID` chez DOORS,
parfois en XHTML plutôt qu'en chaîne simple. Pour ces cas, enregistrez un **rendu
personnalisé** : la fonction reçoit la valeur déjà résolue de l'attribut ciblé, plus un
contexte qui donne accès à *tous* les autres attributs de l'objet, et son HTML est injecté
juste avant ou juste après le texte principal, au choix.

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
          ? `<span class="puid-badge">${text}</span>` // pensez à échapper vos propres textes
          : undefined;
      },
    },
  ],
});
```

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
  ([diagnostics](/guide/diagnostics)).
- Le HTML retourné est inséré **tel quel**. Ce n'est pas du contenu du document ReqIF,
  mais du code que *vous* écrivez — il n'est donc pas assaini. Échappez vous-même tout
  texte brut interpolé, par exemple avec `escapeHtml`, exporté par la bibliothèque.

## Le filet de sécurité : HTML mal fermé

Si le HTML retourné a des balises mal fermées — une balise oubliée, une balise fermante en
trop — la bibliothèque le détecte et l'affiche **comme texte échappé** plutôt que de
l'insérer brut.

Ce n'est pas de la pudeur : un déséquilibre de balises ne casse pas seulement votre
badge, il casse la structure de **tout ce qui est affiché après** — le contenu, les détails
techniques, jusqu'aux exigences suivantes dans l'arbre, qui se retrouvent avalées à
l'intérieur de votre balise restée ouverte. Le symptôme visible serait « la moitié de mon
document a disparu », à mille lignes de la vraie cause.

Un avertissement est alors envoyé dans la console avec le HTML fautif, et l'événement
`custom-renderer-unbalanced-html` est émis.

```ts
render: () => `<span class="badge">CRS-001`, // <-- balise jamais fermée
// affiché littéralement : <span class="badge">CRS-001
```

::: tip
Ce filet ne remplace pas un test. Si votre rendu construit du HTML par concaténation,
la façon la plus sûre de ne jamais déclencher ce cas est de ne pas fabriquer de balises
ouvrantes sans leur fermante dans la même expression.
:::
