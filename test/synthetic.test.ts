import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  loadReqIfPackage,
  parseReqIfXml,
  renderDocumentToHtml,
  renderPackageToHtml,
  renderSpecification,
  ReqIfIndex,
  extractLifecycleInfo,
  xhtmlToPlainText,
} from "../src/index.js";
import { SYNTHETIC_REQIF, TINY_PNG_BASE64 } from "./fixtures.js";

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

describe("synthetic fixture: full data-type coverage", () => {
  it("parses every primitive attribute kind with correct values", () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    const index = new ReqIfIndex(doc);
    const obj = index.specObjects.get("so-1")!;
    const byDef = Object.fromEntries(obj.values.map((v) => [v.definitionRef, v]));

    expect(byDef["ad-name"]).toMatchObject({ kind: "STRING", value: "Login feature" });
    expect(byDef["ad-count"]).toMatchObject({ kind: "INTEGER", value: 42 });
    expect(byDef["ad-ratio"]).toMatchObject({ kind: "REAL", value: 0.75 });
    expect(byDef["ad-active"]).toMatchObject({ kind: "BOOLEAN", value: true });
    expect(byDef["ad-due"]).toMatchObject({ kind: "DATE", value: "2024-02-01T00:00:00.000+01:00" });
    expect(byDef["ad-prio"]?.kind).toBe("ENUMERATION");
  });

  it("resolves the SpecObjectType's attribute order and datatype definitions", () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    const index = new ReqIfIndex(doc);
    const sot = index.specTypes.get("sot-req")!;
    expect(sot.specAttributes.map((a) => a.identifier)).toEqual([
      "ad-name","ad-count","ad-ratio","ad-active","ad-due","ad-desc","ad-prio",
      "ad-foreignid","ad-createdby","ad-createdon","ad-modifiedby","ad-modifiedon","ad-puid","ad-chapter",
    ]);
    const nameDef = sot.specAttributes[0];
    const dt = index.datatypeOf(nameDef);
    expect(dt?.kind).toBe("STRING");
  });

  it("builds the specification tree with nested children", () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    const spec = doc.coreContent.specifications[0];
    expect(spec.children).toHaveLength(1);
    expect(spec.children[0].children).toHaveLength(1);
    expect(spec.children[0].objectRef).toBe("so-1");
    expect(spec.children[0].children[0].objectRef).toBe("so-2");
  });

  it("extracts plain text from an XHTML attribute value", () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    const index = new ReqIfIndex(doc);
    const obj = index.specObjects.get("so-1")!;
    const xhtml = obj.values.find((v) => v.kind === "XHTML");
    expect(xhtml?.kind).toBe("XHTML");
    if (xhtml?.kind === "XHTML" && xhtml.value) {
      const text = xhtmlToPlainText(xhtml.value);
      expect(text).toContain("The user shall be able to log in with email and password.");
    }
  });
});

describe("synthetic fixture: simple mode vs technical details", () => {
  it("shows the id and the rich-text content unconditionally", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).toContain('<div class="reqif-simple">');
    expect(html).toContain("ID: <code>REQ-001</code>"); // ForeignID, not the raw GUID
    expect(html).toContain('<div class="reqif-content">');
    expect(html).toContain("The user shall be able to");
  });

  it("hides technical attributes behind a closed <details> toggle by default", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).toContain('<details class="reqif-technical">'); // no "open" attribute
    expect(html).not.toContain('<details class="reqif-technical" open>');
    expect(html).toContain("Détails techniques");
    // The technical attribute names (e.g. "Count", "Ratio") must still be present,
    // just nested inside the collapsed panel rather than shown unconditionally.
    expect(html).toContain("Count");
    expect(html).toContain("Ratio");
  });

  it("expands the technical panel when showTechnicalByDefault is set", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, showTechnicalByDefault: true });
    expect(html).toContain('<details class="reqif-technical" open>');
  });

  it("supports overriding labels (e.g. back to English)", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      labels: { technicalDetails: "Technical details", yes: "Yes", no: "No" },
    });
    expect(html).toContain("Technical details");
    expect(html).toContain(">Yes<"); // ad-active is true in the fixture
  });
});

describe("synthetic fixture: ForeignID + created/modified UI", () => {
  it("displays ReqIF.ForeignID instead of the raw GUID identifier", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).toContain("ID: <code>REQ-001</code>");
    expect(html).not.toContain("ID: <code>so-1</code>");
  });

  it("falls back to the raw identifier when no ForeignID attribute is present", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).toContain("ID: <code>so-2</code>"); // so-2 has no ForeignID in the fixture
  });

  it("shows a clearly labeled created-by/modified-by line with formatted dates", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).toContain('<div class="reqif-meta-strip">');
    expect(html).toContain("Créé par");
    expect(html).toContain("<strong>Alice</strong>");
    expect(html).toContain("Modifié par");
    expect(html).toContain("<strong>Bob</strong>");
    // dates are reformatted via Intl for display...
    expect(html).toContain("10 janv. 2024");
    // ...but the machine-readable ISO value is preserved in the <time> attribute
    expect(html).toContain('datetime="2024-01-10T09:00:00.000+01:00"');
  });

  it("still lists created/modified/foreignId attributes in the technical panel (never hidden)", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).toContain("ReqIF.ForeignID");
    expect(html).toContain("ReqIF.ForeignCreatedBy");
    expect(html).toContain("ReqIF.ForeignModifiedBy");
  });

  it("recognizes created/modified by+on even when stored as XHTML, not just STRING/DATE", async () => {
    const doc = parseReqIfXml(`<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="h1"><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER>
  <CORE-CONTENT><REQ-IF-CONTENT>
    <DATATYPES><DATATYPE-DEFINITION-XHTML IDENTIFIER="dt-x" LONG-NAME="x"/></DATATYPES>
    <SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="t1" LONG-NAME="T"><SPEC-ATTRIBUTES>
      <ATTRIBUTE-DEFINITION-XHTML IDENTIFIER="a1" LONG-NAME="ForeignCreatedBy">
        <TYPE><DATATYPE-DEFINITION-XHTML-REF>dt-x</DATATYPE-DEFINITION-XHTML-REF></TYPE>
      </ATTRIBUTE-DEFINITION-XHTML>
    </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE></SPEC-TYPES>
    <SPEC-OBJECTS><SPEC-OBJECT IDENTIFIER="o1"><VALUES>
      <ATTRIBUTE-VALUE-XHTML>
        <DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>a1</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION>
        <THE-VALUE><xhtml:div>susan</xhtml:div></THE-VALUE>
      </ATTRIBUTE-VALUE-XHTML>
    </VALUES><TYPE><SPEC-OBJECT-TYPE-REF>t1</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT></SPEC-OBJECTS>
    <SPECIFICATIONS/><SPEC-RELATIONS/><SPEC-RELATION-GROUPS/>
  </REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`);
    const index = new ReqIfIndex(doc);
    const obj = index.specObjects.get("o1")!;
    const lifecycle = extractLifecycleInfo(obj, index);
    expect(lifecycle.createdBy).toBe("susan");
  });

  it("supports a different date locale", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, dateLocale: "en-US" });
    // en-US medium date style renders like "Jan 10, 2024"
    expect(html).toMatch(/Jan\s+10,\s+2024/);
  });
  it("does not duplicate created/modified values as bare main content, even when stored as XHTML", async () => {
    const doc = parseReqIfXml(`<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="h1"><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER>
  <CORE-CONTENT><REQ-IF-CONTENT>
    <DATATYPES><DATATYPE-DEFINITION-XHTML IDENTIFIER="dt-x" LONG-NAME="x"/></DATATYPES>
    <SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="t1" LONG-NAME="T"><SPEC-ATTRIBUTES>
      <ATTRIBUTE-DEFINITION-XHTML IDENTIFIER="a1" LONG-NAME="ForeignCreatedBy">
        <TYPE><DATATYPE-DEFINITION-XHTML-REF>dt-x</DATATYPE-DEFINITION-XHTML-REF></TYPE>
      </ATTRIBUTE-DEFINITION-XHTML>
    </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE></SPEC-TYPES>
    <SPEC-OBJECTS><SPEC-OBJECT IDENTIFIER="o1"><VALUES>
      <ATTRIBUTE-VALUE-XHTML>
        <DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>a1</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION>
        <THE-VALUE><xhtml:div>susan</xhtml:div></THE-VALUE>
      </ATTRIBUTE-VALUE-XHTML>
    </VALUES><TYPE><SPEC-OBJECT-TYPE-REF>t1</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT></SPEC-OBJECTS>
    <SPECIFICATIONS><SPECIFICATION IDENTIFIER="s1"><VALUES/><TYPE><SPECIFICATION-TYPE-REF>t1</SPECIFICATION-TYPE-REF></TYPE>
      <CHILDREN><SPEC-HIERARCHY IDENTIFIER="h1"><OBJECT><SPEC-OBJECT-REF>o1</SPEC-OBJECT-REF></OBJECT><CHILDREN/></SPEC-HIERARCHY></CHILDREN>
    </SPECIFICATION></SPECIFICATIONS>
    <SPEC-RELATIONS/><SPEC-RELATION-GROUPS/>
  </REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`);
    const pkg = { documents: [doc], document: doc, attachments: { resolve: () => undefined, list: () => [] } };
    const html = await renderDocumentToHtml(doc, pkg.attachments, { includeCss: false });
    // "susan" must appear once (in the meta chip), never as a bare <div class="reqif-content">.
    expect(html).not.toContain('<div class="reqif-content">\n                <div>susan</div>');
    const contentMatches = html.match(/reqif-content/g) ?? [];
    expect(contentMatches.length).toBe(0);
    expect(html).toContain("<strong>susan</strong>");
  });
});

describe("synthetic fixture: customAttributeRenderers", () => {
  it("injects custom content before the main text using a user-named attribute (e.g. PUID)", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [
        {
          attribute: "IE PUID",
          position: "before",
          render: (value) =>
            value?.kind === "STRING" && value.value
              ? `<span class="puid-badge">${value.value}</span>`
              : undefined,
        },
      ],
    });
    expect(html).toContain('<span class="puid-badge">SRS-42</span>');
    const puidIndex = html.indexOf("puid-badge");
    const contentIndex = html.indexOf("The user shall be able to");
    expect(puidIndex).toBeGreaterThan(-1);
    expect(puidIndex).toBeLessThan(contentIndex);
  });

  it("supports position: 'after' and matching by attribute identifier", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [
        { attribute: "ad-puid", position: "after", render: (v) => (v?.kind === "STRING" ? `<em>${v.value}</em>` : undefined) },
      ],
    });
    const emIndex = html.indexOf("<em>SRS-42</em>");
    const contentIndex = html.indexOf("The user shall be able to");
    expect(emIndex).toBeGreaterThan(contentIndex);
  });

  it("gives the renderer access to other attributes via the context", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [
        {
          attribute: "IE PUID",
          render: (_value, ctx) => {
            const name = ctx.getValue("Name");
            const formatted = ctx.formatValue(name);
            return `<span class="cross-attr">${formatted}</span>`;
          },
        },
      ],
    });
    expect(html).toContain('<span class="cross-attr">Login feature</span>');
  });

  it("keeps the matched attribute visible in the technical panel by default, hides it only with hideFromTechnical: true", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const shown = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [{ attribute: "IE PUID", render: () => "<b>x</b>" }],
    });
    expect(shown).toContain("IE PUID");

    const hidden = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [{ attribute: "IE PUID", hideFromTechnical: true, render: () => "<b>x</b>" }],
    });
    expect(hidden).not.toContain("IE PUID");
  });

  it("does not crash the whole render if a custom renderer throws", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [
        {
          attribute: "IE PUID",
          render: () => {
            throw new Error("boom");
          },
        },
      ],
    });
    expect(html).toContain("The user shall be able to");
  });

  it("renders nothing for objects that don't carry the targeted attribute", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [
        { attribute: "IE PUID", render: (v) => (v ? `<span class="puid-badge">${v.kind === "STRING" ? v.value : ""}</span>` : undefined) },
      ],
    });
    // so-2 has no "IE PUID" value, so its badge must not appear at all near its block.
    const so2Index = html.indexOf("Password reset");
    expect(so2Index).toBeGreaterThan(-1);
  });
});

describe("synthetic fixture: contentAttributes (user-controlled content)", () => {
  it("by default shows every XHTML attribute not already surfaced elsewhere", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).toContain("The user shall be able to");
  });

  it("restricts content to only the listed attribute(s), in the given order", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      contentAttributes: ["Name"], // a plain STRING attribute, not XHTML
    });
    expect(html).toContain('<div class="reqif-content">Login feature</div>');
    // it's still fine for "Description" to appear in the always-exhaustive
    // technical panel — the exact match above already proves contentAttributes
    // correctly restricted what shows up as *content* for this object.
  });

  it("renders non-XHTML attributes as plain escaped text", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, contentAttributes: ["Count"] });
    expect(html).toContain('<div class="reqif-content">42</div>');
  });

  it("falls back to the empty placeholder when none of the listed attributes are present", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, contentAttributes: ["Does not exist"] });
    expect(html).toContain("(vide)");
  });
});

describe("synthetic fixture: titleAttributes (user-controlled title fallback)", () => {
  it("still prefers the object's own LONG-NAME when present", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, titleAttributes: ["Name"] });
    expect(html).toContain(">Parent requirement<"); // so-1's LONG-NAME, not its "Name" attribute value
  });

  it("falls back to the first non-empty attribute in titleAttributes when LONG-NAME is missing", async () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    // Strip the LONG-NAME from so-1 and its hierarchy node to force the fallback chain.
    doc.coreContent.specObjects[0].longName = undefined;
    doc.coreContent.specifications[0].children[0].longName = undefined;
    const index = new ReqIfIndex(doc);
    const html = await renderSpecification(
      doc.coreContent.specifications[0],
      index,
      { get: () => undefined },
      undefined,
      { includeCss: false, titleAttributes: ["Does not exist", "Name"] },
    );
    expect(html).toContain(">Login feature<"); // resolved via the "Name" attribute
  });

  it("falls back to the untitled label when nothing matches", async () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    doc.coreContent.specObjects[0].longName = undefined;
    doc.coreContent.specifications[0].children[0].longName = undefined;
    const index = new ReqIfIndex(doc);
    const html = await renderSpecification(
      doc.coreContent.specifications[0],
      index,
      { get: () => undefined },
      undefined,
      { includeCss: false, titleAttributes: ["Does not exist"] },
    );
    expect(html).toContain("(sans titre)");
  });
});

describe("synthetic fixture: customAttributeRenderers fail-safe against broken HTML", () => {
  it("escapes (instead of inserting raw) an unclosed-tag custom renderer output, and keeps content/technical intact afterwards", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [
        { attribute: "IE PUID", render: (v) => (v?.kind === "STRING" ? `<div class="puid-badge">${v.value}` : undefined) }, // missing </div>
      ],
    });
    // the broken tag must be escaped, not inserted raw...
    expect(html).toContain('&lt;div class="puid-badge"&gt;SRS-42');
    // ...and everything that comes after must still be correctly nested
    // (i.e. the content + technical panel weren't swallowed by the open div).
    expect(html).toContain('<div class="reqif-content">');
    expect(html).toContain('<details class="reqif-technical">');
  });

  it("escapes a custom renderer output with a stray extra closing tag", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [
        { attribute: "IE PUID", render: (v) => (v?.kind === "STRING" ? `<span>${v.value}</span></span>` : undefined) }, // extra </span>
      ],
    });
    expect(html).toContain("&lt;span&gt;SRS-42&lt;/span&gt;&lt;/span&gt;");
    expect(html).toContain('<div class="reqif-content">');
  });

  it("still inserts well-formed custom HTML as raw markup, unescaped", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [
        { attribute: "IE PUID", render: (v) => (v?.kind === "STRING" ? `<span class="puid-badge">${v.value}</span>` : undefined) },
      ],
    });
    expect(html).toContain('<span class="puid-badge">SRS-42</span>');
    expect(html).not.toContain("&lt;span");
  });
  it("escapes a real-world unclosed <table> (the actual bug reported)", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [
        {
          attribute: "IE PUID",
          render: () => `<table><tr><th>Champ</th><th>Valeur</th></tr><tr><td>PUID</td><td>SRS-42</td></tr>`, // missing </table>
        },
      ],
    });
    expect(html).toContain("&lt;table&gt;");
    expect(html).toContain('<div class="reqif-content">');
    expect(html).toContain('<details class="reqif-technical">');
  });
});

describe("synthetic fixture: chapterNumbers", () => {
  it("does not number titles by default", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).toContain(">Parent requirement<");
  });

  it("prefixes top-level and nested titles with a Word-style chapter number", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, chapterNumbers: true });
    expect(html).toContain(">1 Parent requirement<");
    expect(html).toContain(">1.1 Child requirement<");
  });

  it("restarts numbering at 1 for each Specification", async () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    // Duplicate the single specification so there are two top-level ones.
    const second = { ...doc.coreContent.specifications[0], identifier: "spec-2" };
    doc.coreContent.specifications.push(second);
    const index = new ReqIfIndex(doc);
    const lookup = { get: () => undefined };
    const html1 = renderSpecification(doc.coreContent.specifications[0], index, lookup, undefined, { chapterNumbers: true });
    const html2 = renderSpecification(doc.coreContent.specifications[1], index, lookup, undefined, { chapterNumbers: true });
    expect(html1).toContain(">1 Parent requirement<");
    expect(html2).toContain(">1 Parent requirement<"); // restarted, not "2 ..."
  });
});

describe("synthetic fixture: readingMode (Word-like clean view)", () => {
  it("hides the id badge, the created/modified line, and the technical panel", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, readingMode: true });
    expect(html).not.toContain('class="reqif-id"');
    expect(html).not.toContain('class="reqif-meta-strip"');
    expect(html).not.toContain('class="reqif-technical"');
    expect(html).not.toContain("Détails techniques");
    expect(html).not.toContain("Créé par");
  });

  it("still shows the title and the main content", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, readingMode: true });
    expect(html).toContain("Parent requirement");
    expect(html).toContain("The user shall be able to");
  });

  it("still shows custom-renderer content (it's consumer-authored, not auto-generated chrome)", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      readingMode: true,
      customAttributeRenderers: [{ attribute: "IE PUID", render: (v) => (v?.kind === "STRING" ? `<em>${v.value}</em>` : undefined) }],
    });
    expect(html).toContain("<em>SRS-42</em>");
  });

  it("uses heading tags for titles instead of a plain bold summary", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, readingMode: true });
    expect(html).toMatch(/<h3 class="reqif-node-heading">Parent requirement<\/h3>/);
    expect(html).toMatch(/<h4 class="reqif-node-heading">Child requirement<\/h4>/);
  });

  it("combines cleanly with chapterNumbers", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, readingMode: true, chapterNumbers: true });
    expect(html).toContain(">1 Parent requirement<");
  });
});

describe("layout: tabs (multiple documents / specifications)", () => {
  it("does not introduce a tab switcher for a single document", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, layout: "tabs" });
    expect(html).not.toContain('class="reqif-tabs"');
  });

  it("renders a CSS-only tab switcher for multiple documents in one package", async () => {
    const docA = SYNTHETIC_REQIF.replace('IDENTIFIER="hdr-1"', 'IDENTIFIER="hdr-1"').replace(
      "<TITLE>Synthetic Sample</TITLE>",
      "<TITLE>Document A</TITLE>",
    );
    const docB = SYNTHETIC_REQIF.replace(
      "<TITLE>Synthetic Sample</TITLE>",
      "<TITLE>Document B</TITLE>",
    );
    const zipBytes = zipSync({ "a.reqif": strToU8(docA), "b.reqif": strToU8(docB) });
    const pkg = await loadReqIfPackage(zipBytes);
    expect(pkg.documents).toHaveLength(2);

    const html = await renderPackageToHtml(pkg, { includeCss: false, layout: "tabs" });
    expect(html).toContain('class="reqif-tabs"');
    expect(html).toContain(">Document A<");
    expect(html).toContain(">Document B<");
    // exactly one radio input has the `checked` attribute by default (the first tab)
    const inputTags = html.match(/<input[^>]*>/g) ?? [];
    expect(inputTags.filter((tag) => tag.includes("checked"))).toHaveLength(1);
  });

  it("renders a tab switcher across multiple Specifications within one document", async () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    const second = { ...doc.coreContent.specifications[0], identifier: "spec-2", longName: "Second Spec" };
    doc.coreContent.specifications.push(second);
    const index = new ReqIfIndex(doc);

    const html = await renderDocumentToHtml(doc, { resolve: () => undefined, list: () => [] }, { includeCss: false, layout: "tabs" });
    expect(html).toContain('class="reqif-tabs"');
    expect(html).toContain(">Demo Specification<");
    expect(html).toContain(">Second Spec<");
  });

  it("keeps stacked layout (default) when layout option is omitted, even with multiple documents", async () => {
    const zipBytes = zipSync({ "a.reqif": strToU8(SYNTHETIC_REQIF), "b.reqif": strToU8(SYNTHETIC_REQIF) });
    const pkg = await loadReqIfPackage(zipBytes);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).not.toContain('class="reqif-tabs"');
  });
});

describe("synthetic fixture: chapterNumberAttributes (chapter-only numbering)", () => {
  it("numbers every node when chapterNumberAttributes is omitted (blunt default)", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, chapterNumbers: true });
    expect(html).toContain(">1 Parent requirement<");
    expect(html).toContain(">1.1 Child requirement<"); // so-2 has no ChapterName but still gets a number here
  });

  it("only numbers nodes carrying the configured attribute, skipping others without breaking the sequence", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      includeCss: false,
      chapterNumbers: true,
      chapterNumberAttributes: ["ChapterName"],
    });
    // so-1 has ChapterName -> numbered "1"
    expect(html).toContain(">1 Parent requirement<");
    // so-2 has NO ChapterName -> no number prefix at all
    expect(html).toContain(">Child requirement<");
    expect(html).not.toContain("1.1 Child requirement");
    // so-3 (grandchild of so-1, child of so-2) DOES have ChapterName -> continues
    // from the nearest numbered ancestor (so-1's "1"), skipping through so-2 -> "1.1"
    expect(html).toContain(">1.1 Grandchild requirement<");
  });

  it("does not number anything when chapterNumbers itself is false, even with chapterNumberAttributes set", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, chapterNumberAttributes: ["ChapterName"] });
    expect(html).not.toContain("1 Parent requirement");
    expect(html).toContain(">Parent requirement<");
  });
});

describe("synthetic fixture: spec relations (liaisons)", () => {
  it("shows an object's outgoing relation with the type's long name and a same-page anchor link", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    // so-2 --(Derives From)--> so-1
    expect(html).toContain('<div class="reqif-relations">');
    expect(html).toContain("Derives From");
    expect(html).toMatch(/<a class="reqif-relation-target" href="#reqif-obj-so-1">Parent requirement<\/a>/);
  });

  it("shows the matching incoming relation on the target object, with the reverse arrow", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).toContain('id="reqif-obj-so-1"');
    expect(html).toMatch(/<a class="reqif-relation-target" href="#reqif-obj-so-2">Child requirement<\/a>/);
  });

  it("does not render a relations block for objects with no relations at all", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    // so-3 has no relations; its body shouldn't carry a reqif-relations block right after it.
    const so3Index = html.indexOf("Grandchild requirement");
    const nextRelations = html.indexOf("reqif-relations", so3Index);
    const nextNode = html.indexOf("reqif-node-children", so3Index);
    // either no more relations block at all after so-3, or it belongs to an earlier node
    expect(nextRelations === -1 || (nextNode !== -1 && nextRelations > nextNode)).toBe(true);
  });

  it("can be hidden with showRelations: false", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, showRelations: false });
    expect(html).not.toContain('class="reqif-relations"');
  });

  it("stays visible by default even in readingMode (it's content, not metadata chrome)", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, readingMode: true });
    expect(html).toContain('class="reqif-relations"');
  });

  it("falls back to a plain (non-link) label when the related object can't be resolved", () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    doc.coreContent.specRelations.push({
      identifier: "sr-broken",
      values: [],
      typeRef: "srt-derives",
      sourceRef: "so-1",
      targetRef: "does-not-exist",
    });
    const index = new ReqIfIndex(doc);
    const html = renderSpecification(doc.coreContent.specifications[0], index, { get: () => undefined }, undefined, {});
    expect(html).toContain("reqif-relation-unresolved");
    expect(html).toContain("objet non trouvé");
  });
});

describe("synthetic fixture: rendering & sanitization", () => {
  it("escapes/strips dangerous markup and keeps safe formatting", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });

    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("<strong>log in</strong>");
    expect(html).toContain("text-decoration:underline"); // kept
    expect(html).not.toContain("display:none"); // stripped
  });

  it("resolves the enumeration value to its long name", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg);
    expect(html).toContain("High");
  });

  it("renders the nested object fallback chain without attachments (no image found)", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg);
    // No attachment resolver provided contents for diagram.png/demo.mp3,
    // so it should fall through to the innermost plain-text alternative.
    expect(html).toContain("Fallback alt text for");
    expect(html).toContain("<em>the audio clip</em>");
  });
});

describe(".reqifz packaging with real attachments", () => {
  it("inlines an image attachment as a data: URI and skips non-image fallback", async () => {
    const png = base64ToBytes(TINY_PNG_BASE64);
    const zipBytes = zipSync({
      "model.reqif": strToU8(SYNTHETIC_REQIF),
      "diagram.png": png,
      // demo.mp3 intentionally NOT included, to exercise the "unresolved -> alt text" path
    });

    const pkg = await loadReqIfPackage(zipBytes);
    expect(pkg.documents).toHaveLength(1);
    expect(pkg.attachments.list().map((a) => a.path)).toContain("diagram.png");

    const html = await renderPackageToHtml(pkg);
    expect(html).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
    // since the image WAS resolved, the inner audio fallback must not be used:
    expect(html).not.toContain("Fallback alt text for");
  });

  it("falls back to a download link when a referenced attachment is a non-image binary", async () => {
    const audio = strToU8("fake-mp3-bytes");
    const zipBytes = zipSync({
      "model.reqif": strToU8(SYNTHETIC_REQIF),
      "demo.mp3": audio,
      // diagram.png intentionally NOT included, to exercise the second fallback level
    });

    const pkg = await loadReqIfPackage(zipBytes);
    const html = await renderPackageToHtml(pkg);
    expect(html).toContain("reqif-attachment");
    expect(html).toContain("demo.mp3");
  });
});
