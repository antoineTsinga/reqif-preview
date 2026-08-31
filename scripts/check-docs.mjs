/**
 * Fails the docs build if a symbol exported by `src/index.ts` is documented
 * nowhere in any locale's API reference.
 *
 * The only thing that reliably keeps documentation from drifting is a check
 * that breaks the build. A README paragraph asking future maintainers to
 * "remember to document new exports" is not a control; this is.
 *
 * The export list is read through the TypeScript compiler rather than with a
 * regex, so `export * from "./types.js"` is expanded exactly the way a consumer
 * of the package sees it — types included, which are the bulk of the surface.
 *
 * A symbol documented in any one locale counts. The check is that the public
 * surface is described somewhere a reader can reach, not that every
 * translation is finished — that would block adding a language.
 *
 *   node scripts/check-docs.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const ENTRY = "src/index.ts";
const DOCS_DIR = "docs";

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

/** Every `api/` directory under docs/, one per locale that has one. */
function apiDirs(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".vitepress" || entry === "public") continue;
    const path = join(dir, entry);
    if (!statSync(path).isDirectory()) continue;
    if (entry === "api") out.push(path);
    else apiDirs(path, out);
  }
  return out;
}

function apiProse(dirs) {
  return dirs
    .flatMap((d) =>
      readdirSync(d)
        .filter((f) => f.endsWith(".md"))
        .map((f) => join(d, f)),
    )
    .map((f) => readFileSync(f, "utf8"))
    .join("\n");
}

const dirs = apiDirs(DOCS_DIR);
if (dirs.length === 0) {
  console.error(`\nAucune référence API trouvée sous ${DOCS_DIR}/.`);
  process.exit(1);
}

const exported = publicExports(ENTRY);
const prose = apiProse(dirs);

// Word-boundary match: `RenderOptions` must not be satisfied by a stray
// mention of `RenderOptionsFoo`, and `escapeHtml` must not be satisfied by
// `unescapeHtml`.
const missing = exported.filter((name) => !new RegExp(`\\b${name}\\b`).test(prose));

if (missing.length > 0) {
  console.error(
    `\n${missing.length} export(s) de ${ENTRY} ne sont documentés dans aucune référence API :\n`,
  );
  for (const name of missing) console.error(`  - ${name}`);
  console.error(
    `\nAjoutez-les à une page d'API (ou retirez-les de ${ENTRY} s'ils ne font pas` +
      ` partie de la surface publique).\n`,
  );
  process.exit(1);
}

console.log(
  `check-docs : ${exported.length} exports publics, tous documentés` +
    ` (${dirs.length} référence(s) API : ${dirs.join(", ")}).`,
);
