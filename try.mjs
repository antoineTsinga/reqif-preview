import { loadReqIfPackage, renderPackageToHtml } from "./dist/index.js";
import { writeFile, readFile } from "node:fs/promises";

const bytes = await readFile("sample.reqif"); // ou .reqifz
const pkg = await loadReqIfPackage(bytes);
const html = await renderPackageToHtml(pkg, {
  customAttributeRenderers: [
    {
      attribute: "ChapterName", // nom long de l'attribut visé (chez DOORS, souvent en XHTML)
      position: "before", // "before" ou "after" le texte principal
      render: (value, ctx) => {
        if (!value) return undefined; // l'objet n'a pas cet attribut -> rien à afficher

        console.log("render ChapterName", value, ctx);
        // gère le cas où l'attribut est une chaîne simple OU du XHTML (cas réel DOORS)
        const text =
          value.kind === "STRING"
            ? value.value
            : value.kind === "XHTML" && value.value
              ? xhtmlToPlainText(value.value)
              : undefined;

        return text
          ? `<span style="display:inline-block;background:#222;color:#fff;border-radius:4px;padding:2px 8px;font-size:12px;font-family:monospace;">${text}</span>`
          : undefined;
      },
    },
  ],
});
await writeFile("preview.html", html);
console.log("Titre :", pkg.document.header.title);
