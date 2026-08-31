import { defineConfig, type DefaultTheme } from "vitepress";
import { createRequire } from "node:module";

// Read from package.json rather than typed out here: a version in two places
// is a version that will disagree with itself on the next release.
const { version } = createRequire(import.meta.url)("../../package.json");

// Served at the root of its own domain, so the base is "/". It was
// "/reqif-preview/" while the site lived under a github.io project page: get
// this wrong and every asset URL misses by one path segment, which shows up as
// a site rendering with no styles at all rather than as a visible error.
const BASE = "/";

const REPO = "https://github.com/antoineTsinga/reqif-preview";
const HOSTNAME = "https://reqif-preview.dev";

/**
 * Pages that exist in both languages, English path on the left.
 *
 * This has to be written out: nothing in the file tree says that
 * `guide/getting-started.md` and `fr/guide/demarrage.md` are the same page,
 * because the French slugs are French. Only pairs listed here get `hreflang`
 * alternates — claiming an alternate that does not exist is worse than
 * claiming none, since it sends a reader to a 404 in their own language.
 */
const TRANSLATED: ReadonlyArray<readonly [string, string]> = [
  ["index.md", "fr/index.md"],
  ["playground.md", "fr/bac-a-sable.md"],
  ["guide/getting-started.md", "fr/guide/demarrage.md"],
  ["guide/title-and-content.md", "fr/guide/titre-et-contenu.md"],
  ["guide/simplified-text.md", "fr/guide/texte-simplifie.md"],
  ["guide/custom-renderers.md", "fr/guide/rendus-personnalises.md"],
  ["guide/layout.md", "fr/guide/mise-en-page.md"],
  ["guide/relations.md", "fr/guide/relations.md"],
  ["guide/attachments.md", "fr/guide/pieces-jointes.md"],
  ["guide/large-documents.md", "fr/guide/gros-documents.md"],
  ["guide/diagnostics.md", "fr/guide/diagnostics.md"],
  ["guide/security.md", "fr/guide/securite.md"],
  ["guide/your-own-rendering.md", "fr/guide/rendu-maison.md"],
  ["api/index.md", "fr/api/index.md"],
  ["api/loading.md", "fr/api/chargement.md"],
  ["api/rendering.md", "fr/api/rendu.md"],
  ["api/options.md", "fr/api/options.md"],
  ["api/model.md", "fr/api/modele.md"],
  ["api/diagnostics.md", "fr/api/diagnostics.md"],
];

/** `fr/api/index.md` -> `https://reqif-preview.dev/fr/api/`, matching cleanUrls. */
function pageUrl(relativePath: string): string {
  let path = relativePath.replace(/\.md$/, "");
  if (path === "index") path = "";
  else if (path.endsWith("/index")) path = path.slice(0, -"index".length);
  return `${HOSTNAME}/${path}`;
}

const enGuide: DefaultTheme.SidebarItem[] = [
  { text: "Getting started", link: "/guide/getting-started" },
  { text: "Title and content shown", link: "/guide/title-and-content" },
  { text: "Simplified text", link: "/guide/simplified-text" },
  { text: "Custom renderers", link: "/guide/custom-renderers" },
  { text: "Tabs, numbering, reading view", link: "/guide/layout" },
  { text: "Links between requirements", link: "/guide/relations" },
  { text: "Attachments", link: "/guide/attachments" },
  { text: "Deeply nested documents", link: "/guide/large-documents" },
  { text: "Diagnostics", link: "/guide/diagnostics" },
  { text: "Security", link: "/guide/security" },
  { text: "Rendering it yourself", link: "/guide/your-own-rendering" },
];

const enApi: DefaultTheme.SidebarItem[] = [
  { text: "Overview", link: "/api/" },
  { text: "Loading and parsing", link: "/api/loading" },
  { text: "HTML rendering", link: "/api/rendering" },
  { text: "Render options", link: "/api/options" },
  { text: "Data model", link: "/api/model" },
  { text: "Diagnostics", link: "/api/diagnostics" },
];

const frGuide: DefaultTheme.SidebarItem[] = [
  { text: "Démarrage", link: "/fr/guide/demarrage" },
  { text: "Titre et contenu affichés", link: "/fr/guide/titre-et-contenu" },
  { text: "Texte simplifié", link: "/fr/guide/texte-simplifie" },
  { text: "Rendus personnalisés", link: "/fr/guide/rendus-personnalises" },
  { text: "Onglets, numérotation, lecture", link: "/fr/guide/mise-en-page" },
  { text: "Liens entre exigences", link: "/fr/guide/relations" },
  { text: "Pièces jointes", link: "/fr/guide/pieces-jointes" },
  { text: "Documents très imbriqués", link: "/fr/guide/gros-documents" },
  { text: "Diagnostics", link: "/fr/guide/diagnostics" },
  { text: "Sécurité", link: "/fr/guide/securite" },
  { text: "Votre propre rendu", link: "/fr/guide/rendu-maison" },
];

const frApi: DefaultTheme.SidebarItem[] = [
  { text: "Vue d'ensemble", link: "/fr/api/" },
  { text: "Chargement et parsing", link: "/fr/api/chargement" },
  { text: "Rendu HTML", link: "/fr/api/rendu" },
  { text: "Options de rendu", link: "/fr/api/options" },
  { text: "Modèle de données", link: "/fr/api/modele" },
  { text: "Diagnostics", link: "/fr/api/diagnostics" },
];

export default defineConfig({
  base: BASE,
  title: "reqif-preview",
  cleanUrls: true,
  lastUpdated: true,

  // The conventions partials are `@include`d into other pages, never visited
  // on their own. Left as pages they get a URL, land in the sitemap and are
  // offered to readers as a result — a code block with no surrounding page.
  // `@include` reads them off disk, so excluding them here costs nothing.
  srcExclude: ["**/_conventions.md"],
  head: [["link", { rel: "icon", href: `${BASE}favicon.svg` }]],

  sitemap: { hostname: HOSTNAME },

  /**
   * `lang` on <html> tells a crawler what language a page is in; it does not
   * tell it that two pages are the same page in two languages. That is what
   * `hreflang` is for, and without it a search engine is free to treat the
   * French and English versions as competing content rather than alternates —
   * which is precisely the benefit an English root is meant to buy.
   *
   * `x-default` points at English: it is what a reader whose language matches
   * neither should land on.
   */
  transformHead({ pageData }) {
    const rel = pageData.relativePath;
    const head: [string, Record<string, string>][] = [
      ["link", { rel: "canonical", href: pageUrl(rel) }],
    ];

    const pair = TRANSLATED.find(([en, fr]) => en === rel || fr === rel);
    if (pair) {
      const [en, fr] = pair;
      head.push(
        ["link", { rel: "alternate", hreflang: "en", href: pageUrl(en) }],
        ["link", { rel: "alternate", hreflang: "fr", href: pageUrl(fr) }],
        ["link", { rel: "alternate", hreflang: "x-default", href: pageUrl(en) }],
      );
    }
    return head;
  },

  // English is the root locale; French lives under /fr/. Both are complete
  // sites in their own right as far as routing goes — VitePress picks the
  // locale from the URL prefix, and the language switcher preserves the rest
  // of the path when an equivalent page exists.
  locales: {
    root: {
      label: "English",
      lang: "en",
      description:
        "Framework-independent library to parse and preview ReqIF and ReqIFZ files.",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/guide/getting-started" },
          { text: "API", link: "/api/" },
          { text: "Playground", link: "/playground" },
          { text: `v${version}`, link: `${REPO}/releases` },
        ],
        sidebar: [
          { text: "Guide", items: enGuide },
          { text: "API reference", items: enApi },
          { text: "Playground", link: "/playground" },
        ],
        editLink: {
          pattern: `${REPO}/edit/main/docs/:path`,
          text: "Suggest a change to this page",
        },
        footer: {
          message: "Released under the MIT licence. Conformant to OMG ReqIF v1.2 (formal/2016-07-01).",
          copyright: "© 2026 Antoine Tsinga",
        },
      },
    },

    fr: {
      label: "Français",
      lang: "fr-FR",
      link: "/fr/",
      description:
        "Bibliothèque indépendante de tout framework pour parser et prévisualiser des fichiers ReqIF et ReqIFZ.",
      themeConfig: {
        outline: { level: [2, 3], label: "Sur cette page" },
        nav: [
          { text: "Guide", link: "/fr/guide/demarrage" },
          { text: "API", link: "/fr/api/" },
          { text: "Bac à sable", link: "/fr/bac-a-sable" },
          { text: `v${version}`, link: `${REPO}/releases` },
        ],
        sidebar: [
          { text: "Guide", items: frGuide },
          { text: "Référence API", items: frApi },
          { text: "Bac à sable", link: "/fr/bac-a-sable" },
        ],
        editLink: {
          pattern: `${REPO}/edit/main/docs/:path`,
          text: "Proposer une modification de cette page",
        },
        docFooter: { prev: "Page précédente", next: "Page suivante" },
        darkModeSwitchLabel: "Apparence",
        lightModeSwitchTitle: "Passer en thème clair",
        darkModeSwitchTitle: "Passer en thème sombre",
        sidebarMenuLabel: "Menu",
        returnToTopLabel: "Retour en haut",
        lastUpdatedText: "Dernière mise à jour",
        langMenuLabel: "Changer de langue",
        footer: {
          message: "Publié sous licence MIT. Conforme à OMG ReqIF v1.2 (formal/2016-07-01).",
          copyright: "© 2026 Antoine Tsinga",
        },
        search: {
          provider: "local",
          options: {
            translations: {
              button: { buttonText: "Rechercher", buttonAriaLabel: "Rechercher" },
              modal: {
                noResultsText: "Aucun résultat pour",
                resetButtonTitle: "Effacer",
                footer: { selectText: "ouvrir", navigateText: "naviguer", closeText: "fermer" },
              },
            },
          },
        },
      },
    },
  },

  themeConfig: {
    outline: { level: [2, 3] },
    // Search is configured once here so its index covers both locales; the
    // French locale overrides only the interface strings.
    search: { provider: "local" },
    socialLinks: [
      { icon: "github", link: REPO },
      { icon: "npm", link: "https://www.npmjs.com/package/reqif-preview" },
    ],
  },

  vite: {
    // The sandbox loads the real bundle from /public at runtime; nothing to
    // pre-bundle, and no Node built-ins to shim.
    optimizeDeps: { exclude: ["reqif-preview"] },
  },
});
