/**
 * Fails the docs build when the API reference drifts from `src/index.ts`.
 *
 * Two checks, both derived from the code through the TypeScript compiler
 * rather than from a list someone has to remember to update:
 *
 *   1. every exported symbol is documented somewhere;
 *   2. every interface the docs spell out as a block has exactly the members
 *      the real one has.
 *
 * The second exists because the first is not enough, and we found out the hard
 * way: `RenderLabels` is documented as a full interface listing, a field was
 * added to it, and nothing broke — the name `RenderLabels` was still mentioned,
 * so check (1) was satisfied while the block quietly described 18 of 19 fields.
 * A reader copying it would have had a type error and no idea why.
 *
 * The comparison is deliberately asymmetric, because the pages legitimately use
 * two styles and a symmetric rule rejects one of them:
 *
 *   - a field **declared on** the real interface and absent from the block is
 *     an error. That is the drift worth catching.
 *   - a field in the block is an error only if the real type has no such
 *     property at all, inherited ones included. Blocks that lean on `extends`
 *     show fewer members; blocks that flatten show more — `AttributeValueString`
 *     spells out `definitionRef`, inherited from a base that is not exported,
 *     so a reader could not have followed an `extends` to find it. Both are
 *     honest, and only a field that exists nowhere is a lie.
 *
 *   node scripts/check-docs.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

const ENTRY = "src/index.ts";
const DOCS_DIR = "docs";

/** `<!-- exemple: extrait — pourquoi -->`, the same marker the examples guard uses. */
const SKIP_WITH_REASON = /<!--\s*exemple\s*:\s*extrait\s*[—–-]\s*(\S.*?)\s*-->\s*$/;

const CODE_LANGS = new Set(["ts", "typescript"]);

// --- the code's own account of itself ---------------------------------------

function program(entry) {
  const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, ".");
  const prog = ts.createProgram([entry], parsed.options);
  const source = prog.getSourceFile(entry);
  if (!source) throw new Error(`Entrée introuvable : ${entry}`);
  const checker = prog.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`${entry} n'est pas un module.`);
  return { exports: checker.getExportsOfModule(moduleSymbol), checker };
}

/** The name of one interface member, or undefined for index/call signatures. */
function memberName(member, sourceFile) {
  if (!member.name) return undefined;
  if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) return member.name.text;
  return sourceFile ? member.name.getText(sourceFile) : undefined;
}

/**
 * The symbol an export name really refers to.
 *
 * `export { type RenderLabels } from "./render.js"` produces an *alias*, whose
 * declaration is the export specifier rather than the interface. Reading
 * members off it finds none, so the check silently skipped every re-exported
 * type -- including RenderLabels, the one case it was written for. It passed,
 * which is the worst way for a guard to be wrong.
 */
function resolve(symbol, checker) {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

/** Members declared on the interface itself, inherited ones excluded. */
function declaredMembers(symbol) {
  const members = new Set();
  for (const declaration of symbol.getDeclarations() ?? []) {
    if (!ts.isInterfaceDeclaration(declaration)) continue;
    for (const member of declaration.members) {
      const name = memberName(member, declaration.getSourceFile());
      if (name) members.add(name);
    }
  }
  return members;
}

// --- what the documentation claims ------------------------------------------

function markdownFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".vitepress" || entry === "public") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) markdownFiles(path, out);
    else if (entry.endsWith(".md")) out.push(path);
  }
  return out;
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

/** Fenced TypeScript blocks, with the line they start on and the line above. */
function codeBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const fence = /^```(\w+)/.exec(lines[i]);
    if (!fence || !CODE_LANGS.has(fence[1])) continue;
    const start = i + 1;
    let end = start;
    while (end < lines.length && !/^```\s*$/.test(lines[end])) end++;
    let preceding = "";
    for (let j = i - 1; j >= 0; j--) {
      if (lines[j].trim()) {
        preceding = lines[j];
        break;
      }
    }
    blocks.push({ code: lines.slice(start, end).join("\n"), startLine: start + 1, preceding });
    i = end;
  }
  return blocks;
}

/**
 * Interfaces spelled out in the documentation, found by parsing the blocks
 * rather than by matching braces: a member holding an object type, a comment
 * with a brace in it, or a one-line `interface X { a: 1; b: 2 }` all defeat a
 * regex, and all three occur in these pages.
 */
function documentedInterfaces(files) {
  const found = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const block of codeBlocks(text)) {
      if (SKIP_WITH_REASON.test(block.preceding)) continue;
      const parsed = ts.createSourceFile(file, block.code, ts.ScriptTarget.Latest, true);
      for (const statement of parsed.statements) {
        if (!ts.isInterfaceDeclaration(statement)) continue;
        const members = new Set();
        for (const member of statement.members) {
          const name = memberName(member, parsed);
          if (name) members.add(name);
        }
        found.push({
          name: statement.name.text,
          members,
          file,
          // The interface's own line, not the fence's, so the error points at it.
          line: block.startLine + parsed.getLineAndCharacterOfPosition(statement.pos).line,
        });
      }
    }
  }
  return found;
}

// --- checks ------------------------------------------------------------------

const { exports: publicSymbols, checker } = program(ENTRY);
const exported = publicSymbols
  .map((s) => s.getName())
  .filter((n) => n !== "default")
  .sort();

const dirs = apiDirs(DOCS_DIR);
if (dirs.length === 0) {
  console.error(`\nAucune référence API trouvée sous ${DOCS_DIR}/.`);
  process.exit(1);
}

const problems = [];

// 1. Every export documented somewhere -----------------------------------------
const prose = dirs
  .flatMap((d) =>
    readdirSync(d)
      .filter((f) => f.endsWith(".md"))
      .map((f) => join(d, f)),
  )
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

// Word-boundary match: `RenderOptions` must not be satisfied by a stray mention
// of `RenderOptionsFoo`, and `escapeHtml` must not be satisfied by `unescapeHtml`.
for (const name of exported) {
  if (!new RegExp(`\\b${name}\\b`).test(prose)) {
    problems.push(`${ENTRY} exporte « ${name} », documenté dans aucune référence API.`);
  }
}

// 2. Documented interfaces list the real members --------------------------------
const realInterfaces = new Map();
for (const exportedSymbol of publicSymbols) {
  const symbol = resolve(exportedSymbol, checker);
  const own = declaredMembers(symbol);
  if (own.size === 0) continue;
  // Resolved properties too, so a block that flattens an inherited field is
  // accepted while a block naming a field that exists nowhere is not.
  const all = new Set(
    checker.getDeclaredTypeOfSymbol(symbol).getProperties().map((p) => p.getName()),
  );
  realInterfaces.set(exportedSymbol.getName(), { own, all });
}

let compared = 0;
for (const documented of documentedInterfaces(markdownFiles(DOCS_DIR))) {
  const real = realInterfaces.get(documented.name);
  if (!real) continue; // not a public interface: a local illustration, left alone
  compared++;

  const missing = [...real.own].filter((m) => !documented.members.has(m));
  const extra = [...documented.members].filter((m) => !real.all.has(m));
  if (missing.length === 0 && extra.length === 0) continue;

  const where = `${relative(".", documented.file)}:${documented.line}`;
  const parts = [];
  if (missing.length) parts.push(`absent(s) de la doc : ${missing.join(", ")}`);
  if (extra.length) parts.push(`absent(s) du code : ${extra.join(", ")}`);
  problems.push(`${where} — l'interface « ${documented.name} » a dérivé. ${parts.join(" · ")}`);
}

// --- report --------------------------------------------------------------------

if (problems.length > 0) {
  console.error(`\n${problems.length} écart(s) entre le code et la référence API :\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    `\nAjoutez l'export à une page d'API, ou corrigez le bloc de l'interface.\n` +
      `Un bloc volontairement partiel se marque sur la ligne au-dessus :\n` +
      `  <!-- exemple: extrait — pourquoi il ne montre qu'une partie -->\n`,
  );
  process.exit(1);
}

console.log(
  `check-docs : ${exported.length} exports publics tous documentés, ` +
    `${compared} bloc(s) d'interface conformes au code ` +
    `(${dirs.length} référence(s) API : ${dirs.join(", ")}).`,
);
