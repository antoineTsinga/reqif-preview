/**
 * Data model for the OMG "Requirements Interchange Format" (ReqIF) v1.2
 * (formal/2016-07-01). Field names follow the spec's UML attribute names
 * (camelCase); the original XML tag is noted in comments where it helps.
 *
 * This model is intentionally *acyclic and serializable*: cross references
 * (TYPE, DEFINITION, SOURCE/TARGET, OBJECT, ...) are kept as plain string
 * identifiers, never as embedded object graphs. Use `ReqIfIndex` (see
 * index.ts) to resolve an id to its element in O(1).
 */

export type Identifier = string;

/**
 * 10.8.2 AlternativeID — an optional secondary identifier an exporting tool
 * may attach to any identifiable element, typically to carry the id the
 * element had in the originating repository.
 *
 * The spec gives the class one *attribute*, `identifier`, and one
 * *association*, `ident : Identifiable` — the back-linkage to the owning
 * element (Figure 10.2 names the two ends `+ident` / `+alternativeID`).
 * That back-linkage is deliberately NOT modeled here: it is pure navigation,
 * derivable from containment, never serialized in the XML, and materializing
 * it would make ReqIfDocument cyclic — breaking JSON.stringify and the
 * acyclic-model invariant the whole design rests on.
 *
 * Note that clause 2 (Conformance) allows a tool to use AlternativeID as a
 * *parallel identification mechanism*. ReqIfIndex keys off the primary
 * `identifier` only, so a document whose *-REFs point at alternative ids
 * would not resolve. No such export has been observed so far.
 */
export interface AlternativeId {
  identifier: Identifier;
}

/** Common base for every identifiable ReqIF element (10.8.32 Identifiable). */
export interface Identifiable {
  identifier: Identifier;
  lastChange?: string; // xsd:dateTime
  longName?: string;
  desc?: string;
  alternativeId?: AlternativeId;
}

/** 10.8.1 AccessControlledElement */
export interface AccessControlled {
  isEditable?: boolean;
}

// ---------------------------------------------------------------------------
// Data types (10.8.21 - 10.8.28)
// ---------------------------------------------------------------------------

export type DatatypeKind =
  | "BOOLEAN"
  | "DATE"
  | "ENUMERATION"
  | "INTEGER"
  | "REAL"
  | "STRING"
  | "XHTML";

export interface DatatypeDefinitionBase extends Identifiable {
  kind: DatatypeKind;
}

export interface DatatypeDefinitionBoolean extends DatatypeDefinitionBase {
  kind: "BOOLEAN";
}

export interface DatatypeDefinitionDate extends DatatypeDefinitionBase {
  kind: "DATE";
}

export interface DatatypeDefinitionInteger extends DatatypeDefinitionBase {
  kind: "INTEGER";
  min?: number;
  max?: number;
}

export interface DatatypeDefinitionReal extends DatatypeDefinitionBase {
  kind: "REAL";
  min?: number;
  max?: number;
  accuracy?: number;
}

export interface DatatypeDefinitionString extends DatatypeDefinitionBase {
  kind: "STRING";
  maxLength?: number;
}

export interface DatatypeDefinitionXhtml extends DatatypeDefinitionBase {
  kind: "XHTML";
}

/** 10.8.31 EnumValue (a possible value of an enumeration data type). */
export interface EnumValue extends Identifiable {
  /** 10.8.30 EmbeddedValue, optional ordering/numeric key + extra payload. */
  properties?: { key?: number; otherContent?: string };
}

export interface DatatypeDefinitionEnumeration extends DatatypeDefinitionBase {
  kind: "ENUMERATION";
  /** Possible values, in document order (SPECIFIED-VALUES/ENUM-VALUE). */
  specifiedValues: EnumValue[];
}

export type DatatypeDefinition =
  | DatatypeDefinitionBoolean
  | DatatypeDefinitionDate
  | DatatypeDefinitionInteger
  | DatatypeDefinitionReal
  | DatatypeDefinitionString
  | DatatypeDefinitionXhtml
  | DatatypeDefinitionEnumeration;

// ---------------------------------------------------------------------------
// Attribute definitions (10.8.3 - 10.8.11)
// ---------------------------------------------------------------------------

export interface AttributeDefinitionBase extends Identifiable, AccessControlled {
  kind: DatatypeKind;
  /** Identifier of the related DatatypeDefinition. */
  datatypeRef: Identifier;
}

export interface AttributeDefinitionBoolean extends AttributeDefinitionBase {
  kind: "BOOLEAN";
  defaultValue?: boolean;
}
export interface AttributeDefinitionDate extends AttributeDefinitionBase {
  kind: "DATE";
  defaultValue?: string;
}
export interface AttributeDefinitionInteger extends AttributeDefinitionBase {
  kind: "INTEGER";
  defaultValue?: number;
}
export interface AttributeDefinitionReal extends AttributeDefinitionBase {
  kind: "REAL";
  defaultValue?: number;
}
export interface AttributeDefinitionString extends AttributeDefinitionBase {
  kind: "STRING";
  defaultValue?: string;
}
export interface AttributeDefinitionXhtml extends AttributeDefinitionBase {
  kind: "XHTML";
  defaultValue?: XhtmlContent;
}
export interface AttributeDefinitionEnumeration extends AttributeDefinitionBase {
  kind: "ENUMERATION";
  multiValued?: boolean;
  /** Identifiers of EnumValue used as default, if any. */
  defaultValueRefs?: Identifier[];
}

export type AttributeDefinition =
  | AttributeDefinitionBoolean
  | AttributeDefinitionDate
  | AttributeDefinitionInteger
  | AttributeDefinitionReal
  | AttributeDefinitionString
  | AttributeDefinitionXhtml
  | AttributeDefinitionEnumeration;

// ---------------------------------------------------------------------------
// XHTML content (10.8.45, 10.6.3)
// ---------------------------------------------------------------------------

/** A generic, namespace-agnostic node tree for embedded XHTML fragments. */
export type XhtmlNode = XhtmlElementNode | XhtmlTextNode;

export interface XhtmlTextNode {
  type: "text";
  value: string;
}

export interface XhtmlElementNode {
  type: "element";
  /** Local tag name, lower-cased, namespace prefix stripped (e.g. "div"). */
  tag: string;
  attributes: Record<string, string>;
  children: XhtmlNode[];
}

export interface XhtmlContent {
  /** Root mixed-content nodes found inside <THE-VALUE>/<XHTML-CONTENT>. */
  nodes: XhtmlNode[];
}

// ---------------------------------------------------------------------------
// Attribute values (10.8.12 - 10.8.20)
// ---------------------------------------------------------------------------

interface AttributeValueBase {
  kind: DatatypeKind;
  /** Identifier of the AttributeDefinition this value conforms to. */
  definitionRef: Identifier;
}

export interface AttributeValueBoolean extends AttributeValueBase {
  kind: "BOOLEAN";
  value?: boolean;
}
export interface AttributeValueDate extends AttributeValueBase {
  kind: "DATE";
  value?: string;
}
export interface AttributeValueInteger extends AttributeValueBase {
  kind: "INTEGER";
  value?: number;
}
export interface AttributeValueReal extends AttributeValueBase {
  kind: "REAL";
  value?: number;
}
export interface AttributeValueString extends AttributeValueBase {
  kind: "STRING";
  value?: string;
}
export interface AttributeValueXhtml extends AttributeValueBase {
  kind: "XHTML";
  value?: XhtmlContent;
  isSimplified?: boolean;
}
export interface AttributeValueEnumeration extends AttributeValueBase {
  kind: "ENUMERATION";
  /** Identifiers of the chosen EnumValue element(s). */
  valueRefs: Identifier[];
}

export type AttributeValue =
  | AttributeValueBoolean
  | AttributeValueDate
  | AttributeValueInteger
  | AttributeValueReal
  | AttributeValueString
  | AttributeValueXhtml
  | AttributeValueEnumeration;

// ---------------------------------------------------------------------------
// Spec types (10.8.39, 10.8.41, 10.8.43, 10.8.34, 10.8.44)
// ---------------------------------------------------------------------------

export type SpecTypeKind =
  | "SPEC-OBJECT-TYPE"
  | "SPECIFICATION-TYPE"
  | "SPEC-RELATION-TYPE"
  | "RELATION-GROUP-TYPE";

export interface SpecType extends Identifiable {
  kind: SpecTypeKind;
  specAttributes: AttributeDefinition[];
}

// ---------------------------------------------------------------------------
// Spec elements with attributes (10.8.36)
// ---------------------------------------------------------------------------

interface SpecElementWithAttributes extends Identifiable {
  values: AttributeValue[];
  /** Identifier of the owning SpecType. */
  typeRef: Identifier;
}

/** 10.8.40 SpecObject — an identifiable requirement / information object. */
export interface SpecObject extends SpecElementWithAttributes {}

/** 10.8.42 SpecRelation — a typed link between two SpecObjects. */
export interface SpecRelation extends SpecElementWithAttributes {
  sourceRef: Identifier;
  targetRef: Identifier;
}

/** 10.8.37 SpecHierarchy — one node of a Specification's tree. */
export interface SpecHierarchy extends Identifiable, AccessControlled {
  isTableInternal?: boolean;
  /** Identifier of the SpecObject represented by this node. */
  objectRef: Identifier;
  children: SpecHierarchy[];
}

/** 10.8.38 Specification — the root of a requirements tree. */
export interface Specification extends SpecElementWithAttributes {
  children: SpecHierarchy[];
}

/** 10.8.33 RelationGroup — a named set of SpecRelations between two specs. */
export interface RelationGroup extends SpecElementWithAttributes {
  specRelationRefs: Identifier[];
  sourceSpecificationRef: Identifier;
  targetSpecificationRef: Identifier;
}

// ---------------------------------------------------------------------------
// Header & document root (9.2.1 - 9.2.3)
// ---------------------------------------------------------------------------

/** 9.2.3 ReqIFHeader */
export interface ReqIfHeader {
  identifier: Identifier;
  comment?: string;
  creationTime?: string;
  repositoryId?: string;
  reqIfToolId?: string;
  reqIfVersion?: string;
  sourceToolId?: string;
  title?: string;
}

/** 10.8.35 ReqIFContent — the core content root. */
export interface ReqIfContent {
  datatypes: DatatypeDefinition[];
  specTypes: SpecType[];
  specObjects: SpecObject[];
  specifications: Specification[];
  specRelations: SpecRelation[];
  specRelationGroups: RelationGroup[];
}

/** The fully parsed document (9.2.1 ReqIF root element). */
export interface ReqIfDocument {
  lang?: string;
  header: ReqIfHeader;
  coreContent: ReqIfContent;
  /** Original namespaces declared on <REQ-IF>, kept for round-tripping. */
  namespaces: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Attachments (.reqifz) & packages
// ---------------------------------------------------------------------------

/** A binary resource bundled in a .reqifz archive next to the .reqif XML. */
export interface ReqIfAttachment {
  /** Path inside the archive, as referenced by XHTML <object data="...">. */
  path: string;
  mimeType?: string;
  size: number;
  /** Lazily read; call once and cache, bytes are not duplicated in memory. */
  getBytes(): Promise<Uint8Array>;
}

/**
 * Resolves a relative path (as found in an XHTML `<object data="...">`
 * element) to its binary content. Implement your own for non-zip use cases
 * (e.g. files served from a CDN) — see `createZipAttachmentResolver`.
 */
export interface AttachmentResolver {
  resolve(path: string): ReqIfAttachment | undefined;
  list(): ReqIfAttachment[];
}

/** The result of loading a .reqif or .reqifz input — what the renderer needs. */
export interface ReqIfPackage {
  /** All ReqIF documents found (a .reqifz may legally contain several). */
  documents: ReqIfDocument[];
  /** Convenience accessor for the common single-document case. */
  document: ReqIfDocument;
  attachments: AttachmentResolver;
}
