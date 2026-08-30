/**
 * Fails the docs build if a code example uses a variable that comes from
 * nowhere.
 *
 * The problem this catches: a reader landing on `docs/guide/relations.md` from
 * a search engine read `renderPackageToHtml(pkg, …)` with nothing on the page
 * saying what `pkg` was. Across the docs, `pkg` appeared in 22 blocks and was
 * defined in exactly one. Prose asking future maintainers to "introduce your
 * variables" has already failed twice in this repo, so this is a check that
 * breaks the build instead.
 *
 * It type-checks each example and reports ONLY "Cannot find name 'X'"
 * (TS2304/TS2552). That narrowness is deliberate: a documentation snippet
 * legitimately triggers plenty of other errors without being wrong.
 * `document.getElementById("preview").innerHTML` is possibly-null under
 * `strict`, and `docs/guide/demarrage.md` declares `const html` twice on
 * purpose to contrast two calls. Filtering by error code lets those through
 * without needing a single exemption.
 *
 * Three kinds of block are not checked, in decreasing order of automation:
 *
 *   1. Declarations — `function`, `interface`, `type`, `class`, `declare`,
 *      `enum`. Half the blocks in `docs/api/` are signatures; they have no
 *      runtime variables at all. Recognised by shape, no marker needed.
 *
 *   2. Blocks marked `<!-- exemple: extrait — <raison> -->` on the line above.
 *      For fragments that are partial on purpose, where showing the whole
 *      program would bury the point. The reason is REQUIRED: an unexplained
 *      marker fails, which is what stops the escape hatch from quietly
 *      becoming a dumping ground.
 *
 *   3. Names the docs deliberately leave to the reader — see PLACEHOLDERS.
 *      Kept as one short central list rather than scattered local exemptions,
 *      so it stays reviewable.
 *
 * The preamble every example is checked against is not written here: it is
 * read from the `ts` block of `docs/_conventions.md`, the same text the reader
 * is shown. One source, so the checker cannot assume something the docs do not
 * actually say.
 *
 *   node scripts/check-doc-examples.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const ENTRY = "src/index.ts";
const CONVENTIONS = "docs/_conventions.md";
const VIRTUAL_DIR = resolve(ROOT, "__doc-examples__");

/**
 * Identifiers the examples intentionally leave undefined, because their whole
 * point is that you supply them. Their names say so. Keep this list short —
 * every addition is a place where the docs stop explaining themselves.
 */
const PLACEHOLDERS = [
  "declare function myOwnFileLookup(path: string): Uint8Array | undefined;",
  "declare function showUserError(message: string): void;",
];

/** Blocks whose first meaningful line is one of these are declarations. */
const DECLARATION = /^\s*(?:export\s+)?(?:declare|function|interface|type|class|enum)\b/;

/** `<!-- exemple: extrait — pourquoi -->` immediately above a fence. */
const SKIP_WITH_REASON = /<!--\s*exemple\s*:\s*extrait\s*[—–-]\s*(\S.*?)\s*-->\s*$/;
const SKIP_BARE = /<!--\s*exemple\s*:\s*extrait\s*-->\s*$/;

const CHECKED_LANGS = new Set(["ts", "typescript", "js", "javascript"]);

// --- gathering ---------------------------------------------------------------

function markdownFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".vitepress" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) markdownFiles(path, out);
    else if (entry.endsWith(".md")) out.push(path);
  }
  return out;
}

/** Every fenced code block, with the 1-based line its first code line sits on. */
function codeBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const fence = /^```(\w+)/.exec(lines[i]);
    if (!fence) continue;
    const start = i + 1;
    let end = start;
    while (end < lines.length && !/^```\s*$/.test(lines[end])) end++;
    blocks.push({
      lang: fence[1],
      code: lines.slice(start, end).join("\n"),
      startLine: start + 1, // 1-based line of the first code line
      // The nearest non-blank line above the fence, for the skip marker.
      preceding: (() => {
        for (let j = i - 1; j >= 0; j--) if (lines[j].trim()) return lines[j];
        return "";
      })(),
    });
    i = end;
  }
  return blocks;
}

// --- the library's own names ------------------------------------------------

/**
 * Puts every public export in scope ambiently, generated from the real export
 * list rather than a hand-kept copy.
 *
 * This check is about YOUR variables, not about repeating imports: a snippet
 * demonstrating one option would learn nothing from an `import` line, and
 * twenty of them would be noise. The docs establish once — in the conventions
 * block — that these names come from `"reqif-preview"`.
 *
 * Generating the list from the compiler has a side benefit: an example calling
 * a function that no longer exists now fails, because the name is not in the
 * generated scope either.
 */
function apiGlobals() {
  const config = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, ROOT);
  const program = ts.createProgram([ENTRY], parsed.options);
  const source = program.getSourceFile(ENTRY);
  if (!source) throw new Error(`Entrée introuvable : ${ENTRY}`);
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`${ENTRY} n'est pas un module.`);

  const TYPE = ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias | ts.SymbolFlags.Enum;
  const values = [];
  const types = [];
  for (const symbol of checker.getExportsOfModule(moduleSymbol)) {
    const name = symbol.getName();
    if (name === "default") continue;
    const flags =
      symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol).flags : symbol.flags;
    // A class is both, and needs both to be usable as `new X()` and as a type.
    if (flags & ts.SymbolFlags.Value) values.push(name);
    if (flags & (TYPE | ts.SymbolFlags.Class)) types.push(name);
  }

  return (
    `import type * as RP from "reqif-preview";\ndeclare global {\n` +
    values.map((n) => `  const ${n}: typeof RP.${n};`).join("\n") +
    "\n" +
    types.map((n) => `  type ${n} = RP.${n};`).join("\n") +
    `\n}\nexport {};\n`
  );
}

// --- the preamble the reader is actually shown -------------------------------

const conventionsText = readFileSync(join(ROOT, CONVENTIONS), "utf8");
const conventionsBlock = codeBlocks(conventionsText).find((b) => CHECKED_LANGS.has(b.lang));
if (!conventionsBlock) {
  console.error(`\n${CONVENTIONS} ne contient aucun bloc de code TypeScript.`);
  console.error("C'est lui qui sert de préambule à tous les exemples vérifiés.\n");
  process.exit(1);
}

const preamble = `${conventionsBlock.code}\n${PLACEHOLDERS.join("\n")}\n`;
const preambleLines = preamble.split("\n").length - 1;

/** Names the conventions bring into scope, for the "did you include it?" check. */
const conventionNames = [...conventionsBlock.code.matchAll(/\b(?:const|let|declare const)\s+(\w+)/g)]
  .map((m) => m[1])
  .filter((n, i, a) => a.indexOf(n) === i);

// --- classify ----------------------------------------------------------------

const files = [...markdownFiles(join(ROOT, "docs")), join(ROOT, "README.md")].filter(
  (f) => f !== join(ROOT, CONVENTIONS),
);

const units = []; // { virtualName, file, startLine, code }
const problems = [];
let skippedDeclaration = 0;
let skippedFragment = 0;

for (const file of files) {
  const relative = file.slice(ROOT.length + 1).replaceAll("\\", "/");
  const text = readFileSync(file, "utf8");
  const includesConventions = text.includes("_conventions.md");

  // A page is read top to bottom, so a variable introduced by an earlier block
  // is introduced, full stop. Each block is therefore checked with the blocks
  // above it prepended — which is exactly what the reader has in mind by the
  // time they reach it.
  let context = "";
  let contextLines = 0;

  for (const block of codeBlocks(text)) {
    if (!CHECKED_LANGS.has(block.lang)) continue;

    if (SKIP_BARE.test(block.preceding)) {
      problems.push(
        `${relative}:${block.startLine} — marqueur « exemple: extrait » sans raison.\n` +
          `      Écrivez pourquoi ce bloc est partiel : <!-- exemple: extrait — la raison -->`,
      );
      continue;
    }
    if (SKIP_WITH_REASON.test(block.preceding)) {
      skippedFragment++;
      continue;
    }

    const meaningful = block.code.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "").trim();
    if (DECLARATION.test(meaningful)) {
      skippedDeclaration++;
      continue;
    }

    // A page whose example leans on a convention must actually show it.
    if (!includesConventions) {
      const leaning = conventionNames.filter((n) =>
        new RegExp(`(?<![.\\w])${n}\\b`).test(meaningful),
      );
      const alreadyIntroduced = new Set(
        [...`${context}\n${meaningful}`.matchAll(/\b(?:const|let|var|function)\s+(\w+)/g)].map(
          (m) => m[1],
        ),
      );
      const borrowed = leaning.filter((n) => !alreadyIntroduced.has(n));
      if (borrowed.length > 0) {
        problems.push(
          `${relative}:${block.startLine} — utilise ${borrowed.map((n) => `\`${n}\``).join(", ")} ` +
            `sans inclure les conventions.\n` +
            `      Ajoutez <!--@include: ${relative.startsWith("docs/guide/") || relative.startsWith("docs/api/") ? "../_conventions.md" : "./_conventions.md"}--> en haut de la page,\n` +
            `      ou définissez ces variables dans le bloc.`,
        );
      }
    }

    units.push({
      virtualName: join(VIRTUAL_DIR, `u${units.length}.ts`),
      file: relative,
      startLine: block.startLine,
      offset: preambleLines + contextLines,
      // `export {}` makes every block its own module. Without it these are
      // scripts sharing one global scope, and a `const pkg` in one example
      // would silently satisfy a ghost `pkg` in another page — defeating the
      // check. Sharing within a page is deliberate; across pages is a bug.
      code: `${preamble}${context}${block.code}\nexport {};\n`,
    });

    context += `${block.code}\n`;
    contextLines += block.code.split("\n").length;
  }
}

// --- type-check --------------------------------------------------------------

const config = ts.readConfigFile(join(ROOT, "tsconfig.json"), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config ?? {}, ts.sys, ROOT);
const options = {
  ...parsed.options,
  noEmit: true,
  declaration: false,
  rootDir: undefined,
  outDir: undefined,
  baseUrl: ROOT,
  // Examples import from the package name; resolve it to the source, so the
  // check runs against src/ rather than a possibly stale dist/.
  paths: { "reqif-preview": [resolve(ROOT, "src/index.ts")] },
};

const GLOBALS_FILE = join(VIRTUAL_DIR, "api-globals.d.ts");
const sources = new Map([
  [GLOBALS_FILE, apiGlobals()],
  ...units.map((u) => [u.virtualName, u.code]),
]);
const host = ts.createCompilerHost(options, true);
const realGetSourceFile = host.getSourceFile.bind(host);
const realFileExists = host.fileExists.bind(host);
const realReadFile = host.readFile.bind(host);

host.getSourceFile = (name, languageVersion, onError, shouldCreate) => {
  const virtual = sources.get(name) ?? sources.get(resolve(name));
  if (virtual !== undefined) {
    return ts.createSourceFile(name, virtual, languageVersion, true);
  }
  return realGetSourceFile(name, languageVersion, onError, shouldCreate);
};
host.fileExists = (name) => sources.has(name) || sources.has(resolve(name)) || realFileExists(name);
host.readFile = (name) => sources.get(name) ?? sources.get(resolve(name)) ?? realReadFile(name);

const program = ts.createProgram(
  [GLOBALS_FILE, ...units.map((u) => u.virtualName)],
  options,
  host,
);

const GHOST_CODES = new Set([2304, 2552]); // Cannot find name / did you mean

for (const unit of units) {
  const source = program.getSourceFile(unit.virtualName);
  if (!source) continue;
  for (const diagnostic of program.getSemanticDiagnostics(source)) {
    if (!GHOST_CODES.has(diagnostic.code) || diagnostic.start === undefined) continue;
    const { line } = source.getLineAndCharacterOfPosition(diagnostic.start);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    if (line < preambleLines) {
      problems.push(`${CONVENTIONS} — le préambule partagé est cassé : ${message}`);
    } else if (line < unit.offset) {
      // In an earlier block of the same page: already reported against it.
      continue;
    } else {
      problems.push(`${unit.file}:${unit.startLine + (line - unit.offset)} — ${message}`);
    }
  }
}

// --- report ------------------------------------------------------------------

if (problems.length > 0) {
  console.error(`\n${problems.length} problème(s) dans les exemples de la documentation :\n`);
  for (const p of [...new Set(problems)].sort()) console.error(`  - ${p}`);
  console.error(
    `\nIntroduisez la variable dans le bloc, incluez ${CONVENTIONS},\n` +
      `ou — si le bloc est partiel à dessein — marquez-le au-dessus par\n` +
      `  <!-- exemple: extrait — pourquoi il doit rester partiel -->\n`,
  );
  process.exit(1);
}

console.log(
  `check-doc-examples : ${units.length} exemples vérifiés, ` +
    `${skippedDeclaration} déclarations et ${skippedFragment} extraits assumés ignorés.`,
);
