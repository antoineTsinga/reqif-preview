import { escapeHtml } from "./escape.js";

export interface TabItem {
  label: string;
  html: string;
}

let counter = 0;

/** A per-render unique id, so multiple tab groups on the same page never collide. */
function nextGroupId(): string {
  counter += 1;
  return `reqif-tabs-${counter}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Renders a set of items as a tabbed switcher using only HTML + scoped CSS —
 * no JavaScript. The classic technique: hidden radio inputs drive `:checked`
 * sibling-selector rules that show the matching panel and highlight the
 * matching label. Falls back to plain concatenation for 0 or 1 item, since a
 * single-tab switcher is just UI noise.
 */
export function renderTabs(items: TabItem[]): string {
  if (items.length <= 1) return items.map((i) => i.html).join("");

  const groupId = nextGroupId();
  const inputs: string[] = [];
  const labels: string[] = [];
  const panels: string[] = [];
  const rules: string[] = [];

  items.forEach((item, i) => {
    const inputId = `${groupId}-${i}`;
    inputs.push(
      `<input type="radio" class="reqif-tab-input" name="${groupId}" id="${inputId}"${i === 0 ? " checked" : ""} />`,
    );
    labels.push(`<label class="reqif-tab-label" for="${inputId}">${escapeHtml(item.label)}</label>`);
    panels.push(`<div class="reqif-tab-panel" data-tab-index="${i}">${item.html}</div>`);
    rules.push(
      `#${inputId}:checked ~ .reqif-tab-panel[data-tab-index="${i}"] { display: block; }` +
        `#${inputId}:checked ~ .reqif-tab-headers label[for="${inputId}"] { background: #fff; border-color: #b6d0f5; color: #0b62d6; }`,
    );
  });

  return (
    `<style>${rules.join("")}</style>` +
    `<div class="reqif-tabs">` +
    inputs.join("") +
    `<div class="reqif-tab-headers">${labels.join("")}</div>` +
    panels.join("") +
    `</div>`
  );
}
