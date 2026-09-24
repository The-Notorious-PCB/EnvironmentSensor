/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// GitHub Pages project site: https://the-notorious-pcb.github.io/EnvironmentSensor/
// The base path must match the repo name exactly (case-sensitive) — if
// this is ever forked/renamed, override at build time with
// `VITE_BASE_PATH=/new-name/ npm run build` rather than editing this file.
const BASE_PATH = process.env.VITE_BASE_PATH ?? "/EnvironmentSensor/";

const REQUIRED_ENV_VARS = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"];

export default defineConfig(({ command, mode }) => {
  if (command === "build") {
    // src/lib/supabaseClient.ts only throws once the bundle actually runs
    // in a browser — without this check, a CI build missing these vars
    // succeeds and silently deploys a site that can never reach Supabase.
    // loadEnv (not just process.env) so this also catches values set via
    // .env.production/.env.local rather than only real shell env vars.
    const env = loadEnv(mode, process.cwd(), "VITE_");
    const missing = REQUIRED_ENV_VARS.filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required env var(s) for production build: ${missing.join(", ")}. ` +
          "Set them (see .env.example) before running `vite build`.",
      );
    }
  }

  return {
    base: BASE_PATH,
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
  };
});
