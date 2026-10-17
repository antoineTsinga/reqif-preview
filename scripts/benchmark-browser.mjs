/**
 * Serves the repository root so scripts/benchmark-browser.html can run against
 * the real bundle and the real fixtures, and opens it.
 *
 * A static server rather than a headless-Chrome dependency: the browser half of
 * the benchmark answers an architectural question that comes up a few times a
 * year, and a permanent devDependency downloading a browser on every install is
 * a poor trade for that. Reading the numbers by eye is also the point — the
 * interesting part is how the page *feels* while the 50 MB case runs.
 *
 *   npm run bench:browser
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8123;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".reqif": "application/xml; charset=utf-8",
  ".reqifz": "application/zip",
};

try {
  await stat(join(ROOT, "dist/index.js"));
} catch {
  console.error("dist/index.js absent — lancez `npm run build` (npm run bench:browser le fait).");
  process.exit(1);
}

const server = createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  // The page is served at "/" rather than at its own path, so that its
  // `./dist/index.js` and `./sample.reqif` resolve against the repository root
  // the way they read.
  const relative = requested === "/" ? "scripts/benchmark-browser.html" : requested;
  const path = join(ROOT, normalize(relative).replace(/^(\.\.[/\\])+/, ""));

  // Serving the whole repository is fine for a benchmark bound to localhost,
  // but a path escaping it is not, whatever the reason.
  if (path !== ROOT && !path.startsWith(ROOT + sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  const stream = createReadStream(path);
  stream.on("error", () => res.writeHead(404).end("not found"));
  stream.on("open", () => {
    res.writeHead(200, { "content-type": TYPES[extname(path)] ?? "application/octet-stream" });
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\nBanc navigateur : ${url}`);
  console.log("Le cas 50 Mo fige volontairement l'onglet — c'est la mesure.");
  console.log("Ctrl+C pour arrêter le serveur.\n");

  const opener =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : process.platform === "darwin" ? ["open", [url]]
    : ["xdg-open", [url]];
  spawn(opener[0], opener[1], { stdio: "ignore", detached: true }).unref();
});
