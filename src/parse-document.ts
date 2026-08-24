import { XMLParser } from "fast-xml-parser";
import {
  XNode,
  attrOf,
  attrsOf,
  childrenOf,
  elementsOf,
  findAll,
  findFirst,
  parseBool,
  parseNum,
  readRef,
  readRefs,
  tagOf,
  textOfChild,
} from "./xml-tree.js";
import { xNodesToXhtmlContent } from "./xhtml.js";
import { ReqIfParseError } from "./errors.js";
import type {
  AlternativeId,
  AttributeDefinition,
  AttributeValue,
  DatatypeDefinition,
  DatatypeKind,
  EnumValue,
  Identifiable,
  ReqIfContent,
  ReqIfDocument,
  ReqIfHeader,
  RelationGroup,
  SpecHierarchy,
  SpecObject,
  SpecRelation,
  SpecType,
  SpecTypeKind,
  Specification,
} from "./types.js";

const DEFAULT_MAX_NESTED_TAGS = 10_000;

const DEFAULT_PROCESS_ENTITIES = {
  enabled: true,
  // fast-xml-parser's own anti-"XML bomb" defaults here (maxTotalExpansions /
  // maxEntityCount both effectively 1000 in current releases) are far too
  // low for a real ReqIF export: a sizeable document can easily contain
  // more than 1000 ordinary entity references (&amp;, &quot;, ...) spread
  // across hundreds of requirements, or a tool-generated DOCTYPE with many
  // named entities — throwing "Entity count exceeds maximum allowed" (or
  // "Entity expansion limit exceeded", depending on the exact release) on
  // an otherwise perfectly legitimate file.
  maxEntitySize: 1_000_000,
  maxExpansionDepth: 10_000,
  maxTotalExpansions: 1_000_000,
  maxExpandedLength: 10_000_000,
  maxEntityCount: 1_000_000,
  allowedTags: null,
  tagFilter: null,
  appliesTo: "all",
} as const;

const BASE_PARSER_OPTIONS = {
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: false,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
  ignoreDeclaration: true,
  ignorePiTags: true,
  htmlEntities: true,
} as const;

export interface ParseOptions {
  /**
   * fast-xml-parser refuses XML nested deeper than this many levels, as a
   * defense against maliciously crafted "XML bomb" files — but its default
   * (100) is too low for real-world ReqIF: a deep specification hierarchy
   * combined with richly nested XHTML content (e.g. pasted from Word) can
   * easily exceed it, causing a "Maximum nested tags exceeded" error on a
   * perfectly legitimate document. Default here: 10000. Lower it if you're
   * processing untrusted files and want tighter protection against
   * pathological input; raise it further for unusually deep documents.
   */
  maxNestedTags?: number;
  /**
   * Same idea, for fast-xml-parser's separate entity-processing guards
   * (total entity expansions / entity count / expanded length) — its
   * defaults throw on documents with as few as ~1000 entity references or
   * declarations (`Entity count exceeds maximum allowed` / `Entity
   * expansion limit exceeded`), which a real ReqIF export can exceed simply
   * by having many `&amp;`/`&quot;`-containing requirements. Pass a partial
   * object to override only the limits you care about; pass `false` to
   * disable entity processing entirely (rarely what you want).
   */
  processEntities?: Partial<typeof DEFAULT_PROCESS_ENTITIES> | false;
}

function buildProcessEntities(override: ParseOptions["processEntities"]): unknown {
  if (override === false) return false;
  return { ...DEFAULT_PROCESS_ENTITIES, ...override };
}

/** Parses a single ReqIF XML document (the content of one `.reqif` file). */
export function parseReqIfXml(xml: string, options: ParseOptions = {}): ReqIfDocument {
  let roots: XNode[];
  try {
    const parser = new XMLParser({
      ...BASE_PARSER_OPTIONS,
      maxNestedTags: options.maxNestedTags ?? DEFAULT_MAX_NESTED_TAGS,
      processEntities: buildProcessEntities(options.processEntities),
    } as any);
    roots = parser.parse(xml) as XNode[];
  } catch (err) {
    throw new ReqIfParseError("Failed to parse XML.", err);
  }

  const reqIfNode = roots.find((n) => tagOf(n) === "REQ-IF");
  if (!reqIfNode) {
    throw new ReqIfParseError("No <REQ-IF> root element found in document.");
  }

  const theHeader = findFirst(reqIfNode, "THE-HEADER");
  const headerEl = theHeader && findFirst(theHeader, "REQ-IF-HEADER");
  if (!headerEl) {
    throw new ReqIfParseError("Missing required <THE-HEADER>/<REQ-IF-HEADER> element.");
  }

  const coreContentWrap = findFirst(reqIfNode, "CORE-CONTENT");
  const contentEl = coreContentWrap && findFirst(coreContentWrap, "REQ-IF-CONTENT");
  if (!contentEl) {
    throw new ReqIfParseError("Missing required <CORE-CONTENT>/<REQ-IF-CONTENT> element.");
  }

  return {
    lang: attrOf(reqIfNode, "lang"),
    header: parseHeader(headerEl),
    coreContent: parseContent(contentEl),
    namespaces: extractNamespaces(xml),
  };
}

// ---------------------------------------------------------------------------

function extractNamespaces(xml: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /xmlns(:[\w.-]+)?\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    out[m[1] ? m[1].slice(1) : "xmlns"] = m[2];
  }
  return out;
}

/**
 * 10.8.2 AlternativeID. Like every other aggregation in the format it is
 * wrapped in an element named after the role — which here happens to repeat
 * the type name, so the shape is doubled:
 *
 *   <ALTERNATIVE-ID><ALTERNATIVE-ID IDENTIFIER="external-42"/></ALTERNATIVE-ID>
 *
 * The flat form (IDENTIFIER carried directly by the wrapper) is accepted too:
 * it costs one `??` and some exporters emit it. A wrapper without any usable
 * IDENTIFIER yields `undefined` rather than an empty object, so callers can
 * test the field itself instead of its contents.
 */
function parseAlternativeId(node: XNode): AlternativeId | undefined {
  const wrapper = findFirst(node, "ALTERNATIVE-ID");
  if (!wrapper) return undefined;
  const inner = elementsOf(wrapper)[0];
  const identifier = (inner ? attrsOf(inner)["IDENTIFIER"] : undefined) ?? attrsOf(wrapper)["IDENTIFIER"];
  return identifier ? { identifier } : undefined;
}

function parseIdentifiable(node: XNode): Identifiable {
  const a = attrsOf(node);
  return {
    identifier: a["IDENTIFIER"] ?? "",
    lastChange: a["LAST-CHANGE"],
    longName: a["LONG-NAME"],
    desc: a["DESC"],
    alternativeId: parseAlternativeId(node),
  };
}

function parseHeader(node: XNode): ReqIfHeader {
  const a = attrsOf(node);
  return {
    identifier: a["IDENTIFIER"] ?? "",
    comment: textOfChild(node, "COMMENT"),
    creationTime: textOfChild(node, "CREATION-TIME"),
    repositoryId: textOfChild(node, "REPOSITORY-ID"),
    reqIfToolId: textOfChild(node, "REQ-IF-TOOL-ID"),
    reqIfVersion: textOfChild(node, "REQ-IF-VERSION"),
    sourceToolId: textOfChild(node, "SOURCE-TOOL-ID"),
    title: textOfChild(node, "TITLE"),
  };
}

function parseContent(node: XNode): ReqIfContent {
  const datatypesWrap = findFirst(node, "DATATYPES");
  const specTypesWrap = findFirst(node, "SPEC-TYPES");
  const specObjectsWrap = findFirst(node, "SPEC-OBJECTS");
  const specsWrap = findFirst(node, "SPECIFICATIONS");
  const specRelationsWrap = findFirst(node, "SPEC-RELATIONS");
  const relationGroupsWrap = findFirst(node, "SPEC-RELATION-GROUPS");

  return {
    datatypes: datatypesWrap ? elementsOf(datatypesWrap).map(parseDatatypeDefinition) : [],
    specTypes: specTypesWrap ? elementsOf(specTypesWrap).map(parseSpecType) : [],
    specObjects: specObjectsWrap ? elementsOf(specObjectsWrap).map(parseSpecObject) : [],
    specifications: specsWrap ? elementsOf(specsWrap).map(parseSpecification) : [],
    specRelations: specRelationsWrap ? elementsOf(specRelationsWrap).map(parseSpecRelation) : [],
    specRelationGroups: relationGroupsWrap
      ? elementsOf(relationGroupsWrap).map(parseRelationGroup)
      : [],
  };
}

// ---------------------------------------------------------------------------
// Datatypes
// ---------------------------------------------------------------------------

function kindFromTag(tag: string, prefix: string): DatatypeKind {
  const suffix = tag.slice(prefix.length).replace(/^-/, "");
  return suffix as DatatypeKind;
}

function parseDatatypeDefinition(node: XNode): DatatypeDefinition {
  const tag = tagOf(node) ?? "";
  const base = parseIdentifiable(node);
  const a = attrsOf(node);
  const kind = kindFromTag(tag, "DATATYPE-DEFINITION");

  switch (kind) {
    case "INTEGER":
      return { ...base, kind, min: parseNum(a["MIN"]), max: parseNum(a["MAX"]) };
    case "REAL":
      return {
        ...base,
        kind,
        min: parseNum(a["MIN"]),
        max: parseNum(a["MAX"]),
        accuracy: parseNum(a["ACCURACY"]),
      };
    case "STRING":
      return { ...base, kind, maxLength: parseNum(a["MAX-LENGTH"]) };
    case "ENUMERATION": {
      const specifiedValuesWrap = findFirst(node, "SPECIFIED-VALUES");
      const values: EnumValue[] = specifiedValuesWrap
        ? findAll(specifiedValuesWrap, "ENUM-VALUE").map(parseEnumValue)
        : [];
      return { ...base, kind, specifiedValues: values };
    }
    case "BOOLEAN":
    case "DATE":
    case "XHTML":
      return { ...base, kind } as DatatypeDefinition;
    default:
      throw new ReqIfParseError(`Unknown datatype definition tag: <${tag}>`);
  }
}

function parseEnumValue(node: XNode): EnumValue {
  const base = parseIdentifiable(node);
  const propsWrap = findFirst(node, "PROPERTIES");
  const embedded = propsWrap && findFirst(propsWrap, "EMBEDDED-VALUE");
  if (!embedded) return base;
  const ea = attrsOf(embedded);
  return {
    ...base,
    properties: { key: parseNum(ea["KEY"]), otherContent: ea["OTHER-CONTENT"] },
  };
}

// ---------------------------------------------------------------------------
// Spec types & attribute definitions
// ---------------------------------------------------------------------------

const SPEC_TYPE_TAGS: Record<string, SpecTypeKind> = {
  "SPEC-OBJECT-TYPE": "SPEC-OBJECT-TYPE",
  "SPECIFICATION-TYPE": "SPECIFICATION-TYPE",
  "SPEC-RELATION-TYPE": "SPEC-RELATION-TYPE",
  "RELATION-GROUP-TYPE": "RELATION-GROUP-TYPE",
};

function parseSpecType(node: XNode): SpecType {
  const tag = tagOf(node) ?? "";
  const kind = SPEC_TYPE_TAGS[tag];
  if (!kind) throw new ReqIfParseError(`Unknown spec type tag: <${tag}>`);
  const base = parseIdentifiable(node);
  const attrsWrap = findFirst(node, "SPEC-ATTRIBUTES");
  const specAttributes = attrsWrap ? elementsOf(attrsWrap).map(parseAttributeDefinition) : [];
  return { ...base, kind, specAttributes };
}

function parseAttributeDefinition(node: XNode): AttributeDefinition {
  const tag = tagOf(node) ?? "";
  const kind = kindFromTag(tag, "ATTRIBUTE-DEFINITION");
  const base = parseIdentifiable(node);
  const isEditable = parseBool(attrsOf(node)["IS-EDITABLE"]);
  const datatypeRef = readRef(node, "TYPE") ?? "";
  const common = { ...base, isEditable, datatypeRef };

  switch (kind) {
    case "BOOLEAN":
      return { ...common, kind, defaultValue: parseBool(readSimpleDefault(node)) };
    case "DATE":
      return { ...common, kind, defaultValue: readSimpleDefault(node) };
    case "INTEGER":
      return { ...common, kind, defaultValue: parseNum(readSimpleDefault(node)) };
    case "REAL":
      return { ...common, kind, defaultValue: parseNum(readSimpleDefault(node)) };
    case "STRING":
      return { ...common, kind, defaultValue: readSimpleDefault(node) };
    case "XHTML": {
      const defaultWrap = findFirst(node, "DEFAULT-VALUE");
      const valueEl = defaultWrap && findFirst(defaultWrap, "ATTRIBUTE-VALUE-XHTML");
      const theValueEl = valueEl && findFirst(valueEl, "THE-VALUE");
      return {
        ...common,
        kind,
        defaultValue: theValueEl ? xNodesToXhtmlContent(childrenOf(theValueEl)) : undefined,
      };
    }
    case "ENUMERATION": {
      const multiValued = parseBool(attrsOf(node)["MULTI-VALUED"]);
      const defaultWrap = findFirst(node, "DEFAULT-VALUE");
      const valueEl = defaultWrap && findFirst(defaultWrap, "ATTRIBUTE-VALUE-ENUMERATION");
      const defaultValueRefs = valueEl ? readRefs(valueEl, "VALUES") : undefined;
      return { ...common, kind, multiValued, defaultValueRefs };
    }
    default:
      throw new ReqIfParseError(`Unknown attribute definition tag: <${tag}>`);
  }
}

/** Reads THE-VALUE="..." off the single ATTRIBUTE-VALUE-* child of DEFAULT-VALUE. */
function readSimpleDefault(node: XNode): string | undefined {
  const defaultWrap = findFirst(node, "DEFAULT-VALUE");
  if (!defaultWrap) return undefined;
  const valueEl = elementsOf(defaultWrap)[0];
  return valueEl ? attrsOf(valueEl)["THE-VALUE"] : undefined;
}

// ---------------------------------------------------------------------------
// Spec objects, attribute values
// ---------------------------------------------------------------------------

function parseSpecObject(node: XNode): SpecObject {
  const base = parseIdentifiable(node);
  const valuesWrap = findFirst(node, "VALUES");
  const values = valuesWrap ? elementsOf(valuesWrap).map(parseAttributeValue) : [];
  const typeRef = readRef(node, "TYPE") ?? "";
  return { ...base, values, typeRef };
}

function parseAttributeValue(node: XNode): AttributeValue {
  const tag = tagOf(node) ?? "";
  const kind = kindFromTag(tag, "ATTRIBUTE-VALUE");
  const definitionRef = readRef(node, "DEFINITION") ?? "";
  const a = attrsOf(node);

  switch (kind) {
    case "BOOLEAN":
      return { kind, definitionRef, value: parseBool(a["THE-VALUE"]) };
    case "DATE":
      return { kind, definitionRef, value: a["THE-VALUE"] };
    case "INTEGER":
      return { kind, definitionRef, value: parseNum(a["THE-VALUE"]) };
    case "REAL":
      return { kind, definitionRef, value: parseNum(a["THE-VALUE"]) };
    case "STRING":
      return { kind, definitionRef, value: a["THE-VALUE"] };
    case "XHTML": {
      const theValueEl = findFirst(node, "THE-VALUE");
      // 10.8.20: when an upstream tool had to degrade the formatting it keeps
      // the untouched original alongside. Losing it means showing a poorer
      // rendition than the file actually carries.
      const originalEl = findFirst(node, "THE-ORIGINAL-VALUE");
      return {
        kind,
        definitionRef,
        isSimplified: parseBool(a["IS-SIMPLIFIED"]),
        value: theValueEl ? xNodesToXhtmlContent(childrenOf(theValueEl)) : undefined,
        originalValue: originalEl ? xNodesToXhtmlContent(childrenOf(originalEl)) : undefined,
      };
    }
    case "ENUMERATION":
      return { kind, definitionRef, valueRefs: readRefs(node, "VALUES") };
    default:
      throw new ReqIfParseError(`Unknown attribute value tag: <${tag}>`);
  }
}

// ---------------------------------------------------------------------------
// Specifications & hierarchy
// ---------------------------------------------------------------------------

function parseSpecification(node: XNode): Specification {
  const base = parseIdentifiable(node);
  const valuesWrap = findFirst(node, "VALUES");
  const values = valuesWrap ? elementsOf(valuesWrap).map(parseAttributeValue) : [];
  const typeRef = readRef(node, "TYPE") ?? "";
  const childrenWrap = findFirst(node, "CHILDREN");
  const children = childrenWrap ? findAll(childrenWrap, "SPEC-HIERARCHY").map(parseSpecHierarchy) : [];
  return { ...base, values, typeRef, children };
}

function parseSpecHierarchy(node: XNode): SpecHierarchy {
  const base = parseIdentifiable(node);
  const a = attrsOf(node);
  const objectRef = readRef(node, "OBJECT") ?? "";
  const childrenWrap = findFirst(node, "CHILDREN");
  const children = childrenWrap ? findAll(childrenWrap, "SPEC-HIERARCHY").map(parseSpecHierarchy) : [];
  return {
    ...base,
    isEditable: parseBool(a["IS-EDITABLE"]),
    isTableInternal: parseBool(a["IS-TABLE-INTERNAL"]),
    objectRef,
    children,
  };
}

// ---------------------------------------------------------------------------
// Relations & relation groups
// ---------------------------------------------------------------------------

function parseSpecRelation(node: XNode): SpecRelation {
  const base = parseIdentifiable(node);
  const valuesWrap = findFirst(node, "VALUES");
  const values = valuesWrap ? elementsOf(valuesWrap).map(parseAttributeValue) : [];
  const typeRef = readRef(node, "TYPE") ?? "";
  const sourceRef = readRef(node, "SOURCE") ?? "";
  const targetRef = readRef(node, "TARGET") ?? "";
  return { ...base, values, typeRef, sourceRef, targetRef };
}

function parseRelationGroup(node: XNode): RelationGroup {
  const base = parseIdentifiable(node);
  const valuesWrap = findFirst(node, "VALUES");
  const values = valuesWrap ? elementsOf(valuesWrap).map(parseAttributeValue) : [];
  const typeRef = readRef(node, "TYPE") ?? "";
  const specRelationRefs = readRefs(node, "SPEC-RELATIONS");
  const sourceSpecificationRef = readRef(node, "SOURCE-SPECIFICATION") ?? "";
  const targetSpecificationRef = readRef(node, "TARGET-SPECIFICATION") ?? "";
  return { ...base, values, typeRef, specRelationRefs, sourceSpecificationRef, targetSpecificationRef };
}
