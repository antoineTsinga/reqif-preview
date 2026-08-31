# Diagnostics

Trois types, une option. Voir [le guide](/fr/guide/diagnostics) pour l'usage et la lecture des
symptômes.

## `DegradationHandler`

```ts
type DegradationHandler = (event: DegradationEvent) => void;
```

Passé via `RenderOptions.onDegradation` — accepté par `renderPackageToHtml`,
`renderDocumentToHtml`, `renderSpecification`, `createAttachmentLookup` et
`renderXhtmlContent`.

Une exception levée dans le gestionnaire est **interceptée et ignorée**. Un canal de
diagnostic qui casse ce qu'il observe serait pire que pas de canal du tout.

## `DegradationEvent`

```ts
interface DegradationEvent {
  code: DegradationCode;
  /** Une phrase lisible, sûre à journaliser telle quelle. */
  message: string;
  /** Ce qui identifie l'endroit : un id, un chemin, un nom de balise, la valeur fautive. */
  detail?: Record<string, unknown>;
}
```

## `DegradationCode`

```ts
type DegradationCode =
  | "attachment-missing"
  | "attachment-too-large"
  | "unresolved-reference"
  | "orphan-attribute-value"
  | "missing-spec-object"
  | "duplicate-dom-id"
  | "custom-renderer-threw"
  | "custom-renderer-unbalanced-html"
  | "dropped-tag"
  | "unwrapped-tag"
  | "dropped-style-declaration"
  | "dropped-href"
  | "unparsable-date"
  | "invalid-locale";
```

| Code | Situation | Clés de `detail` |
|---|---|---|
| `attachment-missing` | pièce jointe référencée qu'aucun résolveur ne trouve | `path` |
| `attachment-too-large` | pièce jointe dépassant `maxInlineBytes`, laissée non résolue | `path`, `size`, `maxInlineBytes` |
| `unresolved-reference` | `SpecRelation` visant un objet absent du rendu | `relation`, `sourceRef`, `targetRef` |
| `orphan-attribute-value` | valeur dont l'`AttributeDefinition` est absente du `SpecType` déclaré | `specObject`, `definitionRef`, `specType` |
| `missing-spec-object` | nœud d'arborescence pointant vers un `SpecObject` inexistant | `specHierarchy`, `objectRef` |
| `duplicate-dom-id` | objet rendu plusieurs fois ; seule la première occurrence porte l'`id` | `specObject`, `id`, `specHierarchy` |
| `custom-renderer-threw` | un `customAttributeRenderers` a levé et a été ignoré | `attribute`, `specObject`, `error` |
| `custom-renderer-unbalanced-html` | HTML personnalisé mal fermé, échappé en texte | `attribute`, `specObject`, `html` |
| `dropped-tag` | balise supprimée avec son sous-arbre (`<script>`, `<iframe>`…) | `tag` |
| `unwrapped-tag` | balise hors liste blanche déballée, enfants conservés | `tag` |
| `dropped-style-declaration` | déclaration `style` invalide abandonnée | `prop`, `value` |
| `dropped-href` | `href` en `javascript:` / `vbscript:` / `data:` neutralisé | `href` |
| `unparsable-date` | date non analysable, affichée telle quelle | `value` |
| `invalid-locale` | `Intl` a rejeté la locale configurée | `locale`, `value` |

Les identifiants rapportés (`specObject`, `specHierarchy`, `relation`…) sont des
identifiants **ReqIF**, pas des `id` DOM — sauf la clé `id` de `duplicate-dom-id`, qui est
bien l'ancre HTML en conflit.

::: warning Volume
`dropped-tag` et `unwrapped-tag` peuvent se déclencher des milliers de fois sur un gros
export — chaque `<span>` de mise en forme Word non autorisé compte. C'est un canal de
diagnostic, pas un journal de production : filtrez par code, ou n'activez l'option qu'en
investigation.
:::

::: info Le rendu ne change pas
Brancher un gestionnaire ne modifie strictement rien à la sortie HTML. L'option rend
visibles des décisions déjà prises, elle n'en prend aucune.
:::
