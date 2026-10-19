/**
 * The only JavaScript this library emits, and the reason it exists.
 *
 * The per-requirement technical panel sits inside a `<details>` nobody has
 * opened, and under the default its elements belong to the initial DOM all the
 * same: a closed `<details>` skips the layout of its contents, but the nodes
 * are built before anyone asks to see them. How much of the document they
 * account for depends on how many attributes each requirement carries, and
 * varies between documents by several times over.
 *
 * What deferring them spares depends on the document, and the node count is a
 * poor predictor of it: the deferred markup still travels, as a string that is
 * not shorter. Hence an option rather than a default.
 *
 * So in `technicalPanel: "lazy"` mode the panel's markup travels inside a
 * `<script type="application/reqif-panel">` block. The browser does not parse a
 * script block's contents as HTML, so those nodes cost nothing until the panel
 * is opened; the markup itself is still produced by the TypeScript renderer, so
 * none of the rendering logic is duplicated here.
 *
 * Two delivery paths, because one is not enough:
 *
 *   - `renderPackageToHtml` embeds `DEFAULT_JS` as an inline `<script>`, which
 *     covers server-rendered pages where the markup arrives in the initial
 *     document.
 *   - `expandLazyPanels()` covers the browser path, because **a
 *     `<script>` inserted through `innerHTML` never executes** — that is the
 *     HTML specification, not a quirk, and `innerHTML` is exactly how the
 *     README tells people to use this library. Emitting only the inline script
 *     would leave the panel silently inert in the primary use case.
 */

/** Marks the document-level listener so repeat calls stay harmless. */
const INSTALLED = "__reqifPanelsActivated";

/**
 * The attribute carrying the "needs JavaScript" message. It is both the
 * hydration marker and the fallback text: the stylesheet renders it through
 * `content: attr(...)`, so an un-hydrated panel explains itself instead of
 * opening empty, and it costs no extra DOM node to say so.
 */
export const LAZY_ATTR = "data-reqif-lazy";

/** The inert block holding the panel's markup until it is needed. */
export const PANEL_SCRIPT_TYPE = "application/reqif-panel";

/**
 * The only sequence that can end a script block early. Case-insensitive
 * because HTML tag names are: `</SCRIPT>` closes the element just as well.
 */
const CLOSING_TAG = /<\/script/gi;

/** The escaped form of the above, and the single source both unescapers use. */
const ESCAPED_CLOSING_TAG = /<\\\/script/gi;

/**
 * Makes panel markup safe to sit inside a `<script>` block.
 *
 * The renderer escapes `<` in document text, so the sequence cannot arise from
 * file content today — but a guard that depends on an invariant holding
 * somewhere else is not a guard, and this one costs a single replace. The
 * original casing is preserved, so nothing is quietly rewritten on the way
 * through.
 */
export function escapePanelPayload(html: string): string {
  return html.replace(CLOSING_TAG, (match) => `<\\/${match.slice(2)}`);
}

/** Reverses `escapePanelPayload`. */
export function unescapePanelPayload(text: string): string {
  return text.replace(ESCAPED_CLOSING_TAG, (match) => `</${match.slice(3)}`);
}

/**
 * Expands `technicalPanel: "lazy"` panels as they are opened. Needed in that
 * mode and no other — there is nothing deferred to expand under `"eager"` or
 * `"off"`, where calling this is harmless but pointless.
 *
 * It installs a listener and nothing more: no existing panel is touched at call
 * time. So the order relative to inserting the HTML does not matter, though
 * early beats late — a panel opened before the listener exists shows the
 * fallback message until it is closed and reopened. Calling it repeatedly is
 * safe, and outside a browser it does nothing at all.
 *
 * The listener goes on the root in the capture phase rather than on each panel,
 * because `toggle` does not bubble. One listener then serves every panel,
 * including those inserted later — which is what makes the call order
 * irrelevant.
 *
 * @param root Pass a shadow root to reach panels inside it: `toggle` does not
 *   cross a shadow boundary, so a listener on the document would never see them.
 */
export function expandLazyPanels(root: Document | ShadowRoot | undefined = globalThis.document): void {
  if (!root || typeof root.addEventListener !== "function") return;
  const host = root as unknown as Record<string, unknown>;
  if (host[INSTALLED]) return;
  host[INSTALLED] = true;

  root.addEventListener(
    "toggle",
    (event: Event) => {
      const details = event.target as HTMLDetailsElement | null;
      if (!details || details.tagName !== "DETAILS") return;
      if (!details.hasAttribute(LAZY_ATTR)) return;
      const block = details.querySelector(`script[type="${PANEL_SCRIPT_TYPE}"]`);
      if (!block) return;
      details.insertAdjacentHTML("beforeend", unescapePanelPayload(block.textContent ?? ""));
      block.remove();
      // Removing the marker both prevents a second expansion and drops the
      // "needs JavaScript" fallback the stylesheet was showing.
      details.removeAttribute(LAZY_ATTR);
    },
    true,
  );
}

/**
 * The same behaviour as a standalone string, for the inline `<script>`.
 *
 * Written out rather than derived from the function above, because deriving it
 * would mean `Function.prototype.toString()` on code the bundler has already
 * transformed — fragile to ship. What it does *not* do is restate the escaping
 * rule: the pattern is interpolated from `ESCAPED_CLOSING_TAG` through
 * `JSON.stringify`, so there is one definition of it and no hand-counted
 * backslashes to get wrong in a second place.
 */
export const DEFAULT_JS = `(function(){var K=${JSON.stringify(INSTALLED)};if(document[K])return;document[K]=1;
document.addEventListener("toggle",function(e){var d=e.target;
if(!d||d.tagName!=="DETAILS"||!d.hasAttribute(${JSON.stringify(LAZY_ATTR)}))return;
var s=d.querySelector('script[type="${PANEL_SCRIPT_TYPE}"]');if(!s)return;
var p=new RegExp(${JSON.stringify(ESCAPED_CLOSING_TAG.source)},"gi");
d.insertAdjacentHTML("beforeend",(s.textContent||"").replace(p,function(m){return "</"+m.slice(3)}));
s.remove();d.removeAttribute(${JSON.stringify(LAZY_ATTR)});},true);})();`;
