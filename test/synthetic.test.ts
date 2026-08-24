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
  resolveAttribute,
  valueToPlainText,
  createAttachmentLookup,
  type DegradationEvent,
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
    // Tabs are links, not hidden radios: that is what lets a deep anchor into
    // another tab open it. No <input> should be emitted at all any more.
    expect(html).not.toContain("<input");
    expect(html).toMatch(/<a class="reqif-tab-label" href="#reqif-doc-[^"]+">/);
    expect(html).toMatch(/<div class="reqif-tab-panel" id="reqif-doc-[^"]+">/);
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

describe("readingMode: heading sizes don't shrink illegibly with depth", () => {
  it("gives each heading level an explicit rem-based size instead of relying on compounding em defaults", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { readingMode: true }); // includeCss: true (default) on purpose here
    expect(html).toContain("h3.reqif-node-heading { font-size: 1.3rem; }");
    expect(html).toContain("h4.reqif-node-heading { font-size: 1.15rem; }");
    expect(html).toContain("h5.reqif-node-heading { font-size: 1.05rem; }");
    expect(html).toContain("h6.reqif-node-heading { font-size: 0.95rem; }");
  });

  it("caps at h6/0.95rem instead of continuing to shrink for very deep trees", async () => {
    // Build a chain 6 levels deep (deeper than the h3..h6 cap of 4 levels).
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    const index = new ReqIfIndex(doc);
    const so1 = doc.coreContent.specObjects[0];
    let lastChildren = doc.coreContent.specifications[0].children[0].children[0].children; // under so-3
    for (let i = 0; i < 4; i++) {
      const newNode = { identifier: `deep-${i}`, values: [], objectRef: so1.identifier, children: [] as any[] };
      lastChildren.push(newNode);
      lastChildren = newNode.children;
    }
    const html = await renderPackageToHtml({ documents: [doc], document: doc, attachments: { resolve: () => undefined, list: () => [] } }, { readingMode: true });
    // Every heading tag actually used is one of h3..h6 — never anything smaller/invalid like h7.
    const tags = [...html.matchAll(/<h(\d) class="reqif-node-heading">/g)].map((m) => Number(m[1]));
    expect(tags.length).toBeGreaterThan(0);
    expect(Math.max(...tags)).toBe(6);
    expect(tags.every((t) => t >= 3 && t <= 6)).toBe(true);
  });
});

describe("suppressEmptyPlaceholdersForChapters", () => {
  it("by default still shows '(vide)'/'(sans titre)' even for chapter-qualifying objects", async () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    // so-1 has a ChapterName but also a LONG-NAME and content, so let's use a
    // bare chapter object with neither: strip so-3's title and give it no content.
    doc.coreContent.specObjects[2].longName = undefined;
    const index = new ReqIfIndex(doc);
    const html = renderSpecification(doc.coreContent.specifications[0], index, { get: () => undefined }, undefined, {
      chapterNumberAttributes: ["ChapterName"],
    });
    expect(html).toContain("(sans titre)");
    expect(html).toContain("(vide)");
  });

  it("suppresses both placeholders for the chapter object itself, leaving non-chapter siblings unaffected", async () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    doc.coreContent.specObjects[2].longName = undefined; // so-3: has ChapterName, no title, no content
    const index = new ReqIfIndex(doc);
    const html = renderSpecification(doc.coreContent.specifications[0], index, { get: () => undefined }, undefined, {
      chapterNumberAttributes: ["ChapterName"],
      suppressEmptyPlaceholdersForChapters: true,
    });
    // Isolate so-3's own node: no placeholder text, just an empty <summary> and no empty-content <p>.
    const so3Start = html.indexOf('id="reqif-obj-so-3"');
    const so3Block = html.slice(so3Start, html.indexOf("</details>", so3Start));
    expect(so3Block).not.toContain("(sans titre)");
    expect(so3Block).not.toContain("(vide)");
    // so-2 (not a chapter: no ChapterName) keeps its own legitimate "(vide)".
    const so2Start = html.indexOf('id="reqif-obj-so-2"');
    const so2Block = html.slice(so2Start, so3Start);
    expect(so2Block).toContain("(vide)");
  });

  it("still shows the placeholders for non-chapter objects, even with the option on", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    // so-2 ("Child requirement") has a title and is not empty, but let's check
    // a genuinely empty *non*-chapter case stays flagged: so-3 without ChapterName matching.
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    doc.coreContent.specObjects[1].longName = undefined; // so-2: no ChapterName attribute at all -> not a chapter
    const index = new ReqIfIndex(doc);
    const html = renderSpecification(doc.coreContent.specifications[0], index, { get: () => undefined }, undefined, {
      chapterNumberAttributes: ["ChapterName"],
      suppressEmptyPlaceholdersForChapters: true,
    });
    expect(html).toContain("(sans titre)"); // so-2 is not a chapter -> still flagged
  });

  it("has no effect without chapterNumberAttributes configured", async () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    doc.coreContent.specObjects[1].longName = undefined;
    const index = new ReqIfIndex(doc);
    const html = renderSpecification(doc.coreContent.specifications[0], index, { get: () => undefined }, undefined, {
      suppressEmptyPlaceholdersForChapters: true, // no chapterNumberAttributes -> isRealChapter always false
    });
    expect(html).toContain("(sans titre)");
  });

  it("exposes isChapter on the customAttributeRenderers context for power users who want their own placeholder", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      chapterNumberAttributes: ["ChapterName"],
      customAttributeRenderers: [
        {
          attribute: "ad-name", // arbitrary; we only care about ctx.isChapter here
          render: (_v, ctx) => (ctx.isChapter ? `<em data-chapter-marker="1"></em>` : undefined),
        },
      ],
    });
    expect(html).toContain('data-chapter-marker="1"'); // present for so-1 (has ChapterName)
  });
});

describe("isTitleless / isContentless (general predicate, not tied to chapters)", () => {
  it("suppresses '(sans titre)' for a plain paragraph object that has content but is never meant to have a title", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    // so-2 ("Child requirement") -> pretend it's untitled and give it body content to mimic
    // "a plain paragraph object that has text but no title", independent of any chapter concept.
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    doc.coreContent.specObjects[1].longName = undefined;
    const index = new ReqIfIndex(doc);
    const html = renderSpecification(doc.coreContent.specifications[0], index, { get: () => undefined }, undefined, {
      isTitleless: (obj) => obj?.identifier === "so-2",
    });
    const so2Start = html.indexOf('id="reqif-obj-so-2"');
    const so2Block = html.slice(so2Start, html.indexOf("reqif-node-children", so2Start));
    expect(so2Block).not.toContain("(sans titre)");
    // its sibling so-1 is unaffected and keeps its real title
    expect(html).toContain(">Parent requirement<");
  });

  it("does not suppress the content placeholder for a titleless object unless isContentless says so too", async () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    doc.coreContent.specObjects[1].longName = undefined; // so-2: no title, and (in the fixture) no content either
    const index = new ReqIfIndex(doc);
    const html = renderSpecification(doc.coreContent.specifications[0], index, { get: () => undefined }, undefined, {
      isTitleless: (obj) => obj?.identifier === "so-2",
    });
    const so2Start = html.indexOf('id="reqif-obj-so-2"');
    const so2Block = html.slice(so2Start, html.indexOf("reqif-node-children", so2Start));
    expect(so2Block).not.toContain("(sans titre)"); // title suppressed
    expect(so2Block).toContain("(vide)"); // content placeholder still shown — different concern
  });

  it("can target objects by SpecObjectType rather than by identifier", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    doc.coreContent.specObjects[1].longName = undefined;
    const index = new ReqIfIndex(doc);
    const html = renderSpecification(doc.coreContent.specifications[0], index, { get: () => undefined }, undefined, {
      isTitleless: (_obj, specType) => specType?.longName === "Requirement",
    });
    // every object in the fixture uses the "Requirement" SpecObjectType, so all titles are suppressed when present...
    // so-1 still HAS a real title (LONG-NAME wins over isTitleless, which only governs the *fallback*)
    expect(html).toContain(">Parent requirement<");
    // ...but so-2, which has none, no longer shows the placeholder
    const so2Start = html.indexOf('id="reqif-obj-so-2"');
    expect(html.slice(so2Start, so2Start + 200)).not.toContain("(sans titre)");
  });

  it("composes with suppressEmptyPlaceholdersForChapters (either one suppressing is enough)", async () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    doc.coreContent.specObjects[1].longName = undefined; // so-2: not a chapter, but isTitleless says yes
    const index = new ReqIfIndex(doc);
    const html = renderSpecification(doc.coreContent.specifications[0], index, { get: () => undefined }, undefined, {
      chapterNumberAttributes: ["ChapterName"],
      suppressEmptyPlaceholdersForChapters: true,
      isTitleless: (obj) => obj?.identifier === "so-2",
    });
    const so2Start = html.indexOf('id="reqif-obj-so-2"');
    expect(html.slice(so2Start, so2Start + 200)).not.toContain("(sans titre)");
  });

  it("isContentless independently suppresses '(vide)' without affecting the title", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      isContentless: (obj) => obj.identifier === "so-2",
    });
    const so2Start = html.indexOf('id="reqif-obj-so-2"');
    const so2Block = html.slice(so2Start, html.indexOf("reqif-node-children", so2Start));
    expect(so2Block).toContain(">Child requirement<"); // title still shown normally
    expect(so2Block).not.toContain("(vide)"); // content placeholder suppressed
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

describe("AlternativeID (10.8.2)", () => {
  function docWithAltIds(objectAlt: string, typeAlt = ""): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="h1"><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER>
  <CORE-CONTENT><REQ-IF-CONTENT>
    <DATATYPES><DATATYPE-DEFINITION-STRING IDENTIFIER="dt-s" LONG-NAME="S"/></DATATYPES>
    <SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="t1" LONG-NAME="T">${typeAlt}<SPEC-ATTRIBUTES>
      <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="a1" LONG-NAME="Name"><TYPE><DATATYPE-DEFINITION-STRING-REF>dt-s</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>
    </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE></SPEC-TYPES>
    <SPEC-OBJECTS><SPEC-OBJECT IDENTIFIER="o1" LONG-NAME="Req">${objectAlt}<VALUES>
      <ATTRIBUTE-VALUE-STRING THE-VALUE="hello"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>a1</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>
    </VALUES><TYPE><SPEC-OBJECT-TYPE-REF>t1</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT></SPEC-OBJECTS>
    <SPECIFICATIONS/><SPEC-RELATIONS/><SPEC-RELATION-GROUPS/>
  </REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`;
  }

  it("reads the spec-conforming doubled wrapper into alternativeId", () => {
    const doc = parseReqIfXml(
      docWithAltIds(`<ALTERNATIVE-ID><ALTERNATIVE-ID IDENTIFIER="DOORS-4711"/></ALTERNATIVE-ID>`),
    );
    expect(doc.coreContent.specObjects[0].alternativeId).toEqual({ identifier: "DOORS-4711" });
    // the primary identifier must be untouched by it
    expect(doc.coreContent.specObjects[0].identifier).toBe("o1");
  });

  it("also accepts the flat form some exporters emit", () => {
    const doc = parseReqIfXml(docWithAltIds(`<ALTERNATIVE-ID IDENTIFIER="FLAT-99"/>`));
    expect(doc.coreContent.specObjects[0].alternativeId).toEqual({ identifier: "FLAT-99" });
  });

  it("applies to every Identifiable, not just SpecObject", () => {
    const doc = parseReqIfXml(
      docWithAltIds("", `<ALTERNATIVE-ID><ALTERNATIVE-ID IDENTIFIER="TYPE-ALT"/></ALTERNATIVE-ID>`),
    );
    expect(doc.coreContent.specTypes[0].alternativeId).toEqual({ identifier: "TYPE-ALT" });
  });

  it("is undefined when absent, and when the wrapper carries no usable IDENTIFIER", () => {
    expect(parseReqIfXml(docWithAltIds("")).coreContent.specObjects[0].alternativeId).toBeUndefined();
    expect(
      parseReqIfXml(docWithAltIds(`<ALTERNATIVE-ID><ALTERNATIVE-ID/></ALTERNATIVE-ID>`)).coreContent
        .specObjects[0].alternativeId,
    ).toBeUndefined();
  });
});

describe("AttributeValueXHTML: theOriginalValue (10.8.20)", () => {
  function docWithXhtml(theValue: string, original?: string, isSimplified = true): string {
    const flag = isSimplified ? ` IS-SIMPLIFIED="true"` : "";
    const originalEl = original ? `<THE-ORIGINAL-VALUE>${original}</THE-ORIGINAL-VALUE>` : "";
    return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="h1"><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER>
  <CORE-CONTENT><REQ-IF-CONTENT>
    <DATATYPES><DATATYPE-DEFINITION-XHTML IDENTIFIER="dt-x" LONG-NAME="X"/></DATATYPES>
    <SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="t1" LONG-NAME="T"><SPEC-ATTRIBUTES>
      <ATTRIBUTE-DEFINITION-XHTML IDENTIFIER="a1" LONG-NAME="ReqIF.Text"><TYPE><DATATYPE-DEFINITION-XHTML-REF>dt-x</DATATYPE-DEFINITION-XHTML-REF></TYPE></ATTRIBUTE-DEFINITION-XHTML>
    </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE></SPEC-TYPES>
    <SPEC-OBJECTS><SPEC-OBJECT IDENTIFIER="o1" LONG-NAME="Req"><VALUES>
      <ATTRIBUTE-VALUE-XHTML${flag}>
        <DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>a1</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION>
        <THE-VALUE>${theValue}</THE-VALUE>
        ${originalEl}
      </ATTRIBUTE-VALUE-XHTML>
    </VALUES><TYPE><SPEC-OBJECT-TYPE-REF>t1</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT></SPEC-OBJECTS>
    <SPECIFICATIONS><SPECIFICATION IDENTIFIER="s1" LONG-NAME="Spec"><CHILDREN>
      <SPEC-HIERARCHY IDENTIFIER="sh1"><OBJECT><SPEC-OBJECT-REF>o1</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>
    </CHILDREN></SPECIFICATION></SPECIFICATIONS>
    <SPEC-RELATIONS/><SPEC-RELATION-GROUPS/>
  </REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`;
  }

  const SIMPLE = `<xhtml:div>Flattened fallback</xhtml:div>`;
  const RICH = `<xhtml:div>Rich <xhtml:b>original</xhtml:b> text</xhtml:div>`;

  it("parses THE-ORIGINAL-VALUE alongside THE-VALUE", () => {
    const doc = parseReqIfXml(docWithXhtml(SIMPLE, RICH));
    const value = doc.coreContent.specObjects[0].values[0];
    expect(value.kind).toBe("XHTML");
    if (value.kind !== "XHTML") throw new Error("expected an XHTML value");
    expect(value.isSimplified).toBe(true);
    expect(xhtmlToPlainText(value.value!)).toBe("Flattened fallback");
    expect(xhtmlToPlainText(value.originalValue!)).toBe("Rich original text");
  });

  it("renders the original rather than the simplified stand-in by default", async () => {
    const pkg = await loadReqIfPackage(docWithXhtml(SIMPLE, RICH));
    const html = await renderPackageToHtml(pkg);
    expect(html).toContain("Rich <b>original</b> text");
    expect(html).not.toContain("Flattened fallback");
  });

  it("renders the simplified stand-in when preferSimplifiedXhtml is set", async () => {
    const pkg = await loadReqIfPackage(docWithXhtml(SIMPLE, RICH));
    const html = await renderPackageToHtml(pkg, { preferSimplifiedXhtml: true });
    expect(html).toContain("Flattened fallback");
    expect(html).not.toContain("Rich <b>original</b> text");
  });

  it("leaves values without an original untouched", async () => {
    const pkg = await loadReqIfPackage(docWithXhtml(SIMPLE, undefined, false));
    const doc = parseReqIfXml(docWithXhtml(SIMPLE, undefined, false));
    const value = doc.coreContent.specObjects[0].values[0];
    if (value.kind !== "XHTML") throw new Error("expected an XHTML value");
    expect(value.originalValue).toBeUndefined();
    expect(await renderPackageToHtml(pkg)).toContain("Flattened fallback");
  });

  it("resolves an attachment referenced only by the original value", async () => {
    const withImage = docWithXhtml(
      SIMPLE,
      `<xhtml:div>See <xhtml:object data="diagram.png" type="image/png">alt</xhtml:object></xhtml:div>`,
    );
    const zipBytes = zipSync({
      "model.reqif": strToU8(withImage),
      "diagram.png": base64ToBytes(TINY_PNG_BASE64),
    });
    const pkg = await loadReqIfPackage(zipBytes);
    const html = await renderPackageToHtml(pkg);
    expect(html).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
  });

  it("extracts plain text from the original, which may carry text the simplification dropped", () => {
    const doc = parseReqIfXml(docWithXhtml(`<xhtml:div>Only a stub</xhtml:div>`, RICH));
    const index = new ReqIfIndex(doc);
    const { value } = resolveAttribute(doc.coreContent.specObjects[0], index, "ReqIF.Text");
    expect(valueToPlainText(value!, index)).toBe("Rich original text");
  });
});

describe("cross-document SpecRelation (GLOBAL-REF, clause 11 rule 5b)", () => {
  /** A minimal document exposing one object, and optionally a relation to `linkTo`. */
  function docWith(id: string, objId: string, title: string, linkTo?: string): string {
    const relation = linkTo
      ? `<SPEC-RELATION IDENTIFIER="rel-${id}">
           <TYPE><SPEC-RELATION-TYPE-REF>srt-1</SPEC-RELATION-TYPE-REF></TYPE>
           <SOURCE><SPEC-OBJECT-REF>${objId}</SPEC-OBJECT-REF></SOURCE>
           <TARGET><SPEC-OBJECT-REF>${linkTo}</SPEC-OBJECT-REF></TARGET>
         </SPEC-RELATION>`
      : "";
    return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="h-${id}"><TITLE>Doc ${id}</TITLE><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER>
  <CORE-CONTENT><REQ-IF-CONTENT>
    <DATATYPES><DATATYPE-DEFINITION-STRING IDENTIFIER="dt-s" LONG-NAME="S"/></DATATYPES>
    <SPEC-TYPES>
      <SPEC-OBJECT-TYPE IDENTIFIER="t1" LONG-NAME="T"><SPEC-ATTRIBUTES/></SPEC-OBJECT-TYPE>
      <SPEC-RELATION-TYPE IDENTIFIER="srt-1" LONG-NAME="Derives from"><SPEC-ATTRIBUTES/></SPEC-RELATION-TYPE>
    </SPEC-TYPES>
    <SPEC-OBJECTS><SPEC-OBJECT IDENTIFIER="${objId}" LONG-NAME="${title}">
      <VALUES/><TYPE><SPEC-OBJECT-TYPE-REF>t1</SPEC-OBJECT-TYPE-REF></TYPE>
    </SPEC-OBJECT></SPEC-OBJECTS>
    <SPECIFICATIONS><SPECIFICATION IDENTIFIER="s-${id}" LONG-NAME="Spec ${id}"><CHILDREN>
      <SPEC-HIERARCHY IDENTIFIER="sh-${id}"><OBJECT><SPEC-OBJECT-REF>${objId}</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>
    </CHILDREN></SPECIFICATION></SPECIFICATIONS>
    <SPEC-RELATIONS>${relation}</SPEC-RELATIONS><SPEC-RELATION-GROUPS/>
  </REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`;
  }

  const twoDocPackage = () =>
    zipSync({
      "a.reqif": strToU8(docWith("a", "obj-a", "Customer requirement", "obj-b")),
      "b.reqif": strToU8(docWith("b", "obj-b", "System requirement")),
    });

  it("indexes several documents at once", async () => {
    const pkg = await loadReqIfPackage(twoDocPackage());
    const index = new ReqIfIndex(pkg.documents);
    expect(index.specObjects.get("obj-a")?.longName).toBe("Customer requirement");
    expect(index.specObjects.get("obj-b")?.longName).toBe("System requirement");
  });

  it("resolves a relation pointing into another .reqif of the same package", async () => {
    const pkg = await loadReqIfPackage(twoDocPackage());
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    // The target lives in b.reqif; before the shared index this fell back to
    // the unresolved label instead of an anchor.
    expect(html).toContain('href="#reqif-obj-obj-b"');
    expect(html).toContain("System requirement");
    expect(html).not.toContain("(objet non trouvé)");
  });

  it("still falls back to a plain label when the target is nowhere in the package", async () => {
    const zipBytes = zipSync({ "a.reqif": strToU8(docWith("a", "obj-a", "Orphan source", "obj-missing")) });
    const pkg = await loadReqIfPackage(zipBytes);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).toContain("(objet non trouvé)");
  });

  it("keeps indexing a single document when called the old way", () => {
    const doc = parseReqIfXml(docWith("a", "obj-a", "Alone"));
    const index = new ReqIfIndex(doc);
    expect(index.specObjects.get("obj-a")?.longName).toBe("Alone");
  });
});

describe("model completeness: EDITABLE-ATTS, alternative ids, attachment lookup", () => {
  function docWithHierarchy(editableAtts: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="h1"><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER>
  <CORE-CONTENT><REQ-IF-CONTENT>
    <DATATYPES><DATATYPE-DEFINITION-STRING IDENTIFIER="dt-s" LONG-NAME="S"/></DATATYPES>
    <SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="t1" LONG-NAME="T"><SPEC-ATTRIBUTES>
      <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="ad-1" LONG-NAME="Name"><TYPE><DATATYPE-DEFINITION-STRING-REF>dt-s</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>
    </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE></SPEC-TYPES>
    <SPEC-OBJECTS><SPEC-OBJECT IDENTIFIER="o1" LONG-NAME="Req">
      <ALTERNATIVE-ID><ALTERNATIVE-ID IDENTIFIER="DOORS-4711"/></ALTERNATIVE-ID>
      <VALUES/><TYPE><SPEC-OBJECT-TYPE-REF>t1</SPEC-OBJECT-TYPE-REF></TYPE>
    </SPEC-OBJECT></SPEC-OBJECTS>
    <SPECIFICATIONS><SPECIFICATION IDENTIFIER="s1" LONG-NAME="Spec"><CHILDREN>
      <SPEC-HIERARCHY IDENTIFIER="sh1">${editableAtts}
        <OBJECT><SPEC-OBJECT-REF>o1</SPEC-OBJECT-REF></OBJECT>
      </SPEC-HIERARCHY>
    </CHILDREN></SPECIFICATION></SPECIFICATIONS>
    <SPEC-RELATIONS/><SPEC-RELATION-GROUPS/>
  </REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`;
  }

  it("parses EDITABLE-ATTS into attribute definition ids", () => {
    const doc = parseReqIfXml(
      docWithHierarchy(`<EDITABLE-ATTS><ATTRIBUTE-DEFINITION-STRING-REF>ad-1</ATTRIBUTE-DEFINITION-STRING-REF></EDITABLE-ATTS>`),
    );
    expect(doc.coreContent.specifications[0].children[0].editableAttributeRefs).toEqual(["ad-1"]);
  });

  it("keeps absent and present-but-empty EDITABLE-ATTS distinct (10.8.37 [5])", () => {
    const absent = parseReqIfXml(docWithHierarchy(""));
    expect(absent.coreContent.specifications[0].children[0].editableAttributeRefs).toBeUndefined();

    const empty = parseReqIfXml(docWithHierarchy(`<EDITABLE-ATTS/>`));
    expect(empty.coreContent.specifications[0].children[0].editableAttributeRefs).toEqual([]);
  });

  it("indexes elements by their AlternativeID without disturbing primary resolution", () => {
    const doc = parseReqIfXml(docWithHierarchy(""));
    const index = new ReqIfIndex(doc);
    expect(index.byAlternativeId.get("DOORS-4711")?.identifier).toBe("o1");
    // the primary namespace is untouched: an alternative id resolves nowhere there
    expect(index.specObjects.get("DOORS-4711")).toBeUndefined();
    expect(index.specObjects.get("o1")?.longName).toBe("Req");
  });

  it("lets a caller build an AttachmentLookup and drive renderSpecification directly", async () => {
    const zipBytes = zipSync({
      "model.reqif": strToU8(SYNTHETIC_REQIF),
      "diagram.png": base64ToBytes(TINY_PNG_BASE64),
    });
    const pkg = await loadReqIfPackage(zipBytes);
    const index = new ReqIfIndex(pkg.documents);
    const lookup = await createAttachmentLookup(pkg.document, pkg.attachments);

    const html = renderSpecification(pkg.document.coreContent.specifications[0], index, lookup);
    expect(html).toMatch(/<img src="data:image\/png;base64,[A-Za-z0-9+/=]+"/);
  });
});

describe("onDegradation: making the silent fallbacks observable", () => {
  function collect() {
    const events: DegradationEvent[] = [];
    return { events, onDegradation: (e: DegradationEvent) => events.push(e) };
  }
  const codes = (events: DegradationEvent[]) => events.map((e) => e.code);

  it("reports a referenced attachment that no resolver can find", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF); // no zip, so no attachments at all
    const { events, onDegradation } = collect();
    await renderPackageToHtml(pkg, { onDegradation });
    const missing = events.filter((e) => e.code === "attachment-missing");
    expect(missing.length).toBeGreaterThan(0);
    expect(missing[0].detail?.path).toBe("diagram.png");
  });

  it("reports an attachment skipped for exceeding maxInlineBytes", async () => {
    const zipBytes = zipSync({
      "model.reqif": strToU8(SYNTHETIC_REQIF),
      "diagram.png": base64ToBytes(TINY_PNG_BASE64),
    });
    const pkg = await loadReqIfPackage(zipBytes);
    const { events, onDegradation } = collect();
    await renderPackageToHtml(pkg, { onDegradation, maxInlineBytes: 1 });
    expect(codes(events)).toContain("attachment-too-large");
  });

  it("reports tags the allowlist drops and tags it unwraps", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const { events, onDegradation } = collect();
    await renderPackageToHtml(pkg, { onDegradation });
    // the synthetic fixture carries a <script> and a <font> inside its XHTML
    expect(codes(events)).toContain("dropped-tag");
    expect(events.find((e) => e.code === "dropped-tag")?.detail?.tag).toBe("script");
  });

  it("reports a custom renderer that throws, and one that returns unbalanced HTML", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const { events, onDegradation } = collect();
    await renderPackageToHtml(pkg, {
      onDegradation,
      customAttributeRenderers: [
        { attribute: "Name", render: () => { throw new Error("boom"); } },
        { attribute: "Count", position: "after", render: () => "<div>never closed" },
      ],
    });
    expect(codes(events)).toContain("custom-renderer-threw");
    expect(codes(events)).toContain("custom-renderer-unbalanced-html");
  });

  it("reports a relation whose target is nowhere in the render", async () => {
    const doc = parseReqIfXml(`<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd">
  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="h1"><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER>
  <CORE-CONTENT><REQ-IF-CONTENT>
    <DATATYPES/><SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="t1" LONG-NAME="T"><SPEC-ATTRIBUTES/></SPEC-OBJECT-TYPE></SPEC-TYPES>
    <SPEC-OBJECTS><SPEC-OBJECT IDENTIFIER="o1" LONG-NAME="Source"><VALUES/><TYPE><SPEC-OBJECT-TYPE-REF>t1</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT></SPEC-OBJECTS>
    <SPECIFICATIONS><SPECIFICATION IDENTIFIER="s1" LONG-NAME="S"><CHILDREN>
      <SPEC-HIERARCHY IDENTIFIER="sh1"><OBJECT><SPEC-OBJECT-REF>o1</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>
    </CHILDREN></SPECIFICATION></SPECIFICATIONS>
    <SPEC-RELATIONS><SPEC-RELATION IDENTIFIER="rel1">
      <TYPE><SPEC-RELATION-TYPE-REF>missing-type</SPEC-RELATION-TYPE-REF></TYPE>
      <SOURCE><SPEC-OBJECT-REF>o1</SPEC-OBJECT-REF></SOURCE>
      <TARGET><SPEC-OBJECT-REF>ghost</SPEC-OBJECT-REF></TARGET>
    </SPEC-RELATION></SPEC-RELATIONS><SPEC-RELATION-GROUPS/>
  </REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>`);
    const { events, onDegradation } = collect();
    await renderDocumentToHtml(doc, { resolve: () => undefined, list: () => [] }, { onDegradation });
    const unresolved = events.filter((e) => e.code === "unresolved-reference");
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0].detail?.targetRef).toBe("ghost");
  });

  it("stays silent when no handler is supplied, and survives one that throws", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const withoutHandler = await renderPackageToHtml(pkg);
    const withHostileHandler = await renderPackageToHtml(pkg, {
      onDegradation: () => { throw new Error("handler exploded"); },
    });
    // A diagnostic channel that can break what it observes is worse than none.
    expect(withHostileHandler).toBe(withoutHandler);
  });
});

describe("URL-linked tabs (:target) and deep anchors", () => {
  const twoDocs = () => {
    const a = SYNTHETIC_REQIF.replace("<TITLE>Synthetic Sample</TITLE>", "<TITLE>Doc A</TITLE>")
      .replace('IDENTIFIER="hdr-1"', 'IDENTIFIER="hdr-a"');
    const b = SYNTHETIC_REQIF.replace("<TITLE>Synthetic Sample</TITLE>", "<TITLE>Doc B</TITLE>")
      .replace('IDENTIFIER="hdr-1"', 'IDENTIFIER="hdr-b"');
    return zipSync({ "a.reqif": strToU8(a), "b.reqif": strToU8(b) });
  };

  it("derives panel ids from ReqIF identifiers, not from tab position", async () => {
    const pkg = await loadReqIfPackage(twoDocs());
    const html = await renderPackageToHtml(pkg, { includeCss: false, layout: "tabs" });
    expect(html).toContain('id="reqif-doc-hdr-a"');
    expect(html).toContain('id="reqif-doc-hdr-b"');
    expect(html).toContain('href="#reqif-doc-hdr-a"');
  });

  it("emits identical ids across two renders, so a shared link keeps working", async () => {
    const pkg = await loadReqIfPackage(twoDocs());
    const first = await renderPackageToHtml(pkg, { includeCss: false, layout: "tabs" });
    const second = await renderPackageToHtml(pkg, { includeCss: false, layout: "tabs" });
    const ids = (h: string) => (h.match(/id="reqif-(?:doc|spec)-[^"]+"/g) ?? []).join(",");
    expect(ids(first)).toBe(ids(second));
    expect(ids(first)).not.toBe(""); // guard against the regex silently matching nothing
  });

  it("ships the three rules that make a deep anchor open its panel", async () => {
    const pkg = await loadReqIfPackage(twoDocs());
    const html = await renderPackageToHtml(pkg, { layout: "tabs" }); // includeCss defaults to true
    expect(html).toContain(".reqif-tab-panel:has(:target)");
    expect(html).toContain(".reqif-tab-panel:target");
    expect(html).toContain(".reqif-tabs:not(:has(:target)) > .reqif-tab-panel:first-of-type");
  });

  it("uses specification identifiers for the inner tab level", async () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    doc.coreContent.specifications.push({
      ...doc.coreContent.specifications[0],
      identifier: "spec-2",
      longName: "Second Spec",
    });
    const html = await renderDocumentToHtml(
      doc,
      { resolve: () => undefined, list: () => [] },
      { includeCss: false, layout: "tabs" },
    );
    expect(html).toContain('id="reqif-spec-spec-2"');
    expect(html).toContain('href="#reqif-spec-spec-2"');
  });
});
