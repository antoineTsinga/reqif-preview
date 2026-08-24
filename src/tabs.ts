import { escapeHtml } from "./escape.js";

export interface TabItem {
  /**
   * DOM id for this tab's panel. It becomes a URL fragment, so it must be a
   * valid HTML id, unique in the page, and — since consumers will share these
   * links — stable across renders. Callers derive it from a ReqIF identifier
   * via `htmlId()` rather than from the tab's position.
   */
  id: string;
  label: string;
  html: string;
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}

/**
 * Renders a set of items as a tabbed switcher using only HTML + scoped CSS —
 * no JavaScript. Falls back to plain concatenation for 0 or 1 item, since a
 * single-tab switcher is just UI noise.
 *
 * The tabs are real links, and which panel shows is decided by `:target` /
 * `:has(:target)` (rules in render.ts's DEFAULT_CSS). Hidden radio inputs
 * would be more self-contained — state in the DOM rather than in the host
 * page's URL — but they make a *deep* anchor impossible: a relation link
 * pointing at an object inside another tab scrolls to an element that is
 * still `display:none`. With `:target`, the panel containing the anchor's
 * target opens on its own, at every nesting level at once.
 *
 * The trade-off is deliberate and documented: tab state now lives in the URL
 * fragment, so a host application that routes on the hash will see its route
 * change, and two previews on one page can no longer hold independent tab
 * selections. In exchange, `…#reqif-obj-SYS-REQ-0042` reopens the right
 * document, the right specification, scrolled to the requirement.
 *
 * Only the active-tab highlight needs per-tab rules now; showing the panel is
 * handled by three static rules that do not depend on how many tabs there are.
 */
export function renderTabs(items: TabItem[]): string {
  if (items.length <= 1) return items.map((i) => i.html).join("");

  const ACTIVE = "background: #fff; border-color: #b6d0f5; color: #0b62d6;";
  const labels: string[] = [];
  const panels: string[] = [];
  const rules: string[] = [];

  items.forEach((item) => {
    labels.push(
      `<a class="reqif-tab-label" href="#${escapeAttr(item.id)}">${escapeHtml(item.label)}</a>`,
    );
    panels.push(`<div class="reqif-tab-panel" id="${escapeAttr(item.id)}">${item.html}</div>`);
    // Matches whether the panel itself is the anchor target (the tab was
    // clicked) or merely contains it (a deep link landed inside).
    rules.push(
      `.reqif-tabs:has(#${item.id}:target, #${item.id} :target) [href="#${item.id}"] { ${ACTIVE} }`,
    );
  });

  // Nothing in this group is targeted: the first tab is the one shown, so it
  // is the one highlighted.
  rules.push(`.reqif-tabs:not(:has(:target)) [href="#${items[0].id}"] { ${ACTIVE} }`);

  return (
    `<style>${rules.join("")}</style>` +
    `<div class="reqif-tabs">` +
    `<nav class="reqif-tab-headers">${labels.join("")}</nav>` +
    panels.join("") +
    `</div>`
  );
}
