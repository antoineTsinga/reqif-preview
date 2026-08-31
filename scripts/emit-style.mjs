/**
 * Writes `dist/style.css` from the bundle's own `DEFAULT_CSS`.
 *
 * `package.json` advertises a `reqif-preview/style.css` export, and the
 * renderer's `includeCss: false` option is only usable if that file exists —
 * otherwise there is no way to obtain the styles the markup is scoped against.
 *
 * The string is read from the built bundle rather than re-declared here, so
 * the file and the inline `<style>` cannot say different things.
 *
 *   npm run build   (runs this last)
 */
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const BUNDLE = resolve("dist/index.js");
const DEST = "dist/style.css";

const { DEFAULT_CSS } = await import(pathToFileURL(BUNDLE).href);

if (typeof DEFAULT_CSS !== "string" || DEFAULT_CSS.length === 0) {
  console.error(
    `DEFAULT_CSS est absent ou vide dans ${BUNDLE}.\n` +
      `Il doit rester exporté par src/index.ts : c'est la seule source de ${DEST}.`,
  );
  process.exit(1);
}

const banner = `/* reqif-preview — feuille de style de l'aperçu.\n   Équivaut au <style> injecté par défaut ; à charger si vous rendez avec\n   { includeCss: false }. Toutes les règles sont scopées sous .reqif-preview. */\n`;

await writeFile(DEST, banner + DEFAULT_CSS.trim() + "\n", "utf8");
console.log(`style    : ${DEST} (${(DEFAULT_CSS.length / 1024).toFixed(1)} Ko)`);
