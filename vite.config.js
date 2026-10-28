import { defineConfig } from "vite";

// base "./" gör att bygget fungerar var som helst: GitHub Pages, Netlify, en undermapp eller en vanlig webbserver.
export default defineConfig({
  base: "./",
  worker: { format: "es" },
  build: { target: "es2020", chunkSizeWarningLimit: 1200 }
});
