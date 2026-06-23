import { normalizeKey } from "./attribute-lookup.js";
import { ReqIfIndex } from "./lookup.js";
import type { SpecObject } from "./types.js";

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
  /** Identifiers of the AttributeDefinitions consumed above — exclude these
   * from a generic "all attributes" dump to avoid showing the same name/date
   * twice with no context about which is which. */
  consumedDefinitionIds: Set<string>;
}

function asString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s.length ? s : undefined;
}

export function extractLifecycleInfo(obj: SpecObject, index: ReqIfIndex): LifecycleInfo {
  const info: LifecycleInfo = { consumedDefinitionIds: new Set() };

  for (const value of obj.values) {
    const def = index.attributeDefinitions.get(value.definitionRef);
    if (!def?.longName) continue;
    const key = normalizeKey(def.longName);

    let matched = false;
    if (FOREIGN_ID_KEYS.has(key) && (value.kind === "STRING" || value.kind === "INTEGER")) {
      info.foreignId = asString(value.value);
      matched = true;
    } else if (CREATED_BY_KEYS.has(key) && value.kind === "STRING") {
      info.createdBy = asString(value.value);
      matched = true;
    } else if (CREATED_ON_KEYS.has(key) && value.kind === "DATE") {
      info.createdOn = asString(value.value);
      matched = true;
    } else if (MODIFIED_BY_KEYS.has(key) && value.kind === "STRING") {
      info.modifiedBy = asString(value.value);
      matched = true;
    } else if (MODIFIED_ON_KEYS.has(key) && value.kind === "DATE") {
      info.modifiedOn = asString(value.value);
      matched = true;
    }
    if (matched) info.consumedDefinitionIds.add(def.identifier);
  }

  return info;
}
