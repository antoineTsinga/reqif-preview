<script setup lang="ts">
/**
 * Interactive sandbox: loads the built bundle from /public and runs it in the
 * reader's browser, so whatever the library does today is what this page shows.
 *
 * The bundle and the sample package are copied into docs/public by
 * scripts/sync-docs-assets.mjs at build time, so they can never lag behind
 * src/.
 *
 * Layout note: the controls sit in a toolbar ABOVE the output, not in a side
 * column. A ReqIF preview is a wide, deeply indented tree — every pixel taken
 * by a control column is taken from the thing being demonstrated. The page
 * also sets `aside: false` so VitePress drops its 688px content cap.
 */
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { useData } from "vitepress";

/**
 * The sandbox's own chrome, per locale. Only the interface is translated: the
 * option names are the library's API and stay as they are, and the sample file
 * is French whichever language you read this in.
 */
const MESSAGES = {
  en: {
    loading: "Loading the library…", loadFailed: "Could not load.",
    open: "Open a file…", sample: "Sample", attributes: "Attributes", reset: "Reset",
    stacked: "Documents and specifications stacked one under the other",
    tabs: "CSS tabs driven by the URL fragment",
    readingMode: "Reading view", chapterNumbers: "Number 1, 1.1, 1.2…",
    technical: "Technical panel open", simplified: "Simplified version rather than the original",
    relations: "Links between requirements",
    preview: "Preview", code: "Code", diagnostics: "Diagnostics",
    rendering: "rendering…", renderedAt: "rendered at",
    copy: "Copied", copyIdle: "Copy",
    dropHint: ["Drop a", "or a", "anywhere on this block to replace it."],
    fieldsHint: ["Several values separated by commas, in the order you want. Leaving it empty keeps the default behaviour.", "has no effect without"],
    codeHint: "This code produces exactly the preview above. Options left at their default value do not appear in it.",
    noEvents: "No degradation on this file with these options.",
    thCode: "Code", thCount: "Occurrences", thSample: "Sample message",
    diagHint: ["Fed live by", "The rendering is strictly identical with or without this handler: the option only makes decisions that were already taken visible."],
  },
  fr: {
    loading: "Chargement de la bibliothèque…", loadFailed: "Échec du chargement.",
    open: "Ouvrir un fichier…", sample: "Exemple", attributes: "Attributs", reset: "Réinitialiser",
    stacked: "Documents et spécifications les uns sous les autres",
    tabs: "Onglets CSS pilotés par le fragment d'URL",
    readingMode: "Vue de lecture", chapterNumbers: "Numéroter 1, 1.1, 1.2…",
    technical: "Panneau technique ouvert", simplified: "Version simplifiée plutôt que l'original",
    relations: "Liens entre exigences",
    preview: "Aperçu", code: "Code", diagnostics: "Diagnostics",
    rendering: "rendu en cours…", renderedAt: "rendu à",
    copy: "Copié", copyIdle: "Copier",
    dropHint: ["Déposez un", "ou un", "n'importe où sur ce bloc pour le remplacer."],
    fieldsHint: ["Plusieurs valeurs séparées par des virgules, dans l'ordre voulu. Laisser vide garde le comportement par défaut.", "n'a d'effet qu'avec"],
    codeHint: "Ce code produit exactement l'aperçu ci-dessus. Les options laissées à leur valeur par défaut n'y apparaissent pas.",
    noEvents: "Aucune dégradation sur ce fichier avec ces options.",
    thCode: "Code", thCount: "Occurrences", thSample: "Exemple de message",
    diagHint: ["Alimenté en direct par", "Le rendu est strictement identique avec ou sans ce gestionnaire : l'option ne fait que rendre visibles des décisions déjà prises."],
  },
} as const;

const { lang } = useData();
const t = computed(() => (lang.value.startsWith("fr") ? MESSAGES.fr : MESSAGES.en));

type Lib = typeof import("../../../src/index.js");
type Degradation = { code: string; message: string; detail?: unknown };

const lib = shallowRef<Lib | null>(null);
const pkg = shallowRef<unknown>(null);

const html = ref("");
const status = ref("");
const error = ref("");
const busy = ref(false);
const fileName = ref("exemple.reqifz");
const dragging = ref(false);
const events = ref<Degradation[]>([]);
const copied = ref(false);
const rightTab = ref<"apercu" | "code" | "diagnostics">("apercu");
const showAdvanced = ref(false);

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

/** The boolean options, as toggle chips. */
const toggles = computed(() => [
  { model: readingMode, label: "readingMode", hint: t.value.readingMode },
  { model: chapterNumbers, label: "chapterNumbers", hint: t.value.chapterNumbers },
  { model: showTechnicalByDefault, label: "showTechnicalByDefault", hint: t.value.technical },
  { model: preferSimplifiedXhtml, label: "preferSimplifiedXhtml", hint: t.value.simplified },
  { model: showRelations, label: "showRelations", hint: t.value.relations },
]);

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

const changedCount = computed(() => Object.keys(renderOptions.value).length);

/** The snippet that reproduces exactly what the preview pane is showing. */
const snippet = computed(() => {
  const entries = Object.entries(renderOptions.value);
  const head = `import { loadReqIfPackage, renderPackageToHtml } from "reqif-preview";

const pkg = await loadReqIfPackage(bytes);
`;
  if (entries.length === 0) {
    return `${head}const html = await renderPackageToHtml(pkg);`;
  }
  const body = entries.map(([k, v]) => `  ${k}: ${JSON.stringify(v)},`).join("\n");
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
    status.value = `${fileName.value} — ${t.value.renderedAt} ${new Date().toLocaleTimeString(lang.value)}`;
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
    status.value = t.value.loadFailed;
  }
});

watch(renderOptions, render, { deep: true });
</script>

<template>
  <div
    class="pg"
    :class="{ 'pg-dragging': dragging }"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <!-- Toolbar --------------------------------------------------------------->
    <div class="pg-bar">
      <div class="pg-bar-row">
        <label class="pg-btn pg-btn-primary">
          <input type="file" accept=".reqif,.reqifz,.xml" hidden @change="onFile" />
          {{ t.open }}
        </label>
        <button class="pg-btn" type="button" @click="loadSample">{{ t.sample }}</button>

        <span class="pg-sep" aria-hidden="true"></span>

        <div class="pg-seg" role="group" aria-label="layout">
          <button
            type="button"
            :class="{ on: layout === 'stacked' }"
            @click="layout = 'stacked'"
            :title="t.stacked"
          >
            stacked
          </button>
          <button
            type="button"
            :class="{ on: layout === 'tabs' }"
            @click="layout = 'tabs'"
            :title="t.tabs"
          >
            tabs
          </button>
        </div>

        <span class="pg-sep" aria-hidden="true"></span>

        <button
          v-for="t in toggles"
          :key="t.label"
          class="pg-chip"
          type="button"
          role="switch"
          :aria-checked="t.model.value"
          :class="{ on: t.model.value }"
          :title="t.hint"
          @click="t.model.value = !t.model.value"
        >
          {{ t.label }}
        </button>

        <span class="pg-spacer"></span>

        <button
          class="pg-btn pg-btn-ghost"
          type="button"
          :aria-expanded="showAdvanced"
          @click="showAdvanced = !showAdvanced"
        >
          {{ t.attributes }} {{ showAdvanced ? "▴" : "▾" }}
        </button>
        <button
          class="pg-btn pg-btn-ghost"
          type="button"
          :disabled="changedCount === 0"
          @click="reset"
        >
          {{ t.reset }}
        </button>
      </div>

      <div v-show="showAdvanced" class="pg-bar-row pg-advanced">
        <label class="pg-field">
          <span>contentAttributes</span>
          <input v-model="contentAttributes" type="text" placeholder="ReqIF.Text" />
        </label>
        <label class="pg-field">
          <span>titleAttributes</span>
          <input v-model="titleAttributes" type="text" placeholder="ChapterName" />
        </label>
        <label class="pg-field">
          <span>chapterNumberAttributes</span>
          <input
            v-model="chapterNumberAttributes"
            type="text"
            placeholder="ChapterName"
            :disabled="!chapterNumbers"
          />
        </label>
        <label class="pg-field pg-field-narrow">
          <span>dateLocale</span>
          <input v-model="dateLocale" type="text" placeholder="fr-FR" />
        </label>
        <p class="pg-hint">
          {{ t.fieldsHint[0] }} <code>chapterNumberAttributes</code>
          {{ t.fieldsHint[1] }} <code>chapterNumbers</code>.
        </p>
      </div>
    </div>

    <!-- Output --------------------------------------------------------------->
    <nav class="pg-tabs">
      <button :class="{ on: rightTab === 'apercu' }" @click="rightTab = 'apercu'">{{ t.preview }}</button>
      <button :class="{ on: rightTab === 'code' }" @click="rightTab = 'code'">
        {{ t.code }}
        <span v-if="changedCount" class="pg-badge pg-badge-soft">{{ changedCount }}</span>
      </button>
      <button :class="{ on: rightTab === 'diagnostics' }" @click="rightTab = 'diagnostics'">
        {{ t.diagnostics }}
        <span v-if="groupedEvents.length" class="pg-badge">{{ groupedEvents.length }}</span>
      </button>
      <span class="pg-status">{{ busy ? t.rendering : status || t.loading }}</span>
    </nav>

    <p v-if="error" class="pg-error">{{ error }}</p>

    <div class="pg-pane">
      <div v-show="rightTab === 'apercu'">
        <!-- The library's output is HTML it generated itself, from content it
             sanitized itself — that is exactly what this pane exists to show. -->
        <!-- `vp-raw` is VitePress's documented opt-out from its own router.
             Its global click handler bails on `link.closest('.vp-raw')`;
             without that it calls preventDefault() and history.pushState() for
             every in-page anchor — and pushState does NOT recompute `:target`,
             so the URL changed while the tab stayed shut. Measured: clicking
             the second tab moved the hash but left display:none on its panel.
             See guide/mise-en-page.md — this bites any SPA host, not just this
             page. -->
        <div class="pg-render vp-raw" v-html="html" />
        <p class="pg-drop-hint">
          {{ t.dropHint[0] }} <code>.reqif</code> {{ t.dropHint[1] }} <code>.reqifz</code>
          {{ t.dropHint[2] }}
        </p>
      </div>

      <div v-show="rightTab === 'code'">
        <button class="pg-copy" type="button" @click="copySnippet">
          {{ copied ? t.copy : t.copyIdle }}
        </button>
        <pre class="pg-code"><code>{{ snippet }}</code></pre>
        <p class="pg-hint">
          {{ t.codeHint }}
        </p>
      </div>

      <div v-show="rightTab === 'diagnostics'">
        <p v-if="!groupedEvents.length" class="pg-hint">
          {{ t.noEvents }}
        </p>
        <table v-else class="pg-diag">
          <thead>
            <tr><th>{{ t.thCode }}</th><th>{{ t.thCount }}</th><th>{{ t.thSample }}</th></tr>
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
          {{ t.diagHint[0] }} <code>onDegradation</code>. {{ t.diagHint[1] }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pg {
  margin: 24px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg);
}
.pg-dragging {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
}

/* Toolbar -------------------------------------------------------------------*/
.pg-bar {
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}
.pg-bar-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 10px 12px;
}
.pg-advanced {
  align-items: flex-end;
  gap: 12px;
  border-top: 1px dashed var(--vp-c-divider);
}
.pg-sep {
  width: 1px;
  align-self: stretch;
  margin: 0 4px;
  background: var(--vp-c-divider);
}
.pg-spacer { flex: 1 1 auto; }

.pg-btn {
  padding: 6px 11px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
  cursor: pointer;
  white-space: nowrap;
}
.pg-btn:hover { border-color: var(--vp-c-brand-1); }
.pg-btn-primary {
  color: var(--vp-c-white);
  background: var(--vp-c-brand-1);
  border-color: transparent;
}
.pg-btn-primary:hover { background: var(--vp-c-brand-2); }
.pg-btn-ghost { color: var(--vp-c-text-2); background: transparent; }
.pg-btn:disabled { opacity: 0.45; cursor: default; border-color: var(--vp-c-divider); }

/* Segmented control for the one non-boolean enum. */
.pg-seg {
  display: inline-flex;
  padding: 2px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
}
.pg-seg button {
  padding: 4px 11px;
  font-size: 12.5px;
  font-weight: 600;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  background: transparent;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}
.pg-seg button.on {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}

/* Boolean options: pressed-looking pills, so the active set is readable at a
   glance instead of being a column of identical checkboxes. */
.pg-chip {
  padding: 5px 10px;
  font-size: 12.5px;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}
.pg-chip:hover { color: var(--vp-c-text-1); border-color: var(--vp-c-brand-1); }
.pg-chip.on {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  font-weight: 600;
}

.pg-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1 1 190px;
  min-width: 0;
  font-size: 12px;
  color: var(--vp-c-text-2);
}
.pg-field-narrow { flex: 0 1 110px; }
.pg-field input {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 8px;
  font-size: 13px;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
}
.pg-field input:disabled { opacity: 0.5; }

/* Panes ---------------------------------------------------------------------*/
.pg-tabs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--vp-c-divider);
}
.pg-tabs button {
  padding: 5px 11px;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  color: var(--vp-c-text-2);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 7px;
  cursor: pointer;
}
.pg-tabs button.on {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.pg-badge {
  display: inline-block;
  margin-left: 5px;
  padding: 0 6px;
  font-size: 11px;
  color: var(--vp-c-white);
  background: var(--vp-c-warning-3, #d97706);
  border-radius: 9px;
}
.pg-badge-soft {
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
.pg-status {
  margin-left: auto;
  padding-left: 8px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

.pg-pane { padding: 16px 18px; }
.pg-error {
  margin: 0;
  padding: 10px 18px;
  font-size: 13px;
  color: var(--vp-c-danger-1);
  background: var(--vp-c-danger-soft);
}
.pg-render {
  max-height: 78vh;
  overflow: auto;
  /* The library ships its own stylesheet scoped to .reqif-preview; this only
     keeps a long document from taking over the page. */
}
.pg-drop-hint {
  margin: 12px 0 0;
  font-size: 12px;
  color: var(--vp-c-text-3);
}
.pg-hint {
  flex: 1 1 100%;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--vp-c-text-3);
}
.pg-code {
  margin: 0;
  padding: 14px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.6;
  background: var(--vp-c-bg-alt);
  border-radius: 8px;
}
.pg-copy {
  float: right;
  padding: 4px 9px;
  font-size: 12px;
  font-family: inherit;
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
  padding: 7px 10px;
  text-align: left;
  border-bottom: 1px solid var(--vp-c-divider);
  vertical-align: top;
}
.pg-diag th { font-size: 12px; color: var(--vp-c-text-2); }
.pg-num { text-align: right; font-variant-numeric: tabular-nums; }

@media (max-width: 640px) {
  .pg-sep { display: none; }
  .pg-spacer { flex-basis: 100%; }
}
</style>
