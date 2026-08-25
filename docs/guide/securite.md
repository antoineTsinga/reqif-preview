# Sécurité

Le contenu XHTML d'un fichier ReqIF est une donnée **non fiable** provenant d'un tiers :
elle arrive par un échange inter-entreprises, elle a traversé plusieurs outils, et vous
allez l'injecter dans votre page avec `innerHTML`. `renderXhtmlContent` la traite en
conséquence.

## Liste blanche stricte

Les balises et attributs autorisés sont alignés sur les modules XHTML que la spec ReqIF
elle-même autorise : Text, List, Hypertext, Edit, Presentation, Basic Tables, Object,
Style Attribute. Tout le reste est écarté, selon deux traitements distincts :

- **supprimé avec son sous-arbre** — `<script>`, `<style>`, `<iframe>`, les formulaires… :
  la balise **et** son contenu disparaissent, car ce contenu n'est pas du texte à lire mais
  du code à exécuter. Émet `dropped-tag` ;
- **déballé** — toute autre balise hors liste blanche : la balise disparaît, **ses enfants
  sont conservés**. Une mise en forme inconnue ne doit pas emporter le texte qu'elle
  entoure. Émet `unwrapped-tag`.

## Schémas d'URL neutralisés

Les `href` et `src` en `javascript:`, `vbscript:` ou `data:` sont neutralisés : l'attribut
est simplement omis, le libellé du lien reste visible. Émet `dropped-href`.

::: info Pourquoi `data:` est dans la liste
`data:text/html,<script>…</script>` est un vecteur d'exécution au même titre que
`javascript:`. Le fait qu'un `data:` puisse aussi être une image inoffensive n'y change
rien : distinguer les deux demanderait de faire confiance au type MIME déclaré dans l'URL,
c'est-à-dire à la donnée qu'on est en train de filtrer.

Les `data:` URI **produites par la bibliothèque elle-même** pour les pièces jointes
résolues sont émises normalement — elles ne viennent pas du document et ne passent pas par
ce filtre.
:::

## L'attribut `style`

Seules deux propriétés sont autorisées, conformément à la clause 10.8.20 de la spec :

- `text-decoration` (`underline`, `line-through`) ;
- `color`.

Tout le reste est filtré déclaration par déclaration — une déclaration invalide n'invalide
pas les autres. Émet `dropped-style-declaration`.

C'est étroit exprès. Un `position: fixed` ou un `background-image: url(...)` dans un
document tiers n'est pas de la mise en forme d'exigence : c'est soit un accident d'export,
soit une tentative de recouvrir votre interface.

## Objets externes

L'élément `<object>` suit la chaîne de repli décrite dans la spec : image PNG résolue →
sinon objet alternatif imbriqué → sinon lien de téléchargement → sinon texte alternatif.
Rien n'est jamais chargé depuis le réseau ; seule une pièce jointe fournie par votre
résolveur peut apparaître. Voir [Pièces jointes](/guide/pieces-jointes).

## Ce que la bibliothèque ne fait PAS pour vous

::: warning Le HTML de vos `customAttributeRenderers` n'est pas assaini
C'est du code que **vous** écrivez, pas du contenu de document — il est inséré tel quel.
Si vous y interpolez du texte venant du fichier ReqIF, échappez-le vous-même avec
`escapeHtml`, exporté par la bibliothèque.

```ts
import { escapeHtml } from "reqif-preview";
render: (value) => `<span class="badge">${escapeHtml(value.value ?? "")}</span>`;
```

Un [filet de sécurité](/guide/rendus-personnalises#le-filet-de-securite-html-mal-ferme)
existe pour les balises mal fermées, mais il ne protège pas de l'injection : il vérifie
l'équilibre des balises, pas la provenance du texte.
:::

Le HTML produit est destiné à `innerHTML`. Il ne contient jamais de `<script>` et
n'exécute rien de lui-même, mais il n'est pas conçu pour être servi tel quel comme
document HTML complet à un tiers sans en-têtes de sécurité appropriés.
