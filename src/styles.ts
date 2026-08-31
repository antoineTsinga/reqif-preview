/**
 * The stylesheet the rendered HTML is scoped against.
 *
 * It lives in its own module so there is exactly one copy of it: the renderer
 * inlines it when `includeCss` is left on, `scripts/emit-style.mjs` writes the
 * same string to `dist/style.css` for the `reqif-preview/style.css` export,
 * and it is exported here for hosts that need the text itself — a Shadow DOM
 * has to adopt a stylesheet, it cannot be reached by a <link> in the page.
 *
 * Every rule is scoped under `.reqif-preview`, so dropping it into a page
 * styles nothing else. It sets a text colour but no background: the output
 * assumes a light surface, which a dark-themed host has to provide.
 */
export const DEFAULT_CSS: string = `
.reqif-preview { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #1a1a1a; line-height: 1.5; }
.reqif-preview * { box-sizing: border-box; }
.reqif-header { border: 1px solid #e2e2e2; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; background: #fafafa; }
.reqif-meta-row { display: flex; gap: 8px; font-size: 13px; }
.reqif-meta-key { font-weight: 600; min-width: 110px; color: #555; }
.reqif-spec-title { font-size: 18px; margin: 0 0 8px; }
.reqif-spec { margin-bottom: 24px; }
.reqif-tree { border-left: 2px solid #eee; padding-left: 12px; }
.reqif-node { border: 1px solid #e8e8e8; border-radius: 6px; padding: 6px 10px; margin: 6px 0; background: #fff; }
.reqif-node-title { cursor: pointer; font-weight: 600; }
.reqif-node-body { margin-top: 8px; contain: layout; overflow: hidden; }
.reqif-node-children { margin-left: 14px; }
.reqif-attrs { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 0; }
.reqif-attr { display: contents; }
.reqif-attr-name { font-size: 12px; text-transform: uppercase; letter-spacing: .02em; color: #888; align-self: start; padding-top: 2px; }
.reqif-attr-value { margin: 0; font-size: 14px; }
.reqif-empty { color: #aaa; font-style: italic; }
.reqif-missing { color: #b00; font-style: italic; }
.reqif-attachment { display: inline-flex; align-items: center; gap: 4px; color: #0b62d6; text-decoration: none; }
.reqif-preview table { border-collapse: collapse; }
.reqif-preview td, .reqif-preview th { border: 1px solid #ddd; padding: 4px 8px; }
.reqif-simple { display: flex; flex-direction: column; gap: 8px; }
.reqif-id { font-size: 11px; color: #999; }
.reqif-id code { background: #f2f2f2; border-radius: 4px; padding: 1px 6px; color: #555; }
.reqif-content { font-size: 14px; }
.reqif-content p:first-child { margin-top: 0; }
.reqif-technical { margin-top: 10px; }
.reqif-technical-toggle {
  display: inline-block; cursor: pointer; list-style: none; user-select: none;
  font-size: 12px; color: #444; background: #f0f0f0; border: 1px solid #ddd;
  border-radius: 999px; padding: 3px 10px; width: fit-content;
}
.reqif-technical-toggle::-webkit-details-marker { display: none; }
.reqif-technical-toggle:hover { background: #e6e6e6; }
.reqif-technical[open] > .reqif-technical-toggle { background: #e0ebfb; border-color: #b6d0f5; }
.reqif-technical .reqif-attrs { margin-top: 10px; }
.reqif-meta-strip { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; }
.reqif-meta-chip { display: inline-flex; align-items: center; gap: 4px; background: #f5f5f5; border-radius: 6px; padding: 2px 8px; color: #444; white-space: nowrap; max-width: 100%; }
.reqif-meta-role { color: #888; }
.reqif-meta-chip time { color: #666; }
.reqif-custom-attr { font-size: 14px; contain: layout; }
.reqif-relations { margin-top: 10px; padding-top: 8px; border-top: 1px dashed #e8e8e8; display: flex; flex-direction: column; gap: 4px; }
.reqif-relations-label { font-size: 11px; text-transform: uppercase; letter-spacing: .02em; color: #999; }
.reqif-relation { display: flex; align-items: baseline; gap: 6px; font-size: 13px; }
.reqif-relation-arrow { color: #999; }
.reqif-relation-type { color: #666; font-style: italic; }
.reqif-relation-target { color: #0b62d6; text-decoration: none; }
.reqif-relation-target:hover { text-decoration: underline; }
.reqif-relation-unresolved { color: #aaa; font-style: italic; text-decoration: none; }

/* Tabs (CSS-only, see tabs.ts). The tabs are links and the URL fragment picks
   the panel, which is what makes a deep anchor into a hidden tab work: the
   panel *containing* the target opens, at every nesting level at once.
   NOTE: the ":first-of-type" default below means "first div child of
   .reqif-tabs". tabs.ts emits <nav> then the panels, so that is the first
   panel — inserting any other <div> before them would silently break it. */
.reqif-tab-headers { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid #e2e2e2; margin-bottom: 16px; }
.reqif-tab-label { cursor: pointer; padding: 8px 14px; font-size: 14px; font-weight: 600; color: #666; text-decoration: none; border: 1px solid transparent; border-bottom: none; border-radius: 8px 8px 0 0; margin-bottom: -1px; }
.reqif-tab-label:hover { color: #0b62d6; }
.reqif-tab-label:focus-visible { outline: 2px solid #0b62d6; outline-offset: -2px; }
.reqif-tab-panel { display: none; scroll-margin-top: 8px; }
.reqif-tab-panel:target,
.reqif-tab-panel:has(:target) { display: block; }
.reqif-tabs:not(:has(:target)) > .reqif-tab-panel:first-of-type { display: block; }

/* Reading mode: strip the "card list" look for something closer to a flowing Word document */
.reqif-reading-mode .reqif-node { border: none; border-radius: 0; padding: 0; margin: 0 0 18px; background: transparent; }
.reqif-reading-mode .reqif-tree { border-left: none; padding-left: 0; }
.reqif-reading-mode .reqif-node-children { margin-left: 22px; margin-top: 8px; }
.reqif-reading-mode .reqif-node-title { cursor: default; list-style: none; }
.reqif-reading-mode .reqif-node-title::-webkit-details-marker { display: none; }
.reqif-reading-mode .reqif-node-heading {
  margin: 0 0 6px; font-weight: 600; line-height: 1.3;
  /* Headings are nested inside each other's containers, so browsers' default
     em-based h3..h6 sizing would COMPOUND with depth (each level's em is
     relative to its own, already-shrunk, parent) and shrink illegibly fast.
     Fixed rem sizes (relative to the root, never to a nested ancestor) with
     a comfortable floor fix that: it gets gently smaller down to h6, then
     stays exactly that size for any further depth instead of continuing to shrink. */
  font-size: 1rem;
}
.reqif-reading-mode h3.reqif-node-heading { font-size: 1.3rem; }
.reqif-reading-mode h4.reqif-node-heading { font-size: 1.15rem; }
.reqif-reading-mode h5.reqif-node-heading { font-size: 1.05rem; }
.reqif-reading-mode h6.reqif-node-heading { font-size: 0.95rem; }
.reqif-reading-mode .reqif-node-body { overflow: visible; }
.reqif-reading-mode .reqif-content { line-height: 1.7; font-size: 15px; }
`;
