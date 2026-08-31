# Options de rendu

<!--@include: ../_conventions.md-->

## `RenderOptions`

Le même objet est accepté par `renderPackageToHtml`, `renderDocumentToHtml` et
`renderSpecification`. Toutes les propriétés sont facultatives.

### Présentation

| Option | Type | Défaut | Effet |
|---|---|---|---|
| `includeCss` | `boolean` | `true` | Inclut la feuille de style par défaut dans un `<style>` en tête de la sortie. Si `false`, chargez-la via `reqif-preview/style.css` ou l'export `DEFAULT_CSS` — voir [Feuille de style](/api/#feuille-de-style). |
| `layout` | `"stacked" \| "tabs"` | `"stacked"` | Onglets CSS entre documents et entre spécifications. Sans effet s'il n'y en a qu'un. [Détails](/guide/mise-en-page) |
| `readingMode` | `boolean` | `false` | Vue de lecture : masque ID, créé/modifié et panneau technique ; titres en `<h3>`…`<h6>`. |
| `chapterNumbers` | `boolean` | `false` | Préfixe les titres de `1`, `1.1`, `1.1.1`… en repartant à 1 par `Specification`. |
| `chapterNumberAttributes` | `string[]` | — | Ne numérote que les nœuds portant l'un de ces attributs. Sans effet sans `chapterNumbers`. |
| `labels` | `Partial<RenderLabels>` | français | Remplace les libellés d'interface. |
| `dateLocale` | `string` | `"fr-FR"` | Locale de formatage des dates créé/modifié. |

### Contenu

| Option | Type | Défaut | Effet |
|---|---|---|---|
| `contentAttributes` | `string[]` | — | Liste blanche stricte des attributs formant le contenu principal, dans cet ordre. [Détails](/guide/titre-et-contenu) |
| `titleAttributes` | `string[]` | — | Attributs essayés comme titre **en dernier recours**, après les `LONG-NAME`. |
| `showTechnicalByDefault` | `boolean` | `false` | Ouvre le panneau « Détails techniques » d'entrée. |
| `hideEmptyAttributes` | `boolean` | `true` | Omet du panneau technique les attributs sans aucune valeur. |
| `preferSimplifiedXhtml` | `boolean` | `false` | Affiche la version simplifiée plutôt que l'original. [Détails](/guide/texte-simplifie) |
| `showRelations` | `boolean` | `true` | Affiche les liens entrants/sortants. Visible aussi en `readingMode`. |
| `customAttributeRenderers` | `CustomAttributeRenderer[]` | — | Injecte votre propre HTML avant/après le contenu. |

### Placeholders « (sans titre) » / « (vide) »

| Option | Type | Effet |
|---|---|---|
| `suppressEmptyPlaceholdersForChapters` | `boolean` | Raccourci pour les objets « chapitres ». Sans effet sans `chapterNumberAttributes`. |
| `isTitleless` | `(obj, specType, index) => boolean` | Décide, par vos critères, qu'un titre vide est normal pour cet objet. |
| `isContentless` | `(obj, specType, index) => boolean` | Idem pour un contenu vide. Indépendant du précédent. |

Les trois se composent : la suppression a lieu si **l'un** dit oui.
Voir [Titre et contenu affichés](/guide/titre-et-contenu#titre-ou-contenu-vide-volontaire).

### Pièces jointes et diagnostics

| Option | Type | Défaut | Effet |
|---|---|---|---|
| `attachments` | `AttachmentResolver` | celui du paquet | Remplace le résolveur. [Détails](/guide/pieces-jointes) |
| `maxInlineBytes` | `number` | `5 * 1024 * 1024` | Taille maximale intégrée en `data:` URI, par fichier. |
| `onDegradation` | `DegradationHandler` | — | Observe tout ce que le rendu dégrade silencieusement. [Détails](/api/diagnostics) |

## `RenderLabels`

Tous les libellés d'interface, en français par défaut. `labels` accepte un objet **partiel**
— seuls les libellés fournis sont remplacés.

```ts
interface RenderLabels {
  noContent: string;              // "(vide)"
  untitled: string;               // "(sans titre)"
  idLabel: string;
  technicalDetails: string;       // "Détails techniques"
  headerTitle: string;
  headerSourceTool: string;
  headerExportedBy: string;
  headerCreationTime: string;
  headerComment: string;
  yes: string;
  no: string;
  createdByLabel: string;
  createdOnLabel: string;
  modifiedByLabel: string;
  modifiedOnLabel: string;
  relationsLabel: string;         // "Liens"
  relationFallbackType: string;
  relationUnresolved: string;
}
```

::: tip Traduire l'interface complète
```ts
const html = await renderPackageToHtml(pkg, {
  dateLocale: "en-US",
  labels: {
    noContent: "(empty)", untitled: "(untitled)", technicalDetails: "Technical details",
    yes: "Yes", no: "No", relationsLabel: "Links",
  },
});
```
:::

## `CustomAttributeRenderer`

```ts
interface CustomAttributeRenderer {
  attribute: string;                    // nom long (insensible casse/espaces) ou identifiant
  position?: "before" | "after";        // défaut : "before"
  render(value: AttributeValue | undefined, ctx: AttributeRenderContext): string | undefined;
  hideFromTechnical?: boolean;          // défaut : false
}
```

Le HTML retourné est inséré **tel quel** — c'est du code que vous écrivez, pas du contenu
de document, donc il n'est pas assaini. Échappez le texte interpolé avec
[`escapeHtml`](/api/rendu#escapehtml).

Deux filets de sécurité : une exception dans `render()` est interceptée
(`custom-renderer-threw`), et un HTML aux balises mal fermées est affiché en texte échappé
(`custom-renderer-unbalanced-html`) plutôt que de casser la structure de tout ce qui suit.
Voir [Rendus personnalisés](/guide/rendus-personnalises).

## `AttributeRenderContext`

```ts
interface AttributeRenderContext {
  specObject: SpecObject;
  specType: SpecType | undefined;
  index: ReqIfIndex;
  attachments: AttachmentLookup;
  isChapter: boolean;
  getValue(attributeNameOrId: string): AttributeValue | undefined;
  getDefinition(attributeNameOrId: string): AttributeDefinition | undefined;
  formatValue(value: AttributeValue | undefined): string;
}
```

`formatValue` réutilise exactement le formatage du panneau technique : libellés
d'énumération résolus, XHTML assaini, booléens selon `labels.yes`/`labels.no`. C'est le
moyen le plus court d'afficher une valeur « comme la bibliothèque le ferait » sans
réimplémenter la logique de type.
