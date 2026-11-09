import { defineConfig } from "vite";

export default defineConfig({
  root: "src/site",
  base: "/weather-records/",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
  },
});
