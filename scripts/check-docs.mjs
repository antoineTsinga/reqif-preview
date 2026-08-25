/**
 * Fails the docs build if a symbol exported by `src/index.ts` is documented
 * nowhere under `docs/api/`.
 *
 * Same reasoning as `check-bundle.mjs`: the only thing that reliably keeps
 * documentation from drifting is a check that breaks the build. A README
 * paragraph asking future maintainers to "remember to document new exports"
 * has already failed twice in this repo.
 *
 * The export list is read through the TypeScript compiler rather than with a
 * regex, so `export * from "./types.js"` is expanded exactly the way a consumer
 * of the package sees it — types included, which are the bulk of the surface.
 *
 *   node scripts/check-docs.mjs
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ENTRY = "src/index.ts";
const API_DIR = "docs/api";

/** Every name `import * as x from "reqif-preview"` would expose. */
function publicExports(entry) {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, ".");
  const program = ts.createProgram([entry], parsed.options);
  const source = program.getSourceFile(entry);
  if (!source) throw new Error(`Entrée introuvable : ${entry}`);

  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`${entry} n'est pas un module.`);

  return checker
    .getExportsOfModule(moduleSymbol)
    .map((s) => s.getName())
    .filter((n) => n !== "default")
    .sort();
}

function apiProse() {
  return readdirSync(API_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => readFileSync(join(API_DIR, f), "utf8"))
    .join("\n");
}

const exported = publicExports(ENTRY);
const prose = apiProse();

// Word-boundary match: `RenderOptions` must not be satisfied by a stray
// mention of `RenderOptionsFoo`, and `escapeHtml` must not be satisfied by
// `unescapeHtml`.
const missing = exported.filter((name) => !new RegExp(`\\b${name}\\b`).test(prose));

if (missing.length > 0) {
  console.error(
    `\n${missing.length} export(s) de ${ENTRY} ne sont documentés nulle part dans ${API_DIR}/ :\n`,
  );
  for (const name of missing) console.error(`  - ${name}`);
  console.error(
    `\nAjoutez-les à une page d'API (ou retirez-les de ${ENTRY} s'ils ne font pas` +
      ` partie de la surface publique).\n`,
  );
  process.exit(1);
}

console.log(`check-docs : ${exported.length} exports publics, tous documentés dans ${API_DIR}/.`);
