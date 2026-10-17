/**
 * Measures where the time and the memory actually go, phase by phase.
 *
 * The point is to stop guessing. "Parsing is slow" and "big files are a
 * problem" are claims, not numbers, and every expensive decision downstream —
 * whether to move work to a Worker, whether to virtualise the tree, whether to
 * rewrite the parser to stream — should rest on a measurement rather than on an
 * intuition about file sizes nobody has seen.
 *
 * Two deliberate choices about method:
 *
 *   - Each fixture runs in its own child process, so peak memory can be read
 *     from `process.resourceUsage().maxRSS`. That counter is a high-water mark
 *     that never decreases, which makes it useless within a process and exact
 *     across one.
 *
 *   - Every phase is warmed up and repeated, and the report shows the minimum
 *     alongside the median. A single shot mostly measures JIT warmup: the first
 *     naive probe of this codebase read 49 ms for 0.27 MB and 475 ms for
 *     4.94 MB — 18x the input for 9.7x the time, which looks like sublinear
 *     scaling and is really just a fixed startup cost polluting the small case.
 *
 * No instrumentation inside src/ is needed: the public API already exposes each
 * phase separately. The one thing it does not separate is XHTML conversion from
 * HTML serialisation — both live inside renderSpecification — and splitting
 * those is not worth an internal hook while they are a fraction of parsing.
 *
 *   npm run bench
 */
import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const FIXTURE_DIR = join(ROOT, ".bench");
const SYNTHETIC = join(FIXTURE_DIR, "synthetic-50mb.reqif");

const MB = 1024 * 1024;
const mb = (bytes) =>
  bytes < MB ? `${(bytes / 1024).toFixed(0)} Ko` : `${(bytes / MB).toFixed(2)} Mo`;

// --- the large fixture ------------------------------------------------------

/**
 * A ReqIF document grown to a target size. Deliberately plausible rather than
 * minimal: rich text with nesting, an enumeration, lifecycle attributes — a
 * file of 50 MB of `<p>x</p>` would measure the parser against an input no
 * export produces.
 */
async function ensureSynthetic(targetBytes) {
  try {
    const existing = await stat(SYNTHETIC);
    if (existing.size >= targetBytes * 0.95) return SYNTHETIC;
  } catch {
    /* not generated yet */
  }
  await mkdir(FIXTURE_DIR, { recursive: true });
  process.stdout.write(`génération de ${SYNTHETIC.slice(ROOT.length + 1)} (~${mb(targetBytes)}) : `);

  const head = `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <THE-HEADER><REQ-IF-HEADER IDENTIFIER="bench-hdr">
    <CREATION-TIME>2026-01-01T00:00:00Z</CREATION-TIME>
    <REQ-IF-VERSION>1.0</REQ-IF-VERSION><SOURCE-TOOL-ID>reqif-preview bench</SOURCE-TOOL-ID>
    <TITLE>Synthetic scale fixture</TITLE>
  </REQ-IF-HEADER></THE-HEADER>
  <CORE-CONTENT><REQ-IF-CONTENT>
    <DATATYPES>
      <DATATYPE-DEFINITION-STRING IDENTIFIER="dt-str" LONG-NAME="Text" MAX-LENGTH="4096"/>
      <DATATYPE-DEFINITION-XHTML IDENTIFIER="dt-xhtml" LONG-NAME="Rich"/>
    </DATATYPES>
    <SPEC-TYPES>
      <SPEC-OBJECT-TYPE IDENTIFIER="sot" LONG-NAME="Requirement"><SPEC-ATTRIBUTES>
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="ad-fid" LONG-NAME="ReqIF.ForeignID"><TYPE><DATATYPE-DEFINITION-STRING-REF>dt-str</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="ad-by" LONG-NAME="ReqIF.ForeignCreatedBy"><TYPE><DATATYPE-DEFINITION-STRING-REF>dt-str</DATATYPE-DEFINITION-STRING-REF></TYPE></ATTRIBUTE-DEFINITION-STRING>
        <ATTRIBUTE-DEFINITION-XHTML IDENTIFIER="ad-text" LONG-NAME="ReqIF.Text"><TYPE><DATATYPE-DEFINITION-XHTML-REF>dt-xhtml</DATATYPE-DEFINITION-XHTML-REF></TYPE></ATTRIBUTE-DEFINITION-XHTML>
      </SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE>
      <SPECIFICATION-TYPE IDENTIFIER="spt" LONG-NAME="Module"><SPEC-ATTRIBUTES/></SPECIFICATION-TYPE>
    </SPEC-TYPES>
    <SPEC-OBJECTS>
`;

  const object = (i) => `      <SPEC-OBJECT IDENTIFIER="o-${i}" LONG-NAME="Requirement ${i}"><VALUES>
        <ATTRIBUTE-VALUE-STRING THE-VALUE="SYS-${String(i).padStart(6, "0")}"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>ad-fid</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>
        <ATTRIBUTE-VALUE-STRING THE-VALUE="A. Rousseau"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>ad-by</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>
        <ATTRIBUTE-VALUE-XHTML><DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>ad-text</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION><THE-VALUE>
          <xhtml:div>The system shall <xhtml:strong>satisfy condition ${i}</xhtml:strong> within
            <xhtml:em>250 ms</xhtml:em> under nominal load, as measured at the interface.
            <xhtml:ul><xhtml:li>Precondition: subsystem ${i % 17} initialised &amp; ready</xhtml:li>
            <xhtml:li>Tolerance: &#177;5&#160;% over the operating range</xhtml:li></xhtml:ul>
          </xhtml:div>
        </THE-VALUE></ATTRIBUTE-VALUE-XHTML>
      </VALUES><TYPE><SPEC-OBJECT-TYPE-REF>sot</SPEC-OBJECT-TYPE-REF></TYPE></SPEC-OBJECT>
`;

  const hierarchy = (i) =>
    `        <SPEC-HIERARCHY IDENTIFIER="h-${i}"><OBJECT><SPEC-OBJECT-REF>o-${i}</SPEC-OBJECT-REF></OBJECT></SPEC-HIERARCHY>\n`;

  // Sized off a six-digit index so the estimate does not drift short once the
  // identifiers grow past the sample used to measure them.
  const perObject = Buffer.byteLength(object(100000)) + Buffer.byteLength(hierarchy(100000));
  const count = Math.ceil(targetBytes / perObject);

  const parts = [head];
  for (let i = 0; i < count; i++) parts.push(object(i));
  parts.push(`    </SPEC-OBJECTS>
    <SPECIFICATIONS><SPECIFICATION IDENTIFIER="spec-1" LONG-NAME="Scale module"><VALUES/>
      <TYPE><SPECIFICATION-TYPE-REF>spt</SPECIFICATION-TYPE-REF></TYPE><CHILDREN>
`);
  for (let i = 0; i < count; i++) parts.push(hierarchy(i));
  parts.push(`      </CHILDREN></SPECIFICATION></SPECIFICATIONS>
    <SPEC-RELATIONS/>
  </REQ-IF-CONTENT></CORE-CONTENT>
</REQ-IF>
`);

  await writeFile(SYNTHETIC, parts.join(""), "utf8");
  console.log(`${count.toLocaleString("fr-FR")} SpecObject.`);
  return SYNTHETIC;
}

// --- measurement ------------------------------------------------------------

/** Minimum and median across repeats, after warmup. The minimum is the least
 *  noisy estimate of the real cost; the median shows how stable it is. */
async function repeat(fn, { warmup, runs }) {
  for (let i = 0; i < warmup; i++) await fn();
  const times = [];
  for (let i = 0; i < runs; i++) {
    globalThis.gc?.();
    const started = performance.now();
    await fn();
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  return { min: times[0], median: times[times.length >> 1] };
}

/** Counts the elements a browser would build, ignoring inert script payloads. */
function countDomNodes(html) {
  const inert = html.replace(/<script(?:\s[^>]*)?>[\s\S]*?<\/script>/gi, "<script></script>");
  return (inert.match(/<[a-z]/gi) ?? []).length;
}

async function runCase(file) {
  const { parseReqIfXml, ReqIfIndex, loadReqIfPackage, renderPackageToHtml,
          createAttachmentLookup, renderSpecification } = await import("../dist/index.js");

  const raw = await readFile(file);
  // A 50 MB fixture through seven full pipelines is minutes of waiting for a
  // third decimal nobody reads.
  const budget = raw.length > 10 * MB ? { warmup: 1, runs: 3 } : { warmup: 2, runs: 5 };
  const phases = {};

  let xml;
  if (file.endsWith(".reqifz")) {
    const { unzipSync, strFromU8 } = await import("fflate");
    phases.unzip = await repeat(() => {
      const entries = unzipSync(new Uint8Array(raw));
      const name = Object.keys(entries).find((n) => n.toLowerCase().endsWith(".reqif"));
      xml = strFromU8(entries[name]);
    }, budget);
  } else {
    xml = raw.toString("utf8");
  }

  phases.parse = await repeat(() => void parseReqIfXml(xml), budget);

  const pkg = await loadReqIfPackage(raw);
  const doc = pkg.document;

  phases.index = await repeat(() => void new ReqIfIndex(doc), budget);
  const index = new ReqIfIndex(doc);

  // pkg.attachments, not EMPTY_ATTACHMENTS: on a .reqifz this phase reads the
  // archive entries and base64-encodes them, and an empty resolver would report
  // the cost of a phase that never ran.
  phases.attachments = await repeat(() => createAttachmentLookup(doc, pkg.attachments), budget);
  const lookup = await createAttachmentLookup(doc, pkg.attachments);

  const spec = doc.coreContent.specifications[0];
  phases.render = await repeat(() => void renderSpecification(spec, index, lookup), budget);

  let html = "";
  phases.endToEnd = await repeat(async () => {
    html = await renderPackageToHtml(await loadReqIfPackage(raw));
  }, budget);

  return {
    file,
    budget,
    bytes: raw.length,
    objects: doc.coreContent.specObjects.length,
    // "render" times one specification, end-to-end renders them all. Without
    // this count the difference looks like unaccounted time: on the DOORS
    // export, 94 ms x 3 specs closes the gap almost exactly.
    specs: pkg.documents.reduce((n, d) => n + d.coreContent.specifications.length, 0),
    htmlBytes: Buffer.byteLength(html),
    // The nodes a browser would actually build. A script block's contents are
    // not parsed as HTML, so neutralising those is what separates the markup
    // that becomes DOM from the markup that merely travels -- which is the
    // whole mechanism behind the default lazy technical panel.
    domNodes: countDomNodes(html),
    // maxRSS is a high-water mark for the whole process: exact here, because
    // this process measured exactly one fixture.
    maxRssMb: process.resourceUsage().maxRSS / 1024,
    phases,
  };
}

// --- child mode -------------------------------------------------------------

if (process.argv[2] === "--case") {
  const result = await runCase(process.argv[3]);
  process.stdout.write("\u0000RESULT" + JSON.stringify(result));
  process.exit(0);
}

// --- driver -----------------------------------------------------------------

try {
  await stat(join(ROOT, "dist/index.js"));
} catch {
  console.error("dist/index.js est absent. Lancez `npm run build` d'abord (npm run bench le fait).");
  process.exit(1);
}

const cases = [join(ROOT, "sample.reqif"), join(ROOT, "sample.reqifz")];
for (const optional of ["AEB_Platform_Requirements_TestDataset.reqif"]) {
  try {
    await stat(join(ROOT, optional));
    cases.push(join(ROOT, optional));
  } catch {
    console.log(`(${optional} absent — cas ignoré)`);
  }
}
cases.push(await ensureSynthetic(50 * MB));

const results = [];
for (const file of cases) {
  const child = spawnSync(
    process.execPath,
    ["--expose-gc", fileURLToPath(import.meta.url), "--case", file],
    { encoding: "utf8", maxBuffer: 64 * MB },
  );
  if (child.status !== 0) {
    console.error(`échec sur ${file}:\n${child.stderr}`);
    process.exit(1);
  }
  const marker = child.stdout.indexOf("\u0000RESULT");
  results.push(JSON.parse(child.stdout.slice(marker + 7)));
}

// --- report -----------------------------------------------------------------

const PHASES = [
  ["unzip", "décompression ZIP"],
  ["parse", "parsing XML → modèle"],
  ["index", "construction de l'index"],
  ["attachments", "résolution des pièces jointes"],
  ["render", "rendu d'une spécification (sync)"],
  ["endToEnd", "bout en bout"],
];

const ms = (n) => (n >= 100 ? n.toFixed(0) : n.toFixed(1));

console.log();
for (const r of results) {
  console.log(`\x1b[1m${r.file.slice(ROOT.length + 1)}\x1b[0m`);
  console.log(
    `  ${mb(r.bytes)} · ${r.objects.toLocaleString("fr-FR")} SpecObject · ` +
      `${r.specs} spécification${r.specs > 1 ? "s" : ""} · ` +
      `${mb(r.htmlBytes)} de HTML · ${r.domNodes.toLocaleString("fr-FR")} nœuds DOM · ` +
      `pic mémoire ${r.maxRssMb.toFixed(0)} Mo` +
      `  \x1b[2m(min sur ${r.budget.runs}, ${r.budget.warmup} de chauffe)\x1b[0m`,
  );
  const total = r.phases.endToEnd.min;
  // Phases are timed in runs of their own, separate from the end-to-end run, so
  // noise can push one past it — this table printed "117 %" for a 2 Ko fixture.
  // The guard targets that impossibility directly rather than comparing sums: a
  // sum *below* the total is expected and legitimate ("rendu" times one
  // specification out of several), and on a single-specification file the sum
  // equals the total by construction, so a sum-based test would flicker on the
  // largest case. An absolute floor covers fixtures too small to time at all.
  const slowest = Math.max(
    ...Object.entries(r.phases)
      .filter(([key]) => key !== "endToEnd")
      .map(([, p]) => p.min),
  );
  const attributable = total >= 20 && slowest <= total;
  for (const [key, label] of PHASES) {
    const p = r.phases[key];
    if (!p) continue;
    const share =
      key === "endToEnd" ? "" : attributable ? `${((p.min / total) * 100).toFixed(0)} %` : "—";
    console.log(
      `    ${label.padEnd(34)}${ms(p.min).padStart(8)} ms` +
        `   \x1b[2mmédiane ${ms(p.median)} ms\x1b[0m`.padEnd(30) +
        share.padStart(6),
    );
  }
  console.log();
}

console.log(
  "Chaque phase est mesurée isolément ; « bout en bout » rejoue chargement + rendu\n" +
    "complet et sert de dénominateur aux pourcentages. « — » : décomposition jugée non\n" +
    "fiable — total trop court, ou une phase mesurée au-dessus du total, ce qui ne peut\n" +
    "venir que du bruit d'horloge.\n\n" +
    "Insertion dans le DOM et plus longue tâche bloquante : `npm run bench:browser`.",
);
