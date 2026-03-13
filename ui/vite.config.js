import fs from "fs";
import { fileURLToPath, URL } from "node:url";

import vue from "@vitejs/plugin-vue";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import VueRouter from "unplugin-vue-router/vite";
import { defineConfig, loadEnv } from "vite";
import Layouts from "vite-plugin-vue-layouts";
// import basicSsl from "@vitejs/plugin-basic-ssl";
import { visualizer } from "rollup-plugin-visualizer";
import IconsResolver from "unplugin-icons/resolver";
import Icons from "unplugin-icons/vite";
import { VueRouterAutoImports } from "unplugin-vue-router";

// https://vitejs.dev/config/
// eslint-disable-next-line no-unused-vars
export default defineConfig(({ command, mode }) => {
  // eslint-disable-next-line no-undef
  const env = loadEnv(mode, process.cwd());
  return {
    plugins: [
      // https://github.com/posva/unplugin-vue-router
      // ⚠️ `Vue` must be placed after VueRouter()
      VueRouter({
        // https://github.com/posva/unplugin-vue-router#configuration
        dts: "./typed-router.d.ts",
      }),

      // https://vuejs.org/guide/extras/reactivity-transform.html#refs-vs-reactive-variables
      vue({
        reactivityTransform: true,
      }),

      // https://github.com/antfu/unplugin-auto-import
      AutoImport({
        eslintrc: {
          enabled: true, // generates .eslintrc-auto-import.json which is used in .eslintrc.cjs
        },
        imports: ["vue", "vue/macros", "@vueuse/core", VueRouterAutoImports],
        dts: true,
        dirs: ["./src/composables"], // ./src/stores and ./src/services can be added to auto import, but should we? Your developers were so preoccupied with whether they could, they didn't stop to think if they should.
        vueTemplate: true,
      }),

      // https://github.com/antfu/vite-plugin-components
      Components({
        dts: true,

        // custom resolvers
        resolvers: [
          // auto import icons
          // https://github.com/antfu/unplugin-icons#auto-importing
          IconsResolver(),

          // auto import Icon - iconify vue component
          // https://docs.iconify.design/icon-components/vue/
          (componentName) => {
            if (componentName == "Icon")
              return { name: "Icon", from: "@iconify/vue" };
          },
        ],
      }),

      // https://github.com/antfu/unplugin-icons
      Icons({
        autoInstall: true,
      }),

      // https://github.com/JohnCampionJr/vite-plugin-vue-layouts
      Layouts(),

      // https://github.com/vitejs/vite-plugin-basic-ssl
      // basicSsl(),

      // https://www.npmjs.com/package/rollup-plugin-visualizer
      visualizer(),
    ],
    define: { "process.env": {} },
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    server: {
      host: true,
      port: 443,

      // https://vitejs.dev/config/#server-https
      https: {
        key: fs.readFileSync("./.cert/key.pem"),
        cert: fs.readFileSync("./.cert/cert.pem"),
      },
      // just `true` yields errors with Firefox as of 2022.12
      // https: true,

      // https://vitejs.dev/config/#server-proxy
      // useful when running vite on localhost
      // as the primary web / dev server
      proxy: {
        "/api": {
          target: env.VITE_API_REDIRECT_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
        "/grafana": {
          target: env.VITE_GRAFANA_REDIRECT_URL,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/grafana/, ""),
          // retrieve the grafana_token from cookie and set it as a header
          // X-JWT-Assertion
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq, req) => {
              const grafana_token = req?.headers?.cookie
                ?.split("; ")
                ?.find((row) => row.startsWith("grafana_token"))
                ?.split("=")?.[1];
              if (!grafana_token) {
                return;
              }
              proxyReq.setHeader("X-JWT-Assertion", grafana_token);
              proxyReq.setHeader("X-Forwarded-Proto", "https");
            });
          },
        },
        "/upload": {
          target: env.VITE_UPLOAD_API_BASE_PATH,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    // to disable minification - https://vitejs.dev/config/build-options.html#build-minify
    // build: {
    //   minify: false,
    // },
  };
});
