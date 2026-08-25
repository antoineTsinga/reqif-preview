# Votre propre rendu

Vous n'êtes pas obligé d'utiliser le HTML fourni. `loadReqIfPackage` — et `parseReqIfXml`
pour du XML déjà en mémoire — vous donnent un modèle de données **typé, acyclique et
sérialisable** (`ReqIfDocument`) qui reflète fidèlement le modèle UML de la spec ReqIF :
`Specification`, `SpecObject`, `SpecHierarchy`, `AttributeDefinition*`, `AttributeValue*`,
`DatatypeDefinition*`, etc.

## Acyclique, et pourquoi ça compte

Les références croisées — `typeRef`, `definitionRef`, `objectRef`, `sourceRef`… — restent
de **simples chaînes d'identifiants**. Pas d'objets imbriqués circulaires.

C'est un choix de conception, pas une facilité d'implémentation : un modèle cyclique casse
`JSON.stringify`, casse le passage par `postMessage` vers un Web Worker, casse la mise en
cache dans `IndexedDB`, et rend tout instantané de débogage illisible. Le prix à payer est
une indirection à la lecture — c'est le rôle de `ReqIfIndex`.

```ts
import { parseReqIfXml, ReqIfIndex } from "reqif-preview";

const doc = parseReqIfXml(xmlString);
const index = new ReqIfIndex(doc);

for (const spec of doc.coreContent.specifications) {
  for (const node of spec.children) {
    const requirement = index.specObjects.get(node.objectRef);
    console.log(requirement?.longName);
  }
}
```

`ReqIfIndex` accepte aussi bien un document qu'un tableau de documents. Pour un `.reqifz`
multi-documents, passez `pkg.documents` — c'est ce qui fait résoudre les relations qui
traversent la frontière entre deux `.reqif`. Voir [Liens entre exigences](/guide/relations).

## Lire une valeur d'attribut

Trouver « l'attribut nommé `ReqIF.Text` » demande de traverser `values` → `definitionRef`
→ `AttributeDefinition` → `longName`. Deux helpers exportés font ce chemin pour vous :

```ts
import { resolveAttribute, valueToPlainText } from "reqif-preview";

const { value, definition } = resolveAttribute(obj, index, "ReqIF.Text");
const text = valueToPlainText(value, index); // string | undefined
```

La correspondance se fait sur le **nom long ou l'identifiant**, insensible à la casse et
aux espaces (`normalizeKey`), parce que les exports réels écrivent indifféremment
`ReqIF.ForeignID`, `Foreign ID` ou `ForeignID`.

`valueToPlainText` résout les libellés d'énumération si vous lui passez l'index — sans lui,
une valeur d'énumération n'est qu'une liste d'identifiants.

## Contenu enrichi

Pour un `AttributeValueXHTML`, vous disposez de :

| Expression | Résultat |
|---|---|
| `value.value` | un arbre `XhtmlNode[]` portable, sans dépendance au DOM |
| `value.originalValue` | l'original avant simplification, s'il existe ([détails](/guide/texte-simplifie)) |
| `renderXhtmlContent(value.value, { attachments })` | sérialise cet arbre en HTML **assaini** ([sécurité](/guide/securite)) |
| `xhtmlToPlainText(value.value)` | extrait le texte brut — recherche plein texte, export CSV |

L'arbre `XhtmlNode` est délibérément minimal : un nœud est soit `{ type: "text", value }`,
soit `{ type: "element", tag, attributes, children }`. Le préfixe de namespace est retiré
et le nom de balise mis en minuscules à l'analyse, donc `<xhtml:P>` et `<p>` arrivent tous
les deux comme `"p"`.

## Métadonnées de cycle de vie

`extractLifecycleInfo(obj, index)` renvoie l'auteur et la date de création/modification en
appliquant les conventions reconnues (`ReqIF.ForeignCreatedBy/On`,
`ReqIF.ForeignModifiedBy/On`), qu'elles soient stockées en chaîne ou en XHTML. C'est ce que
le rendu par défaut affiche dans sa ligne « Créé par / Modifié par » ; l'exporter permet de
la reconstruire à votre façon.

## Rendre une seule spécification, de façon synchrone

`renderSpecification` est synchrone — pensé pour une UI virtualisée qui rend à la volée
pendant le défilement. Il exige en contrepartie des pièces jointes **déjà résolues** :

```ts
import { createAttachmentLookup, renderSpecification, ReqIfIndex } from "reqif-preview";

const index = new ReqIfIndex(pkg.documents);
const lookup = await createAttachmentLookup(pkg.document, pkg.attachments);

const html = renderSpecification(spec, index, lookup); // sync
```

## Le modèle complet

Les définitions exactes sont dans
[`src/types.ts`](https://github.com/antoineTsinga/reqif-preview/blob/main/src/types.ts),
annotées avec le numéro de clause de la spec qu'elles implémentent. La page
[Modèle de données](/api/modele) en donne la carte.
