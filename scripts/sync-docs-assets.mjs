/**
 * Copies the freshly built bundle and regenerates the sample package into
 * `docs/public/`, so the documentation site always demonstrates the code that
 * is in the tree right now.
 *
 * The previous documentation page inlined a hand-pasted copy of the bundle. It
 * was never regenerated, and within two months it was showing the behaviour of
 * a version that no longer existed. Both outputs here are gitignored: they are
 * build artefacts, produced by `npm run docs:build`, never edited by hand.
 *
 *   npm run build && node scripts/sync-docs-assets.mjs
 */
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const BUNDLE_SRC = "dist/index.js";
const PUBLIC_DIR = "docs/public";
const BUNDLE_DEST = `${PUBLIC_DIR}/reqif-preview.js`;
const SAMPLE_DEST = `${PUBLIC_DIR}/exemple.reqifz`;
const HERO_DEST = "docs/.vitepress/theme/hero-preview.generated.html";

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} Ko`;

await mkdir(PUBLIC_DIR, { recursive: true });

try {
  await stat(BUNDLE_SRC);
} catch {
  console.error(
    `${BUNDLE_SRC} est absent. Lancez \`npm run build\` avant \`sync-docs-assets\`` +
      ` (les scripts docs:* le font pour vous).`,
  );
  process.exit(1);
}

await copyFile(BUNDLE_SRC, BUNDLE_DEST);
console.log(`bundle   : ${BUNDLE_DEST} (${kb((await stat(BUNDLE_DEST)).size)})`);

// The sandbox needs a package that actually exercises what the site claims:
// three cross-referencing documents, one attachment, one dangling relation and
// one object rendered twice.
await run(process.execPath, ["make-sample-package.mjs", SAMPLE_DEST]);
console.log(`exemple  : ${SAMPLE_DEST} (${kb((await stat(SAMPLE_DEST)).size)})`);

// The landing page's illustration. Rendering it here rather than shipping a
// screenshot means it cannot go stale, and — because the library runs on Node
// and emits self-contained HTML with its own <style> — it costs the visitor
// nothing: no headless browser at build time, no 216 Ko bundle downloaded on a
// page that only wants to show what the output looks like.
//
// One document, not the whole package: a single document has no tabs, so the
// illustration cannot hijack the landing page's URL fragment through :target.
const lib = await import("../dist/index.js");
const samplePkg = await lib.loadReqIfPackage(new Uint8Array(await readFile(SAMPLE_DEST)));
const heroHtml = await lib.renderDocumentToHtml(samplePkg.document, samplePkg.attachments);
await writeFile(HERO_DEST, heroHtml, "utf8");
console.log(`aperçu   : ${HERO_DEST} (${kb(heroHtml.length)})`);
