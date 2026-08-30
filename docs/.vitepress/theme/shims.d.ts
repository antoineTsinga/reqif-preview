// Vite inlines `?raw` imports as strings at build time.
declare module "*.html?raw" {
  const content: string;
  export default content;
}
