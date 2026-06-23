import { strFromU8, unzipSync } from "fflate";
import { parseReqIfXml } from "./parse-document.js";
import { ReqIfParseError } from "./errors.js";
import type { AttachmentResolver, ReqIfAttachment, ReqIfDocument, ReqIfPackage } from "./types.js";

export type ReqIfInput = string | Uint8Array | ArrayBuffer;

function toUint8Array(input: ReqIfInput): Uint8Array {
  if (typeof input === "string") return new TextEncoder().encode(input);
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/** ZIP local-file-header magic number ("PK"), enough to tell .reqif from .reqifz. */
function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  svg: "image/svg+xml",
  bmp: "image/bmp",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  html: "text/html",
  htm: "text/html",
  xml: "application/xml",
  json: "application/json",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  mp4: "video/mp4",
  csv: "text/csv",
  zip: "application/zip",
};

function guessMime(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? MIME_BY_EXT[ext] : undefined;
}

function normalizePath(path: string): string {
  return path.replace(/^\.?\//, "").replace(/\\/g, "/");
}

export const EMPTY_ATTACHMENTS: AttachmentResolver = {
  resolve: () => undefined,
  list: () => [],
};

class MapAttachmentResolver implements AttachmentResolver {
  private byPath = new Map<string, ReqIfAttachment>();

  constructor(entries: Map<string, Uint8Array>) {
    for (const [path, bytes] of entries) {
      const attachment: ReqIfAttachment = {
        path,
        mimeType: guessMime(path),
        size: bytes.length,
        getBytes: async () => bytes,
      };
      this.byPath.set(path, attachment);
      this.byPath.set(normalizePath(path), attachment);
    }
  }

  resolve(path: string): ReqIfAttachment | undefined {
    return this.byPath.get(path) ?? this.byPath.get(normalizePath(path));
  }

  list(): ReqIfAttachment[] {
    return [...new Set(this.byPath.values())];
  }
}

/**
 * Build a resolver from your own lookup function — useful when you have a
 * plain `.reqif` file plus sidecar assets that did not travel inside a zip
 * (e.g. images fetched from your own backend by relative path).
 */
export function createAttachmentResolver(
  fetchByPath: (path: string) => { bytes: Uint8Array; mimeType?: string } | undefined,
): AttachmentResolver {
  const cache = new Map<string, ReqIfAttachment>();
  return {
    resolve(path: string) {
      const key = normalizePath(path);
      const cached = cache.get(key);
      if (cached) return cached;
      const found = fetchByPath(path);
      if (!found) return undefined;
      const attachment: ReqIfAttachment = {
        path,
        mimeType: found.mimeType ?? guessMime(path),
        size: found.bytes.length,
        getBytes: async () => found.bytes,
      };
      cache.set(key, attachment);
      return attachment;
    },
    list() {
      return [...cache.values()];
    },
  };
}

/**
 * Loads a ReqIF package from raw bytes/text and auto-detects whether it's a
 * bare `.reqif` XML document or a `.reqifz` zip archive (which may legally
 * contain several `.reqif` documents plus binary attachments).
 */
export async function loadReqIfPackage(input: ReqIfInput): Promise<ReqIfPackage> {
  if (typeof input === "string") {
    const doc = parseReqIfXml(input);
    return { documents: [doc], document: doc, attachments: EMPTY_ATTACHMENTS };
  }

  const bytes = toUint8Array(input);
  if (!looksLikeZip(bytes)) {
    const doc = parseReqIfXml(strFromU8(bytes));
    return { documents: [doc], document: doc, attachments: EMPTY_ATTACHMENTS };
  }

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch (err) {
    throw new ReqIfParseError("Failed to read .reqifz archive.", err);
  }

  const documents: ReqIfDocument[] = [];
  const attachmentEntries = new Map<string, Uint8Array>();
  for (const [path, data] of Object.entries(entries)) {
    if (path.endsWith("/")) continue; // directory marker, no content
    if (/\.reqif$/i.test(path)) {
      documents.push(parseReqIfXml(strFromU8(data)));
    } else {
      attachmentEntries.set(path, data);
    }
  }

  if (documents.length === 0) {
    throw new ReqIfParseError("No .reqif document found inside the .reqifz archive.");
  }

  return {
    documents,
    document: documents[0],
    attachments: new MapAttachmentResolver(attachmentEntries),
  };
}
