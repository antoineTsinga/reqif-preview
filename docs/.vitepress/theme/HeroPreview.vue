<script setup lang="ts">
/**
 * The landing page's illustration: not a screenshot, but the library's actual
 * output for `docs/public/exemple.reqifz`, rendered at build time by
 * scripts/sync-docs-assets.mjs and inlined here.
 *
 * Why not a PNG: a committed screenshot shows whatever the library did on the
 * day it was taken. Why not render it live like the sandbox does: that would
 * pull the 216 Ko bundle onto the landing page just to draw a picture. Generating the
 * HTML on Node costs the visitor nothing, needs no headless browser in CI, and
 * cannot drift.
 *
 * It is inert on purpose. `pointer-events: none` keeps the anchors inside from
 * competing with the page for the URL fragment, and the real thing is one
 * click away in the sandbox.
 */
import { computed } from "vue";
import html from "./hero-preview.generated.html?raw";
// A raw <a href> is NOT rewritten by VitePress the way a markdown link is, so
// on a project page served under /reqif-preview/ a bare "/bac-a-sable" 404s.
import { useData, withBase } from "vitepress";

// The caption and the link it carries follow the page's locale. `lang` is what
// VitePress derives from the URL prefix, so this needs no prop and no store.
const { lang } = useData();
const fr = computed(() => lang.value.startsWith("fr"));
const caption = computed(() =>
  fr.value
    ? "Rendu produit par la bibliothèque à partir du fichier d'exemple."
    : "Rendered by the library itself, from the sample file.",
);
const cta = computed(() =>
  fr.value ? "Essayez sur votre propre fichier" : "Try it on your own file",
);
const playground = computed(() => withBase(fr.value ? "/fr/bac-a-sable" : "/playground"));
</script>

<template>
  <figure class="hero-preview">
    <div class="hp-frame">
      <div class="hp-bar" aria-hidden="true">
        <span class="hp-dot" /><span class="hp-dot" /><span class="hp-dot" />
        <span class="hp-name">exigences-client.reqif</span>
      </div>
      <!-- The library's own HTML, with its own scoped stylesheet. -->
      <div class="hp-body vp-raw" v-html="html" />
      <div class="hp-fade" aria-hidden="true" />
    </div>
    <figcaption>
      {{ caption }}
      <a :href="playground">{{ cta }}</a>.
    </figcaption>
  </figure>
</template>

<style scoped>
.hero-preview {
  margin: 40px auto 8px;
  padding: 0 24px;
  /* 1200 - 2x24 = 1152, the exact width VitePress gives the feature cards
     above, so the frame lines up with them instead of sitting inset. */
  max-width: 1200px;
}

.hp-frame {
  /* The library's stylesheet sets `color: #1a1a1a` on `.reqif-preview` but no
     background, so its output assumes a light surface. Pinning one here keeps
     the illustration readable in dark mode instead of near-black on near-black,
     and a light document inside a themed window frame is what a screenshot of
     this output would look like anyway. */
  --hp-surface: #fff;
  position: relative;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg);
  box-shadow: 0 12px 32px -12px rgb(0 0 0 / 18%);
}

.hp-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-divider);
}
.hp-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--vp-c-gray-3, #c2c2c4);
}
.hp-name {
  margin-left: 10px;
  font-size: 12px;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-3);
}

.hp-body {
  background: var(--hp-surface);
  max-height: 460px;
  overflow: hidden;
  padding: 8px 18px 0;
  /* Inert: the preview's own anchors must not fight the page for the URL
     fragment, and this is an illustration, not a control. */
  pointer-events: none;
  user-select: none;
}

/* Lets the block read as a peek rather than as something abruptly cut off. */
.hp-fade {
  position: absolute;
  right: 1px;
  bottom: 0;
  left: 1px;
  height: 110px;
  background: linear-gradient(to bottom, transparent, var(--hp-surface));
}

figcaption {
  margin-top: 12px;
  font-size: 13px;
  line-height: 1.6;
  text-align: center;
  color: var(--vp-c-text-3);
}
figcaption a {
  color: var(--vp-c-brand-1);
  font-weight: 500;
  text-decoration: none;
}
figcaption a:hover {
  text-decoration: underline;
}

@media (max-width: 640px) {
  .hero-preview {
    padding: 0 16px;
  }
  .hp-body {
    max-height: 320px;
  }
}
</style>
