import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "docs",
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
  worker: {
    format: "es",
  },
  server: {
    host: true,
    port: 5173,
  },
});
