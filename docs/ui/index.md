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
- [Rollup Dependencies Visualizer](https://www.npmjs.com/package/rollup-plugin-visualizer) - Visualize and analyze your Rollup bundle to see which modules are taking up space. Run `npm run build` and open `stats.html`
- Feature flags

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
  - mdi is installed in this repo and is a recommended icon library to use

## Colors

Vuestic colors: https://ui.vuestic.dev/en/styles/colors

```css
:host {
  --va-text-selected: #b3d4fc;
  --va-text-highlighted: #ffc5274e;
  --va-link-color: var(--va-primary);
  --va-link-color-secondary: var(--va-secondary);
  --va-link-color-hover: var(--va-primary-lighten, --va-primary);
  --va-link-color-active: var(--va-primary);
  --va-link-color-visited: var(--va-primary-darken, --va-primary);
  --va-muted: #7f828b;
  --va-primary: #154ec1;
  --va-secondary: #767c88;
  --va-success: #3d9209;
  --va-info: #158de3;
  --va-danger: #e42222;
  --va-warning: #ffd43a;
  --va-background-primary: #f6f6f6;
  --va-background-secondary: #ffffff;
  --va-background-element: #ebf1f4;
  --va-background-border: #dee5f2;
  --va-text-primary: #262824;
  --va-text-inverted: #ffffff;
  --va-shadow: rgba(0, 0, 0, .12);
  --va-focus: #49a8ff;
}
```

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
## Notable Vuestic Classes

CSS: `bioloop/ui/node_modules/vuestic-ui/dist/styles/css-variables.css`

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

Users are authenticated using IU CAS. [More on auth module](/ui/auth_explained.md).

Authentication with google OpenID Connect is implemented following this guide https://developers.google.com/identity/openid-connect/openid-connect

Authentication with CILogon OpenID Connect is implemented following this guide https://www.cilogon.org/oidc

Enable / disable login with authentication providers:

`ui/src/config.js`
- "auth_enabled.google": true | false
- "auth_enabled.cilogon": true | false

`api/src/config/default.json`
- "auth.google.enabled": true | false
- "auth.cilogon.enabled": true | false

Environment Variables:

`ui/.env`
- VITE_GOOGLE_RETURN=https://localhost/auth/google
- VITE_CILOGON_RETURN=https://localhost/auth/cil

`api/.env`
- GOOGLE_OAUTH_CLIENT_ID=
- GOOGLE_OAUTH_CLIENT_SECRET=
- CILOGON_OAUTH_CLIENT_ID=
- CILOGON_OAUTH_CLIENT_SECRET=

### Authentication controls on router
By default any page will require user authentication

```html
<route lang="yaml">
meta:
  title: Dashboard
</route>
```

Page requires user authentication + role constrained.
```html
<route lang="yaml">
meta:
  title: Dashboard
  requiresRoles: ['operator', 'admin']
</route>
```
Only users with either operator or admin role can access this page

No authentication, anonymous view
```html
<route lang="yaml">
meta:
  title: Dashboard
  requiresAuth: false
</route>
```

## Utility Components

Vue Components developed in house to be reused in the app. [Documentation](/ui/util_components.md)

## Coding Conventions
- Use custom component names as `<CustomComponent>`

## Adding Additional Fonts
- Search for fonts on https://fontsource.org/
- Install - `npm install @fontsource/audiowide`
- Add `import '@fontsource/audiowide';` in [main.js](src/main.js)
- Add 'Audiowide' to `font-family: ` in body styles in [base.css](src/styles/base.css)

## Dates and Times
- All dates, timestamps are returned from API as ISO 8601 strings in UTC time zone
- [datetime](src/services/datetime.js) module is used to consolidate the various date and time formats to use in the UI.
- Use browser's local time zone to show date and time whenever possible.

Usage:

```javascript
import * as datetime from '@/services/datetime.js'

datetime.date("2023-06-14T01:18:40.501Z") // "Jun 14 2023"
datetime.absolute("2023-06-14T01:18:40.501Z") // "2023-06-13 21:18:40 -04:00"

datetime.fromNow("2023-06-14T01:18:40.501Z") // "2 months ago"
datetime.readableDuration(130*1000) // "2 minutes"
datetime.formatDuration(12000 * 1000) // "3h 20m"
```

If you have a usecase to display in formats other than above in more than one component, add a function to [datetime](src/services/datetime.js) service and use it.

## Feature Flags

Features can be enabled or disabled at the UI level. Components can determine whether a feature is enabled by reading it from `./config.js`, which in turn reads this config from `./.env`.

```
// ./config.js

  ...
  enabledFeatures: {
    genomeBrowser: import.meta.env.VITE_ENABLED_GENOME_BROWSER === "true",
  },
  ...

```
```
# ./.env

VITE_ENABLED_GENOME_BROWSER=true
```

Reading the feature flag from `.env` allows for features to be toggled without changing the code.

Once a feature's status has been changed in `.env`, the app will need to be redeployed for those changes to come into effect.


## Navigational Breadcrumbs

To set static nav links for a page `/page1/page2`, add nav attr to route meta config block

```html
<route lang="yaml">
meta:
  title: Users
  requiresRoles: ["operator", "admin"]
  nav: [{ label: "Users" }]
</route>
```

Nav breadcrumb are not reset after leaving a page. So if a page should not show nav breadcrumbs they have to be explicitly disabled.

```html
<script setup>
import { useNavStore } from "@/stores/nav";
const nav = useNavStore();
nav.setNavItems([], false);
</script>
```


To set dynamic nav links for a page `/page-dyn-1/page-dyn-2`

```html
<script setup>
import { useNavStore } from "@/stores/nav";
const nav = useNavStore();

page1Promise = api.getP1()
page2Promise = api.getP2()
Promise.all([page1Promise, page2Promise]).then(results => {
  const page1 = results[0]
  const page2 = results[1]
  nav.setNavItems([
    {
      label: page1.name,
      to: "/page1"
    },
    {
      label: page2.name
    },
  ]);
})
</script>
```

## HTTP API Error Handling and Notifications
API requests are to be made with axios.

Catch the error 

```javascript
import toast from "@/services/toast";

getRecords()
  .then((res) => {...})
  .catch((err) => {
    if (err?.response?.status == 404)
        toast.info("No datasets");
    else toast.error("Could not fetch datatset");
  })
```

or let someone else handle the dirty work

```javascript
getRecords()
  .then((res) => {...})
```

Global axios error handler will display a generic error toast based on error class ex: 4xx, 5xx, network errors, etc.