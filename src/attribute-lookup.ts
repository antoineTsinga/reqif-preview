import { ReqIfIndex } from "./lookup.js";
import type { AttributeDefinition, AttributeValue, SpecObject } from "./types.js";

/** Lowercases and strips everything but letters/digits, so "ReqIF.ForeignID",
 * "Foreign ID" and "foreign_id" all normalize to the same key. */
export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export interface ResolvedAttribute {
  definition?: AttributeDefinition;
  value?: AttributeValue;
}

/**
 * Finds the attribute value an object carries for a given attribute, matched
 * either by the AttributeDefinition's exact identifier or by its long name
 * (case/spacing/punctuation-insensitive). Only scans values actually present
 * on the object, so it never "leaks" attributes from a different SpecObjectType.
 */
export function resolveAttribute(obj: SpecObject, index: ReqIfIndex, nameOrId: string): ResolvedAttribute {
  const key = normalizeKey(nameOrId);
  for (const value of obj.values) {
    const definition = index.attributeDefinitions.get(value.definitionRef);
    if (!definition) continue;
    if (definition.identifier === nameOrId || (definition.longName && normalizeKey(definition.longName) === key)) {
      return { definition, value };
    }
  }
  return {};
}
