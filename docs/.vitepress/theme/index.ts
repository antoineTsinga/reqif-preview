import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";
import Playground from "./Playground.vue";
import "./custom.css";

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // Usable from any markdown page as <Playground />.
    app.component("Playground", Playground);
  },
} satisfies Theme;
