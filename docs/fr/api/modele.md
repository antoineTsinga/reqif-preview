# Modèle de données

Le modèle reflète fidèlement le modèle UML de la spec OMG ReqIF v1.2. Chaque type porte,
dans [`src/types.ts`](https://github.com/antoineTsinga/reqif-preview/blob/main/src/types.ts),
le numéro de clause qu'il implémente.

Deux propriétés le caractérisent, et elles ne sont pas négociables :

- **acyclique** — toute référence croisée est une chaîne d'identifiants, jamais un objet
  imbriqué. `JSON.stringify`, `postMessage` vers un Worker et `IndexedDB` fonctionnent donc
  sans précaution ;
- **sérialisable** — aucune classe, aucune fonction, aucun `Symbol` dans les données. Ce que
  vous obtenez est du JSON structuré, typé.

Le prix est une indirection à la lecture. C'est le rôle de [`ReqIfIndex`](#reqifindex).

## Racine

```ts
type Identifier = string;

interface ReqIfDocument {
  lang?: string;
  header: ReqIfHeader;
  coreContent: ReqIfContent;
  namespaces: Record<string, string>; // namespaces déclarés sur <REQ-IF>, gardés pour un aller-retour
}

interface ReqIfHeader {
  identifier: Identifier;
  comment?: string;
  creationTime?: string;
  repositoryId?: string;
  reqIfToolId?: string;
  reqIfVersion?: string;
  sourceToolId?: string;
  title?: string;
}

interface ReqIfContent {
  datatypes: DatatypeDefinition[];
  specTypes: SpecType[];
  specObjects: SpecObject[];
  specifications: Specification[];
  specRelations: SpecRelation[];
  specRelationGroups: RelationGroup[];
}
```

## Identité

```ts
/** 10.8.32 Identifiable — base commune de tout élément identifiable. */
interface Identifiable {
  identifier: Identifier;
  lastChange?: string;      // xsd:dateTime
  longName?: string;
  desc?: string;
  alternativeId?: AlternativeId;
}

/** 10.8.1 AccessControlledElement */
interface AccessControlled {
  isEditable?: boolean;
}

/** 10.8.2 AlternativeID */
interface AlternativeId {
  identifier: Identifier;
}
```

::: details Pourquoi `AlternativeId` n'a qu'un champ
La spec donne à cette classe un *attribut*, `identifier`, et une *association*,
`ident : Identifiable` — le lien retour vers l'élément porteur (figure 10.2 nomme les deux
extrémités `+ident` / `+alternativeID`).

Ce lien retour n'est **délibérément pas modélisé**. Il est purement navigationnel,
déductible de la containment, jamais sérialisé dans le XML — et le matérialiser rendrait
`ReqIfDocument` cyclique, ce qui casserait `JSON.stringify` et l'invariant sur lequel tout
le reste repose.

La clause 2 (Conformance) autorise par ailleurs un outil à se servir de l'`AlternativeID`
comme **mécanisme d'identification parallèle**. `ReqIfIndex` indexe sur l'`identifier`
primaire ; un document dont les `*-REF` viseraient des identifiants alternatifs ne
résoudrait donc pas. Aucun export réel de ce genre n'a été observé à ce jour, et
`index.byAlternativeId` permet de retrouver l'élément dans l'autre sens.
:::

## Types de données (10.8.21 – 10.8.28)

```ts
type DatatypeKind = "BOOLEAN" | "DATE" | "ENUMERATION" | "INTEGER" | "REAL" | "STRING" | "XHTML";

interface DatatypeDefinitionBase extends Identifiable { kind: DatatypeKind }

interface DatatypeDefinitionBoolean extends DatatypeDefinitionBase { kind: "BOOLEAN" }
interface DatatypeDefinitionDate    extends DatatypeDefinitionBase { kind: "DATE" }
interface DatatypeDefinitionXhtml   extends DatatypeDefinitionBase { kind: "XHTML" }
interface DatatypeDefinitionString  extends DatatypeDefinitionBase { kind: "STRING"; maxLength?: number }
interface DatatypeDefinitionInteger extends DatatypeDefinitionBase { kind: "INTEGER"; min?: number; max?: number }
interface DatatypeDefinitionReal    extends DatatypeDefinitionBase {
  kind: "REAL"; min?: number; max?: number; accuracy?: number;
}
interface DatatypeDefinitionEnumeration extends DatatypeDefinitionBase {
  kind: "ENUMERATION";
  specifiedValues: EnumValue[]; // dans l'ordre du document
}

/** 10.8.31 EnumValue */
interface EnumValue extends Identifiable {
  properties?: { key?: number; otherContent?: string }; // 10.8.30 EmbeddedValue
}

type DatatypeDefinition = /* l'union des sept ci-dessus */;
```

`kind` est le **discriminant** : un `switch (dt.kind)` restreint le type correctement.

## Définitions d'attributs (10.8.3 – 10.8.11)

```ts
interface AttributeDefinitionBase extends Identifiable, AccessControlled {
  kind: DatatypeKind;
  datatypeRef: Identifier; // -> DatatypeDefinition
}

interface AttributeDefinitionBoolean extends AttributeDefinitionBase { kind: "BOOLEAN"; defaultValue?: boolean }
interface AttributeDefinitionDate    extends AttributeDefinitionBase { kind: "DATE";    defaultValue?: string }
interface AttributeDefinitionInteger extends AttributeDefinitionBase { kind: "INTEGER"; defaultValue?: number }
interface AttributeDefinitionReal    extends AttributeDefinitionBase { kind: "REAL";    defaultValue?: number }
interface AttributeDefinitionString  extends AttributeDefinitionBase { kind: "STRING";  defaultValue?: string }
interface AttributeDefinitionXhtml   extends AttributeDefinitionBase { kind: "XHTML";   defaultValue?: XhtmlContent }
interface AttributeDefinitionEnumeration extends AttributeDefinitionBase {
  kind: "ENUMERATION";
  multiValued?: boolean;
  defaultValueRefs?: Identifier[]; // -> EnumValue
}

type AttributeDefinition = /* l'union des sept ci-dessus */;
```

## Valeurs d'attributs (10.8.12 – 10.8.20)

```ts
interface AttributeValueBoolean { kind: "BOOLEAN"; definitionRef: Identifier; value?: boolean }
interface AttributeValueDate    { kind: "DATE";    definitionRef: Identifier; value?: string }
interface AttributeValueInteger { kind: "INTEGER"; definitionRef: Identifier; value?: number }
interface AttributeValueReal    { kind: "REAL";    definitionRef: Identifier; value?: number }
interface AttributeValueString  { kind: "STRING";  definitionRef: Identifier; value?: string }

interface AttributeValueEnumeration {
  kind: "ENUMERATION";
  definitionRef: Identifier;
  valueRefs: Identifier[]; // -> EnumValue
}

/** 10.8.20 AttributeValueXHTML */
interface AttributeValueXhtml {
  kind: "XHTML";
  definitionRef: Identifier;
  value?: XhtmlContent;          // theValue — ce qui est destiné à l'affichage
  originalValue?: XhtmlContent;  // theOriginalValue — l'original d'avant simplification
  isSimplified?: boolean;        // true quand `value` est un substitut dégradé
}

type AttributeValue = /* l'union des sept ci-dessus */;
```

Sur `isSimplified` et `originalValue`, voir [Texte simplifié](/fr/guide/texte-simplifie).

## Contenu XHTML

```ts
type XhtmlNode = XhtmlElementNode | XhtmlTextNode;

interface XhtmlTextNode { type: "text"; value: string }

interface XhtmlElementNode {
  type: "element";
  tag: string;                        // minuscules, préfixe de namespace retiré
  attributes: Record<string, string>;
  children: XhtmlNode[];
}

interface XhtmlContent { nodes: XhtmlNode[] }
```

Volontairement minimal et sans dépendance au DOM : le même arbre se manipule dans un Worker,
côté Node, ou dans un test. `<xhtml:P>` et `<p>` arrivent tous les deux comme `"p"`.

## Éléments structurels

```ts
type SpecTypeKind = "SPEC-OBJECT-TYPE" | "SPECIFICATION-TYPE" | "SPEC-RELATION-TYPE" | "RELATION-GROUP-TYPE";

interface SpecType extends Identifiable {
  kind: SpecTypeKind;
  specAttributes: AttributeDefinition[];
}

/** 10.8.36 SpecElementWithAttributes — base interne, non exportée. */
interface SpecElementWithAttributes extends Identifiable {
  values: AttributeValue[];
  typeRef: Identifier; // -> SpecType
}

/** 10.8.40 SpecObject — une exigence / un objet d'information. */
interface SpecObject extends SpecElementWithAttributes {}

/** 10.8.38 Specification — la racine d'un arbre d'exigences. */
interface Specification extends SpecElementWithAttributes { children: SpecHierarchy[] }

/** 10.8.37 SpecHierarchy — un nœud de l'arbre d'une Specification. */
interface SpecHierarchy extends Identifiable, AccessControlled {
  isTableInternal?: boolean;
  objectRef: Identifier;                // -> SpecObject
  editableAttributeRefs?: Identifier[]; // EDITABLE-ATTS
  children: SpecHierarchy[];
}

/** 10.8.42 SpecRelation — un lien typé entre deux SpecObject. */
interface SpecRelation extends SpecElementWithAttributes {
  sourceRef: Identifier;
  targetRef: Identifier;
}

/** 10.8.33 RelationGroup — un ensemble nommé de SpecRelations entre deux Specification. */
interface RelationGroup extends SpecElementWithAttributes {
  specRelationRefs: Identifier[];
  sourceSpecificationRef: Identifier;
  targetSpecificationRef: Identifier;
}
```

::: info `editableAttributeRefs` : absent ≠ vide
`undefined` signifie que l'élément `EDITABLE-ATTS` était **absent**, ce qui, selon la
contrainte [5] de 10.8.37, fait hériter le nœud de l'ensemble de son parent. Un tableau
**vide** signifie que l'élément était présent mais sans contenu. La distinction est
préservée dans le modèle ; la bibliothèque n'implémente pas l'héritage, n'ayant aucun usage
de l'éditabilité.
:::

::: info L'arbre a deux niveaux d'indirection
Un nœud (`SpecHierarchy`) n'est **pas** une exigence : il pointe vers une (`objectRef`). Le
même `SpecObject` peut donc apparaître à plusieurs endroits de l'arbre — c'est légal, c'est
courant, et c'est ce qui rend `duplicate-dom-id` nécessaire. Voir
[Liens entre exigences](/fr/guide/relations#objets-rendus-plusieurs-fois).
:::

## `ReqIfIndex`

```ts
class ReqIfIndex {
  constructor(input: ReqIfDocument | ReqIfDocument[]);
}
```

Résout en O(1) toutes les références croisées. **Passez le tableau** (`pkg.documents`) dès
qu'il y a plusieurs documents : c'est ce qui fait résoudre les relations `GLOBAL-REF` d'un
`.reqif` vers un autre.

Douze `Map`, toutes en lecture seule :

| Map | Clé → valeur |
|---|---|
| `datatypes` | id → `DatatypeDefinition` |
| `specTypes` | id → `SpecType` |
| `attributeDefinitions` | id → `AttributeDefinition` |
| `enumValues` | id → `EnumValue` |
| `specObjects` | id → `SpecObject` |
| `specifications` | id → `Specification` |
| `specHierarchies` | id → `SpecHierarchy` |
| `specRelations` | id → `SpecRelation` |
| `relationGroups` | id → `RelationGroup` |
| `outgoingRelations` | id d'objet → `SpecRelation[]` dont il est la source |
| `incomingRelations` | id d'objet → `SpecRelation[]` dont il est la cible |
| `byAlternativeId` | identifiant alternatif → l'élément `Identifiable` porteur |

Les deux `Map` de relations sont pré-calculées à la construction : sans elles, afficher les
liens d'un objet demanderait de balayer toutes les relations du document à chaque exigence.

## Helpers de lecture

### `resolveAttribute`

```ts
function resolveAttribute(obj: SpecObject, index: ReqIfIndex, nameOrId: string): {
  definition?: AttributeDefinition;
  value?: AttributeValue;
};
```

Trouve « l'attribut nommé X » sur un objet, en traversant `values` → `definitionRef` →
`AttributeDefinition` → `longName` à votre place. Retourne `{}` si l'objet ne porte pas cet
attribut.

Ne parcourt que les valeurs **effectivement présentes sur l'objet** : il ne peut donc jamais
faire remonter un attribut appartenant à un autre `SpecObjectType`.

### `normalizeKey`

```ts
function normalizeKey(s: string): string;
```

La normalisation utilisée pour cette correspondance : insensible à la casse et aux espaces.
C'est ce qui fait que `ReqIF.ForeignID`, `Foreign ID` et `foreignid` désignent le même
attribut — les exports réels écrivent les trois.

### `valueToPlainText`

```ts
function valueToPlainText(value: AttributeValue, index?: ReqIfIndex): string | undefined;
```

Rend n'importe quelle valeur en texte brut. **Passez l'index** si vous voulez que les
énumérations rendent leurs libellés plutôt que leurs identifiants.

### `extractLifecycleInfo`

```ts
function extractLifecycleInfo(obj: SpecObject, index: ReqIfIndex): LifecycleInfo;

interface LifecycleInfo {
  foreignId?: string;   // l'ID métier ("REQS-123"), distinct du GUID ReqIF interne
  createdBy?: string;
  createdOn?: string;
  modifiedBy?: string;
  modifiedOn?: string;
  consumedDefinitionIds: Set<string>; // les AttributeDefinition reconnues ci-dessus
}
```

Applique les conventions reconnues (`ReqIF.ForeignID`, `ReqIF.ForeignCreatedBy/On`,
`ReqIF.ForeignModifiedBy/On` et leurs variantes d'écriture), que la valeur soit stockée en
chaîne simple ou en XHTML — DOORS exporte parfois ces champs en XHTML.

`consumedDefinitionIds` n'est utilisé pour masquer **rien** par défaut : le panneau
technique liste toujours tous les attributs. Il est exposé pour que vous puissiez bâtir
votre propre déduplication.
