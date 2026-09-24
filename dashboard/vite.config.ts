/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // shared-ui is a workspace-local package linked via file:../shared-ui,
    // not a prebuilt one — dedupe so it and this app share one React
    // instance instead of each resolving their own copy.
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // shared-ui ships raw .tsx source (no build step); exclude it from
    // esbuild's dependency pre-bundling so Vite transforms it through the
    // normal React plugin pipeline instead of treating it as an opaque
    // pre-built package.
    exclude: ["shared-ui"],
  },
  test: {
    environment: "jsdom",
    globals: true,
  },
});
