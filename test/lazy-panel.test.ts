import { describe, expect, it } from "vitest";
import { loadReqIfPackage, renderPackageToHtml, DEFAULT_JS, DEFAULT_CSS } from "../src/index.js";
import { escapePanelPayload, unescapePanelPayload, LAZY_ATTR, PANEL_SCRIPT_TYPE } from "../src/script.js";
import { SYNTHETIC_REQIF } from "./fixtures.js";

/** The markup a browser would actually parse: a script block's contents are not HTML. */
function domTagCount(html: string): number {
  const inert = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>");
  return (inert.match(/<[a-z]/gi) ?? []).length;
}

/**
 * The markup, without the inlined stylesheet.
 *
 * The default stylesheet mentions both `reqif-technical` and the lazy marker
 * attribute in its selectors, so asserting on the whole output finds them even
 * when the body contains neither.
 */
function body(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/g, "");
}

function panelPayload(html: string): string {
  const match = html.match(new RegExp(`<script type="${PANEL_SCRIPT_TYPE}">([\\s\\S]*?)</script>`));
  return match ? unescapePanelPayload(match[1]) : "";
}

describe("technicalPanel: deferring the panel nobody has opened", () => {
  it("defaults to lazy, and cuts the nodes a browser must build", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const lazy = await renderPackageToHtml(pkg);
    const eager = await renderPackageToHtml(pkg, { technicalPanel: "eager" });

    expect(body(lazy)).toContain(LAZY_ATTR);
    expect(body(eager)).not.toContain(LAZY_ATTR);
    // The whole point: fewer nodes to build, even though the markup still ships.
    expect(domTagCount(lazy)).toBeLessThan(domTagCount(eager));
  });

  it("defers exactly the markup that eager mode writes inline", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const lazy = await renderPackageToHtml(pkg);
    const eager = await renderPackageToHtml(pkg, { technicalPanel: "eager" });

    // What hydration will insert must be what eager mode would have shown —
    // otherwise opening a panel reveals something different from the old
    // behaviour, which is a silent regression no node count would catch.
    const deferred = panelPayload(lazy);
    expect(deferred).toMatch(/^<dl class="reqif-attrs">/);
    expect(eager).toContain(deferred);
  });

  it("omits the panel entirely with off, and says so in the node count", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const off = await renderPackageToHtml(pkg, { technicalPanel: "off" });

    expect(body(off)).not.toContain("reqif-technical");
    expect(body(off)).not.toContain(PANEL_SCRIPT_TYPE);
    expect(domTagCount(off)).toBeLessThan(domTagCount(await renderPackageToHtml(pkg)));
  });

  it("renders eagerly when the panel is open from the start", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, { showTechnicalByDefault: true });

    // An expanded panel is on screen immediately, so deferring it would only
    // add a hydration step before showing what was already asked for.
    expect(body(html)).toContain('<details class="reqif-technical" open>');
    expect(body(html)).not.toContain(PANEL_SCRIPT_TYPE);
    expect(body(html)).not.toContain("<script>");
  });
});

describe("the inline script", () => {
  it("is emitted only when a lazy panel needs it", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const inline = /<script>\(function\(\)/;

    expect(await renderPackageToHtml(pkg)).toMatch(inline);
    expect(await renderPackageToHtml(pkg, { technicalPanel: "eager" })).not.toMatch(inline);
    expect(await renderPackageToHtml(pkg, { technicalPanel: "off" })).not.toMatch(inline);
    // Strict CSP blocks inline scripts; activateTechnicalPanels() replaces it.
    expect(await renderPackageToHtml(pkg, { includeJs: false })).not.toMatch(inline);
  });

  it("ships once per package, not once per document", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml({ ...pkg, documents: [pkg.document, pkg.document] });

    expect(html.match(/<script>\(function\(\)/g)).toHaveLength(1);
  });

  it("is valid JavaScript", () => {
    expect(() => new Function(DEFAULT_JS)).not.toThrow();
  });

  it("undoes the renderer's escaping with the same rule the renderer applied", () => {
    // DEFAULT_JS does not restate the escaping rule: it interpolates the
    // shared pattern through JSON.stringify. So the check is that running the
    // emitted script's own unescape gives back exactly what the renderer
    // escaped -- no hand-counted backslashes on either side.
    const payload = `<dl><dd></script><script>alert(1)</script></dd></dl>`;
    const escaped = escapePanelPayload(payload);

    const emitted = DEFAULT_JS.match(/new RegExp\((".*?"),"gi"\)/);
    expect(emitted).toBeTruthy();
    const viaScript = escaped.replace(
      new RegExp(JSON.parse(emitted![1]) as string, "gi"),
      (m) => `</${m.slice(3)}`,
    );

    expect(viaScript).toBe(payload);
    expect(unescapePanelPayload(escaped)).toBe(payload);
  });
});

describe("the inert block cannot be broken out of", () => {
  it("escapes a closing script tag in the deferred markup", () => {
    const escaped = escapePanelPayload(`<dd></script><img src=x onerror=alert(1)></dd>`);

    expect(escaped).not.toMatch(/<\/script/i);
    expect(escaped).toContain("<\\/script");
  });

  it("escapes it whatever its case", () => {
    for (const variant of ["</script", "</SCRIPT", "</Script", "</sCrIpT"]) {
      expect(escapePanelPayload(`a${variant}>b`)).not.toMatch(/<\/script/i);
    }
  });

  it("leaves a rendered document with no way out of the block", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg);

    // Every </script> in the output must be one we opened: the inline script
    // and the inert blocks. A stray one would close a block early and spill
    // raw markup into the page.
    const opens = (html.match(/<script\b/gi) ?? []).length;
    const closes = (html.match(/<\/script>/gi) ?? []).length;
    expect(closes).toBe(opens);
  });
});

describe("the no-JavaScript fallback", () => {
  it("carries a translatable message in the marker attribute", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      labels: { technicalUnavailable: "Besoin de JS" },
    });

    expect(body(html)).toContain(`${LAZY_ATTR}="Besoin de JS"`);
  });

  it("escapes a message containing a quotation mark", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const html = await renderPackageToHtml(pkg, {
      labels: { technicalUnavailable: `say "no"` },
    });

    expect(body(html)).toContain(`${LAZY_ATTR}="say &quot;no&quot;"`);
    expect(body(html)).not.toContain(`${LAZY_ATTR}="say "no""`);
  });

  it("is shown by the stylesheet only while the panel is un-hydrated and open", () => {
    // Without this rule an un-hydrated panel opens onto nothing at all, which
    // reads as a broken viewer rather than as a missing script.
    expect(DEFAULT_CSS).toContain(`.reqif-technical[${LAZY_ATTR}][open]::after`);
    expect(DEFAULT_CSS).toContain(`content: attr(${LAZY_ATTR})`);
  });
});
