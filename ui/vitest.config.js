import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import { VueRouterAutoImports } from "unplugin-vue-router";
import { defineConfig } from "vitest/config";

// Separate from vite.config.js: that file reads TLS certs on load and would fail in CI.
export default defineConfig({
  plugins: [
    vue({
      reactivityTransform: true,
    }),
    AutoImport({
      imports: ["vue", "vue/macros", "@vueuse/core", VueRouterAutoImports],
      dts: false,
      dirs: ["./src/composables"],
      vueTemplate: true,
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.{js,ts}"],
    passWithNoTests: true,
  },
});
