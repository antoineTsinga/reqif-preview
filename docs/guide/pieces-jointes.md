# Pièces jointes (`.reqifz`)

Un `.reqifz` est une archive zip contenant un ou plusieurs `.reqif` **et** les fichiers
binaires qu'ils référencent : images, PDF, tout ce que le texte enrichi cite via
`<object data="...">`.

`loadReqIfPackage` détecte le zip, extrait chaque `.reqif` qu'il contient — un `.reqifz`
peut légalement en contenir plusieurs — et construit un `AttachmentResolver` pour le reste
des fichiers.

Le renderer HTML résout automatiquement ces références et les intègre en `data:` URI.

```ts
const pkg = await loadReqIfPackage(bytes);
const html = await renderPackageToHtml(pkg); // images incluses, rien à faire
```

## La limite de taille

Par défaut, **5 Mo par fichier**. Au-delà, la pièce jointe est laissée non résolue —
l'élément `<object>` retombe sur son alternative — et l'événement `attachment-too-large`
est émis.

```ts
const html = await renderPackageToHtml(pkg, { maxInlineBytes: 20 * 1024 * 1024 });
```

Une `data:` URI grossit d'environ un tiers par rapport aux octets d'origine (base64), et
elle vit dans la chaîne HTML que vous allez injecter. Un export riche en captures d'écran
peut faire exploser la mémoire du navigateur bien avant de faire échouer quoi que ce soit.
C'est pour ça que la limite existe et qu'elle est basse.

## Votre propre résolveur

Pour un `.reqif` nu accompagné d'images servies ailleurs — un CDN, une API, un dossier sur
disque — fournissez votre propre résolveur :

```ts
import { createAttachmentResolver, loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

const attachments = createAttachmentResolver((path) => {
  const bytes = myOwnFileLookup(path); // Uint8Array | undefined
  return bytes ? { bytes } : undefined;
});

const pkg = await loadReqIfPackage(xmlString);
const html = await renderPackageToHtml(pkg, { attachments });
```

Le `path` reçu est exactement celui écrit dans l'attribut `data` de l'élément `<object>`,
tel quel. `createAttachmentResolver` déduit le type MIME de l'extension si vous ne le
fournissez pas ; retournez `{ bytes, mimeType }` pour l'imposer.

`EMPTY_ATTACHMENTS` est un résolveur qui ne trouve jamais rien — pratique comme valeur par
défaut explicite, et c'est ce que `loadReqIfPackage` utilise pour un `.reqif` nu.

## La chaîne de repli d'un `<object>`

L'élément `<object>` suit la chaîne décrite par la spec, dans cet ordre :

1. image résolue → une balise `<img>` avec la `data:` URI ;
2. sinon, objet alternatif imbriqué → on récursive dessus ;
3. sinon, pièce jointe résolue mais non-image → un lien de téléchargement ;
4. sinon, le texte alternatif contenu dans l'élément.

Une image manquante ne fait donc jamais disparaître le contexte : il reste toujours quelque
chose à lire à sa place.

## Rendu synchrone : pré-résoudre les pièces jointes

Résoudre une pièce jointe est asynchrone — d'où le `await` sur `renderPackageToHtml`. Si
vous avez besoin d'un rendu **synchrone** (une UI virtualisée qui rend une spécification à
la volée pendant le défilement, par exemple), pré-résolvez tout une fois puis appelez
`renderSpecification` :

```ts
import { createAttachmentLookup, renderSpecification, ReqIfIndex } from "reqif-preview";

const index = new ReqIfIndex(pkg.documents);
const lookup = await createAttachmentLookup(pkg.document, pkg.attachments);

// désormais synchrone, appelable dans un rendu virtualisé
const html = renderSpecification(spec, index, lookup);
```

Voir [Rendu HTML](/api/rendu) pour les signatures complètes.
