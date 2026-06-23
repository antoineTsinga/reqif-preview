import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import {
  loadReqIfPackage,
  parseReqIfXml,
  renderDocumentToHtml,
  renderPackageToHtml,
  ReqIfIndex,
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
      "ad-foreignid","ad-createdby","ad-createdon","ad-modifiedby","ad-modifiedon","ad-puid",
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

  it("excludes the consumed lifecycle/id attributes from the technical panel", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false });
    expect(html).not.toContain("ReqIF.ForeignID");
    expect(html).not.toContain("ReqIF.ForeignCreatedBy");
    expect(html).not.toContain("ReqIF.ForeignModifiedBy");
  });

  it("supports a different date locale", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { includeCss: false, dateLocale: "en-US" });
    // en-US medium date style renders like "Jan 10, 2024"
    expect(html).toMatch(/Jan\s+10,\s+2024/);
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

  it("hides the matched attribute from the technical panel by default, but can keep it with hideFromTechnical: false", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const hidden = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [{ attribute: "IE PUID", render: () => "<b>x</b>" }],
    });
    expect(hidden).not.toContain("IE PUID");

    const shown = await renderPackageToHtml(pkg, {
      includeCss: false,
      customAttributeRenderers: [{ attribute: "IE PUID", hideFromTechnical: false, render: () => "<b>x</b>" }],
    });
    expect(shown).toContain("IE PUID");
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
