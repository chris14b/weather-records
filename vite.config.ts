import { defineConfig } from "vite";

export default defineConfig({
  root: "src/site",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
});
