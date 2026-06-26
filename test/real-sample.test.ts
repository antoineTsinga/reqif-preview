import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { loadReqIfPackage, parseReqIfXml, renderPackageToHtml, ReqIfIndex } from "../src/index.js";

const fixturePath = join(__dirname, "sample1.reqif");

describe("deeply nested documents (fast-xml-parser maxNestedTags)", () => {
  function buildDeepXhtml(depth: number): string {
    let open = "";
    let close = "";
    for (let i = 0; i < depth; i++) {
      open += "<xhtml:div>";
      close = "</xhtml:div>" + close;
    }
    return open + "deeply nested text" + close;
  }

  function docWithDeepXhtml(depth: number): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="h1"><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER>
  <CORE-CONTENT><REQ-IF-CONTENT>
    <DATATYPES><DATATYPE-DEFINITION-XHTML IDENTIFIER="dt-x" LONG-NAME="x"/></DATATYPES>
    <SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="t1" LONG-NAME="T"><SPEC-ATTRIBUTES>
      <ATTRIBUTE-DEFINITION-XHTML IDENTIFIER="a1" LONG-NAME="Text"><TYPE><DATATYPE-DEFINITION-XHTML-REF>dt-x</DATATYPE-DEFINITION-XHTML-REF></TYPE></ATTRIBUTE-DEFINITION-XHTML>
    </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE></SPEC-TYPES>
    <SPEC-OBJECTS><SPEC-OBJECT IDENTIFIER="o1"><VALUES>
      <ATTRIBUTE-VALUE-XHTML><DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>a1</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION>
        <THE-VALUE>${buildDeepXhtml(depth)}</THE-VALUE>
      </ATTRIBUTE-VALUE-XHTML>
    </VALUES><TYPE><SPEC-OBJECT-TYPE-REF>t1</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT></SPEC-OBJECTS>
    <SPECIFICATIONS/><SPEC-RELATIONS/><SPEC-RELATION-GROUPS/>
  </REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`;
  }

  it("parses content nested past fast-xml-parser's old default limit of 100", () => {
    const doc = parseReqIfXml(docWithDeepXhtml(150));
    expect(doc.coreContent.specObjects).toHaveLength(1);
  });

  it("still respects an explicit, lower maxNestedTags when the caller wants tighter protection", () => {
    expect(() => parseReqIfXml(docWithDeepXhtml(150), { maxNestedTags: 50 })).toThrow();
  });

  it("loadReqIfPackage forwards maxNestedTags too", async () => {
    const pkg = await loadReqIfPackage(docWithDeepXhtml(150));
    expect(pkg.document.coreContent.specObjects).toHaveLength(1);
  });
});

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
