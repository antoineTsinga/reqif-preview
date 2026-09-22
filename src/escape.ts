/**
 * Escapes text destined for an element's *body*: `&`, `<`, `>`.
 *
 * Not sufficient for an attribute value — it leaves quotation marks alone, so
 * `title="${escapeHtml(v)}"` lets a value containing a double quote close the
 * attribute early and open another one. Use `escapeAttr` there.
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Escapes text destined for a double-quoted *attribute* value: everything
 * `escapeHtml` handles, plus the quotation mark that would end the attribute.
 *
 * The two exist separately because the contexts differ: a `"` inside element
 * text is harmless and escaping it only makes the markup noisier, while the
 * same character inside an attribute is the whole attack.
 */
export function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
