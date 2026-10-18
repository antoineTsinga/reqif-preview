/** Structural oracle built from the parsed model, independent of renderPackageToHtml.
 * Checks all hierarchy occurrences (including repeats/missing objects), specifications,
 * unique anchors and every surviving main-XHTML text leaf, in its own occurrence.
 * This is a semantic guard, not a complete independent implementation of the renderer.
 */
const canonical = s => s.replace(/\s+/gu, '');
const dropped = new Set(['script','style','iframe','embed','form','input','button','select','textarea','noscript','head','meta','link','title','svg','video','audio']);
const anchor = id => 'reqif-obj-' + id.replace(/[^A-Za-z0-9_-]/g, '_');
function check(ok, message) { if (!ok) throw Error(`Render validation failed: ${message}`); }

function witnesses(nodes, result = []) {
  for (const n of nodes) {
    if (n.type === 'text') { const text = canonical(n.value); if (text) result.push(text); }
    // An object/img can legitimately render an image instead of fallback text.
    else if (!dropped.has(n.tag) && !['object','img'].includes(n.tag)) witnesses(n.children, result);
  }
  return result;
}

export function expectedRender(api, pkg, options = {}) {
  const index = new api.ReqIfIndex(pkg.documents);
  const occurrences = [], anchors = new Set(); let specifications = 0;
  for (const doc of pkg.documents) for (const spec of doc.coreContent.specifications) {
    specifications++;
    const stack = [...spec.children].reverse();
    while (stack.length) {
      const node = stack.pop(), obj = index.specObjects.get(node.objectRef);
      const contents = [];
      if (obj) {
        anchors.add(anchor(obj.identifier));
        const consumed = api.extractLifecycleInfo(obj, index).consumedDefinitionIds;
        for (const value of obj.values) if (value.kind === 'XHTML' && !consumed.has(value.definitionRef)) {
          const content = options.preferSimplifiedXhtml ? value.value : value.originalValue ?? value.value;
          if (content) contents.push(witnesses(content.nodes));
        }
      }
      occurrences.push({ objectRef: node.objectRef, title: canonical(obj?.longName || node.longName || ''), contents, missing: !obj });
      stack.push(...[...node.children].reverse());
    }
  }
  return { specifications, occurrences, anchors: [...anchors].sort(),
    unreferencedObjects: [...index.specObjects.keys()].filter(id => !anchors.has(anchor(id))).length };
}

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity) => {
    if (entity[0] === '#') return String.fromCodePoint(entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' })[entity.toLowerCase()] ?? all;
  });
}

/** Small streaming tokenizer for the library's emitted HTML. Raw script/style bodies
 * are skipped, so inert lazy-panel markup cannot impersonate rendered elements.
 */
export function observeHtml(html) {
  check(typeof html === 'string', 'HTML must be a string');
  const tokens = /<!--[\s\S]*?-->|<\/?[A-Za-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>/g;
  const stack = [], nodes = [], ids = [], nodeStack = [];
  const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  let at = 0, specifications = 0, root = false, content = null, title = null;
  for (let match; (match = tokens.exec(html));) {
    if (content) content.parts.push(decode(html.slice(at, match.index)));
    if (title) title.parts.push(decode(html.slice(at, match.index)));
    const tagText = match[0]; at = tokens.lastIndex;
    if (tagText.startsWith('<!--')) continue;
    const tag = /^<\/?([\w-]+)/.exec(tagText)[1].toLowerCase();
    if (tagText[1] === '/') {
      const entry = stack.pop(); check(entry?.tag === tag, `unbalanced ${tag}`);
      if (entry.content) { entry.content.owner.contents.push(canonical(entry.content.parts.join(''))); content = null; }
      if (entry.title) { entry.title.owner.title = canonical(entry.title.parts.join('')); title = null; }
      if (entry.node) nodeStack.pop();
      // Restore a parent content when an inner formatting element closes.
      if (!content) content = stack.findLast(e => e.content)?.content ?? null;
      if (!title) title = stack.findLast(e => e.title)?.title ?? null;
      continue;
    }
    const attrs = Object.fromEntries([...tagText.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
    const classes = (attrs.class ?? '').split(/\s+/);
    if (attrs.id) ids.push(attrs.id);
    if (classes.includes('reqif-preview')) root = true;
    if (tag === 'section' && classes.includes('reqif-spec')) specifications++;
    const entry = { tag };
    if (tag === 'details' && classes.includes('reqif-node')) {
      const node = { contents: [], title: '', id: attrs.id ?? null }; nodes.push(node); nodeStack.push(node); entry.node = node;
    }
    if (classes.includes('reqif-content')) {
      check(nodeStack.length > 0, 'content outside a hierarchy occurrence');
      entry.content = { owner: nodeStack.at(-1), parts: [] }; content = entry.content;
    }
    if (classes.includes('reqif-node-title')) {
      check(nodeStack.length > 0, 'title outside a hierarchy occurrence');
      entry.title = { owner: nodeStack.at(-1), parts: [] }; title = entry.title;
    }
    if (tag === 'script' || tag === 'style') {
      const end = new RegExp(`</${tag}\\s*>`, 'ig'); end.lastIndex = at;
      const close = end.exec(html); check(close, `unclosed ${tag}`); tokens.lastIndex = end.lastIndex; at = tokens.lastIndex;
    } else if (!voids.has(tag) && !tagText.endsWith('/>')) stack.push(entry);
  }
  check(stack.length === 0, 'unclosed HTML elements');
  return { root, specifications, nodes, ids };
}

export function observeDom(root) {
  return { root: !!root.querySelector('.reqif-preview'), specifications: root.querySelectorAll('section.reqif-spec').length,
    ids: [...root.querySelectorAll('[id]')].map(n => n.id),
    nodes: [...root.querySelectorAll('details.reqif-node')].map(n => ({ id: n.id || null, title: canonical(n.children[0].textContent),
      contents: [...n.children[1].getElementsByClassName('reqif-content')].map(c => canonical(c.textContent)) })) };
}

export function verifyObserved(expected, actual) {
  check(actual.root, 'preview root absent');
  check(actual.specifications === expected.specifications, `specifications ${actual.specifications}/${expected.specifications}`);
  check(actual.nodes.length === expected.occurrences.length, `hierarchy occurrences ${actual.nodes.length}/${expected.occurrences.length}`);
  check(new Set(actual.ids).size === actual.ids.length, 'duplicate DOM ids');
  const anchors = actual.ids.filter(id => id.startsWith('reqif-obj-')).sort();
  check(JSON.stringify(anchors) === JSON.stringify(expected.anchors), 'object anchor set differs from reachable model');
  let textLeavesChecked = 0, contentsChecked = 0;
  for (let i = 0; i < expected.occurrences.length; i++) {
    const exp = expected.occurrences[i], observed = actual.nodes[i];
    check(!exp.title || observed.title.includes(exp.title), `title for occurrence ${i} (${exp.objectRef})`);
    check(observed.contents.length === exp.contents.length, `content count for occurrence ${i} (${exp.objectRef})`);
    for (let j = 0; j < exp.contents.length; j++) {
      let cursor = 0; contentsChecked++;
      for (const text of exp.contents[j]) {
        const found = observed.contents[j].indexOf(text, cursor);
        check(found >= 0, `missing/reordered XHTML text in occurrence ${i} (${exp.objectRef})`);
        cursor = found + text.length; textLeavesChecked++;
      }
    }
  }
  return { passed: true, specifications: expected.specifications, hierarchyOccurrences: expected.occurrences.length,
    uniqueObjectAnchors: expected.anchors.length, unreferencedObjects: expected.unreferencedObjects,
    contentsChecked, textLeavesChecked,
    limitations: 'Parsed-model oracle; checks main XHTML text, structure and anchors, not every style, scalar technical value, image pixel or independent XML conformance.' };
}

export function verifyHtml(api, pkg, html, options = {}) {
  const observed = observeHtml(html);
  return { ...verifyObserved(expectedRender(api, pkg, options), observed), semanticText: observed.nodes.map(n => n.title + '|' + n.contents.join('|')).join('\n') };
}
