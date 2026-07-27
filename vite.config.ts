import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages serves the site from /<repo-name>/, so a production build
  // needs that prefix on its asset URLs. The dev server serves from the root.
  base: command === "build" ? "/gilmorehill-campus-nav/" : "/",
  server: {
    port: 5173,
    open: true,
  },
}));
