import { loadReqIfPackage, renderPackageToHtml } from "./dist/index.js";
import { writeFile, readFile } from "node:fs/promises";

const bytes = await readFile("sample.reqif"); // ou .reqifz
const pkg = await loadReqIfPackage(bytes);
const html = await renderPackageToHtml(pkg);
await writeFile("preview.html", html);
console.log("Titre :", pkg.document.header.title);
