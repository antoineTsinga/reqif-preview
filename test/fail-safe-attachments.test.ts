import { describe, expect, it } from "vitest";
import { loadReqIfPackage, renderPackageToHtml, type DegradationEvent } from "../src/index.js";
import { SYNTHETIC_REQIF, TINY_PNG_BASE64 } from "./fixtures.js";

/** The markup without the inlined stylesheet, whose selectors mention the same class names. */
function body(html: string): string {
  return html.replace(/<style>[\s\S]*?<\/style>/g, "");
}

describe("an attachment resolver that fails", () => {
  const exploding = {
    resolve(path: string) {
      return {
        path,
        size: 10,
        mimeType: "image/png",
        getBytes: async (): Promise<Uint8Array> => {
          throw new Error("disk is on fire");
        },
      };
    },
  };

  it("degrades locally when getBytes rejects, instead of losing the document", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const events: DegradationEvent[] = [];

    const html = await renderPackageToHtml(pkg, { attachments: exploding, onDegradation: (e) => events.push(e) });

    const steps = new Set(events.filter((e) => e.code === "attachment-unreadable").map((e) => e.detail?.["step"]));
    expect(steps).toEqual(new Set(["read"]));
    expect(body(html)).toContain("log in");
  });

  it("degrades the same way when resolve itself throws", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const events: DegradationEvent[] = [];

    const html = await renderPackageToHtml(pkg, {
      attachments: {
        resolve() {
          throw new Error("resolver exploded");
        },
      },
      onDegradation: (e) => events.push(e),
    });

    const steps = new Set(events.filter((e) => e.code === "attachment-unreadable").map((e) => e.detail?.["step"]));
    expect(steps).toEqual(new Set(["resolve"]));
    expect(body(html)).toContain("log in");
  });

  it("leaves the unreadable path unresolved, so the document's own fallback runs", async () => {
    // The fixture nests <object data="demo.mp3"> inside <object data="diagram.png">.
    // Failing only the outer one must let the inner alternative be used.
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
    const png = Uint8Array.from(Buffer.from(TINY_PNG_BASE64, "base64"));
    const events: DegradationEvent[] = [];

    const html = await renderPackageToHtml(pkg, {
      attachments: {
        resolve(path: string) {
          if (path === "diagram.png") throw new Error("unreadable");
          return { path, size: png.byteLength, mimeType: "image/png", getBytes: async () => png };
        },
      },
      onDegradation: (e) => events.push(e),
    });

    const failed = events.filter((e) => e.code === "attachment-unreadable").map((e) => e.detail?.["path"]);
    expect(new Set(failed)).toEqual(new Set(["diagram.png"]));
    expect(body(html)).toContain('<img src="data:image/png;base64,');
  });

  it("survives a diagnostic handler that throws as well", async () => {
    const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);

    const html = await renderPackageToHtml(pkg, {
      attachments: exploding,
      onDegradation: () => {
        throw new Error("observer exploded");
      },
    });

    expect(body(html)).toContain("log in");
  });
});

/**
 * A rejection is not necessarily an `Error`. Describing it inside a catch block
 * is the one place where formatting the cause can undo the guard that caught
 * it, so every guard that reports a thrown value is checked against the shapes
 * that break naive formatting.
 */
describe("thrown values that resist being described", () => {
  const shapes: Record<string, () => unknown> = {
    "a null-prototype object": () => Object.create(null) as unknown,
    "an object whose toString throws": () => ({
      toString() {
        throw new Error("nope");
      },
    }),
    "an object whose Symbol.toPrimitive throws": () => ({
      [Symbol.toPrimitive]() {
        throw new Error("nope");
      },
    }),
    // Even `instanceof` traps on a revoked proxy, so the type check has to sit
    // inside the guard with everything else.
    "a revoked proxy": () => {
      const revocable = Proxy.revocable({}, {});
      revocable.revoke();
      return revocable.proxy;
    },
    "an Error whose message getter throws": () => {
      const error = new Error("x");
      Object.defineProperty(error, "message", {
        get() {
          throw new Error("nope");
        },
      });
      return error;
    },
  };

  for (const [label, make] of Object.entries(shapes)) {
    it(`keeps rendering when resolve throws ${label}`, async () => {
      const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
      const events: DegradationEvent[] = [];

      const html = await renderPackageToHtml(pkg, {
        attachments: {
          resolve() {
            throw make();
          },
        },
        onDegradation: (e) => events.push(e),
      });

      const unreadable = events.filter((e) => e.code === "attachment-unreadable");
      expect(new Set(unreadable.map((e) => e.detail?.["step"]))).toEqual(new Set(["resolve"]));
      expect(new Set(unreadable.map((e) => e.detail?.["path"]))).toEqual(new Set(["diagram.png", "demo.mp3"]));
      expect(body(html)).toContain("log in");
    });

    it(`keeps rendering when getBytes rejects ${label}`, async () => {
      const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
      const events: DegradationEvent[] = [];

      const html = await renderPackageToHtml(pkg, {
        attachments: {
          resolve: (path: string) => ({
            path,
            size: 10,
            mimeType: "image/png",
            getBytes: async (): Promise<Uint8Array> => {
              throw make();
            },
          }),
        },
        onDegradation: (e) => events.push(e),
      });

      expect(new Set(events.filter((e) => e.code === "attachment-unreadable").map((e) => e.detail?.["step"]))).toEqual(
        new Set(["read"]),
      );
      expect(body(html)).toContain("log in");
    });

    it(`keeps rendering when a custom renderer throws ${label}`, async () => {
      const pkg = await loadReqIfPackage(SYNTHETIC_REQIF);
      const events: DegradationEvent[] = [];

      const html = await renderPackageToHtml(pkg, {
        customAttributeRenderers: [
          {
            attribute: "Name",
            render() {
              throw make();
            },
          },
        ],
        onDegradation: (e) => events.push(e),
      });

      expect(events.map((e) => e.code)).toContain("custom-renderer-threw");
      expect(body(html)).toContain("log in");
    });
  }
});
