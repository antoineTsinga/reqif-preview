import type {
  AttributeDefinition,
  DatatypeDefinition,
  EnumValue,
  Identifiable,
  Identifier,
  ReqIfDocument,
  RelationGroup,
  SpecHierarchy,
  SpecObject,
  SpecRelation,
  SpecType,
  Specification,
} from "./types.js";

/**
 * O(1) lookup of any identifiable ReqIF element by id, built once per
 * document. Cross-reference fields in the model (`typeRef`, `definitionRef`,
 * `objectRef`, `sourceRef`, ...) are resolved through this index rather than
 * via embedded object pointers, keeping the model itself acyclic and
 * JSON-serializable.
 */
export class ReqIfIndex {
  readonly datatypes = new Map<Identifier, DatatypeDefinition>();
  readonly specTypes = new Map<Identifier, SpecType>();
  readonly attributeDefinitions = new Map<Identifier, AttributeDefinition>();
  readonly enumValues = new Map<Identifier, EnumValue>();
  readonly specObjects = new Map<Identifier, SpecObject>();
  readonly specifications = new Map<Identifier, Specification>();
  readonly specHierarchies = new Map<Identifier, SpecHierarchy>();
  readonly specRelations = new Map<Identifier, SpecRelation>();
  readonly relationGroups = new Map<Identifier, RelationGroup>();
  /** SpecRelations where a given SpecObject is the SOURCE, keyed by that object's id. */
  readonly outgoingRelations = new Map<Identifier, SpecRelation[]>();
  /** SpecRelations where a given SpecObject is the TARGET, keyed by that object's id. */
  readonly incomingRelations = new Map<Identifier, SpecRelation[]>();
  /**
   * Elements carrying an AlternativeID, keyed by that alternative identifier.
   * Clause 2 allows a tool to run an alternative identification mechanism
   * *in parallel* with the primary one, so a document may in principle name
   * things by these ids. Resolution deliberately still goes through the
   * primary maps only — mixing two identifier namespaces silently would be
   * worse than not resolving — but consumers that know their exporter does
   * this can consult it.
   */
  readonly byAlternativeId = new Map<Identifier, Identifiable>();

  /**
   * Indexes one document, or several at once. Several matters for a .reqifz:
   * a SpecRelation's source/target are GLOBAL-REF in the schema (clause 11,
   * rule 5b), so a relation may legally point at a SpecObject living in
   * another .reqif of the same package. A per-document index cannot resolve
   * those.
   */
  constructor(input: ReqIfDocument | ReqIfDocument[]) {
    for (const doc of Array.isArray(input) ? input : [input]) this.addDocument(doc);
  }

  private addDocument(doc: ReqIfDocument): void {
    const c = doc.coreContent;
    for (const d of c.datatypes) this.set(this.datatypes, d);
    for (const t of c.specTypes) {
      this.set(this.specTypes, t);
      for (const ad of t.specAttributes) this.set(this.attributeDefinitions, ad);
    }
    for (const d of c.datatypes) {
      if (d.kind === "ENUMERATION") {
        for (const ev of d.specifiedValues) this.set(this.enumValues, ev);
      }
    }
    for (const o of c.specObjects) this.set(this.specObjects, o);
    for (const s of c.specifications) {
      this.set(this.specifications, s);
      this.indexHierarchy(s.children);
    }
    for (const r of c.specRelations) {
      this.set(this.specRelations, r);
      pushTo(this.outgoingRelations, r.sourceRef, r);
      pushTo(this.incomingRelations, r.targetRef, r);
    }
    for (const g of c.specRelationGroups) this.set(this.relationGroups, g);
  }

  /** Registers an element under its primary id, and under its AlternativeID if it has one. */
  private set<T extends Identifiable>(map: Map<Identifier, T>, element: T): void {
    map.set(element.identifier, element);
    if (element.alternativeId) this.byAlternativeId.set(element.alternativeId.identifier, element);
  }

  private indexHierarchy(nodes: SpecHierarchy[]): void {
    for (const n of nodes) {
      this.set(this.specHierarchies, n);
      this.indexHierarchy(n.children);
    }
  }

  /** The DatatypeDefinition an AttributeDefinition points to. */
  datatypeOf(def: AttributeDefinition): DatatypeDefinition | undefined {
    return this.datatypes.get(def.datatypeRef);
  }

  /** Human-readable long names for the chosen values of an enum attribute value. */
  enumLabels(valueRefs: Identifier[]): string[] {
    return valueRefs.map((id) => this.enumValues.get(id)?.longName ?? id);
  }
}

function pushTo<K>(map: Map<K, SpecRelation[]>, key: K, value: SpecRelation): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
