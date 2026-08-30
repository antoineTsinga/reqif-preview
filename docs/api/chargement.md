# Chargement et parsing

<!--@include: ../_conventions.md-->

## `loadReqIfPackage`

```ts
function loadReqIfPackage(input: ReqIfInput, options?: ParseOptions): Promise<ReqIfPackage>;
type ReqIfInput = string | Uint8Array | ArrayBuffer;
```

Le point d'entrée normal. Détecte seul la nature de l'entrée :

- une **chaîne** est du XML ReqIF ;
- des **octets** commençant par la signature zip (`PK`) sont un `.reqifz` : chaque `.reqif`
  qu'il contient est parsé, le reste devient l'`AttachmentResolver` du paquet ;
- des **octets** quelconques sont décodés en UTF-8 et traités comme du XML.

```ts
const pkg = await loadReqIfPackage(bytes);
pkg.documents;   // ReqIfDocument[] — un .reqifz peut légalement en contenir plusieurs
pkg.document;    // le premier, accesseur de confort pour le cas mono-document
pkg.attachments; // AttachmentResolver (EMPTY_ATTACHMENTS pour un .reqif nu)
```

::: warning `pkg.document` ne suffit pas toujours
Pour construire un index ou rendre un paquet, utilisez `pkg.documents`. `pkg.document` ne
renvoie que le premier — les relations qui traversent la frontière entre deux `.reqif` ne
résolvent alors plus. Voir [Liens entre exigences](/guide/relations).
:::

## `parseReqIfXml`

```ts
function parseReqIfXml(xml: string, options?: ParseOptions): ReqIfDocument;
```

Parse une chaîne XML ReqIF déjà en mémoire, **de façon synchrone**. Pas de pièces jointes,
pas de zip — le contenu brut, rien d'autre. Utile côté serveur quand le XML vient d'une
base ou d'une API.

## `ParseOptions`

```ts
interface ParseOptions {
  maxNestedTags?: number;
  processEntities?: Partial<{ /* limites de fast-xml-parser */ }> | false;
}
```

| Option | Défaut | Rôle |
|---|---|---|
| `maxNestedTags` | `10000` | Profondeur d'imbrication XML maximale. `fast-xml-parser` s'arrête à 100, trop bas pour un vrai ReqIF. |
| `processEntities` | limites relevées | Garde-fous d'expansion d'entités XML. Objet partiel, ou `false` pour désactiver entièrement le traitement des entités. |

Les deux sont des **décisions de sécurité** avant d'être des réglages de confort — voir
[Documents très imbriqués](/guide/gros-documents).

## `ReqIfParseError`

```ts
class ReqIfParseError extends Error {
  readonly cause?: unknown; // l'erreur d'origine (fast-xml-parser, fflate) quand il y en a une
}
```

La **seule** erreur que cette bibliothèque lève. Les cas :

- XML malformé, ou archive `.reqifz` illisible ;
- aucun `.reqif` dans l'archive ;
- élément racine `<REQ-IF>` absent ;
- `<THE-HEADER>` ou `<CORE-CONTENT>` manquant — la spec les rend obligatoires ;
- balise de type de donnée, de type d'objet, de définition ou de valeur d'attribut inconnue.

Tout ce qui se passe **après** le parsing dégrade silencieusement plutôt que de lever
([diagnostics](/api/diagnostics)).

```ts
try {
  const pkg = await loadReqIfPackage(bytes);
} catch (e) {
  if (e instanceof ReqIfParseError) showUserError(e.message);
  else throw e;
}
```

## Pièces jointes

### `AttachmentResolver`

```ts
interface AttachmentResolver {
  resolve(path: string): ReqIfAttachment | undefined;
  list(): ReqIfAttachment[];
}
```

Le contrat que le renderer utilise pour retrouver un fichier binaire. Le `path` reçu est
exactement celui écrit dans l'attribut `data` d'un `<object>` du texte enrichi.

### `ReqIfAttachment`

```ts
interface ReqIfAttachment {
  path: string;
  mimeType?: string;
  size: number;
  getBytes(): Promise<Uint8Array>;
}
```

`getBytes` est **paresseux** : les octets ne sont lus qu'à la demande, et une seule fois. Un
`.reqifz` de 200 Mo ne charge pas 200 Mo en mémoire à l'ouverture.

### `createAttachmentResolver`

```ts
function createAttachmentResolver(
  fetchByPath: (path: string) => { bytes: Uint8Array; mimeType?: string } | undefined,
): AttachmentResolver;
```

Pour un `.reqif` nu dont les images vivent ailleurs — CDN, API, dossier sur disque :

```ts
const attachments = createAttachmentResolver((path) => {
  const bytes = myOwnFileLookup(path);
  return bytes ? { bytes } : undefined;
});

const html = await renderPackageToHtml(pkg, { attachments });
```

Le type MIME est déduit de l'extension si vous ne le fournissez pas.

### `EMPTY_ATTACHMENTS`

```ts
const EMPTY_ATTACHMENTS: AttachmentResolver;
```

Un résolveur qui ne trouve jamais rien. C'est ce que `loadReqIfPackage` attribue à un
`.reqif` nu, et une valeur par défaut explicite commode quand une signature en exige un.

## `ReqIfPackage`

```ts
interface ReqIfPackage {
  documents: ReqIfDocument[];
  document: ReqIfDocument;
  attachments: AttachmentResolver;
}
```

Le résultat du chargement, et l'entrée de [`renderPackageToHtml`](/api/rendu).
