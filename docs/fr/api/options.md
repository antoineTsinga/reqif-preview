# Options de rendu

<!--@include: ../_conventions.md-->

## `RenderOptions`

Le même objet est accepté par `renderPackageToHtml`, `renderDocumentToHtml` et
`renderSpecification`. Toutes les propriétés sont facultatives.

### Présentation

| Option | Type | Défaut | Effet |
|---|---|---|---|
| `includeCss` | `boolean` | `true` | Inclut la feuille de style par défaut dans un `<style>` en tête de la sortie. Si `false`, chargez-la via `reqif-preview/style.css` ou l'export `DEFAULT_CSS` — voir [Feuille de style](/fr/api/#feuille-de-style). |
| `layout` | `"stacked" \| "tabs"` | `"stacked"` | Onglets CSS entre documents et entre spécifications. Sans effet s'il n'y en a qu'un. [Détails](/fr/guide/mise-en-page) |
| `readingMode` | `boolean` | `false` | Vue de lecture : masque ID, créé/modifié et panneau technique ; titres en `<h3>`…`<h6>`. |
| `chapterNumbers` | `boolean` | `false` | Préfixe les titres de `1`, `1.1`, `1.1.1`… en repartant à 1 par `Specification`. |
| `chapterNumberAttributes` | `string[]` | — | Ne numérote que les nœuds portant l'un de ces attributs. Sans effet sans `chapterNumbers`. |
| `labels` | `Partial<RenderLabels>` | français | Remplace les libellés d'interface. |
| `dateLocale` | `string` | `"fr-FR"` | Locale de formatage des dates créé/modifié. |

### Contenu

| Option | Type | Défaut | Effet |
|---|---|---|---|
| `contentAttributes` | `string[]` | — | Liste blanche stricte des attributs formant le contenu principal, dans cet ordre. [Détails](/fr/guide/titre-et-contenu) |
| `titleAttributes` | `string[]` | — | Attributs essayés comme titre **en dernier recours**, après les `LONG-NAME`. |
| `showTechnicalByDefault` | `boolean` | `false` | Ouvre le panneau « Détails techniques » d'entrée. |
| `hideEmptyAttributes` | `boolean` | `true` | Omet du panneau technique les attributs sans aucune valeur. |
| `preferSimplifiedXhtml` | `boolean` | `false` | Affiche la version simplifiée plutôt que l'original. [Détails](/fr/guide/texte-simplifie) |
| `showRelations` | `boolean` | `true` | Affiche les liens entrants/sortants. Visible aussi en `readingMode`. |
| `customAttributeRenderers` | `CustomAttributeRenderer[]` | — | Injecte votre propre HTML avant/après le contenu. |

### Placeholders « (sans titre) » / « (vide) »

| Option | Type | Effet |
|---|---|---|
| `suppressEmptyPlaceholdersForChapters` | `boolean` | Raccourci pour les objets « chapitres ». Sans effet sans `chapterNumberAttributes`. |
| `isTitleless` | `(obj, specType, index) => boolean` | Décide, par vos critères, qu'un titre vide est normal pour cet objet. |
| `isContentless` | `(obj, specType, index) => boolean` | Idem pour un contenu vide. Indépendant du précédent. |

Les trois se composent : la suppression a lieu si **l'un** dit oui.
Voir [Titre et contenu affichés](/fr/guide/titre-et-contenu#titre-ou-contenu-vide-volontaire).

### Pièces jointes et diagnostics

| Option | Type | Défaut | Effet |
|---|---|---|---|
| `attachments` | `AttachmentResolver` | celui du paquet | Remplace le résolveur. [Détails](/fr/guide/pieces-jointes) |
| `maxInlineBytes` | `number` | `5 * 1024 * 1024` | Taille maximale intégrée en `data:` URI, par fichier. |
| `onDegradation` | `DegradationHandler` | — | Observe tout ce que le rendu dégrade silencieusement. [Détails](/fr/api/diagnostics) |

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
  render(value: AttributeValue | undefined, ctx: AttributeRenderContext): RenderOutput;
  hideFromTechnical?: boolean;          // défaut : false
}
```

Deux filets de sécurité : une exception dans `render()` est interceptée
(`custom-renderer-threw`), et un `dangerouslyRawHtml` mal fermé est affiché en texte
échappé (`custom-renderer-unbalanced-html`) plutôt que de casser la structure de tout ce
qui suit. Voir [Rendus personnalisés](/fr/guide/rendus-personnalises).

## `RenderOutput`, `RenderNode`, `RenderElement`, `RenderRawHtml`

Ce qu'un rendu retourne. Le texte est échappé par défaut ; le balisage brut se demande
explicitement.

```ts
type RenderNode = string | RenderElement | RenderRawHtml;

interface RenderElement {
  tag: string;                      // liste blanche, sinon déballé (unwrapped-tag)
  attrs?: Record<string, string>;   // liste blanche, valeurs échappées
  children?: RenderNode[];          // une chaîne y est du texte
}

interface RenderRawHtml {
  dangerouslyRawHtml: string;       // inséré tel quel — à vous de l'échapper
}

type RenderOutput = RenderElement | RenderRawHtml | RenderNode[] | undefined;
```

| | Autorisé |
|---|---|
| Balises | `span` `div` `p` `a` `code` `strong` `b` `em` `i` `small` `br` `img` `ul` `ol` `li` |
| Attributs | `class` `id` `title` `lang` `dir`, plus `href` / `src` via le filtre de schéma d'URL |

`style` est délibérément absent — la présentation va dans votre feuille de style. Une chaîne
nue n'est **pas** acceptée au premier niveau : sous l'API précédente elle voulait dire du
HTML brut, donc l'accepter changerait silencieusement ce que produisent les rendus
existants. Depuis du JavaScript sans types, elle est échappée, avec
`custom-renderer-raw-string`.

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
