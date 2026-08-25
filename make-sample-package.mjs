/**
 * Builds `sample-multi-doc.reqifz` — a three-document package whose documents
 * reference each other, mirroring the exchange scenario the OMG spec opens
 * with (figure 1.1): a customer specification, the system specification that
 * derives from it, and the tests that verify the latter.
 *
 * It exists to exercise, by hand in a real browser, the things the test suite
 * cannot: cross-document relation anchors, the tab mechanism at two nesting
 * levels, and attachment inlining.
 *
 * It is also the source of the documentation site's sample package:
 * `scripts/sync-docs-assets.mjs` runs it into `docs/public/exemple.reqifz` on
 * every docs build. That is why this script is tracked while its output is not
 * — the recipe is repo content, the archive is a build artefact.
 *
 *   node make-sample-package.mjs [chemin de sortie]
 */
import { writeFile } from "node:fs/promises";
import { zipSync, strToU8 } from "fflate";

// 1×1 PNG. Rendered with explicit width/height so it shows as a visible block:
// the point is to prove the attachment resolves to a data: URI, not to be art.
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const NS =
  'xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:xhtml="http://www.w3.org/1999/xhtml"';

/** The attribute definitions every document in this package shares. */
const specAttributes = `
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="ad-fid" LONG-NAME="ReqIF.ForeignID">
          <TYPE><DATATYPE-DEFINITION-STRING-REF>dt-str</DATATYPE-DEFINITION-STRING-REF></TYPE>
        </ATTRIBUTE-DEFINITION-STRING>
        <ATTRIBUTE-DEFINITION-XHTML IDENTIFIER="ad-text" LONG-NAME="ReqIF.Text">
          <TYPE><DATATYPE-DEFINITION-XHTML-REF>dt-xhtml</DATATYPE-DEFINITION-XHTML-REF></TYPE>
        </ATTRIBUTE-DEFINITION-XHTML>
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="ad-chapter" LONG-NAME="ChapterName">
          <TYPE><DATATYPE-DEFINITION-STRING-REF>dt-str</DATATYPE-DEFINITION-STRING-REF></TYPE>
        </ATTRIBUTE-DEFINITION-STRING>
        <ATTRIBUTE-DEFINITION-ENUMERATION IDENTIFIER="ad-prio" LONG-NAME="Priorité" MULTI-VALUED="false">
          <TYPE><DATATYPE-DEFINITION-ENUMERATION-REF>dt-prio</DATATYPE-DEFINITION-ENUMERATION-REF></TYPE>
        </ATTRIBUTE-DEFINITION-ENUMERATION>
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="ad-cby" LONG-NAME="ReqIF.ForeignCreatedBy">
          <TYPE><DATATYPE-DEFINITION-STRING-REF>dt-str</DATATYPE-DEFINITION-STRING-REF></TYPE>
        </ATTRIBUTE-DEFINITION-STRING>
        <ATTRIBUTE-DEFINITION-DATE IDENTIFIER="ad-con" LONG-NAME="ReqIF.ForeignCreatedOn">
          <TYPE><DATATYPE-DEFINITION-DATE-REF>dt-date</DATATYPE-DEFINITION-DATE-REF></TYPE>
        </ATTRIBUTE-DEFINITION-DATE>
        <ATTRIBUTE-DEFINITION-STRING IDENTIFIER="ad-mby" LONG-NAME="ReqIF.ForeignModifiedBy">
          <TYPE><DATATYPE-DEFINITION-STRING-REF>dt-str</DATATYPE-DEFINITION-STRING-REF></TYPE>
        </ATTRIBUTE-DEFINITION-STRING>
        <ATTRIBUTE-DEFINITION-DATE IDENTIFIER="ad-mon" LONG-NAME="ReqIF.ForeignModifiedOn">
          <TYPE><DATATYPE-DEFINITION-DATE-REF>dt-date</DATATYPE-DEFINITION-DATE-REF></TYPE>
        </ATTRIBUTE-DEFINITION-DATE>`;

const datatypes = `
      <DATATYPE-DEFINITION-STRING IDENTIFIER="dt-str" LONG-NAME="Texte" MAX-LENGTH="512"/>
      <DATATYPE-DEFINITION-XHTML IDENTIFIER="dt-xhtml" LONG-NAME="Texte enrichi"/>
      <DATATYPE-DEFINITION-DATE IDENTIFIER="dt-date" LONG-NAME="Date"/>
      <DATATYPE-DEFINITION-ENUMERATION IDENTIFIER="dt-prio" LONG-NAME="Priorité">
        <SPECIFIED-VALUES>
          <ENUM-VALUE IDENTIFIER="ev-h" LONG-NAME="Haute"><PROPERTIES><EMBEDDED-VALUE KEY="1" OTHER-CONTENT="#c0392b"/></PROPERTIES></ENUM-VALUE>
          <ENUM-VALUE IDENTIFIER="ev-m" LONG-NAME="Moyenne"><PROPERTIES><EMBEDDED-VALUE KEY="2" OTHER-CONTENT="#e67e22"/></PROPERTIES></ENUM-VALUE>
          <ENUM-VALUE IDENTIFIER="ev-b" LONG-NAME="Basse"><PROPERTIES><EMBEDDED-VALUE KEY="3" OTHER-CONTENT="#27ae60"/></PROPERTIES></ENUM-VALUE>
        </SPECIFIED-VALUES>
      </DATATYPE-DEFINITION-ENUMERATION>`;

/**
 * One SpecObject. `extra` slots in anything unusual for that object —
 * an ALTERNATIVE-ID, a simplified value with its preserved original…
 */
function specObject({ id, fid, title, xhtml, xhtmlOriginal, chapter, prio = "ev-m", by = "A. Rousseau", on = "2026-03-11T09:14:00Z", modBy, modOn, extra = "" }) {
  const val = (defRef, inner) => `<ATTRIBUTE-VALUE-STRING THE-VALUE="${inner}"><DEFINITION><ATTRIBUTE-DEFINITION-STRING-REF>${defRef}</ATTRIBUTE-DEFINITION-STRING-REF></DEFINITION></ATTRIBUTE-VALUE-STRING>`;
  const date = (defRef, inner) => `<ATTRIBUTE-VALUE-DATE THE-VALUE="${inner}"><DEFINITION><ATTRIBUTE-DEFINITION-DATE-REF>${defRef}</ATTRIBUTE-DEFINITION-DATE-REF></DEFINITION></ATTRIBUTE-VALUE-DATE>`;
  return `
      <SPEC-OBJECT IDENTIFIER="${id}" LONG-NAME="${title}" LAST-CHANGE="${on}">
        ${extra}
        <VALUES>
          ${val("ad-fid", fid)}
          ${chapter ? val("ad-chapter", chapter) : ""}
          ${val("ad-cby", by)}
          ${date("ad-con", on)}
          ${modBy ? val("ad-mby", modBy) : ""}
          ${modOn ? date("ad-mon", modOn) : ""}
          <ATTRIBUTE-VALUE-ENUMERATION>
            <DEFINITION><ATTRIBUTE-DEFINITION-ENUMERATION-REF>ad-prio</ATTRIBUTE-DEFINITION-ENUMERATION-REF></DEFINITION>
            <VALUES><ENUM-VALUE-REF>${prio}</ENUM-VALUE-REF></VALUES>
          </ATTRIBUTE-VALUE-ENUMERATION>
          ${xhtml
            ? `<ATTRIBUTE-VALUE-XHTML${xhtmlOriginal ? ' IS-SIMPLIFIED="true"' : ""}>
            <DEFINITION><ATTRIBUTE-DEFINITION-XHTML-REF>ad-text</ATTRIBUTE-DEFINITION-XHTML-REF></DEFINITION>
            <THE-VALUE>${xhtml}</THE-VALUE>
            ${xhtmlOriginal ? `<THE-ORIGINAL-VALUE>${xhtmlOriginal}</THE-ORIGINAL-VALUE>` : ""}
          </ATTRIBUTE-VALUE-XHTML>`
            : ""}
        </VALUES>
        <TYPE><SPEC-OBJECT-TYPE-REF>sot-req</SPEC-OBJECT-TYPE-REF></TYPE>
      </SPEC-OBJECT>`;
}

const node = (id, objRef, children = "") =>
  `<SPEC-HIERARCHY IDENTIFIER="${id}"><OBJECT><SPEC-OBJECT-REF>${objRef}</SPEC-OBJECT-REF></OBJECT>${children ? `<CHILDREN>${children}</CHILDREN>` : ""}</SPEC-HIERARCHY>`;

const relation = (id, typeRef, source, target) => `
      <SPEC-RELATION IDENTIFIER="${id}">
        <TYPE><SPEC-RELATION-TYPE-REF>${typeRef}</SPEC-RELATION-TYPE-REF></TYPE>
        <SOURCE><SPEC-OBJECT-REF>${source}</SPEC-OBJECT-REF></SOURCE>
        <TARGET><SPEC-OBJECT-REF>${target}</SPEC-OBJECT-REF></TARGET>
      </SPEC-RELATION>`;

function document({ hdr, title, tool, relationTypes, objects, specifications, relations }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<REQ-IF ${NS}>
  <THE-HEADER>
    <REQ-IF-HEADER IDENTIFIER="${hdr}">
      <COMMENT>Jeu d'essai local — trois documents liés entre eux</COMMENT>
      <CREATION-TIME>2026-03-11T09:14:00Z</CREATION-TIME>
      <REQ-IF-TOOL-ID>reqif-preview sample generator</REQ-IF-TOOL-ID>
      <REQ-IF-VERSION>1.0</REQ-IF-VERSION>
      <SOURCE-TOOL-ID>${tool}</SOURCE-TOOL-ID>
      <TITLE>${title}</TITLE>
    </REQ-IF-HEADER>
  </THE-HEADER>
  <CORE-CONTENT>
    <REQ-IF-CONTENT>
      <DATATYPES>${datatypes}</DATATYPES>
      <SPEC-TYPES>
        <SPEC-OBJECT-TYPE IDENTIFIER="sot-req" LONG-NAME="Exigence">
          <SPEC-ATTRIBUTES>${specAttributes}</SPEC-ATTRIBUTES>
        </SPEC-OBJECT-TYPE>
        <SPECIFICATION-TYPE IDENTIFIER="st-doc" LONG-NAME="Document">
          <SPEC-ATTRIBUTES/>
        </SPECIFICATION-TYPE>${relationTypes}
      </SPEC-TYPES>
      <SPEC-OBJECTS>${objects}</SPEC-OBJECTS>
      <SPECIFICATIONS>${specifications}</SPECIFICATIONS>
      <SPEC-RELATIONS>${relations}</SPEC-RELATIONS>
      <SPEC-RELATION-GROUPS/>
    </REQ-IF-CONTENT>
  </CORE-CONTENT>
</REQ-IF>`;
}

// ---------------------------------------------------------------------------
// 1. Customer requirements — holds the attachment and one object placed twice
// ---------------------------------------------------------------------------
const crs = document({
  hdr: "hdr-crs",
  title: "Exigences client — Freinage d'urgence autonome",
  tool: "IBM DOORS 9.7",
  relationTypes: "",
  objects: [
    specObject({
      id: "CRS-CH-1", fid: "CRS-CH-1", title: "Introduction", chapter: "Introduction",
      xhtml: `<xhtml:div>Ce document rassemble les exigences <xhtml:b>client</xhtml:b> du système de freinage d'urgence autonome (AEB).</xhtml:div>`,
    }),
    specObject({
      id: "CRS-001", fid: "CRS-001", title: "Détection d'obstacle", prio: "ev-h",
      modBy: "M. Lefèvre", modOn: "2026-05-02T16:40:00Z",
      xhtml: `<xhtml:div>Le véhicule <xhtml:b>doit</xhtml:b> détecter un obstacle immobile situé dans sa trajectoire à une distance d'au moins 80&#160;m.
        <xhtml:ul>
          <xhtml:li>Conditions : route sèche, visibilité supérieure à 200&#160;m</xhtml:li>
          <xhtml:li>Vitesse d'essai : de 30 à 130&#160;km/h</xhtml:li>
        </xhtml:ul>
        <xhtml:p>Schéma de principe :</xhtml:p>
        <xhtml:object data="images/schema-aeb.png" type="image/png" width="240" height="60">Schéma du capteur AEB</xhtml:object>
      </xhtml:div>`,
    }),
    specObject({
      id: "CRS-CH-2", fid: "CRS-CH-2", title: "Sécurité", chapter: "Sécurité",
    }),
    specObject({
      id: "CRS-002", fid: "CRS-002", title: "Freinage d'urgence", prio: "ev-h",
      xhtml: `<xhtml:div>Le freinage doit s'engager en moins de 2&#160;s après détection.
        <xhtml:table>
          <xhtml:tr><xhtml:th>Vitesse</xhtml:th><xhtml:th>Délai maximal</xhtml:th></xhtml:tr>
          <xhtml:tr><xhtml:td>30&#160;km/h</xhtml:td><xhtml:td>0,8&#160;s</xhtml:td></xhtml:tr>
          <xhtml:tr><xhtml:td>130&#160;km/h</xhtml:td><xhtml:td>2,0&#160;s</xhtml:td></xhtml:tr>
        </xhtml:table>
      </xhtml:div>`,
    }),
    specObject({
      id: "CRS-003", fid: "CRS-003", title: "Alerte conducteur", prio: "ev-m",
      xhtml: `<xhtml:div>Une alerte sonore et visuelle précède tout freinage automatique.</xhtml:div>`,
    }),
  ].join(""),
  // CRS-003 appears twice on purpose: once under each chapter. Only the first
  // occurrence gets the anchor id, and the second raises a duplicate-dom-id.
  specifications: `
      <SPECIFICATION IDENTIFIER="spec-crs" LONG-NAME="Spécification client">
        <VALUES/>
        <TYPE><SPECIFICATION-TYPE-REF>st-doc</SPECIFICATION-TYPE-REF></TYPE>
        <CHILDREN>
          ${node("sh-crs-1", "CRS-CH-1", node("sh-crs-1-1", "CRS-001") + node("sh-crs-1-2", "CRS-003"))}
          ${node("sh-crs-2", "CRS-CH-2", node("sh-crs-2-1", "CRS-002") + node("sh-crs-2-2", "CRS-003"))}
        </CHILDREN>
      </SPECIFICATION>`,
  relations: "",
});

// ---------------------------------------------------------------------------
// 2. System requirements — two specifications, so the inner tab level exists.
//    Its relations point *into* the CRS document: that is the cross-document
//    case, and the reason ReqIfIndex has to span the whole package.
// ---------------------------------------------------------------------------
const srs = document({
  hdr: "hdr-srs",
  title: "Exigences système — Calculateur AEB",
  tool: "Polarion 23",
  relationTypes: `
        <SPEC-RELATION-TYPE IDENTIFIER="srt-derive" LONG-NAME="Dérive de">
          <SPEC-ATTRIBUTES/>
        </SPEC-RELATION-TYPE>`,
  objects: [
    specObject({
      id: "SRS-001", fid: "SRS-001", title: "Portée du radar", prio: "ev-h",
      // Degraded by a tool in the exchange chain, with the untouched original
      // preserved beside it (10.8.20). The renderer shows the original.
      xhtml: `<xhtml:div>Portee radar 80 m minimum. Tableau supprime par l outil exportateur.</xhtml:div>`,
      xhtmlOriginal: `<xhtml:div>Le radar <xhtml:b>doit</xhtml:b> couvrir <xhtml:i>au moins</xhtml:i> 80&#160;m avec un angle de 18°.
        <xhtml:table>
          <xhtml:tr><xhtml:th>Paramètre</xhtml:th><xhtml:th>Valeur</xhtml:th></xhtml:tr>
          <xhtml:tr><xhtml:td>Portée</xhtml:td><xhtml:td>80 m</xhtml:td></xhtml:tr>
          <xhtml:tr><xhtml:td>Angle</xhtml:td><xhtml:td>18°</xhtml:td></xhtml:tr>
        </xhtml:table>
      </xhtml:div>`,
    }),
    specObject({
      id: "SRS-002", fid: "SRS-002", title: "Temps de réaction du calculateur", prio: "ev-h",
      xhtml: `<xhtml:div>Le calculateur émet la consigne de freinage en moins de <xhtml:b>120&#160;ms</xhtml:b> après réception de la trame radar.</xhtml:div>`,
      // Carries the id it had in the originating repository.
      extra: `<ALTERNATIVE-ID><ALTERNATIVE-ID IDENTIFIER="DOORS-88421"/></ALTERNATIVE-ID>`,
    }),
    specObject({
      id: "SRS-003", fid: "SRS-003", title: "Signalisation au tableau de bord", prio: "ev-m",
      xhtml: `<xhtml:div>Le témoin AEB s'allume <xhtml:span style="color:#c0392b">en rouge</xhtml:span> pendant toute la phase de freinage.</xhtml:div>`,
    }),
  ].join(""),
  specifications: `
      <SPECIFICATION IDENTIFIER="spec-srs-capteurs" LONG-NAME="Capteurs">
        <VALUES/>
        <TYPE><SPECIFICATION-TYPE-REF>st-doc</SPECIFICATION-TYPE-REF></TYPE>
        <CHILDREN>${node("sh-srs-1", "SRS-001")}${node("sh-srs-2", "SRS-002")}</CHILDREN>
      </SPECIFICATION>
      <SPECIFICATION IDENTIFIER="spec-srs-ihm" LONG-NAME="Interface conducteur">
        <VALUES/>
        <TYPE><SPECIFICATION-TYPE-REF>st-doc</SPECIFICATION-TYPE-REF></TYPE>
        <CHILDREN>${node("sh-srs-3", "SRS-003")}</CHILDREN>
      </SPECIFICATION>`,
  relations: [
    relation("rel-srs-1", "srt-derive", "SRS-001", "CRS-001"),
    relation("rel-srs-2", "srt-derive", "SRS-002", "CRS-002"),
    relation("rel-srs-3", "srt-derive", "SRS-003", "CRS-003"),
  ].join(""),
});

// ---------------------------------------------------------------------------
// 3. Tests — verifies SRS objects, plus one relation left dangling on purpose
// ---------------------------------------------------------------------------
const tests = document({
  hdr: "hdr-tst",
  title: "Plan de validation — AEB",
  tool: "ReqView 2.15",
  relationTypes: `
        <SPEC-RELATION-TYPE IDENTIFIER="srt-verify" LONG-NAME="Vérifie">
          <SPEC-ATTRIBUTES/>
        </SPEC-RELATION-TYPE>`,
  objects: [
    specObject({
      id: "TST-001", fid: "TST-001", title: "Essai piste — obstacle fixe", prio: "ev-h",
      xhtml: `<xhtml:div>Approche d'un obstacle fixe à 50&#160;km/h. <xhtml:b>Critère</xhtml:b> : arrêt complet sans contact.</xhtml:div>`,
    }),
    specObject({
      id: "TST-002", fid: "TST-002", title: "Mesure du temps de réaction", prio: "ev-m",
      xhtml: `<xhtml:div>Injection d'une trame radar synthétique, mesure à l'oscilloscope sur le bus CAN.</xhtml:div>`,
    }),
  ].join(""),
  specifications: `
      <SPECIFICATION IDENTIFIER="spec-tst" LONG-NAME="Campagne d'essais">
        <VALUES/>
        <TYPE><SPECIFICATION-TYPE-REF>st-doc</SPECIFICATION-TYPE-REF></TYPE>
        <CHILDREN>${node("sh-tst-1", "TST-001")}${node("sh-tst-2", "TST-002")}</CHILDREN>
      </SPECIFICATION>`,
  relations: [
    relation("rel-tst-1", "srt-verify", "TST-001", "SRS-001"),
    relation("rel-tst-2", "srt-verify", "TST-002", "SRS-002"),
    // Dangling on purpose: exercises the unresolved-reference degradation.
    relation("rel-tst-3", "srt-verify", "TST-002", "SRS-999-absent"),
  ].join(""),
});

const out = process.argv[2] ?? "sample-multi-doc.reqifz";
await writeFile(
  out,
  zipSync({
    "01-exigences-client.reqif": strToU8(crs),
    "02-exigences-systeme.reqif": strToU8(srs),
    "03-plan-de-validation.reqif": strToU8(tests),
    "images/schema-aeb.png": Uint8Array.from(Buffer.from(PNG_BASE64, "base64")),
  }),
);
console.log(`écrit : ${out}`);
