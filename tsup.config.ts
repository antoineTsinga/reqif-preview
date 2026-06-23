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
});
