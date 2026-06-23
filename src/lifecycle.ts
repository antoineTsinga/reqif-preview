import { normalizeKey } from "./attribute-lookup.js";
import { ReqIfIndex } from "./lookup.js";
import { xhtmlToPlainText } from "./sanitize.js";
import type { AttributeValue, SpecObject } from "./types.js";

/**
 * These are not part of the OMG ReqIF spec itself, but a widely used
 * de-facto convention (IBM DOORS / DOORS Next, ReqEdit, ReqView, Capella, ...)
 * for carrying the originating tool's own id and audit trail across an
 * exchange. Matching is done on the *normalized* long name, so "ReqIF.ForeignID",
 * "Foreign ID" and "ForeignID" are all recognized.
 */
const FOREIGN_ID_KEYS = new Set(["reqifforeignid", "foreignid"]);
const CREATED_BY_KEYS = new Set(["reqifforeigncreatedby", "foreigncreatedby", "createdby"]);
const CREATED_ON_KEYS = new Set(["reqifforeigncreatedon", "foreigncreatedon", "createdon", "creationdate"]);
const MODIFIED_BY_KEYS = new Set(["reqifforeignmodifiedby", "foreignmodifiedby", "modifiedby", "lastmodifiedby"]);
const MODIFIED_ON_KEYS = new Set([
  "reqifforeignmodifiedon",
  "foreignmodifiedon",
  "modifiedon",
  "lastmodifiedon",
  "lastmodified",
]);

export interface LifecycleInfo {
  /** The human/business id (e.g. "REQS-123"), distinct from the internal ReqIF GUID. */
  foreignId?: string;
  createdBy?: string;
  createdOn?: string;
  modifiedBy?: string;
  modifiedOn?: string;
  /** Identifiers of the AttributeDefinitions matched above. Not used to hide
   * anything by default (the technical panel always shows every attribute),
   * but exposed in case a consumer wants to build their own dedupe. */
  consumedDefinitionIds: Set<string>;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s.length ? s : undefined;
}

/**
 * Extracts a plain-text reading of a value regardless of its concrete kind.
 * Real-world exports are inconsistent about this: some tools store
 * "ForeignCreatedBy"/"ForeignID" as STRING, others (DOORS in particular)
 * store them as XHTML — same semantic role, different datatype.
 */
function textFromValue(value: AttributeValue): string | undefined {
  switch (value.kind) {
    case "STRING":
    case "DATE":
    case "INTEGER":
    case "REAL":
      return asString(value.value);
    case "XHTML":
      return value.value ? asString(xhtmlToPlainText(value.value)) : undefined;
    default:
      return undefined;
  }
}

export function extractLifecycleInfo(obj: SpecObject, index: ReqIfIndex): LifecycleInfo {
  const info: LifecycleInfo = { consumedDefinitionIds: new Set() };

  for (const value of obj.values) {
    const def = index.attributeDefinitions.get(value.definitionRef);
    if (!def?.longName) continue;
    const key = normalizeKey(def.longName);

    let matched = false;
    if (FOREIGN_ID_KEYS.has(key)) {
      const text = textFromValue(value);
      if (text !== undefined) {
        info.foreignId = text;
        matched = true;
      }
    } else if (CREATED_BY_KEYS.has(key)) {
      const text = textFromValue(value);
      if (text !== undefined) {
        info.createdBy = text;
        matched = true;
      }
    } else if (CREATED_ON_KEYS.has(key)) {
      const text = textFromValue(value);
      if (text !== undefined) {
        info.createdOn = text;
        matched = true;
      }
    } else if (MODIFIED_BY_KEYS.has(key)) {
      const text = textFromValue(value);
      if (text !== undefined) {
        info.modifiedBy = text;
        matched = true;
      }
    } else if (MODIFIED_ON_KEYS.has(key)) {
      const text = textFromValue(value);
      if (text !== undefined) {
        info.modifiedOn = text;
        matched = true;
      }
    }
    if (matched) info.consumedDefinitionIds.add(def.identifier);
  }

  return info;
}
