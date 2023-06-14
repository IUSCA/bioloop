# UI

## Getting Started
Create a `.env` file from the template `.env.example`: 
```bash
cp .env.example .env
``` 
and populate the config values to all the keys.

In the developement environment, the API calls from the UI are proxied by the vite server. For example, the UI running on https://localhost:443 make an API call GET https://localhost:443/api/users which the vite server intercepts and proxies it to the API server running on `VITE_API_REDIRECT_URL` (ex: http://localhost:3000) as GET http://localhost:3000/users.

### Running using docker
1. Set `VITE_API_REDIRECT_URL` to http://api:3000
2. From the project root run: `docker composer up ui -d` and open https://localhost:443 in the browser. (start the API and its dependencies before starting UI)

### Running on host machine
1. set `VITE_API_REDIRECT_URL` to the API base url (ex:  http://localhost:3000)
2. Install modules: `pnpm install`
3. Start dev server: `pnpm dev`

## Features
- Vue3
- Vite
- [Vuestic](https://vuestic.dev/)
- [vueuse](https://github.com/antfu/vueuse)
- [vue-router](https://github.com/vuejs/router)
- [file based routing](https://github.com/hannoeru/vite-plugin-pages)
- [auto import](https://github.com/antfu/unplugin-auto-import)
- [auto component import](https://github.com/antfu/unplugin-vue-components)
- eslint
    - [jsconfig.json / tsconfig.json](https://code.visualstudio.com/docs/languages/jsconfig
- [tailwind](https://tailwindcss.com/docs/guides/vite)
- [Layouts](https://github.com/JohnCampionJr/vite-plugin-vue-layouts)
- Icons
- [Vuetify and tailwind](https://michaelzanggl.com/articles/add-tailwind-css-to-vuetify/)
- [pinia](https://pinia.vuejs.org/)
- [https dev](https://vitejs.dev/config/server-options.html#server-https)
- Docker
- Dark mode (TODO)

## Icons

There are multiple ways to include icons:
- [Material Icons](https://fonts.google.com/icons?icon.set=Material+Icons) are provided by Vuestic. Iconify icon components are auto imported.
  - usage: `<va-icon name="dashboard" />`
- [Iconify](https://icon-sets.iconify.design/?query=) has a lot of third party / community icons
  - usage: `<Icon icon="mdi-flask" class="text-2xl" />`
  - usage: `<i-mdi-flask/>`

Iconify icons are installed using
- Installation: option-1: https://docs.iconify.design/icon-components/vue/
- Installation: option-2: https://github.com/antfu/unplugin-icons and [autoimporting](https://github.com/antfu/unplugin-icons#auto-importing)
  - need to install [specific packs](https://github.com/antfu/unplugin-icons#icons-data) ex: `pnpm i -D @iconify-json/mdi`

## Colors

Vuestic colors: https://ui.vuestic.dev/en/styles/colors

Accent
- primary
- secondary
- success
- warning
- danger
- info

Background
- backgroundPrimary
- backgroundSecondary
- backgroundElement
- backgroundBorder

Text
- textPrimary
- textInverted

Using 

```html
<template>
  <!-- use javascript object -->
  <div :style="color: {{ colorByStatus }}"></div>

  <!-- use css variables -->
  <span style="color: var(--va-warning)"> </span>

  <!-- using style block -->
  <p class="title">
    Title
  </p>

  <!-- use builtin props -->
  <va-button color="info"></va-button>
</template>

<script setup>
  import { useColors } from "vuestic-ui";
  const colors = useColors()

  const colorByStatus = status == 'FAILED' ? colors.danger : color.primary
</script>

<style scoped>
.title {
  color: var(--va-primary)
}
</style>
```

```html

```

## Configuration

Layered and Hierarchical config system:
- Config for multiple environment is managed through Env variables specified in `.env` files.
- Based on the [mode](https://vitejs.dev/guide/env-and-mode.html#modes), these environment variables are automatically imported into the code by vite.
- The values from the environment variables is merged with other static config centrally in [config.js](src/config.js). All environment variables are backed by sensible default values.

To introduce new configuration to this project, determine if it is environment-specific or static. If it is static, add both the key and value directly to config.js. Otherwise, add the key to config.js and read the value from an environment variable.

```javascript
{
  ...,
  foobar: import.meta.env.FOOBAR || 120,
}
```

Add the name and value of the environment variable to the `.env` file. This file is not tracked by the version control system. To keep track of the environment variables required to initialize the project in a new machine, another file called `.env.example` is maintained. This file contains all the variables defined in `.env` without the values.

## Authentication

Users are authenticated using IU CAS. [More on auth module](docs/auth_explained.md).