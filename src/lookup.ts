import type {
  AttributeDefinition,
  DatatypeDefinition,
  EnumValue,
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

  constructor(doc: ReqIfDocument) {
    const c = doc.coreContent;
    for (const d of c.datatypes) this.datatypes.set(d.identifier, d);
    for (const t of c.specTypes) {
      this.specTypes.set(t.identifier, t);
      for (const ad of t.specAttributes) this.attributeDefinitions.set(ad.identifier, ad);
    }
    for (const d of c.datatypes) {
      if (d.kind === "ENUMERATION") {
        for (const ev of d.specifiedValues) this.enumValues.set(ev.identifier, ev);
      }
    }
    for (const o of c.specObjects) this.specObjects.set(o.identifier, o);
    for (const s of c.specifications) {
      this.specifications.set(s.identifier, s);
      this.indexHierarchy(s.children);
    }
    for (const r of c.specRelations) this.specRelations.set(r.identifier, r);
    for (const g of c.specRelationGroups) this.relationGroups.set(g.identifier, g);
  }

  private indexHierarchy(nodes: SpecHierarchy[]): void {
    for (const n of nodes) {
      this.specHierarchies.set(n.identifier, n);
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
