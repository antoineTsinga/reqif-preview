export * from "./types.js";
export { ReqIfParseError } from "./errors.js";
export { parseReqIfXml, type ParseOptions } from "./parse-document.js";
export {
  loadReqIfPackage,
  createAttachmentResolver,
  EMPTY_ATTACHMENTS,
  type ReqIfInput,
} from "./load-package.js";
export { ReqIfIndex } from "./lookup.js";
export type { DegradationCode, DegradationEvent, DegradationHandler } from "./diagnostics.js";
export { resolveAttribute, normalizeKey, valueToPlainText } from "./attribute-lookup.js";
export { extractLifecycleInfo, type LifecycleInfo } from "./lifecycle.js";
export type { AttributeRenderContext, CustomAttributeRenderer } from "./custom-render.js";
export {
  renderPackageToHtml,
  renderDocumentToHtml,
  renderSpecification,
  createAttachmentLookup,
  xhtmlToPlainText,
  escapeHtml,
  type RenderOptions,
  type RenderLabels,
} from "./render.js";
export { renderXhtmlContent, type AttachmentLookup, type XhtmlRenderOptions } from "./sanitize.js";
export { DEFAULT_CSS } from "./styles.js";
