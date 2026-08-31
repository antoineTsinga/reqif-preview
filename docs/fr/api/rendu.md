# Rendu HTML

<!--@include: ../_conventions.md-->

Quatre fonctions, de la plus haut niveau à la plus fine. Toutes produisent du HTML destiné
à `innerHTML`, jamais un document complet.

## `renderPackageToHtml`

```ts
function renderPackageToHtml(pkg: ReqIfPackage, options?: RenderOptions): Promise<string>;
```

**Le point d'entrée normal.** Rend tous les documents du paquet, dans un seul bloc, avec sa
feuille de style.

```ts
const html = await renderPackageToHtml(pkg, { layout: "tabs" });
document.getElementById("preview").innerHTML = html;
```

Deux choses qu'elle fait et qu'aucune fonction de plus bas niveau ne fait pour vous :

1. **un index unique sur tous les documents** (`new ReqIfIndex(pkg.documents)`) — c'est ce
   qui fait résoudre les relations `GLOBAL-REF` d'un `.reqif` vers un autre ;
2. **un ensemble d'`id` émis partagé** sur tout le paquet — un `SpecObject` présent dans
   deux documents ne produit pas deux ancres identiques.

La sortie est de la forme :

```html
<style>/* … */</style>
<div class="reqif-preview">…</div>
<!-- ou class="reqif-preview reqif-reading-mode" avec readingMode -->
```

## `renderDocumentToHtml`

```ts
function renderDocumentToHtml(
  doc: ReqIfDocument,
  attachments: AttachmentResolver,
  options?: RenderOptions,
  sharedIndex?: ReqIfIndex,
  emittedIds?: Set<string>,
): Promise<string>;
```

Rend un seul document : son en-tête, puis chacune de ses `Specification` — empilées, ou en
onglets si `layout: "tabs"` et qu'il y en a plusieurs.

::: warning Les deux derniers paramètres ne sont pas facultatifs par accident
Sans `sharedIndex`, le document n'est indexé **que sur lui-même** : toute relation visant
un objet d'un autre `.reqif` du paquet devient `unresolved-reference`. Sans `emittedIds`
partagé, deux documents rendus séparément peuvent émettre le même `id` d'ancrage.

```ts
const options: RenderOptions = { layout: "tabs" };
const emitted = new Set<string>();
const parts = await Promise.all(
  pkg.documents.map((d) => renderDocumentToHtml(d, pkg.attachments, options, index, emitted)),
);
```

C'est exactement ce que `renderPackageToHtml` fait pour vous.
:::

## `renderSpecification`

```ts
function renderSpecification(
  spec: Specification,
  index: ReqIfIndex,
  attachments: AttachmentLookup,
  labels?: RenderLabels,
  options?: RenderOptions,
  emittedIds?: Set<string>,
): string;
```

**Synchrone.** Rend une seule arborescence de spécification — pensé pour une interface
virtualisée qui rend à la volée pendant le défilement, où un `await` par élément serait
rédhibitoire.

La contrepartie de la synchronicité est dans le troisième paramètre : ce n'est pas un
`AttachmentResolver` (paresseux, asynchrone) mais un `AttachmentLookup` (déjà résolu). D'où
`createAttachmentLookup`.

```ts
const index = new ReqIfIndex(pkg.documents);
const lookup = await createAttachmentLookup(pkg.document, pkg.attachments);

const html = renderSpecification(spec, index, lookup); // sync
```

Notez que `labels` est ici un `RenderLabels` **complet**, pas un `Partial` — cette fonction
n'applique pas les valeurs par défaut. Passez `undefined` pour les obtenir.

## `createAttachmentLookup`

```ts
function createAttachmentLookup(
  doc: ReqIfDocument,
  resolver: AttachmentResolver,
  maxInlineBytes?: number,   // défaut : 5 Mo
  onDegradation?: DegradationHandler,
): Promise<AttachmentLookup>;
```

Parcourt tout le contenu XHTML du document, collecte les chemins référencés par les
`<object data="…">`, et les résout **en parallèle** en `data:` URI.

```ts
interface AttachmentLookup {
  get(path: string): { href: string; mimeType?: string } | undefined;
}
```

Une pièce jointe introuvable émet `attachment-missing` ; une pièce jointe trop lourde émet
`attachment-too-large` et n'est pas incluse. Dans les deux cas le rendu continue et
l'élément `<object>` retombe sur son alternative.

## `renderXhtmlContent`

```ts
function renderXhtmlContent(content: XhtmlContent, options?: XhtmlRenderOptions): string;

interface XhtmlRenderOptions {
  attachments?: AttachmentLookup;
  onDegradation?: DegradationHandler;
}
```

Sérialise un fragment XHTML isolé en HTML **assaini** — liste blanche de balises et
d'attributs, schémas d'URL exécutables neutralisés, `style` restreint à `color` et
`text-decoration`. Voir [Sécurité](/fr/guide/securite).

C'est la brique à utiliser si vous construisez votre propre rendu et voulez juste afficher
le corps d'une exigence sans reprendre toute la mise en page.

```ts
const lookup = await createAttachmentLookup(doc, pkg.attachments);
const el = document.getElementById("corps-de-l-exigence")!;

const { value } = resolveAttribute(obj, index, "ReqIF.Text");
if (value?.kind === "XHTML" && value.value) {
  el.innerHTML = renderXhtmlContent(value.value, { attachments: lookup });
}
```

## `xhtmlToPlainText`

```ts
function xhtmlToPlainText(content: XhtmlContent): string;
```

Extrait le texte brut — recherche plein texte, export CSV, calcul de résumé. Aucune balise
n'est conservée.

## `escapeHtml`

```ts
function escapeHtml(s: string): string;
```

Échappe `&`, `<`, `>` et les guillemets. Exporté parce que le HTML retourné par vos
[`customAttributeRenderers`](/fr/api/options#customattributerenderer) **n'est pas assaini** :
si vous y interpolez du texte venant du fichier, c'est à vous de l'échapper.

```ts
import { escapeHtml } from "reqif-preview";
render: (v) => `<span class="badge">${escapeHtml(v?.value ?? "")}</span>`;
```
