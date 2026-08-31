# Data model

The model mirrors the OMG ReqIF v1.2 spec's UML faithfully. Each type carries, in
[`src/types.ts`](https://github.com/antoineTsinga/reqif-preview/blob/main/src/types.ts),
the clause number it implements.

Two properties characterise it, and neither is negotiable:

- **acyclic** — every cross-reference is an identifier string, never a nested object.
  `JSON.stringify`, `postMessage` to a Worker and `IndexedDB` therefore work with no
  precautions;
- **serialisable** — no classes, no functions, no `Symbol` in the data. What you get is
  structured, typed JSON.

The price is one indirection when reading. That is what [`ReqIfIndex`](#reqifindex) is for.

## Root

```ts
type Identifier = string;

interface ReqIfDocument {
  lang?: string;
  header: ReqIfHeader;
  coreContent: ReqIfContent;
  namespaces: Record<string, string>; // namespaces declared on <REQ-IF>, kept for a round trip
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

## Identity

```ts
/** 10.8.32 Identifiable — the common base of every identifiable element. */
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

::: details Why `AlternativeId` has only one field
The spec gives the class one *attribute*, `identifier`, and one *association*,
`ident : Identifiable` — the back-link to the owning element (figure 10.2 names the two
ends `+ident` / `+alternativeID`).

That back-link is **deliberately not modelled**. It is purely navigational, derivable from
containment, never serialised in the XML — and materialising it would make `ReqIfDocument`
cyclic, which would break `JSON.stringify` and the invariant everything else rests on.

Clause 2 (Conformance) also allows a tool to use the `AlternativeID` as a **parallel
identification mechanism**. `ReqIfIndex` keys off the primary `identifier`, so a document
whose `*-REF`s pointed at alternative ids would not resolve. `index.byAlternativeId` lets
you find the element the other way round.
:::

## Datatypes (10.8.21 – 10.8.28)

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
  specifiedValues: EnumValue[]; // in document order
}

/** 10.8.31 EnumValue */
interface EnumValue extends Identifiable {
  properties?: { key?: number; otherContent?: string }; // 10.8.30 EmbeddedValue
}

type DatatypeDefinition = /* the union of the seven above */;
```

`kind` is the **discriminant**: a `switch (dt.kind)` narrows the type correctly.

## Attribute definitions (10.8.3 – 10.8.11)

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

type AttributeDefinition = /* the union of the seven above */;
```

## Attribute values (10.8.12 – 10.8.20)

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
  value?: XhtmlContent;          // theValue — what is meant for display
  originalValue?: XhtmlContent;  // theOriginalValue — the original before simplification
  isSimplified?: boolean;        // true when `value` is a degraded stand-in
}

type AttributeValue = /* the union of the seven above */;
```

On `isSimplified` and `originalValue`, see [Simplified text](/guide/simplified-text).

## XHTML content

```ts
type XhtmlNode = XhtmlElementNode | XhtmlTextNode;

interface XhtmlTextNode { type: "text"; value: string }

interface XhtmlElementNode {
  type: "element";
  tag: string;                        // lower-cased, namespace prefix stripped
  attributes: Record<string, string>;
  children: XhtmlNode[];
}

interface XhtmlContent { nodes: XhtmlNode[] }
```

Deliberately minimal and free of any DOM dependency: the same tree is manipulated in a
Worker, on Node, or in a test. `<xhtml:P>` and `<p>` both arrive as `"p"`.

## Structural elements

```ts
type SpecTypeKind = "SPEC-OBJECT-TYPE" | "SPECIFICATION-TYPE" | "SPEC-RELATION-TYPE" | "RELATION-GROUP-TYPE";

interface SpecType extends Identifiable {
  kind: SpecTypeKind;
  specAttributes: AttributeDefinition[];
}

/** 10.8.36 SpecElementWithAttributes — internal base, not exported. */
interface SpecElementWithAttributes extends Identifiable {
  values: AttributeValue[];
  typeRef: Identifier; // -> SpecType
}

/** 10.8.40 SpecObject — a requirement / an information object. */
interface SpecObject extends SpecElementWithAttributes {}

/** 10.8.38 Specification — the root of a requirements tree. */
interface Specification extends SpecElementWithAttributes { children: SpecHierarchy[] }

/** 10.8.37 SpecHierarchy — a node in a Specification's tree. */
interface SpecHierarchy extends Identifiable, AccessControlled {
  isTableInternal?: boolean;
  objectRef: Identifier;                // -> SpecObject
  editableAttributeRefs?: Identifier[]; // EDITABLE-ATTS
  children: SpecHierarchy[];
}

/** 10.8.42 SpecRelation — a typed link between two SpecObjects. */
interface SpecRelation extends SpecElementWithAttributes {
  sourceRef: Identifier;
  targetRef: Identifier;
}

/** 10.8.33 RelationGroup — a named set of SpecRelations between two Specifications. */
interface RelationGroup extends SpecElementWithAttributes {
  specRelationRefs: Identifier[];
  sourceSpecificationRef: Identifier;
  targetSpecificationRef: Identifier;
}
```

::: info `editableAttributeRefs`: absent ≠ empty
`undefined` means the `EDITABLE-ATTS` element was **absent**, which under constraint [5] of
10.8.37 makes the node inherit its parent's set. An **empty** array means the element was
present but had no content. The distinction is preserved in the model; the library does not
implement the inheritance, having no use for editability.
:::

::: info The tree has two levels of indirection
A node (`SpecHierarchy`) is **not** a requirement: it points at one (`objectRef`). The same
`SpecObject` can therefore appear at several places in the tree — that is legal, it is
common, and it is what makes `duplicate-dom-id` necessary. See
[Links between requirements](/guide/relations#objects-rendered-more-than-once).
:::

## `ReqIfIndex`

```ts
class ReqIfIndex {
  constructor(input: ReqIfDocument | ReqIfDocument[]);
}
```

Resolves every cross-reference in O(1). **Pass the array** (`pkg.documents`) as soon as
there is more than one document: that is what makes `GLOBAL-REF` relations from one
`.reqif` to another resolve.

Twelve `Map`s, all read-only:

| Map | Key → value |
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
| `outgoingRelations` | object id → the `SpecRelation[]` it is the source of |
| `incomingRelations` | object id → the `SpecRelation[]` it is the target of |
| `byAlternativeId` | alternative identifier → the `Identifiable` carrying it |

The two relation `Map`s are precomputed at construction: without them, showing an object's
links would mean scanning every relation in the document for each requirement.

## Reading helpers

### `resolveAttribute`

```ts
function resolveAttribute(obj: SpecObject, index: ReqIfIndex, nameOrId: string): {
  definition?: AttributeDefinition;
  value?: AttributeValue;
};
```

Finds "the attribute named X" on an object, walking `values` → `definitionRef` →
`AttributeDefinition` → `longName` for you. Returns `{}` when the object does not carry
that attribute.

It only walks the values **actually present on the object**, so it can never surface an
attribute belonging to a different `SpecObjectType`.

### `normalizeKey`

```ts
function normalizeKey(s: string): string;
```

The normalisation used for that matching: case- and space-insensitive. It is what makes
`ReqIF.ForeignID`, `Foreign ID` and `foreignid` denote the same attribute — real exports
write all three.

### `valueToPlainText`

```ts
function valueToPlainText(value: AttributeValue, index?: ReqIfIndex): string | undefined;
```

Renders any value as plain text. **Pass the index** if you want enumerations to render
their labels rather than their identifiers.

### `extractLifecycleInfo`

```ts
function extractLifecycleInfo(obj: SpecObject, index: ReqIfIndex): LifecycleInfo;

interface LifecycleInfo {
  foreignId?: string;   // the business ID ("REQS-123"), distinct from the internal ReqIF GUID
  createdBy?: string;
  createdOn?: string;
  modifiedBy?: string;
  modifiedOn?: string;
  consumedDefinitionIds: Set<string>; // the AttributeDefinitions recognised above
}
```

Applies the recognised conventions (`ReqIF.ForeignID`, `ReqIF.ForeignCreatedBy/On`,
`ReqIF.ForeignModifiedBy/On` and their spelling variants), whether the value is stored as a
plain string or as XHTML — DOORS sometimes exports these fields as XHTML.

`consumedDefinitionIds` is used to hide **nothing** by default: the technical panel always
lists every attribute. It is exposed so you can build your own deduplication.
