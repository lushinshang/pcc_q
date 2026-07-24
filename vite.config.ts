import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { githubPagesBase } from "./config/pagesBase";

export default defineConfig({
  base: githubPagesBase(),
  plugins: [react(), tailwindcss()],
  build: {
    sourcemap: false,
  },
  server: {
    hmr: process.env.DISABLE_HMR !== "true",
  },
});
