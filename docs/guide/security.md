# Security

The XHTML content of a ReqIF file is **untrusted** third-party data: it arrives through a
business-to-business exchange, it has passed through several tools, and you are about to
inject it into your page with `innerHTML`. `renderXhtmlContent` treats it accordingly.

## A strict allow-list

The permitted tags and attributes are aligned with the XHTML modules the ReqIF spec
itself allows: Text, List, Hypertext, Edit, Presentation, Basic Tables, Object, Style
Attribute. Everything else is turned away, in one of two ways:

- **removed with its subtree** — `<script>`, `<style>`, `<iframe>`, forms…: the tag
  **and** its content disappear, because that content is not text to read but code to
  run. Emits `dropped-tag`;
- **unwrapped** — any other non-allow-listed tag: the tag disappears, **its children are
  kept**. Unknown formatting must not carry off the text it surrounds. Emits
  `unwrapped-tag`.

## Neutralised URL schemes

`href` and `src` values using `javascript:`, `vbscript:` or `data:` are neutralised: the
attribute is simply omitted, the link's label stays visible. Emits `dropped-href`.

::: info Why `data:` is on the list
`data:text/html,<script>…</script>` is an execution vector every bit as much as
`javascript:`. That a `data:` URI could also be a harmless image changes nothing: telling
the two apart would mean trusting the MIME type declared inside the URL — that is,
trusting the very data being filtered.

The `data:` URIs **the library itself produces** for resolved attachments are emitted
normally: they do not come from the document and do not go through this filter.
:::

## The `style` attribute

Only two properties are allowed, per clause 10.8.20 of the spec:

- `text-decoration` (`underline`, `line-through`);
- `color`.

Everything else is filtered declaration by declaration — one invalid declaration does not
invalidate the others. Emits `dropped-style-declaration`.

It is narrow on purpose. A `position: fixed` or a `background-image: url(...)` in a
third-party document is not requirement formatting: it is either an export accident or an
attempt to cover your interface.

## External objects

The `<object>` element follows the fallback chain the spec describes: resolved PNG image →
otherwise a nested alternative object → otherwise a download link → otherwise the
alternative text. Nothing is ever loaded from the network; only an attachment supplied by
your resolver can appear. See [Attachments](/guide/attachments).

## What the library does NOT do for you

::: warning The HTML from your `customAttributeRenderers` is not sanitised
That is code **you** write, not document content — it is inserted as-is. If you
interpolate text coming from the ReqIF file into it, escape that yourself with
`escapeHtml`, which the library exports.

<!-- exemple: extrait — une ligne `render:` volontairement hors contexte -->

```ts
import { escapeHtml } from "reqif-preview";
render: (value) => `<span class="badge">${escapeHtml(value.value ?? "")}</span>`;
```

A [safety net](/guide/custom-renderers#the-safety-net-unbalanced-html) exists for
unbalanced tags, but it does not protect against injection: it checks that tags balance,
not where the text came from.
:::

The HTML produced is meant for `innerHTML`. It never contains a `<script>` and executes
nothing by itself, but it is not designed to be served as-is as a complete HTML document
to a third party without appropriate security headers.
