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
    const byKind = Object.fromEntries(obj.values.map((v) => [v.kind, v]));

    expect(byKind.STRING).toMatchObject({ value: "Login feature" });
    expect(byKind.INTEGER).toMatchObject({ value: 42 });
    expect(byKind.REAL).toMatchObject({ value: 0.75 });
    expect(byKind.BOOLEAN).toMatchObject({ value: true });
    expect(byKind.DATE).toMatchObject({ value: "2024-02-01T00:00:00.000+01:00" });
    expect(byKind.ENUMERATION).toBeDefined();
  });

  it("resolves the SpecObjectType's attribute order and datatype definitions", () => {
    const doc = parseReqIfXml(SYNTHETIC_REQIF);
    const index = new ReqIfIndex(doc);
    const sot = index.specTypes.get("sot-req")!;
    expect(sot.specAttributes.map((a) => a.identifier)).toEqual([
      "ad-name","ad-count","ad-ratio","ad-active","ad-due","ad-desc","ad-prio",
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
