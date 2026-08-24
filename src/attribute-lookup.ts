import { ReqIfIndex } from "./lookup.js";
import { xhtmlToPlainText } from "./sanitize.js";
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

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s.length ? s : undefined;
}

/**
 * Extracts a plain-text reading of a value regardless of its concrete kind —
 * used wherever an attribute might serve as a title or as fallback content,
 * since real-world exports are inconsistent about which datatype they use
 * for a given semantic role (e.g. DOORS sometimes stores a short label as
 * XHTML rather than STRING).
 */
export function valueToPlainText(value: AttributeValue, index?: ReqIfIndex): string | undefined {
  switch (value.kind) {
    case "STRING":
    case "DATE":
      return asString(value.value);
    case "INTEGER":
    case "REAL":
      return value.value === undefined ? undefined : String(value.value);
    case "BOOLEAN":
      return value.value === undefined ? undefined : value.value ? "true" : "false";
    case "XHTML": {
      // Always read from the original when one is present: a simplified
      // rendition may have *dropped* text (a flattened table, a lost list),
      // and plain-text extraction wants the most complete source available.
      // This is independent of what the renderer chooses to display.
      const content = value.originalValue ?? value.value;
      return content ? asString(xhtmlToPlainText(content)) : undefined;
    }
    case "ENUMERATION": {
      const labels = index ? index.enumLabels(value.valueRefs) : value.valueRefs;
      return labels.length ? labels.join(", ") : undefined;
    }
    default:
      return undefined;
  }
}
