import { fileURLToPath, URL } from "node:url";
import fs from "fs";

import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import Pages from "vite-plugin-pages";
import AutoImport from "unplugin-auto-import/vite";
import Components from "unplugin-vue-components/vite";
import Layouts from "vite-plugin-vue-layouts";
// import basicSsl from "@vitejs/plugin-basic-ssl";
import Icons from "unplugin-icons/vite";
import IconsResolver from "unplugin-icons/resolver";

import config from "./src/config";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // https://vuejs.org/guide/extras/reactivity-transform.html#refs-vs-reactive-variables
    vue({
      reactivityTransform: true,
    }),

    // https://github.com/hannoeru/vite-plugin-pages
    Pages(),

    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      eslintrc: {
        enabled: true, // generates .eslintrc-auto-import.json which is used in .eslintrc.cjs
      },
      imports: ["vue", "vue/macros", "vue-router", "@vueuse/core"],
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

        // auto import Icon - iconify vue compoenet
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
  ],
  define: { "process.env": {} },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // server: {
  //   host: true,
  //   port: 443,

  //   // https://vitejs.dev/config/server-options.html#server-https
  //   https: true,
  //   // https://vitejs.dev/config/#server-proxy
  //   // useful when running vite on localhost
  //   // as the primary web / dev server
  //   proxy: {
  //     "/api": {
  //       target: `http://${config.apiHost}:${config.apiPort}`,
  //       changeOrigin: true,
  //       secure: false,
  //       rewrite: (path) => path.replace(/^\/api/, ""),
  //     },
  //   },
  // },
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
        target: `http://${config.apiHost}:3030`,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
