# Diagnostiquer ce qui a été dégradé (`onDegradation`)

<!--@include: ../_conventions.md-->

Passé l'étape de parsing, **rien ne lève**. Une entrée surprenante dégrade localement et le
reste du document se rend quand même. C'est le bon comportement en production — un aperçu
d'exigences vaut mieux qu'une page blanche — et c'est pénible en support : face à « il
manque des trucs dans mon aperçu », il n'y avait aucun moyen d'obtenir un rapport.

```ts
import type { DegradationEvent } from "reqif-preview";

const events: DegradationEvent[] = [];
const html = await renderPackageToHtml(pkg, { onDegradation: (e) => events.push(e) });

// [{ code: "attachment-missing", message: 'No attachment resolved for "schema.png".',
//    detail: { path: "schema.png" } }, …]
```

::: info Le rendu est strictement identique avec ou sans gestionnaire
L'option ne change rien à la sortie. Elle ne fait que rendre visibles des décisions qui
étaient déjà prises, silencieusement. Vous pouvez donc la brancher en production sans
craindre un changement de comportement.
:::

## Les codes émis

| Code | Situation |
|---|---|
| `attachment-missing` | pièce jointe référencée qu'aucun résolveur ne trouve |
| `attachment-too-large` | pièce jointe dépassant `maxInlineBytes`, laissée non résolue |
| `unresolved-reference` | `SpecRelation` visant un objet absent du rendu |
| `duplicate-dom-id` | objet rendu plusieurs fois ; seule la première occurrence porte l'`id` |
| `orphan-attribute-value` | valeur dont l'`AttributeDefinition` est absente du `SpecType` déclaré |
| `missing-spec-object` | nœud d'arborescence pointant vers un `SpecObject` inexistant |
| `custom-renderer-threw` | un `customAttributeRenderers` a levé et a été ignoré |
| `custom-renderer-unbalanced-html` | HTML personnalisé mal fermé, échappé en texte |
| `dropped-tag` | balise supprimée avec son sous-arbre (`<script>`, `<iframe>`…) |
| `unwrapped-tag` | balise hors liste blanche déballée, enfants conservés |
| `dropped-style-declaration` | déclaration `style` invalide abandonnée |
| `dropped-href` | `href` en `javascript:` / `vbscript:` / `data:` neutralisé |
| `unparsable-date` | date non analysable, affichée telle quelle |
| `invalid-locale` | `Intl` a rejeté la locale configurée |

## Un canal de diagnostic, pas un journal

::: warning
`dropped-tag` et `unwrapped-tag` peuvent se déclencher **des milliers de fois** sur un gros
export : chaque `<span>` de mise en forme Word non autorisé compte. Filtrez par code, ou
n'activez l'option qu'en investigation.
:::

En pratique, ce qui est exploitable est l'**agrégat**, pas la liste brute :

```ts
const byCode = new Map<string, number>();
await renderPackageToHtml(pkg, {
  onDegradation: (e) => byCode.set(e.code, (byCode.get(e.code) ?? 0) + 1),
});
console.table([...byCode]);
```

C'est exactement ce que fait le panneau « Diagnostics » du [bac à sable](/bac-a-sable) :
une ligne par code, avec un compteur et un message d'exemple.

## Un handler qui lève est ignoré

Une exception dans votre gestionnaire est interceptée et avalée. Un canal de diagnostic qui
casse ce qu'il observe serait pire que pas de canal du tout.

## Ce qu'il faut regarder en premier

| Symptôme rapporté | Code à chercher |
|---|---|
| « Les images ne s'affichent pas » | `attachment-missing`, `attachment-too-large` |
| « Ce lien de traçabilité ne mène nulle part » | `unresolved-reference` |
| « Cliquer sur un lien m'amène au mauvais endroit » | `duplicate-dom-id` |
| « Il manque une exigence entière » | `missing-spec-object` |
| « Un attribut n'apparaît pas dans le panneau technique » | `orphan-attribute-value` |
| « Ma mise en forme est perdue » | `dropped-tag`, `unwrapped-tag`, `dropped-style-declaration` |
| « Mon badge personnalisé s'affiche en texte brut » | `custom-renderer-unbalanced-html` |
| « Les dates sont bizarres » | `unparsable-date`, `invalid-locale` |
