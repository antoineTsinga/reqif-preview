import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadReqIfPackage, renderPackageToHtml, ReqIfIndex } from "../src/index.js";

const fixturePath = join(__dirname, "sample1.reqif");

describe("real-world DOORS export", () => {
  it("parses header metadata", async () => {
    const xml = readFileSync(fixturePath, "utf-8");
    const pkg = await loadReqIfPackage(xml);
    const { header } = pkg.document;
    expect(header.sourceToolId).toBe("IBM Rational DOORS");
    expect(header.reqIfVersion).toBe("1.0");
    expect(header.title).toContain("DOORS");
  });

  it("parses spec object types, spec objects and the hierarchy", async () => {
    const xml = readFileSync(fixturePath, "utf-8");
    const pkg = await loadReqIfPackage(xml);
    const { coreContent } = pkg.document;
    expect(coreContent.specObjects.length).toBeGreaterThan(0);
    expect(coreContent.specifications.length).toBe(1);

    const index = new ReqIfIndex(pkg.document);
    const spec = coreContent.specifications[0];
    expect(spec.children.length).toBeGreaterThan(0);
    const firstNode = spec.children[0];
    const obj = index.specObjects.get(firstNode.objectRef);
    expect(obj).toBeDefined();
    expect(obj!.longName).toBe("Requirement-1");

    // Cross-check: the enumeration attribute value resolves to a real EnumValue.
    const enumValue = obj!.values.find((v) => v.kind === "ENUMERATION");
    expect(enumValue).toBeDefined();
    if (enumValue?.kind === "ENUMERATION") {
      const labels = index.enumLabels(enumValue.valueRefs);
      expect(labels.length).toBe(1);
      expect(labels[0]).not.toBe(enumValue.valueRefs[0]); // resolved to a real long name, not the raw id
    }
  });

  it("renders to HTML without throwing and includes the requirement text", async () => {
    const xml = readFileSync(fixturePath, "utf-8");
    const pkg = await loadReqIfPackage(xml);
    const html = await renderPackageToHtml(pkg);
    expect(html).toContain("Requirement-1");
    expect(html).toContain("reqif-preview");
  });
});
