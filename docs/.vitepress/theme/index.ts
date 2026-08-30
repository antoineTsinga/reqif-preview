import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Playground from "./Playground.vue";
import HeroPreview from "./HeroPreview.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Usable from any markdown page as <Playground />.
    app.component("Playground", Playground);
    app.component("HeroPreview", HeroPreview);
  },
} satisfies Theme;
