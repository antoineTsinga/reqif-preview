#!/usr/bin/env node
/**
 * Standalone Node test/benchmark harness derived from src/, not from other
 * benchmark scripts or datasets. No imports from the existing bench tools.
 *
 *   npm run build
 *   node scripts/code-bench.mjs --self-test
 *   node scripts/code-bench.mjs --quick
 *   node scripts/code-bench.mjs --samples 5 --case attributes-64
 *   node scripts/code-bench.mjs --file C:/data/export.reqif --file C:/data/other.reqifz
 *
 * Timings describe Node API calls, never DOM insertion or browser latency.
 */
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { summarize, shuffled, measureOperation } from './code-bench-metrics.mjs';
import { verifyHtml } from './code-bench-verify.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cpus, platform, arch } from 'node:os';
import { basename, dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { strToU8, strFromU8, unzipSync, zipSync } from 'fflate';

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), '..');
let api;
const MiB = 1024 * 1024;
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const BASE_RENDER = {
  includeCss: true,
  includeJs: false,
  technicalPanel: 'eager',
  layout: 'stacked',
  readingMode: false,
  showRelations: true,
  dateLocale: 'en-GB',
};

function taggedRef(role, kind, id) {
  return `<${role}><${kind}-REF>${id}</${kind}-REF></${role}>`;
}

function valueXml(kind, id, value) {
  const definition = taggedRef('DEFINITION', `ATTRIBUTE-DEFINITION-${kind}`, id);
  if (kind === 'XHTML') {
    return `<ATTRIBUTE-VALUE-XHTML>${definition}<THE-VALUE>${value}</THE-VALUE></ATTRIBUTE-VALUE-XHTML>`;
  }
  if (kind === 'ENUMERATION') {
    return `<ATTRIBUTE-VALUE-ENUMERATION>${definition}<VALUES><ENUM-VALUE-REF>${value}</ENUM-VALUE-REF></VALUES></ATTRIBUTE-VALUE-ENUMERATION>`;
  }
  return `<ATTRIBUTE-VALUE-${kind} THE-VALUE="${value}">${definition}</ATTRIBUTE-VALUE-${kind}>`;
}

// Seven kinds correspond to parseAttributeValue/valueToPlainText's switch arms.
const KINDS = ['STRING', 'BOOLEAN', 'INTEGER', 'REAL', 'DATE', 'ENUMERATION', 'XHTML'];

function makeXml(config, docNumber) {
  const { count, attributes, depth, specifications, documents, rich, relations, assets, unsafe } = config;
  const prefix = `d${docNumber}-`;
  const id = suffix => prefix + suffix;
  const definitions = [];
  const datatypes = KINDS.map(kind => {
    const values = kind === 'ENUMERATION'
      ? `<SPECIFIED-VALUES><ENUM-VALUE IDENTIFIER="${id('enum')}" LONG-NAME="Approved"/></SPECIFIED-VALUES>` : '';
    return `<DATATYPE-DEFINITION-${kind} IDENTIFIER="${id(kind)}">${values}</DATATYPE-DEFINITION-${kind}>`;
  }).join('');
  for (let a = 0; a < attributes; a++) {
    const kind = a < 7 ? KINDS[a] : 'STRING';
    const name = a === 6 ? 'ReqIF.Text' : `Field ${a}`;
    definitions.push(`<ATTRIBUTE-DEFINITION-${kind} IDENTIFIER="${id(`a${a}`)}" LONG-NAME="${name}">${taggedRef('TYPE', `DATATYPE-DEFINITION-${kind}`, id(kind))}</ATTRIBUTE-DEFINITION-${kind}>`);
  }
  const objects = [];
  for (let i = 0; i < count; i++) {
    const scalar = {
      STRING: `Value ${i} &amp; preserved`, BOOLEAN: i % 2 ? 'true' : 'false',
      INTEGER: String(i), REAL: '1.25', DATE: '2026-01-01T12:00:00Z', ENUMERATION: id('enum'),
    };
    let xhtml = `<xhtml:p>Payload-${id(`o${i}`)} — exigence vérifiée &amp; conservée.</xhtml:p>`;
    if (rich) {
      xhtml += `<xhtml:table><xhtml:tbody>${Array.from({ length: 6 }, (_, n) => `<xhtml:tr><xhtml:td>Cell ${n}</xhtml:td><xhtml:td><xhtml:strong>Value ${i}</xhtml:strong></xhtml:td></xhtml:tr>`).join('')}</xhtml:tbody></xhtml:table>`;
    }
    if (assets && i < assets.references) {
      const path = `assets/${i % assets.unique}.png`;
      xhtml += `<xhtml:object data="${path}" type="image/png">asset-fallback-${i}</xhtml:object>`;
    }
    if (unsafe) {
      xhtml += '<xhtml:script>blocked-script-marker</xhtml:script><xhtml:a href="javascript:blocked()">safe-link-text</xhtml:a><xhtml:p style="position:fixed;color:red" onclick="blocked()">safe-text</xhtml:p>';
    }
    scalar.XHTML = `<xhtml:div>${xhtml}</xhtml:div>`;
    const values = Array.from({ length: attributes }, (_, a) => {
      const kind = a < 7 ? KINDS[a] : 'STRING';
      return valueXml(kind, id(`a${a}`), scalar[kind]);
    }).join('');
    objects.push(`<SPEC-OBJECT IDENTIFIER="${id(`o${i}`)}" LONG-NAME="Object ${i}"><ALTERNATIVE-ID><ALTERNATIVE-ID IDENTIFIER="${id(`alt${i}`)}"/></ALTERNATIVE-ID>${taggedRef('TYPE', 'SPEC-OBJECT-TYPE', id('ot'))}<VALUES>${values}</VALUES></SPEC-OBJECT>`);
  }
  // Chain-shaped groups exercise indexHierarchy/renderHierarchyChildren recursion.
  // Each object appears exactly once; object count is independent of spec count.
  const hierarchies = Array.from({ length: specifications }, () => []);
  for (let start = 0; start < count; start += depth) {
    let nested = '';
    for (let i = Math.min(count, start + depth) - 1; i >= start; i--) {
      nested = `<SPEC-HIERARCHY IDENTIFIER="${id(`h${i}`)}">${taggedRef('OBJECT', 'SPEC-OBJECT', id(`o${i}`))}${nested ? `<CHILDREN>${nested}</CHILDREN>` : ''}</SPEC-HIERARCHY>`;
    }
    hierarchies[(start / depth) % specifications].push(nested);
  }
  const specs = hierarchies.map((nodes, s) => `<SPECIFICATION IDENTIFIER="${id(`s${s}`)}" LONG-NAME="Specification ${s}">${taggedRef('TYPE', 'SPECIFICATION-TYPE', id('st'))}<CHILDREN>${nodes.join('')}</CHILDREN></SPECIFICATION>`).join('');
  const links = Array.from({ length: relations }, (_, r) => {
    const targetDoc = documents > 1 ? (docNumber + 1) % documents : docNumber;
    return `<SPEC-RELATION IDENTIFIER="${id(`r${r}`)}">${taggedRef('TYPE', 'SPEC-RELATION-TYPE', id('rt'))}${taggedRef('SOURCE', 'SPEC-OBJECT', id(`o${r % count}`))}${taggedRef('TARGET', 'SPEC-OBJECT', `d${targetDoc}-o${(r + 1) % count}`)}</SPEC-RELATION>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><REQ-IF xmlns="http://www.omg.org/spec/ReqIF/20110401/reqif.xsd" xmlns:xhtml="http://www.w3.org/1999/xhtml"><THE-HEADER><REQ-IF-HEADER IDENTIFIER="${id('header')}"><TITLE>Generated code exercise ${docNumber}</TITLE><CREATION-TIME>2026-01-01T00:00:00Z</CREATION-TIME><REQ-IF-VERSION>1.0</REQ-IF-VERSION></REQ-IF-HEADER></THE-HEADER><CORE-CONTENT><REQ-IF-CONTENT><DATATYPES>${datatypes}</DATATYPES><SPEC-TYPES><SPEC-OBJECT-TYPE IDENTIFIER="${id('ot')}"><SPEC-ATTRIBUTES>${definitions.join('')}</SPEC-ATTRIBUTES></SPEC-OBJECT-TYPE><SPECIFICATION-TYPE IDENTIFIER="${id('st')}"/><SPEC-RELATION-TYPE IDENTIFIER="${id('rt')}"/></SPEC-TYPES><SPEC-OBJECTS>${objects.join('')}</SPEC-OBJECTS><SPECIFICATIONS>${specs}</SPECIFICATIONS><SPEC-RELATIONS>${links}</SPEC-RELATIONS></REQ-IF-CONTENT></CORE-CONTENT></REQ-IF>`;
}

export function config(overrides = {}) {
  return { count: 100, attributes: 7, depth: 1, specifications: 1, documents: 1,
    rich: false, relations: 0, assets: null, unsafe: false, zip: false,
    render: { ...BASE_RENDER }, ...overrides };
}

export function makePng(sizeKiB, seed = 1) {
  const width = 256, height = Math.max(1, Math.ceil(sizeKiB * 1024 / (width * 4 + 1)));
  const raw = Buffer.alloc(height * (width * 4 + 1)); let state = seed;
  for (let y = 0; y < height; y++) for (let x = 1; x <= width * 4; x++) {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    raw[y * (width * 4 + 1) + x] = state & 255;
  }
  function chunk(type, data) {
    const body = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const head = Buffer.alloc(4), tail = Buffer.alloc(4); head.writeUInt32BE(data.length); tail.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([head, body, tail]);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 6;
  return new Uint8Array(Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

export function makeInput(c) {
  const xmls = Array.from({ length: c.documents }, (_, d) => makeXml(c, d));
  if (!c.zip) {
    assert.equal(c.documents, 1, 'Multiple documents require an archive');
    assert.equal(c.assets, null, 'Assets require an archive');
    return strToU8(xmls[0]);
  }
  const entries = Object.fromEntries(xmls.map((xml, d) => [`document-${d}.reqif`, strToU8(xml)]));
  if (c.assets) {
    // Valid 1x1 PNG, reused as the same asset or under distinct archive paths.
    const png = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
    for (let n = 0; n < c.assets.unique; n++) entries[`assets/${n}.png`] = c.assets.sizeKiB ? makePng(c.assets.sizeKiB, n + 1) : png;
  }
  return zipSync(entries, { level: 6, mtime: FIXED_DATE });
}

export function scenarios(quick, assetKiB = 256) {
  const n = quick ? 128 : 500;
  const cases = [
    ['objects-small', { count: n }],
    ['objects-medium', { count: n * 4 }],
    ['objects-large', { count: n * 20 }],
    ['attributes-64', { count: n, attributes: 64 }],
    ['rich-eager', { count: n, rich: true }],
    ['rich-lazy', { count: n, rich: true, render: { ...BASE_RENDER, technicalPanel: 'lazy' } }],
    ['rich-off', { count: n, rich: true, render: { ...BASE_RENDER, technicalPanel: 'off' } }],
    ['rich-reading', { count: n, rich: true, render: { ...BASE_RENDER, readingMode: true } }],
    ['hierarchy-64', { count: Math.max(n, 128), depth: 64 }],
    ['relations-dense', { count: n, relations: n * 8 }],
    ['multi-document', { count: n, documents: 4, specifications: 2, relations: n, zip: true, render: { ...BASE_RENDER, layout: 'tabs' } }],
    ['asset-reused', { count: n, zip: true, assets: { references: n, unique: 1 } }],
    ['asset-distinct', { count: n, zip: true, assets: { references: n, unique: n } }],
    ['asset-heavy', { count: n, zip: true, assets: { references: quick ? 4 : 16, unique: quick ? 4 : 16, sizeKiB: assetKiB } }],
    ['sanitize', { count: n, rich: true, unsafe: true }],
  ];
  return cases.map(([name, overrides]) => ({ name, config: config(overrides) }));
}

function checkedPackage(pkg, c) {
  assert.equal(pkg.documents.length, c.documents, 'Document count');
  const index = new api.ReqIfIndex(pkg.documents);
  assert.equal(index.specObjects.size, c.count * c.documents, 'Object count');
  assert.equal(index.specifications.size, c.specifications * c.documents, 'Specification count');
  assert.equal(index.specHierarchies.size, c.count * c.documents, 'Hierarchy count');
  assert.equal(index.specRelations.size, c.relations * c.documents, 'Relation count');
  assert.equal(index.byAlternativeId.size, c.count * c.documents, 'Alternative IDs');
  for (const relation of index.specRelations.values()) {
    assert.ok(index.specObjects.has(relation.sourceRef), 'Relation source resolves');
    assert.ok(index.specObjects.has(relation.targetRef), 'Relation target resolves across documents');
  }
  return index;
}

export async function selfTest() {
  const checks = [];
  async function test(name, fn) {
    try { await fn(); } catch (cause) { throw new Error(`Check failed: ${name}`, { cause }); }
    checks.push(name); console.log(`PASS ${name}`);
  }
  const c = config({ count: 8 });
  const raw = makeInput(c);
  const pkg = await api.loadReqIfPackage(raw);
  const doc = pkg.document;
  await test('generated inputs are byte-for-byte reproducible', () => {
    const zipped = config({ zip: true, assets: { references: 8, unique: 2 } });
    assert.deepEqual(makeInput(zipped), makeInput(zipped));
  });
  await test('text, Uint8Array and ArrayBuffer entry points agree', async () => {
    const text = await api.loadReqIfPackage(new TextDecoder().decode(raw));
    const buffer = await api.loadReqIfPackage(raw.slice().buffer);
    assert.deepEqual(pkg.document, text.document); assert.deepEqual(pkg.document, buffer.document);
  });
  await test('all seven value kinds survive XML parsing', () => {
    const values = doc.coreContent.specObjects[0].values;
    assert.deepEqual(values.map(v => v.kind), KINDS);
    assert.equal(values[0].value, 'Value 0 & preserved');
    assert.equal(values[1].value, false); assert.equal(values[2].value, 0);
    assert.equal(values[3].value, 1.25); assert.equal(values[4].value, '2026-01-01T12:00:00Z');
    assert.deepEqual(values[5].valueRefs, ['d0-enum']);
    assert.ok(api.xhtmlToPlainText(values[6].value).includes('exigence vérifiée & conservée'));
  });
  const index = checkedPackage(pkg, c);
  await test('attribute names normalize and enum IDs resolve to labels', () => {
    const object = doc.coreContent.specObjects[0];
    assert.equal(api.resolveAttribute(object, index, 'FIELD_0').value.value, 'Value 0 & preserved');
    assert.equal(api.valueToPlainText(object.values[5], index), 'Approved');
    assert.deepEqual(api.resolveAttribute(object, index, 'absent'), {});
  });
  await test('hierarchy recursion indexes every level', async () => {
    const deep = config({ count: 64, depth: 64 });
    checkedPackage(await api.loadReqIfPackage(makeInput(deep)), deep);
  });
  await test('multi-document ZIP resolves cross-document relations', async () => {
    const multi = config({ count: 8, documents: 3, specifications: 2, relations: 16, zip: true });
    const p = await api.loadReqIfPackage(makeInput(multi));
    checkedPackage(p, multi);
    const events = [];
    const html = await api.renderPackageToHtml(p, { ...BASE_RENDER, layout: 'tabs', onDegradation: e => events.push(e.code) });
    assert.ok(html.includes('reqif-tabs'));
    assert.ok(!events.includes('unresolved-reference'));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'Unique HTML IDs across documents/specifications');
  });
  await test('referenced PNG resolves, inlines and obeys maxInlineBytes', async () => {
    const assets = config({ count: 8, zip: true, assets: { references: 8, unique: 1 } });
    const p = await api.loadReqIfPackage(makeInput(assets));
    const attachment = p.attachments.resolve('./assets/0.png');
    assert.equal(attachment.mimeType, 'image/png');
    assert.equal(p.attachments.list().length, 1);
    const lookup = await api.createAttachmentLookup(p.document, p.attachments);
    assert.ok(lookup.get('assets/0.png').href.startsWith('data:image/png;base64,'));
    const html = await api.renderPackageToHtml(p, { ...BASE_RENDER, technicalPanel: 'off' });
    assert.ok(html.includes('<img src="data:image/png;base64,'));
    const events = [];
    const limited = await api.createAttachmentLookup(p.document, p.attachments, attachment.size - 1, e => events.push(e.code));
    assert.equal(limited.get('assets/0.png'), undefined);
    assert.deepEqual(events, ['attachment-too-large']);
  });
  await test('repeated asset paths are read only once per document lookup', async () => {
    const c = config({ count: 8, zip: true, assets: { references: 8, unique: 1 } });
    const p = await api.loadReqIfPackage(makeInput(c)); let reads = 0;
    const base = p.attachments.resolve('assets/0.png');
    const resolver = { list: () => [base], resolve: path => path === base.path ? { ...base, getBytes: async () => { reads++; return base.getBytes(); } } : undefined };
    await api.createAttachmentLookup(p.document, resolver);
    assert.equal(reads, 1, 'Set of referenced paths should deduplicate reads');
  });
  await test('missing attachment produces a diagnostic and usable fallback', async () => {
    const p = await api.loadReqIfPackage(makeInput(config({ count: 8, zip: true, assets: { references: 8, unique: 1 } })));
    const events = [];
    const html = await api.renderPackageToHtml(p, { ...BASE_RENDER, attachments: api.EMPTY_ATTACHMENTS, onDegradation: e => events.push(e.code) });
    assert.ok(events.includes('attachment-missing')); assert.ok(html.includes('asset-fallback-0'));
  });
  await test('sanitization removes executable content and reports its choices', async () => {
    const p = await api.loadReqIfPackage(makeInput(config({ count: 2, unsafe: true })));
    const events = [];
    const html = await api.renderPackageToHtml(p, { ...BASE_RENDER, technicalPanel: 'off', onDegradation: e => events.push(e.code) });
    for (const forbidden of ['blocked-script-marker', 'javascript:', 'onclick=', 'position:fixed']) assert.ok(!html.includes(forbidden), forbidden);
    assert.ok(html.includes('safe-link-text'));
    for (const code of ['dropped-tag', 'dropped-href', 'dropped-style-declaration']) assert.ok(events.includes(code), code);
  });
  await test('eager, lazy, off and reading paths preserve requirement content', async () => {
    for (const mode of ['eager', 'lazy', 'off', 'reading']) {
      const html = await api.renderPackageToHtml(pkg, { ...BASE_RENDER, technicalPanel: mode === 'reading' ? 'eager' : mode, readingMode: mode === 'reading' });
      assert.ok(html.includes('Payload-d0-o0'), mode);
      assert.equal(html.includes('type="application/reqif-panel"'), mode === 'lazy');
      if (mode === 'reading') assert.ok(html.includes('reqif-reading-mode'));
    }
  });
  await test('lazy script is opt-in and open panels are emitted eagerly', async () => {
    const lazy = { ...BASE_RENDER, technicalPanel: 'lazy' };
    const html = await api.renderPackageToHtml(pkg, { ...lazy, includeJs: true });
    assert.ok(html.includes(`<script>${api.DEFAULT_JS}</script>`));
    const open = await api.renderPackageToHtml(pkg, { ...lazy, showTechnicalByDefault: true });
    assert.ok(!open.includes('type="application/reqif-panel"'));
    api.expandLazyPanels(); // Documentless Node entry point must remain callable.
  });
  await test('original XHTML is retained and rendering can select the simplified value', async () => {
    const xml = makeXml(config({ count: 1 }), 0)
      .replace('<ATTRIBUTE-VALUE-XHTML>', '<ATTRIBUTE-VALUE-XHTML IS-SIMPLIFIED="true">')
      .replace('</THE-VALUE></ATTRIBUTE-VALUE-XHTML>', '</THE-VALUE><THE-ORIGINAL-VALUE><xhtml:p>original-content-marker</xhtml:p></THE-ORIGINAL-VALUE></ATTRIBUTE-VALUE-XHTML>');
    const p = await api.loadReqIfPackage(xml);
    const value = p.document.coreContent.specObjects[0].values[6];
    assert.equal(value.isSimplified, true);
    assert.equal(api.valueToPlainText(value), 'original-content-marker');
    const original = await api.renderPackageToHtml(p, { ...BASE_RENDER, technicalPanel: 'off' });
    const simplified = await api.renderPackageToHtml(p, { ...BASE_RENDER, technicalPanel: 'off', preferSimplifiedXhtml: true });
    assert.ok(original.includes('original-content-marker'));
    assert.ok(!simplified.includes('original-content-marker'));
    assert.ok(simplified.includes('Payload-d0-o0'));
  });
  await test('repeated objects get a single anchor and a duplicate diagnostic', async () => {
    const p = await api.loadReqIfPackage(raw);
    const children = p.document.coreContent.specifications[0].children;
    children.push({ ...children[0], identifier: 'extra-occurrence' });
    const events = [];
    const html = await api.renderPackageToHtml(p, { ...BASE_RENDER, onDegradation: e => events.push(e.code) });
    assert.ok(events.includes('duplicate-dom-id'));
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length);
  });
  await test('missing objects and failing custom renderers degrade locally', async () => {
    const p = await api.loadReqIfPackage(raw);
    p.document.coreContent.specifications[0].children[0].objectRef = 'nonexistent-object';
    const events = [];
    const html = await api.renderPackageToHtml(p, {
      ...BASE_RENDER, onDegradation: e => events.push(e.code),
      customAttributeRenderers: [{ attribute: 'Field 0', render: () => { throw Error('test callback failure'); } }],
    });
    assert.ok(events.includes('missing-spec-object'));
    assert.ok(events.includes('custom-renderer-threw'));
    assert.ok(html.includes('Payload-d0-o1'), 'Other objects must still render');
  });
  await test('invalid roots, required sections and empty ZIPs fail explicitly', async () => {
    assert.throws(() => api.parseReqIfXml('<other/>'), api.ReqIfParseError);
    assert.throws(() => api.parseReqIfXml('<REQ-IF/>'), /HEADER/);
    assert.throws(() => api.parseReqIfXml('<REQ-IF><THE-HEADER><REQ-IF-HEADER/></THE-HEADER></REQ-IF>'), /CORE-CONTENT/);
    await assert.rejects(() => api.loadReqIfPackage(zipSync({ 'only.txt': strToU8('no document') }, { mtime: FIXED_DATE })), /No .reqif document/);
    await assert.rejects(() => api.loadReqIfPackage(new Uint8Array([80, 75, 3, 4, 0, 0, 0])), /archive/);
  });
  await test('parser nesting limit can reject an otherwise accepted input', () => {
    const xml = makeXml(config({ count: 32, depth: 32 }), 0);
    assert.throws(() => api.parseReqIfXml(xml, { maxNestedTags: 10 }), api.ReqIfParseError);
    assert.equal(api.parseReqIfXml(xml).coreContent.specObjects.length, 32);
  });
  await test('large render cannot silently omit requirements or their XHTML', async () => {
    const big = await api.loadReqIfPackage(makeInput(config({ count: 128 })));
    const html = await api.renderPackageToHtml(big, BASE_RENDER);
    verifyHtml(api, big, html);
    assert.throws(() => verifyHtml(api, big, '<div class="reqif-preview"></div>'), /validation failed/);
    assert.throws(() => verifyHtml(api, big, html.replace('Payload-d0-o63', 'missing-payload')), /validation failed/);
  });
  return checks;
}

function memory() {
  const { heapUsed, external, rss } = process.memoryUsage();
  return { heapUsed, external, heapAndExternal: heapUsed + external, rss };
}
const hash = value => createHash('sha256').update(value).digest('hex');
export const PHASES = ['load + render', 'decode XML bytes', 'unzip archive', 'parse documents', 'load package', 'build index',
  'resolve attachments', 'find last attribute by ID', 'find last attribute by name', 'sanitize object XHTML standalone', 'render package'];
const SOURCES = ['code-bench.mjs', 'code-bench-metrics.mjs', 'code-bench-verify.mjs'];

export async function verifyGeneratedAssets(api, pkg, c, html) {
  if (!c.assets) return null;
  let pathsChecked = 0;
  for (const doc of pkg.documents) {
    const lookup = await api.createAttachmentLookup(doc, pkg.attachments);
    for (let n = 0; n < c.assets.unique; n++) {
      const path = `assets/${n}.png`, found = lookup.get(path);
      assert.ok(found?.href.startsWith('data:image/png;base64,'), `Generated image not encoded: ${path}`);
      const actual = Buffer.from(found.href.slice(found.href.indexOf(',') + 1), 'base64');
      assert.deepEqual(actual, Buffer.from(await pkg.attachments.resolve(path).getBytes()), `Encoded image bytes: ${path}`);
      assert.ok(html.includes(`src="${found.href}"`), `Generated image absent from HTML: ${path}`);
      pathsChecked++;
    }
  }
  const copies = c.render.readingMode || c.render.technicalPanel === 'off' ? 1 : 2;
  const inlinedImageOccurrences = [...html.matchAll(/<img src="data:image\/png;base64,/g)].length;
  assert.equal(inlinedImageOccurrences, c.assets.references * c.documents * copies, 'Generated image occurrence count');
  return { pathsChecked, inlinedImageOccurrences, scope: 'Generated fixtures: every path, exact base64 bytes and emitted image occurrences; lazy payloads count as emitted HTML, not DOM' };
}

function xmlPayloads(raw) {
  return raw[0] === 80 && raw[1] === 75
    ? Object.entries(unzipSync(raw)).filter(([p]) => /\.reqif$/i.test(p)).map(([, b]) => b) : [raw];
}
function attributeTargets(pkg, index, byName) {
  return pkg.documents.flatMap(d => d.coreContent.specObjects).flatMap(object => {
    const value = object.values.findLast(v => index.attributeDefinitions.has(v.definitionRef));
    if (!value) return [];
    const name = byName ? index.attributeDefinitions.get(value.definitionRef).longName : value.definitionRef;
    // Ambiguous/absent long names cannot exercise a last-attribute match by name.
    if (!name || api.resolveAttribute(object, index, name).value !== value) return [];
    return [{ object, name, value }];
  });
}

async function inspect(raw, c) {
  const pkg = await api.loadReqIfPackage(raw);
  const index = c.external ? new api.ReqIfIndex(pkg.documents) : checkedPackage(pkg, c);
  const html = await api.renderPackageToHtml(pkg, c.render);
  const validation = verifyHtml(api, pkg, html, c.render);
  const generatedAssetValidation = await verifyGeneratedAssets(api, pkg, c, html);
  const semanticSha256 = hash(validation.semanticText); delete validation.semanticText;
  const diagnostics = {};
  await api.renderPackageToHtml(pkg, { ...c.render, onDegradation: e => { diagnostics[e.code] = (diagnostics[e.code] ?? 0) + 1; } });
  let hierarchyDepth = 0, hierarchyNodes = 0;
  const stack = pkg.documents.flatMap(d => d.coreContent.specifications.flatMap(s => s.children.map(node => ({ node, depth: 1 }))));
  while (stack.length) { const { node, depth } = stack.pop(); hierarchyDepth = Math.max(depth, hierarchyDepth); hierarchyNodes++; stack.push(...node.children.map(node => ({ node, depth: depth + 1 }))); }
  const paths = new Set();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (value.type === 'element') {
      if (value.tag === 'object' && value.attributes.data) paths.add(value.attributes.data);
      if (value.tag === 'img' && value.attributes.src) paths.add(value.attributes.src);
    }
    for (const v of Object.values(value)) if (v && typeof v === 'object') { if (Array.isArray(v)) v.forEach(visit); else visit(v); }
  }
  pkg.documents.forEach(visit);
  const resolved = [...paths].map(p => pkg.attachments.resolve(p)).filter(Boolean);
  const inlinable = resolved.filter(a => a.size <= (c.render.maxInlineBytes ?? 5 * MiB));
  const zip = raw[0] === 80 && raw[1] === 75;
  const objects = pkg.documents.flatMap(d => d.coreContent.specObjects);
  const fragments = objects.flatMap(o => o.values.filter(v => v.kind === 'XHTML').flatMap(v => [v.value, v.originalValue].filter(Boolean)));
  const targetsById = attributeTargets(pkg, index, false).length, targetsByName = attributeTargets(pkg, index, true).length;
  const notExercised = [];
  if (!zip) notExercised.push('unzip archive: plain XML');
  if (!inlinable.length) notExercised.push('attachment bytes/base64: no resolvable inlinable references; discovery scan is still timed');
  if (!targetsById) notExercised.push('find last attribute by ID: no target');
  if (!targetsByName) notExercised.push('find last attribute by name: absent or ambiguous long names');
  if (!fragments.length) notExercised.push('sanitize object XHTML standalone: no fragment');
  return { objects: objects.length, indexedObjects: index.specObjects.size, documents: pkg.documents.length, specifications: validation.specifications,
    relations: index.specRelations.size, hierarchyDepth, hierarchyNodes, zip, xhtmlFragments: fragments.length,
    referencedPaths: paths.size, resolvedPaths: resolved.length, inlinablePaths: inlinable.length,
    inlinableBytes: inlinable.reduce((n, a) => n + a.size, 0), attachmentSizes: [...new Set(resolved.map(a => a.size))],
    attributeTargetsById: targetsById, attributeTargetsByName: targetsByName, notExercised,
    htmlBytes: Buffer.byteLength(html), htmlSha256: hash(html), semanticSha256, validation, generatedAssetValidation, diagnostics };
}

export async function preparePhase(raw, c, phase) {
  let operation, verify = value => assert.ok(value !== undefined), setup = {};
  if (phase === 'load + render') {
    operation = async () => api.renderPackageToHtml(await api.loadReqIfPackage(raw), c.render);
    verify = value => assert.equal(hash(value), c.expectedHtmlSha256, 'Full output changed');
  } else if (phase === 'load package') {
    operation = () => api.loadReqIfPackage(raw);
    verify = p => assert.equal(p.documents.reduce((n, d) => n + d.coreContent.specObjects.length, 0), c.expectedObjects);
  } else if (phase === 'unzip archive') {
    if (raw[0] !== 80 || raw[1] !== 75) return null;
    const count = Object.keys(unzipSync(raw)).length;
    operation = () => unzipSync(raw); verify = x => assert.equal(Object.keys(x).length, count);
  } else if (phase === 'decode XML bytes' || phase === 'parse documents') {
    const payloads = xmlPayloads(raw);
    if (phase === 'decode XML bytes') {
      // Same UTF-8 decoder as the library's byte entry point (fflate strFromU8).
      const expected = payloads.map(b => strFromU8(b));
      operation = () => payloads.map(b => strFromU8(b)); verify = x => assert.deepEqual(x, expected);
    } else {
      const xmls = payloads.map(b => strFromU8(b));
      operation = () => xmls.map(xml => api.parseReqIfXml(xml));
      verify = docs => assert.equal(docs.reduce((n, d) => n + d.coreContent.specObjects.length, 0), c.expectedObjects);
    }
  } else {
    const pkg = await api.loadReqIfPackage(raw);
    if (phase === 'build index') {
      operation = () => new api.ReqIfIndex(pkg.documents); verify = i => assert.equal(i.specObjects.size, c.expectedIndexedObjects);
    } else if (phase === 'resolve attachments') {
      operation = () => Promise.all(pkg.documents.map(d => api.createAttachmentLookup(d, pkg.attachments)));
      verify = lookups => {
        assert.equal(lookups.length, pkg.documents.length);
        if (c.assets) for (const lookup of lookups) for (let n = 0; n < c.assets.unique; n++) assert.ok(lookup.get(`assets/${n}.png`), `Attachment lookup misses assets/${n}.png`);
      };
    } else if (phase.startsWith('find last attribute')) {
      const index = new api.ReqIfIndex(pkg.documents), targets = attributeTargets(pkg, index, phase.endsWith('name'));
      if (!targets.length) return null;
      setup = { targets: targets.length, match: phase.endsWith('name') ? 'normalized long name; unambiguous matches only' : 'exact identifier' };
      operation = () => { let found = 0; for (const t of targets) if (api.resolveAttribute(t.object, index, t.name).value === t.value) found++; return found; };
      verify = n => assert.equal(n, targets.length);
    } else if (phase === 'sanitize object XHTML standalone') {
      const fragments = pkg.documents.flatMap(d => d.coreContent.specObjects).flatMap(o => o.values.filter(v => v.kind === 'XHTML').flatMap(v => [v.value, v.originalValue].filter(Boolean)));
      if (!fragments.length) return null;
      operation = () => { let chars = 0; for (const f of fragments) chars += api.renderXhtmlContent(f).length; return chars; };
      const expected = operation(); verify = n => assert.equal(n, expected);
      setup = { fragments: fragments.length, scope: 'Object value and originalValue, no attachment lookup; not the full renderer sanitization' };
    } else if (phase === 'render package') {
      operation = () => api.renderPackageToHtml(pkg, c.render);
      verify = html => assert.equal(hash(html), c.expectedHtmlSha256, 'Full output changed');
    } else throw Error(`Unknown phase: ${phase}`);
  }
  return { operation, verify, setup };
}

async function worker(job) {
  const bundle = await readFile(job.bundlePath);
  assert.equal(hash(bundle), job.bundleSha256, 'Frozen bundle changed');
  api = await import(pathToFileURL(job.bundlePath).href);
  const baseline = memory();
  const raw = await readFile(job.path); // Buffer already is a Uint8Array: no second input copy.
  assert.equal(hash(raw), job.inputSha256, 'Frozen input changed');
  const identity = { pid: process.pid, processStartApproxUnixMs: Date.now() - process.uptime() * 1000,
    inputSha256: job.inputSha256, bundleSha256: job.bundleSha256, job: job.kind };
  if (job.kind === 'inspect') return { ...identity, ...await inspect(raw, job.config) };
  if (job.kind === 'memory') {
    // Exactly one consumer path. No warmup, explicit GC, phase setup or diagnostics.
    const beforeLoad = memory();
    const pkg = await api.loadReqIfPackage(raw);
    const html = await api.renderPackageToHtml(pkg, job.config.render);
    const withInputModelHtml = memory();
    const wholeProcessPeakRssBytes = process.resourceUsage().maxRSS * 1024;
    assert.ok(raw.byteLength > 0); // Keep the input, model and HTML alive through the snapshot.
    assert.equal(hash(html), job.config.expectedHtmlSha256);
    assert.equal(pkg.documents.length > 0, true);
    return { ...identity, baselineAfterImport: baseline, beforeLoad, withInputModelHtml, wholeProcessPeakRssBytes,
      scope: 'Fresh process, module import + input + ONE load/render. Peak captured before validation; no warmup, forced GC, diagnostic or other phase. Native allocator/runtime included; not minimum required RAM.' };
  }
  const prepared = await preparePhase(raw, job.config, job.phase);
  if (!prepared) return { ...identity, phase: job.phase, notExercised: true };
  const result = await measureOperation(prepared.operation, { now: () => performance.now(), gc: () => global.gc(), verify: prepared.verify, minBatchMs: job.minBatchMs });
  return { ...identity, phase: job.phase, ...result, setup: prepared.setup };
}

function runChild(job, timeout, runner) {
  return new Promise((done, reject) => {
    const child = fork(runner, ['--worker', JSON.stringify(job)], { execArgv: job.kind === 'timing' ? ['--expose-gc'] : [], silent: true });
    let reply, stderr = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
    child.stdout.resume(); child.stderr.on('data', x => { stderr = (stderr + x).slice(-8000); });
    child.on('message', x => { reply = x; });
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) reject(Error(`Worker exceeded ${timeout} ms`));
      else if (code || !reply?.ok) reject(Error(reply?.error || stderr || `Worker exited ${code}/${signal}`));
      else done(reply.result);
    });
  });
}

function cli(args) {
  const opt = { samples: 10, memorySamples: 3, minBatchMs: 30, timeout: 180000, quick: false, cases: [], files: [], phases: [], assetKiB: 256, seed: 73129,
    output: resolve(ROOT, '.bench/code-v2/report.json') };
  const numbers = { '--samples': 'samples', '--memory-samples': 'memorySamples', '--min-batch-ms': 'minBatchMs', '--timeout': 'timeout', '--asset-kib': 'assetKiB', '--seed': 'seed' };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (['--quick', '--self-test', '--list', '--help'].includes(flag)) { opt[flag.slice(2).replace('-t', 'T')] = true; continue; }
    if (numbers[flag] || ['--case', '--file', '--phase', '--output'].includes(flag)) {
      const v = args[++i]; if (!v || v.startsWith('--')) throw Error(`Missing value for ${flag}`);
      if (numbers[flag]) opt[numbers[flag]] = Number(v);
      if (flag === '--case') opt.cases.push(v);
      if (flag === '--file') opt.files.push(resolve(v));
      if (flag === '--phase') { if (!PHASES.includes(v)) throw Error(`Unknown phase: ${v}`); opt.phases.push(v); }
      if (flag === '--output') opt.output = resolve(v);
    } else throw Error(`Unknown argument: ${flag}`);
  }
  if (!Number.isInteger(opt.samples) || opt.samples < 2 || opt.samples > 50) throw Error('--samples must be 2..50');
  if (!Number.isInteger(opt.memorySamples) || opt.memorySamples < 0 || opt.memorySamples > 50) throw Error('--memory-samples must be 0..50');
  for (const k of ['timeout','minBatchMs','assetKiB','seed']) if (!Number.isSafeInteger(opt[k]) || opt[k] <= 0) throw Error(`Invalid ${k}`);
  if (opt.assetKiB > 4096) throw Error('--asset-kib must be <=4096');
  return opt;
}

async function main(args) {
  const opt = cli(args), all = scenarios(opt.quick, opt.assetKiB);
  if (opt.help) { console.log('code-bench.mjs [--self-test | --list | --quick] [--case NAME] [--file PATH] [--phase NAME] [--samples 10] [--memory-samples 3] [--min-batch-ms 30] [--asset-kib 256] [--output PATH]'); return; }
  if (opt.list) { all.forEach(c => console.log(c.name, JSON.stringify(c.config))); return; }
  for (const name of opt.cases) if (!all.some(c => c.name === name)) throw Error(`Unknown case: ${name}`);
  const bundle = await readFile(resolve(ROOT, 'dist/index.js'));
  const runId = randomUUID(), runDirectory = resolve(ROOT, '.bench/code-v2', runId);
  await mkdir(resolve(runDirectory, 'scripts'), { recursive: true });
  const sourceSha256 = {};
  for (const name of SOURCES) { const data = await readFile(resolve(ROOT, 'scripts', name)); sourceSha256[name] = hash(data); await writeFile(resolve(runDirectory, 'scripts', name), data); }
  const bundlePath = resolve(runDirectory, 'bundle.mjs'); await writeFile(bundlePath, bundle);
  api = await import(pathToFileURL(bundlePath).href);
  const checks = await selfTest();
  if (opt.selfTest) { console.log(`${checks.length} functional checks passed.`); return; }
  const selected = all.filter(c => opt.cases.length ? opt.cases.includes(c.name) : !opt.files.length);
  for (const [n, path] of [...new Set(opt.files)].entries()) selected.push({ name: `file-${n + 1}:${basename(path)}`, inputPath: path, config: { external: true, render: { ...BASE_RENDER } } });
  const runner = resolve(runDirectory, 'scripts/code-bench.mjs');
  const report = { version: 2, runId, createdAt: new Date().toISOString(), bundleSha256: hash(bundle), sourceSha256,
    environment: { runtime: process.version, v8: process.versions.v8, platform: platform(), arch: arch(), cpu: cpus()[0]?.model, logicalCpus: cpus().length,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    methodology: { independentProcessesPerCasePerPhase: opt.samples, memorySamples: opt.memorySamples, warmupsPerOperation: 2,
      selectedPhases: opt.phases.length ? opt.phases : PHASES,
      batch: { targetMs: opt.minBatchMs, maxIterations: 1000, note: 'Batch iterations are NOT independent samples. Warmups and pilot batches calibrate the size; a fresh child measures only ONE phase. Async/loop overhead is included, never subtracted.' },
      order: 'Seeded shuffled case/phase jobs within each repetition, serial execution', seed: opt.seed,
      overlaps: 'Standalone operations overlap. Never add, subtract or publish them as pipeline shares. decode/unzip also have standalone timers.',
      memory: 'Separate fresh workers: one load/render, no warmup, no diagnostic, no explicit GC. Whole-process absolute peak, not incremental/minimum application RAM.',
      validation: 'Separate semantic worker, then full HTML hash verification after each timed render. Setup, validation, hashing and GC outside timers.',
      limits: 'Node only; no DOM/layout/paint, memory leak or statistical significance conclusion. Confidence is not inferred from a sample count.' },
    checks, cases: [], failures: [], executionOrder: [], runDirectory };
  await mkdir(dirname(opt.output), { recursive: true });
  const save = async () => {
    const body = JSON.stringify(report, null, 2);
    await writeFile(resolve(runDirectory, 'report.json'), body);
    await writeFile(opt.output, body);
  };
  const entries = [];
  const storedInputs = new Set();
  for (const entry of selected) {
    const bytes = entry.inputPath ? await readFile(entry.inputPath) : makeInput(entry.config), inputSha256 = hash(bytes);
    const path = resolve(runDirectory, inputSha256 + (entry.config.zip ? '.reqifz' : '.reqif'));
    // Equal fixtures intentionally share one frozen file across render variants.
    if (!storedInputs.has(inputSha256)) { await writeFile(path, bytes); storedInputs.add(inputSha256); }
    const base = { path, inputSha256, bundlePath, bundleSha256: report.bundleSha256, config: entry.config };
    try {
      const metadata = await runChild({ ...base, kind: 'inspect' }, opt.timeout, runner);
      const c = { ...entry.config, expectedObjects: metadata.objects, expectedIndexedObjects: metadata.indexedObjects,
        expectedHtmlSha256: metadata.htmlSha256 };
      const result = { name: entry.name, source: entry.inputPath ?? 'generated', config: entry.config, inputSha256, inputBytes: bytes.length, metadata, timings: {}, memory: [], expectedSamples: opt.samples, complete: false };
      report.cases.push(result); entries.push({ result, base: { ...base, config: c } });
    } catch (error) { report.failures.push({ case: entry.name, stage: 'validation', error: error.stack }); }
  }
  await save();
  for (let sample = 0; sample < opt.samples; sample++) {
    const jobs = entries.flatMap(e => (opt.phases.length ? opt.phases : PHASES).map(phase => ({ e, phase })));
    for (const { e, phase } of shuffled(jobs, opt.seed + sample)) {
      const label = `${sample + 1}/${opt.samples} ${e.result.name} :: ${phase}`;
      process.stdout.write(label + ' ');
      try {
        const value = await runChild({ ...e.base, kind: 'timing', phase, minBatchMs: opt.minBatchMs }, opt.timeout, runner);
        report.executionOrder.push({ sample: sample + 1, case: e.result.name, phase, pid: value.pid });
        if (value.notExercised) { console.log('not exercised'); continue; }
        const timing = e.result.timings[phase] ??= { raw: [] }; timing.raw.push(value);
        Object.assign(timing, summarize(timing.raw.map(x => x.ms)));
        console.log(`${value.ms.toFixed(3)} ms (${value.iterations} iterations)`);
      } catch (error) { report.failures.push({ case: e.result.name, phase, sample: sample + 1, error: error.stack }); console.log('FAIL ' + error.message); }
      await save();
    }
  }
  for (let sample = 0; sample < opt.memorySamples; sample++) for (const e of shuffled(entries, opt.seed + 1000 + sample)) {
    try { const value = await runChild({ ...e.base, kind: 'memory' }, opt.timeout, runner); e.result.memory.push(value); console.log(`One-pass whole-process peak RSS ${e.result.name}: ${(value.wholeProcessPeakRssBytes / MiB).toFixed(1)} MiB`); }
    catch (error) { report.failures.push({ case: e.result.name, stage: 'memory', sample: sample + 1, error: error.stack }); }
    await save();
  }
  for (const e of entries) e.result.complete = !report.failures.some(f => f.case === e.result.name) && e.result.memory.length === opt.memorySamples;
  report.finishedAt = new Date().toISOString(); await save();
  console.log(`Report: ${opt.output} | ${report.failures.length} failures`);
  if (report.failures.length) process.exitCode = 1;
}

if (resolve(process.argv[1] ?? '') === SELF) {
  try {
    if (process.argv[2] === '--worker') { const result = await worker(JSON.parse(process.argv[3])); process.send({ ok: true, result }); process.disconnect(); }
    else await main(process.argv.slice(2));
  } catch (error) {
    if (process.send) { process.send({ ok: false, error: error.stack }); process.disconnect(); }
    else console.error(error.stack, error.cause?.stack ?? '');
    process.exitCode = 1;
  }
}
