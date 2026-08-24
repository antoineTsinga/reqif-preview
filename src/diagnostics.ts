/**
 * An observation channel for the things this library silently degrades.
 *
 * The rendering pipeline is deliberately fail-safe: past the parsing stage
 * nothing throws, a surprising input degrades locally and the rest of the
 * document still renders. That is the right behaviour in production and a
 * miserable one in support — faced with "some things are missing from my
 * preview", there was previously no way to obtain a report. Handing a
 * `onDegradation` handler to the renderer turns every one of those decisions
 * into an event you can log, count or assert on.
 *
 * Nothing here changes what is rendered. It only makes the choices visible.
 */

export type DegradationCode =
  /** A referenced attachment was not found by the resolver. */
  | "attachment-missing"
  /** A referenced attachment exceeded `maxInlineBytes` and was left unresolved. */
  | "attachment-too-large"
  /** A SpecRelation pointed at a SpecObject that is nowhere in the render. */
  | "unresolved-reference"
  /** A value whose AttributeDefinition is absent from the declared SpecType. */
  | "orphan-attribute-value"
  /** A SpecHierarchy node pointed at a SpecObject that does not exist. */
  | "missing-spec-object"
  /** The same SpecObject appears more than once in the tree; only the first occurrence carries the anchor id. */
  | "duplicate-dom-id"
  /** A customAttributeRenderers callback threw and was skipped. */
  | "custom-renderer-threw"
  /** A customAttributeRenderers callback returned unbalanced HTML; it was escaped. */
  | "custom-renderer-unbalanced-html"
  /** A tag in DROP_ENTIRELY_TAGS was removed together with its subtree. */
  | "dropped-tag"
  /** A tag outside the allowlist was unwrapped; its children were kept. */
  | "unwrapped-tag"
  /** One declaration of a `style` attribute failed validation and was dropped. */
  | "dropped-style-declaration"
  /** An `href` using a blocked URL scheme was removed. */
  | "dropped-href"
  /** A date attribute could not be parsed and is displayed verbatim. */
  | "unparsable-date"
  /** `Intl.DateTimeFormat` rejected the configured locale. */
  | "invalid-locale";

export interface DegradationEvent {
  code: DegradationCode;
  /** A human-readable sentence, safe to log as-is. */
  message: string;
  /** Whatever identifies the spot: an id, a path, a tag name, the offending value. */
  detail?: Record<string, unknown>;
}

export type DegradationHandler = (event: DegradationEvent) => void;

/**
 * Delivers one event, defensively.
 *
 * A handler is consumer code, so it gets the same treatment as a custom
 * renderer: if it throws, that must not take the render down with it. A
 * diagnostic channel that can break the thing it observes is worse than no
 * channel at all.
 */
export function reportDegradation(
  handler: DegradationHandler | undefined,
  code: DegradationCode,
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (!handler) return;
  try {
    handler({ code, message, detail });
  } catch {
    // Intentionally silent: reporting a failure of the reporter has nowhere
    // left to go.
  }
}
