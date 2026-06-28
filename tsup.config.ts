import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  clean: true,
  target: "es2020",
  minify: false,
  // Inline our two small deps so dist/index.js is a true zero-config,
  // framework-independent drop-in for a raw <script type="module"> in the
  // browser (no import maps / node_modules resolution required).
  noExternal: ["fast-xml-parser", "fflate"],
  // fflate ships TWO different ESM entry points behind a "node" vs default
  // package.json export condition: the "node" one pulls in
  // `import { createRequire } from "module"` for an optional worker_threads
  // fast path we never use (we only call the synchronous zipSync/unzipSync).
  // esbuild's default platform is "node", which picks that variant — fatal
  // in a real browser ("Failed to resolve module specifier 'module'").
  // Force browser-safe resolution so the bundle is genuinely universal.
  platform: "browser",
});
