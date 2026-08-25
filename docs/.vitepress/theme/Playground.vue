<script setup lang="ts">
/**
 * Interactive sandbox: loads the *real* built bundle from /public and runs it
 * in the reader's browser. Nothing here is a screenshot or a transcription —
 * whatever the library does today is what this page shows.
 *
 * The bundle and the sample package are copied into docs/public by
 * scripts/sync-docs-assets.mjs at build time, so they can never lag behind
 * src/. That is the whole point: the page this replaces was a hand-pasted
 * copy that silently went two months stale.
 */
import { computed, onMounted, ref, shallowRef, watch } from "vue";

type Lib = typeof import("../../../src/index.js");
type Degradation = { code: string; message: string; detail?: unknown };

const lib = shallowRef<Lib | null>(null);
const pkg = shallowRef<unknown>(null);

const html = ref("");
const status = ref("Chargement de la bibliothèque…");
const error = ref("");
const busy = ref(false);
const fileName = ref("exemple.reqifz");
const dragging = ref(false);
const events = ref<Degradation[]>([]);
const copied = ref(false);
const rightTab = ref<"apercu" | "code" | "diagnostics">("apercu");

// --- Options exposed by the sandbox -----------------------------------------
const layout = ref<"stacked" | "tabs">("stacked");
const readingMode = ref(false);
const chapterNumbers = ref(false);
const chapterNumberAttributes = ref("");
const showTechnicalByDefault = ref(false);
const preferSimplifiedXhtml = ref(false);
const showRelations = ref(true);
const dateLocale = ref("fr-FR");
const contentAttributes = ref("");
const titleAttributes = ref("");

/** "a, b" -> ["a", "b"]; blank -> undefined, so the option stays at its default. */
function list(raw: string): string[] | undefined {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length ? parts : undefined;
}

/** Only the options that differ from the library's defaults. */
const renderOptions = computed(() => {
  const o: Record<string, unknown> = {};
  if (layout.value !== "stacked") o.layout = layout.value;
  if (readingMode.value) o.readingMode = true;
  if (chapterNumbers.value) o.chapterNumbers = true;
  const chapters = list(chapterNumberAttributes.value);
  if (chapters) o.chapterNumberAttributes = chapters;
  if (showTechnicalByDefault.value) o.showTechnicalByDefault = true;
  if (preferSimplifiedXhtml.value) o.preferSimplifiedXhtml = true;
  if (!showRelations.value) o.showRelations = false;
  if (dateLocale.value && dateLocale.value !== "fr-FR") o.dateLocale = dateLocale.value;
  const content = list(contentAttributes.value);
  if (content) o.contentAttributes = content;
  const titles = list(titleAttributes.value);
  if (titles) o.titleAttributes = titles;
  return o;
});

/** The snippet that reproduces exactly what the preview pane is showing. */
const snippet = computed(() => {
  const entries = Object.entries(renderOptions.value);
  const head = `import { loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

const pkg = await loadReqIfPackage(bytes);
`;
  if (entries.length === 0) {
    return `${head}const html = await renderPackageToHtml(pkg);`;
  }
  const body = entries
    .map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`)
    .join("\n");
  return `${head}const html = await renderPackageToHtml(pkg, {\n${body}\n});`;
});

/** Grouped, because dropped-tag alone can fire thousands of times. */
const groupedEvents = computed(() => {
  const byCode = new Map<string, { code: string; count: number; sample: string }>();
  for (const e of events.value) {
    const seen = byCode.get(e.code);
    if (seen) seen.count += 1;
    else byCode.set(e.code, { code: e.code, count: 1, sample: e.message });
  }
  return [...byCode.values()].sort((a, b) => b.count - a.count);
});

async function render() {
  if (!lib.value || !pkg.value) return;
  busy.value = true;
  error.value = "";
  const collected: Degradation[] = [];
  try {
    html.value = await lib.value.renderPackageToHtml(pkg.value as never, {
      ...renderOptions.value,
      onDegradation: (e) => collected.push(e as Degradation),
    } as never);
    events.value = collected;
    status.value = `${fileName.value} — rendu à ${new Date().toLocaleTimeString("fr-FR")}`;
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

async function loadBytes(bytes: Uint8Array, name: string) {
  if (!lib.value) return;
  busy.value = true;
  error.value = "";
  try {
    pkg.value = await lib.value.loadReqIfPackage(bytes);
    fileName.value = name;
    await render();
  } catch (e) {
    // Parsing is the one stage that does throw — everything after it degrades.
    error.value = e instanceof Error ? e.message : String(e);
    html.value = "";
    busy.value = false;
  }
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) await loadBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

async function onDrop(event: DragEvent) {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) await loadBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

async function loadSample() {
  const base = import.meta.env.BASE_URL;
  const res = await fetch(`${base}exemple.reqifz`);
  if (!res.ok) throw new Error(`exemple.reqifz introuvable (${res.status})`);
  await loadBytes(new Uint8Array(await res.arrayBuffer()), "exemple.reqifz");
}

function copySnippet() {
  navigator.clipboard?.writeText(snippet.value).then(() => {
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  });
}

function reset() {
  layout.value = "stacked";
  readingMode.value = false;
  chapterNumbers.value = false;
  chapterNumberAttributes.value = "";
  showTechnicalByDefault.value = false;
  preferSimplifiedXhtml.value = false;
  showRelations.value = true;
  dateLocale.value = "fr-FR";
  contentAttributes.value = "";
  titleAttributes.value = "";
}

onMounted(async () => {
  try {
    // @vite-ignore: this URL is resolved by the browser at runtime, from
    // /public — Vite must not try to pre-bundle it.
    const base = import.meta.env.BASE_URL;
    lib.value = (await import(/* @vite-ignore */ `${base}reqif-preview.js`)) as Lib;
    await loadSample();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
    status.value = "Échec du chargement.";
  }
});

watch(renderOptions, render, { deep: true });
</script>

<template>
  <div class="pg">
    <!-- Controls ------------------------------------------------------------->
    <aside class="pg-controls">
      <div class="pg-block">
        <label class="pg-legend">Fichier</label>
        <input
          class="pg-file"
          type="file"
          accept=".reqif,.reqifz,.xml"
          @change="onFile"
        />
        <button class="pg-btn" type="button" @click="loadSample">
          Recharger l'exemple
        </button>
        <p class="pg-hint">
          Votre fichier ne quitte jamais votre navigateur : tout est calculé
          localement, il n'y a aucun serveur derrière cette page.
        </p>
      </div>

      <div class="pg-block">
        <label class="pg-legend">Mise en page</label>
        <label class="pg-row">
          <span>layout</span>
          <select v-model="layout">
            <option value="stacked">stacked</option>
            <option value="tabs">tabs</option>
          </select>
        </label>
        <label class="pg-check">
          <input v-model="readingMode" type="checkbox" />
          <span><code>readingMode</code> — vue de lecture</span>
        </label>
        <label class="pg-check">
          <input v-model="chapterNumbers" type="checkbox" />
          <span><code>chapterNumbers</code> — 1, 1.1, 1.2…</span>
        </label>
        <label class="pg-row" v-if="chapterNumbers">
          <span>chapterNumberAttributes</span>
          <input v-model="chapterNumberAttributes" type="text" placeholder="ChapterName" />
        </label>
      </div>

      <div class="pg-block">
        <label class="pg-legend">Contenu</label>
        <label class="pg-check">
          <input v-model="showTechnicalByDefault" type="checkbox" />
          <span><code>showTechnicalByDefault</code></span>
        </label>
        <label class="pg-check">
          <input v-model="preferSimplifiedXhtml" type="checkbox" />
          <span><code>preferSimplifiedXhtml</code></span>
        </label>
        <label class="pg-check">
          <input v-model="showRelations" type="checkbox" />
          <span><code>showRelations</code></span>
        </label>
        <label class="pg-row">
          <span>contentAttributes</span>
          <input v-model="contentAttributes" type="text" placeholder="ReqIF.Text" />
        </label>
        <label class="pg-row">
          <span>titleAttributes</span>
          <input v-model="titleAttributes" type="text" placeholder="ChapterName" />
        </label>
        <label class="pg-row">
          <span>dateLocale</span>
          <input v-model="dateLocale" type="text" placeholder="fr-FR" />
        </label>
      </div>

      <button class="pg-btn pg-btn-ghost" type="button" @click="reset">
        Réinitialiser les options
      </button>
    </aside>

    <!-- Output --------------------------------------------------------------->
    <section
      class="pg-output"
      :class="{ 'pg-dragging': dragging }"
      @dragover.prevent="dragging = true"
      @dragleave="dragging = false"
      @drop.prevent="onDrop"
    >
      <nav class="pg-tabs">
        <button :class="{ on: rightTab === 'apercu' }" @click="rightTab = 'apercu'">
          Aperçu
        </button>
        <button :class="{ on: rightTab === 'code' }" @click="rightTab = 'code'">
          Code
        </button>
        <button :class="{ on: rightTab === 'diagnostics' }" @click="rightTab = 'diagnostics'">
          Diagnostics
          <span v-if="events.length" class="pg-badge">{{ groupedEvents.length }}</span>
        </button>
        <span class="pg-status">{{ busy ? "rendu en cours…" : status }}</span>
      </nav>

      <p v-if="error" class="pg-error">{{ error }}</p>

      <div v-show="rightTab === 'apercu'" class="pg-pane">
        <p class="pg-drop-hint">Déposez un <code>.reqif</code> / <code>.reqifz</code> ici.</p>
        <!-- The library's output is HTML it generated itself, from content it
             sanitized itself — that is exactly what this pane exists to show. -->
        <div class="pg-render" v-html="html" />
      </div>

      <div v-show="rightTab === 'code'" class="pg-pane">
        <button class="pg-copy" type="button" @click="copySnippet">
          {{ copied ? "Copié" : "Copier" }}
        </button>
        <pre class="pg-code"><code>{{ snippet }}</code></pre>
        <p class="pg-hint">
          Ce code produit exactement l'aperçu ci-contre. Les options laissées à
          leur valeur par défaut n'y apparaissent pas.
        </p>
      </div>

      <div v-show="rightTab === 'diagnostics'" class="pg-pane">
        <p v-if="!events.length" class="pg-hint">
          Aucune dégradation sur ce fichier avec ces options.
        </p>
        <table v-else class="pg-diag">
          <thead>
            <tr><th>Code</th><th>Occurrences</th><th>Exemple de message</th></tr>
          </thead>
          <tbody>
            <tr v-for="g in groupedEvents" :key="g.code">
              <td><code>{{ g.code }}</code></td>
              <td class="pg-num">{{ g.count }}</td>
              <td>{{ g.sample }}</td>
            </tr>
          </tbody>
        </table>
        <p class="pg-hint">
          Ce tableau est alimenté en direct par <code>onDegradation</code>. Le
          rendu est strictement identique avec ou sans ce gestionnaire : l'option
          ne fait que rendre visibles des décisions déjà prises.
        </p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.pg {
  display: grid;
  grid-template-columns: minmax(240px, 280px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
  margin: 24px 0;
}
@media (max-width: 900px) {
  .pg { grid-template-columns: minmax(0, 1fr); }
}

/* Controls ------------------------------------------------------------------*/
.pg-controls {
  display: flex;
  flex-direction: column;
  gap: 14px;
  position: sticky;
  top: 80px;
}
@media (max-width: 900px) {
  .pg-controls { position: static; }
}
.pg-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
}
.pg-legend {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}
.pg-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  min-width: 0;
}
.pg-row input,
.pg-row select,
.pg-file {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 8px;
  font-size: 13px;
  font-family: inherit;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}
.pg-check {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--vp-c-text-1);
  cursor: pointer;
}
.pg-check input { margin-top: 2px; flex: none; }
.pg-check code,
.pg-row code { font-size: 12px; }
.pg-hint {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--vp-c-text-3);
}
.pg-btn {
  padding: 7px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-white);
  background: var(--vp-c-brand-1);
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
.pg-btn-ghost {
  color: var(--vp-c-text-2);
  background: transparent;
  border-color: var(--vp-c-divider);
}

/* Output --------------------------------------------------------------------*/
.pg-output {
  min-width: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  overflow: hidden;
  background: var(--vp-c-bg);
}
.pg-dragging { border-color: var(--vp-c-brand-1); }
.pg-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}
.pg-tabs button {
  padding: 5px 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
}
.pg-tabs button.on {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-bg);
  border-color: var(--vp-c-divider);
}
.pg-badge {
  display: inline-block;
  margin-left: 5px;
  padding: 0 5px;
  font-size: 11px;
  color: var(--vp-c-white);
  background: var(--vp-c-warning-3, #d97706);
  border-radius: 8px;
}
.pg-status {
  margin-left: auto;
  padding-left: 8px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.pg-pane { padding: 14px 16px; }
.pg-error {
  margin: 0;
  padding: 10px 16px;
  font-size: 13px;
  color: var(--vp-c-danger-1);
  background: var(--vp-c-danger-soft);
}
.pg-drop-hint {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.pg-render {
  max-height: 70vh;
  overflow: auto;
  /* The library ships its own stylesheet scoped to .reqif-preview; this only
     keeps a long document from taking over the page. */
}
.pg-code {
  margin: 0;
  padding: 12px;
  overflow-x: auto;
  font-size: 12.5px;
  line-height: 1.6;
  background: var(--vp-c-bg-alt);
  border-radius: 8px;
}
.pg-copy {
  float: right;
  padding: 4px 9px;
  font-size: 12px;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  cursor: pointer;
}
.pg-diag {
  width: 100%;
  display: table;
  font-size: 13px;
  border-collapse: collapse;
}
.pg-diag th,
.pg-diag td {
  padding: 6px 8px;
  text-align: left;
  border-bottom: 1px solid var(--vp-c-divider);
  vertical-align: top;
}
.pg-diag th { font-size: 12px; color: var(--vp-c-text-2); }
.pg-num { text-align: right; font-variant-numeric: tabular-nums; }
</style>
