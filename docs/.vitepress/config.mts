import { defineConfig } from "vitepress";
import { createRequire } from "node:module";

// Read from package.json rather than typed out here: a version in two places
// is a version that will disagree with itself on the next release.
const { version } = createRequire(import.meta.url)("../../package.json");

// Served at the root of its own domain, so the base is "/". It was
// "/reqif-preview/" while the site lived under a github.io project page: get
// this wrong and every asset URL misses by one path segment, which shows up as
// a site rendering with no styles at all rather than as a visible error.
const BASE = "/";

export default defineConfig({
  base: BASE,
  lang: "fr-FR",
  title: "reqif-preview",
  description:
    "Bibliothèque indépendante de tout framework pour parser et prévisualiser des fichiers ReqIF et ReqIFZ.",
  cleanUrls: true,
  lastUpdated: true,
  head: [["link", { rel: "icon", href: `${BASE}favicon.svg` }]],

  themeConfig: {
    outline: { level: [2, 3], label: "Sur cette page" },
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

    nav: [
      { text: "Guide", link: "/guide/demarrage" },
      { text: "API", link: "/api/" },
      { text: "Bac à sable", link: "/bac-a-sable" },
      { text: `v${version}`, link: "https://github.com/antoineTsinga/reqif-preview/releases" },
    ],

    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Démarrage", link: "/guide/demarrage" },
          { text: "Titre et contenu affichés", link: "/guide/titre-et-contenu" },
          { text: "Texte simplifié", link: "/guide/texte-simplifie" },
          { text: "Rendus personnalisés", link: "/guide/rendus-personnalises" },
          { text: "Onglets, numérotation, lecture", link: "/guide/mise-en-page" },
          { text: "Liens entre exigences", link: "/guide/relations" },
          { text: "Pièces jointes", link: "/guide/pieces-jointes" },
          { text: "Documents très imbriqués", link: "/guide/gros-documents" },
          { text: "Diagnostics", link: "/guide/diagnostics" },
          { text: "Sécurité", link: "/guide/securite" },
          { text: "Votre propre rendu", link: "/guide/rendu-maison" },
        ],
      },
      {
        text: "Référence API",
        items: [
          { text: "Vue d'ensemble", link: "/api/" },
          { text: "Chargement et parsing", link: "/api/chargement" },
          { text: "Rendu HTML", link: "/api/rendu" },
          { text: "Options de rendu", link: "/api/options" },
          { text: "Modèle de données", link: "/api/modele" },
          { text: "Diagnostics", link: "/api/diagnostics" },
        ],
      },
      { text: "Bac à sable", link: "/bac-a-sable" },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/antoineTsinga/reqif-preview" },
      { icon: "npm", link: "https://www.npmjs.com/package/reqif-preview" },
    ],

    editLink: {
      pattern: "https://github.com/antoineTsinga/reqif-preview/edit/main/docs/:path",
      text: "Proposer une modification de cette page",
    },

    docFooter: { prev: "Page précédente", next: "Page suivante" },
    darkModeSwitchLabel: "Apparence",
    lightModeSwitchTitle: "Passer en thème clair",
    darkModeSwitchTitle: "Passer en thème sombre",
    sidebarMenuLabel: "Menu",
    returnToTopLabel: "Retour en haut",
    lastUpdatedText: "Dernière mise à jour",

    footer: {
      message: "Publié sous licence MIT. Conforme à OMG ReqIF v1.2 (formal/2016-07-01).",
      copyright: "© 2026 Antoine Tsinga",
    },
  },

  vite: {
    // The sandbox loads the real bundle from /public at runtime; nothing to
    // pre-bundle, and no Node built-ins to shim.
    optimizeDeps: { exclude: ["reqif-preview"] },
  },
});
